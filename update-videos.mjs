// Builds videos.json, the list of short videos the Chosen Word app plays.
//
// Reads every channel in channels.json with the YouTube Data API and keeps the
// Shorts that may be embedded in other apps, most viewed first. Run by GitHub Actions every hour
// (update-videos.yml); needs the secret YT_API_KEY.
//
//   YT_API_KEY=... node update-videos.mjs
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YT_API_KEY;
if (!KEY) {
  console.error('Missing YT_API_KEY');
  process.exit(1);
}
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_PER_CHANNEL = 500;

const get = async (path, params) => {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key: KEY })}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${body?.error?.message || res.status}`);
  return body;
};

// "@handle" or "UC..." -> channel id
const channelId = async (channel) => {
  if (/^UC[\w-]{22}$/.test(channel)) return channel;
  const body = await get('channels', { part: 'id', forHandle: channel.replace(/^@?/, '@') });
  const id = body.items?.[0]?.id;
  if (!id) throw new Error(`Channel not found: ${channel}`);
  return id;
};

// Every video in a playlist (newest first), up to MAX_PER_CHANNEL
const playlistVideos = async (playlistId) => {
  const out = [];
  let pageToken;
  do {
    const body = await get('playlistItems', { part: 'snippet', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    for (const item of body.items || []) {
      const s = item.snippet;
      const id = s?.resourceId?.videoId;
      if (id && s.title !== 'Private video' && s.title !== 'Deleted video') {
        out.push({ id, title: s.title, description: s.description || '', publishedAt: s.publishedAt, channel: s.videoOwnerChannelTitle || s.channelTitle || '' });
      }
    }
    pageToken = body.nextPageToken;
  } while (pageToken && out.length < MAX_PER_CHANNEL);
  return out;
};

// YouTube keeps a playlist of only the Shorts of a channel ("UUSH" + id).
// If it isn't there, all uploads are used instead.
const channelShorts = async (id) => {
  try {
    const shorts = await playlistVideos(`UUSH${id.slice(2)}`);
    if (shorts.length) return shorts;
  } catch (e) {}
  return playlistVideos(`UU${id.slice(2)}`);
};

// View counts are rounded (2 significant figures: 1234 -> 1200), so the file
// only changes when a video's views really grow, not on every hourly run
const roundViews = (n) => {
  if (!n || n < 100) return n || 0;
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
};

// Only public videos that other apps are allowed to play, with their view counts
// (the same request, so no extra API quota)
const playable = async (videos) => {
  const views = new Map();
  for (let i = 0; i < videos.length; i += 50) {
    const ids = videos.slice(i, i + 50).map(v => v.id).join(',');
    const body = await get('videos', { part: 'status,statistics', id: ids });
    for (const v of body.items || []) {
      if (v.status?.embeddable && v.status?.privacyStatus === 'public' && !v.status?.madeForKids) {
        views.set(v.id, roundViews(Number(v.statistics?.viewCount) || 0));
      }
    }
  }
  return videos.filter(v => views.has(v.id)).map(v => ({ ...v, views: views.get(v.id) }));
};

// "#hope #faith" in the description -> ['hope', 'faith'] (topic buttons in the app).
// \p{M} keeps Hindi vowel signs, so #मंदिर stays whole.
const hashtags = (text) =>
  [...new Set((text.match(/#[\p{L}\p{M}\p{N}_]+/gu) || []).map(t => t.slice(1).toLowerCase()))]
    .filter(t => t !== 'shorts')
    .slice(0, 6);

const channels = JSON.parse(await readFile(new URL('./channels.json', import.meta.url), 'utf8'));
const all = [];
for (const { lang, channel } of channels) {
  const id = await channelId(channel);
  const videos = await playable(await channelShorts(id));
  console.log(`${channel} (${lang}): ${videos.length} videos`);
  for (const v of videos) {
    all.push({ id: v.id, lang, title: v.title, channel: v.channel, views: v.views, publishedAt: v.publishedAt, tags: hashtags(`${v.title} ${v.description}`) });
  }
}
// Most viewed first; equal views: newest first
all.sort((a, b) => (b.views - a.views) || (b.publishedAt || '').localeCompare(a.publishedAt || ''));

const file = new URL('./videos.json', import.meta.url);
const next = JSON.stringify({ updatedAt: new Date().toISOString(), videos: all }, null, 1);
// Same videos as last time: leave the file alone so no empty commit is made
const previous = await readFile(file, 'utf8').catch(() => '');
const sameVideos = previous && JSON.stringify(JSON.parse(previous).videos) === JSON.stringify(all);
if (!sameVideos) await writeFile(file, next + '\n');
console.log(sameVideos ? 'No change' : `Wrote ${all.length} videos`);
