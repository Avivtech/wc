# World Cup 2026 Game

A small full-stack app for ranking FIFA World Cup 2026 groups, projecting the playoff field, and saving picks as JSON associated with an email address.

## Run

1. Copy `.env.example` to `.env`
2. Add your `API_FOOTBALL_KEY`
3. Install dependencies:

```bash
npm install
```

4. Start the app:

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

## Saves

Saved JSON files are written to:

- `data/picks/<email>.json`

You can also load an existing save by email from the page and download the stored JSON again.

## Demo Mode

If `API_FOOTBALL_KEY` is missing or the live request fails without a cache, the UI falls back to a clearly marked demo field so the drag-and-save flow still works locally.
