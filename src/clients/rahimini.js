import { fetchWithTimeout } from "../lib/fetch.js";
import { normalizeLookupKey, normalizeTeamMatchKey, toNumber, createFixtureMatchKey, createDetailTeam } from "../lib/utils.js";

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
  const hasStarted = isFinished || isLive;
  const date = parseRahiminiDate(game.local_date);
  const stage = normalizeRahiminiStage(game.type, game.group);
  const homeTeamName = game.home_team_name_en;
  const awayTeamName = game.away_team_name_en;

  return {
    id: game.id ? `rahimini-${game.id}` : null,
    sourceId: game.id ?? null,
    date,
    timestamp: date ? Math.floor(Date.parse(date) / 1000) : 0,
    timezone: "UTC",
    stage,
    round: stage,
    groupLetter: stage === "Group Stage" ? normalizeRahiminiGroupLetter(game.group) : null,
    venue: {
      id: game.stadium_id ?? null,
      name: game.stadium_id ? `Stadium ${game.stadium_id}` : "TBD",
      city: null,
      country: null,
      capacity: null,
      image: null
    },
    teams: {
      home: createRahiminiTeam(game.home_team_id, homeTeamName),
      away: createRahiminiTeam(game.away_team_id, awayTeamName)
    },
    matchKey: [normalizeTeamMatchKey(homeTeamName), normalizeTeamMatchKey(awayTeamName)].sort().join(":"),
    goals: {
      home: hasStarted && Number.isFinite(homeScore) ? homeScore : null,
      away: hasStarted && Number.isFinite(awayScore) ? awayScore : null
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
      scorers: parseRahiminiScorers(game.home_scorers, homeTeamName, game.away_scorers, awayTeamName),
      cards: []
    }
  };
}

function parseRahiminiDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, month, day, year, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
}

function normalizeRahiminiStage(type, group) {
  const key = normalizeLookupKey(type || group);

  if (key === "group") return "Group Stage";
  if (key === "r32" || key.includes("round of 32")) return "Round of 32";
  if (key === "r16" || key.includes("round of 16")) return "Round of 16";
  if (key === "qf" || key.includes("quarter")) return "Quarter-finals";
  if (key === "sf" || key.includes("semi")) return "Semi-finals";
  if (key.includes("third")) return "Third-place play-off";
  if (key.includes("final")) return "Final";
  return "Other";
}

function normalizeRahiminiGroupLetter(value) {
  const match = String(value || "").match(/^[A-L]$/i);
  return match ? match[0].toUpperCase() : null;
}

function createRahiminiTeam(id, name) {
  if (!name) {
    return null;
  }

  return {
    id: id ? `rahimini-team-${id}` : `rahimini-team-${normalizeTeamMatchKey(name)}`,
    name,
    code: null,
    country: name,
    abbreviation: null,
    short: null,
    flagCode: null,
    flag: null,
    logo: null,
    winner: null
  };
}

function parseRahiminiScorers(homeRaw, homeTeam, awayRaw, awayTeam) {
  const parse = (raw, teamName) => {
    if (!raw || raw === "null") return [];
    return [...String(raw).matchAll(/"([^"]+)"/g)].map((m) => {
      const text = m[1];
      const match = text.match(/^(.+?)\s+(\d+)(?:\+\d+)?'\s*(\(p\))?$/);
      return {
        team: createDetailTeam(createRahiminiTeam(null, teamName)),
        player: match ? match[1] : text,
        minute: match ? Number(match[2]) : null,
        type: match?.[3] ? "penalty" : "goal"
      };
    });
  };
  return [...parse(homeRaw, homeTeam), ...parse(awayRaw, awayTeam)];
}

export function mergeRahiminiFixtures(fixtures, rahiminiFixtures, { teamLookup = new Map() } = {}) {
  if (!rahiminiFixtures.length) return fixtures;
  const byMatchKey = new Map(rahiminiFixtures.map((f) => [f.matchKey, f]));
  const mergedKeys = new Set();

  const mergedFixtures = fixtures.map((fixture) => {
    const rahimini = byMatchKey.get(createFixtureMatchKey(fixture));
    if (!rahimini) return fixture;

    mergedKeys.add(rahimini.matchKey);

    const shouldUseRahiminiStatus = shouldMergeRahiminiStatus(fixture.status?.short, rahimini.status?.short);
    const shouldUseRahiminiScore = shouldUseRahiminiStatus || fixture.status?.short === "NS";

    return {
      ...fixture,
      goals: shouldUseRahiminiScore ? rahimini.goals : fixture.goals,
      score: shouldUseRahiminiScore ? { ...fixture.score, fulltime: rahimini.score.fulltime } : fixture.score,
      status: shouldUseRahiminiStatus ? rahimini.status : fixture.status,
      details: {
        ...fixture.details,
        scorers: rahimini.details.scorers.length ? rahimini.details.scorers : (fixture.details?.scorers ?? [])
      }
    };
  });

  const missingFixtures = rahiminiFixtures
    .filter((fixture) => !mergedKeys.has(fixture.matchKey))
    .map((fixture) => createRahiminiFixture(fixture, teamLookup))
    .filter(Boolean);

  return [...mergedFixtures, ...missingFixtures];
}

function shouldMergeRahiminiStatus(currentStatus, rahiminiStatus) {
  const currentCompleted = isCompletedStatus(currentStatus);
  const rahiminiCompleted = isCompletedStatus(rahiminiStatus);

  if (currentCompleted) {
    return false;
  }

  return rahiminiCompleted || ["NS", "TBD", "LIVE"].includes(String(currentStatus || "").toUpperCase());
}

function isCompletedStatus(status) {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(String(status || "").toUpperCase());
}

function createRahiminiFixture(fixture, teamLookup) {
  if (!fixture.teams?.home || !fixture.teams?.away) {
    return null;
  }

  return {
    id: fixture.id,
    date: fixture.date,
    timestamp: fixture.timestamp,
    timezone: fixture.timezone,
    referee: null,
    stage: fixture.stage,
    round: fixture.round,
    groupLetter: fixture.groupLetter,
    status: fixture.status,
    venue: fixture.venue,
    teams: {
      home: resolveRahiminiTeam(fixture.teams.home, teamLookup),
      away: resolveRahiminiTeam(fixture.teams.away, teamLookup)
    },
    goals: fixture.goals,
    score: fixture.score,
    details: fixture.details
  };
}

function resolveRahiminiTeam(team, teamLookup) {
  const resolved = teamLookup.get(normalizeTeamMatchKey(team?.name)) ??
    teamLookup.get(normalizeLookupKey(team?.name)) ??
    null;

  return {
    ...team,
    ...(resolved ?? {}),
    id: resolved?.id ?? team.id,
    winner: team.winner ?? resolved?.winner ?? null
  };
}
