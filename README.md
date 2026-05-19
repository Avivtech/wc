# World Cup 2026 Game

A small full-stack app for ranking FIFA World Cup 2026 groups, projecting the playoff field, and saving picks remotely against the signed-in Supabase user.

## Run

1. Copy `.env.example` to `.env`
2. Configure TheSportsDB. The free v1 key is `123`, so the default `.env.example` works:

```env
SPORTSDB_API_KEY=123
```

The FIFA World Cup league id in TheSportsDB is:

```env
SPORTSDB_WORLD_CUP_LEAGUE_ID=4429
```

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

## Deploy To Google Cloud

This repo now includes:

- `Dockerfile`
- `.gcloudignore`
- `cloudbuild.yaml`
- `.cloudbuild/create-developer-connect-trigger.sh`

The default Google Cloud deployment targets are:

- Cloud Run service: `wc`
- region: `europe-west1`
- Artifact Registry host: `europe-west1-docker.pkg.dev`
- Artifact Registry repository: `wc`

The expected Cloud Run URL for this service is:

- `https://wc-18268740473.europe-west1.run.app`

### Developer Connect Trigger

Create the Artifact Registry repository first if it does not exist:

```bash
gcloud artifacts repositories create wc \
  --repository-format=docker \
  --location=europe-west1
```

Then create the Cloud Build trigger from your Developer Connect git repository link:

```bash
GIT_REPOSITORY_LINK="projects/PROJECT_ID/locations/europe-west1/connections/CONNECTION/gitRepositoryLinks/REPO_LINK" \
bash .cloudbuild/create-developer-connect-trigger.sh
```

The trigger uses Cloud Build's Developer Connect trigger flow and points at `cloudbuild.yaml`.

### Required Runtime Secrets

After the first deploy, configure these runtime env vars on Cloud Run:

```text
SPORTSDB_API_KEY
SPORTSDB_WORLD_CUP_LEAGUE_ID
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

You can set them directly on the service or wire them from Secret Manager.

## Development Seed

To load fake picks locally for UI checks, open:

```text
http://localhost:3000/?devPicks=1
```

Notes:

- sign in first if you want to open `My Rankings`
- the seed is built from the current tournament payload, so team ids and bracket slots stay valid
- group rankings, 8 best third-place picks, and knockout winners are prefilled
- with `?devPicks=1`, the app skips remote load/save so your real saved picks are not overwritten
- remove the query param to return to the normal save/load flow

To fake the `Live Results` side while keeping your real saved picks, open:

```text
http://localhost:3000/?devResults=1
```

Notes:

- the live groups, third-place race, and knockout results are synthesized from the current tournament payload
- the floating score card will score your saved picks against those fake live results
- save/load for `My Rankings` still works normally with `?devResults=1`

## What It Uses

Live tournament data is pulled from TheSportsDB v1 free API using the endpoints below:

- `GET /lookupleague.php`
- `GET /eventsseason.php`
- `GET /lookuptable.php`

Country names, FIFA abbreviations, short codes, and flag URLs are loaded locally from:

- `src/data/countries.json`

TheSportsDB's free tier limits season event responses, so the app fills any missing World Cup 2026 calendar fixtures from the public World Cup 2026 JSON schedule:

- https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json

Documentation:

- https://www.thesportsdb.com/documentation

## Important Note About Knockout Matches

Live football data providers usually add cup fixtures as participants become known. Because of that, future knockout placeholders may not exist yet in the live feed.

The app therefore uses:

- TheSportsDB for live groups, teams, fixtures, locations, and standings where available
- FIFA's published 2026 knockout schedule template for fixed round-of-32 onward slot metadata

Schedule reference:

- https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums

## Auth And Saves

Saving and loading require a Supabase-authenticated user session:

- sign up with display name, email, and password, or log in with email and password in the save panel
- saves and loads are scoped to the signed-in user's email
- the Express API verifies the Supabase bearer token before reading or writing picks
- picks are stored remotely in a private Supabase Storage bucket, not on the local filesystem

The payload shape is still JSON, but it is now persisted server-side in Supabase for the authenticated user. Older saves written into Supabase auth metadata are migrated into storage automatically on server startup.

## Scoring Layer

The app now includes a modular scoring engine under `src/scoring/`:

- `src/scoring/config.js`: all scoring values in one config object
- `src/scoring/engine.js`: match scoring, tournament-pick scoring, and batch settlement
- `src/scoring/index.js`: public entrypoint for importing the scoring helpers

### Supported Scoring Categories

- timing points
- difficulty points
- accuracy points
- bonus points
- penalties

### Match Prediction Example

Use the current fixture shape from `getWorldCupData()` directly:

```js
import { getWorldCupData } from "./src/worldCupService.js";
import {
  buildScoringResultFromFixture,
  calculatePredictionScore
} from "./src/scoring/index.js";

const worldCup = await getWorldCupData();
const fixture = worldCup.fixtures.find((entry) => entry.id === 123456);

const prediction = {
  id: "pred-1",
  matchId: fixture.id,
  createdAt: "2026-06-10T09:00:00.000Z",
  homeGoals: 1,
  awayGoals: 0,
  bothTeamsToScore: false,
  cleanSheet: { home: true }
};

const scorecard = calculatePredictionScore({
  prediction,
  match: fixture,
  result: buildScoringResultFromFixture(fixture),
  context: {
    tournamentStartAt: worldCup.summary?.dateRange?.start,
    hostCountries: worldCup.summary?.hostCountries
  }
});
```

The returned object includes:

- `totalPoints`
- `timingPoints`
- `difficultyPoints`
- `accuracyPoints`
- `bonusPoints`
- `penaltyPoints`
- `capAdjustmentPoints`
- `breakdown`

### Tournament Pick Example

```js
import { calculatePredictionScore } from "./src/scoring/index.js";

const scorecard = calculatePredictionScore({
  prediction: {
    id: "tourn-1",
    type: "tournament",
    pickType: "groupWinner",
    group: "A",
    teamId: "25",
    createdAt: "2026-06-01T10:00:00.000Z"
  },
  result: {
    groupWinners: {
      A: "25"
    }
  }
});
```

### API Integration

Two server endpoints are available:

- `POST /api/scoring/matches/:matchId`
  Body: `{ prediction, result?, config?, context? }`
- `POST /api/scoring/settle`
  Body: `{ predictions, resultsByMatchId?, matchesById?, tournamentResults?, config?, context? }`

The match route reuses the app's current World Cup fixture model and, if no custom result is passed, settles against the live fixture result already loaded by the server.

### Leaderboard Or Settlement Flow

Recommended integration points:

1. Run `settlePredictions()` after a fixture is final and persist the returned scorecard beside the saved prediction.
2. Aggregate `totalPoints` per user to build the leaderboard.
3. Keep the full `breakdown` array for audit, tie-break review, and UI explainability.
4. Tune values by editing `DEFAULT_SCORING_CONFIG` or passing an override config into the scorer or scoring routes.

## Demo Mode

If TheSportsDB or the schedule template cannot be reached and no cache exists, the UI falls back to a clearly marked demo field so the drag-and-save flow still works locally.

If `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, or `SUPABASE_SECRET_KEY` is missing, the app still loads in read-only mode, but auth, save, and load are disabled.
