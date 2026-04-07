# World Cup 2026 Game

A small full-stack app for ranking FIFA World Cup 2026 groups, projecting the playoff field, and saving picks as JSON attached to the signed-in user's email.

## Run

1. Copy `.env.example` to `.env`
2. Add your `API_FOOTBALL_KEY`
3. Add your Supabase keys:

```env
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

Use the publishable key in the browser and keep the secret key on the server only.

4. In Supabase Auth, enable Email and add your local site URL as a redirect URL, for example `http://localhost:3000`
5. Install dependencies:

```bash
npm install
```

6. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## What It Uses

Live tournament data is pulled from API-Football using the documented endpoints below:

- `GET /leagues`
- `GET /standings`
- `GET /teams`
- `GET /fixtures`
- `GET /fixtures/rounds`
- `GET /venues`
- `GET /fixtures/statistics`

Documentation:

- https://www.api-football.com/documentation-v3

## Important Note About Knockout Matches

API-Football documents that cup fixtures are added when both participants are known. Because of that, future knockout placeholders may not exist yet in the live feed.

The app therefore uses:

- API-Football for live groups, teams, fixtures, locations, and stats
- FIFA's published 2026 knockout schedule template for fixed round-of-32 onward slot metadata

Schedule reference:

- https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums

## Auth And Saves

Saving and loading now require a Supabase-authenticated user session:

- sign in with the email magic link in the save panel
- saves and loads are scoped to the signed-in user's email
- the Express API verifies the Supabase bearer token before reading or writing picks

Saved JSON files are written to:

- `data/picks/<email>.json`

You can also load your existing save from the page and download the stored JSON again.

## Demo Mode

If `API_FOOTBALL_KEY` is missing or the live request fails without a cache, the UI falls back to a clearly marked demo field so the drag-and-save flow still works locally.

If `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, or `SUPABASE_SECRET_KEY` is missing, the app still loads in read-only mode, but auth, save, load, and download are disabled.
