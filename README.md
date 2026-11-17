# Video list for the Chosen Word app

The app's **Videos** screen plays Shorts from the English and Hindi YouTube channels.
It reads the list from:

    https://raw.githubusercontent.com/hutsonwallacemap/chosenword-videos/main/videos.json

(set in `app/lib/videoFeed.js`). This folder makes that file automatically, every hour,
so a new Short shows up in the app without an app update.

## One-time setup

1. **YouTube API key** (free)
   - https://console.cloud.google.com → create a project "Chosen Word videos"
   - *APIs & Services → Library* → **YouTube Data API v3** → *Enable*
   - *APIs & Services → Credentials* → *Create credentials* → **API key**
   - *Edit the key* → API restrictions → *Restrict key* → YouTube Data API v3 → Save

2. **New public GitHub repository** named `chosenword-videos`
   (public, so the app can read the list without a password; it only holds the list).
   Put these files in it:
   - `update-videos.mjs`
   - `channels.json`, with your two channel handles, e.g. `"@ChosenWordEnglish"`
   - `update-videos.yml`, at `.github/workflows/update-videos.yml`

3. In that repository: *Settings → Secrets and variables → Actions → New repository secret*
   - Name: `YT_API_KEY`, value: the key from step 1

4. *Actions* tab → **Update videos** → *Run workflow*. After a minute `videos.json`
   appears in the repository and the app's Videos screen shows your Shorts.

## Every day

Just upload Shorts to the channels. Within an hour they are in the app.

- Keep **Allow embedding** on (YouTube Studio → video → Show more), the default.
- Don't mark videos **Made for kids**: YouTube doesn't let other apps play those.
- Hashtags in the description (`#hope #faith`) become topic buttons in the app.

## Good to know

- Uses about 250 of the 10,000 free YouTube API units a day.
- GitHub pauses hourly jobs in a repository with no changes for 60 days. If no new
  video is posted for two months, open *Actions* and enable the workflow again.
- A Tamil channel later: add `{ "lang": "ta", "channel": "@..." }` to `channels.json`
  and a Tamil button in `VIDEO_LANGUAGES` (`app/lib/videoFeed.js`).
