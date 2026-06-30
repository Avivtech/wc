import { fetchWithTimeout } from "../lib/fetch.js";
import { normalizeTeamMatchKey, toNumber, createFixtureMatchKey } from "../lib/utils.js";

const RAHIMINI_GAMES_URL = "https://worldcup26.ir/get/games";

export async function fetchRahiminiWorldCup2026() {
  const token = String(process.env.WC_IR_TOKEN || "").trim();
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithTimeout(RAHIMINI_GAMES_URL, { headers });
  if (!response.ok) {
    throw new Error(`worldcup26.ir games request failed with status ${response.status}`);
  }
  const data = await response.json();
  return (Array.isArray(data?.games) ? data.games : []).map(normalizeRahiminiFixture);
}

function normalizeRahiminiFixture(game) {
  const homeScore = toNumber(game.home_score);
  const awayScore = toNumber(game.away_score);
  const isFinished = game.finished === "TRUE";
  const isLive = !isFinished && game.time_elapsed === "live";

  return {
    matchKey: [normalizeTeamMatchKey(game.home_team_name_en), normalizeTeamMatchKey(game.away_team_name_en)].sort().join(":"),
    goals: {
      home: Number.isFinite(homeScore) ? homeScore : null,
      away: Number.isFinite(awayScore) ? awayScore : null
    },
    score: {
      halftime: { home: null, away: null },
      fulltime: {
        home: isFinished && Number.isFinite(homeScore) ? homeScore : null,
        away: isFinished && Number.isFinite(awayScore) ? awayScore : null
      },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null }
    },
    status: isFinished
      ? { long: "Match Finished", short: "FT", elapsed: null }
      : isLive
        ? { long: "In Progress", short: "LIVE", elapsed: null }
        : { long: "Not Started", short: "NS", elapsed: null },
    details: {
      scorers: parseRahiminiScorers(game.home_scorers, game.home_team_name_en, game.away_scorers, game.away_team_name_en),
      cards: []
    }
  };
}

function parseRahiminiScorers(homeRaw, homeTeam, awayRaw, awayTeam) {
  const parse = (raw, teamName) => {
    if (!raw || raw === "null") return [];
    return [...String(raw).matchAll(/"([^"]+)"/g)].map((m) => {
      const text = m[1];
      const match = text.match(/^(.+?)\s+(\d+)(?:\+\d+)?'\s*(\(p\))?$/);
      return {
        team: teamName,
        player: match ? match[1] : text,
        minute: match ? Number(match[2]) : null,
        type: match?.[3] ? "penalty" : "goal"
      };
    });
  };
  return [...parse(homeRaw, homeTeam), ...parse(awayRaw, awayTeam)];
}

export function mergeRahiminiFixtures(fixtures, rahiminiFixtures) {
  if (!rahiminiFixtures.length) return fixtures;
  const byMatchKey = new Map(rahiminiFixtures.map((f) => [f.matchKey, f]));

  return fixtures.map((fixture) => {
    const rahimini = byMatchKey.get(createFixtureMatchKey(fixture));
    if (!rahimini || fixture.status?.short !== "NS") return fixture;

    return {
      ...fixture,
      goals: rahimini.goals,
      score: { ...fixture.score, fulltime: rahimini.score.fulltime },
      status: rahimini.status,
      details: {
        ...fixture.details,
        scorers: rahimini.details.scorers.length ? rahimini.details.scorers : (fixture.details?.scorers ?? [])
      }
    };
  });
}
