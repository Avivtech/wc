import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import { buildDemoWorldCupBase } from "./data/demoWorldCup.js";
import { KNOCKOUT_TEMPLATE } from "./data/knockoutTemplate.js";

const API_BASE_URL = "https://v3.football.api-sports.io";
const DOCUMENTATION_URL = "https://www.api-football.com/documentation-v3";
const FIFA_SCHEDULE_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums";
const WORLD_CUP_SEASON = 2026;
const CACHE_TTL_MS = 15 * 60 * 1000;
const HOST_COUNTRIES = ["Canada", "Mexico", "United States"];
const CACHE_FILE = new URL("../data/cache/world-cup-2026.json", import.meta.url);
const FIFA_MENS_RANKING_URL = "https://inside.fifa.com/fifa-world-ranking/men";
const MAX_FIFA_RANK = 211;
const EXTERNAL_FETCH_CONCURRENCY = 6;
const AMBIGUOUS_API_CODES = new Set(["AUS", "IRA", "SOU"]);
const FIFA_CODE_FIXUPS = {
  BOS: "BIH",
  CAP: "CPV",
  CON: "COD",
  IVO: "CIV",
  JAP: "JPN",
  MOR: "MAR",
  NET: "NED",
  SAU: "KSA",
  SPA: "ESP",
  SWI: "SUI",
  ZEA: "NZL"
};
const TEAM_NAME_TO_FIFA_CODE = new Map(
  Object.entries({
    algeria: "ALG",
    argentina: "ARG",
    australia: "AUS",
    austria: "AUT",
    belgium: "BEL",
    "bosnia and herzegovina": "BIH",
    brazil: "BRA",
    canada: "CAN",
    "cape verde islands": "CPV",
    colombia: "COL",
    "congo dr": "COD",
    curacao: "CUW",
    "czech republic": "CZE",
    ecuador: "ECU",
    egypt: "EGY",
    england: "ENG",
    france: "FRA",
    germany: "GER",
    ghana: "GHA",
    haiti: "HAI",
    iran: "IRN",
    iraq: "IRQ",
    "ivory coast": "CIV",
    japan: "JPN",
    jordan: "JOR",
    mexico: "MEX",
    morocco: "MAR",
    netherlands: "NED",
    "new zealand": "NZL",
    norway: "NOR",
    panama: "PAN",
    paraguay: "PAR",
    portugal: "POR",
    qatar: "QAT",
    "saudi arabia": "KSA",
    scotland: "SCO",
    senegal: "SEN",
    "south africa": "RSA",
    "south korea": "KOR",
    spain: "ESP",
    sweden: "SWE",
    switzerland: "SUI",
    tunisia: "TUN",
    turkey: "TUR",
    turkiye: "TUR",
    uruguay: "URU",
    usa: "USA",
    "united states": "USA",
    uzbekistan: "UZB"
  })
);

let inflightRequest = null;

export async function getWorldCupData({ refresh = false, timezone = "Asia/Jerusalem" } = {}) {
  if (inflightRequest && !refresh) {
    return inflightRequest;
  }

  inflightRequest = (async () => {
    const cache = await readCache();

    if (!refresh && cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
      return cache.payload;
    }

    const apiKey = String(process.env.API_FOOTBALL_KEY || "").trim();

    if (!apiKey) {
      return finalizeWorldCupData(buildDemoWorldCupBase("No API_FOOTBALL_KEY was found in the environment."));
    }

    try {
      const liveBase = await fetchLiveWorldCupBase({ apiKey, timezone });
      const payload = finalizeWorldCupData(liveBase);
      await writeCache(payload);
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (cache?.payload) {
        return {
          ...cache.payload,
          source: {
            ...cache.payload.source,
            warnings: [
              ...(cache.payload.source?.warnings ?? []),
              `Live refresh failed, falling back to cached data: ${message}`
            ],
            stale: true,
            fallbackMode: "cache"
          }
        };
      }

      return finalizeWorldCupData(buildDemoWorldCupBase(message));
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

async function fetchLiveWorldCupBase({ apiKey, timezone }) {
  const leagueEntry = await findWorldCupLeague(apiKey);
  const leagueId = leagueEntry.league.id;
  const seasonCoverage = leagueEntry.season.coverage ?? {};

  const [standingsResult, teamsResult, fixturesResult, roundsResult] = await Promise.all([
    optionalApiRequest("standings", { league: leagueId, season: WORLD_CUP_SEASON }, apiKey),
    optionalApiRequest("teams", { league: leagueId, season: WORLD_CUP_SEASON }, apiKey),
    optionalApiRequest(
      "fixtures",
      { league: leagueId, season: WORLD_CUP_SEASON, timezone },
      apiKey
    ),
    optionalApiRequest(
      "fixtures/rounds",
      { league: leagueId, season: WORLD_CUP_SEASON, dates: "true", timezone },
      apiKey
    )
  ]);

  const teamLookup = buildTeamLookup(teamsResult.response);
  const rawFixtures = Array.isArray(fixturesResult.response) ? fixturesResult.response : [];
  const venueLookup = await fetchVenueLookup(rawFixtures, apiKey);

  const normalizedFixtures = rawFixtures.map((fixture) =>
    normalizeFixture(fixture, teamLookup, venueLookup)
  );
  const normalizedVenues = collectVenues(normalizedFixtures, venueLookup);

  const groups = buildGroups({
    standingsResponse: standingsResult.response,
    teamLookup,
    fixtures: normalizedFixtures
  });

  const normalizedRounds = normalizeRounds(roundsResult.response);
  const [featuredStats, fifaRankingsResult, teamSignalsResult] = await Promise.all([
    fetchFeaturedStats({
      fixtures: normalizedFixtures,
      apiKey,
      enabled: Boolean(seasonCoverage?.fixtures?.statistics_fixtures)
    }),
    fetchFifaRankings(collectUniqueTeams(groups)),
    fetchTeamStrengthSignals({
      fixtures: normalizedFixtures,
      apiKey
    })
  ]);
  const enrichedGroups = enrichGroupsWithTeamMetrics(groups, fifaRankingsResult.lookup, teamSignalsResult.lookup);

  return {
    source: {
      mode: "live",
      provider: "API-Football",
      documentation: DOCUMENTATION_URL,
      scheduleSource: FIFA_SCHEDULE_URL,
      rankingsSource: FIFA_MENS_RANKING_URL,
      fetchedAt: new Date().toISOString(),
      warnings: [...fifaRankingsResult.warnings, ...teamSignalsResult.warnings],
      enrichment: {
        fifaRankings: fifaRankingsResult.meta,
        teamScores: teamSignalsResult.meta
      },
      stale: false
    },
    competition: {
      id: leagueEntry.league.id,
      name: leagueEntry.league.name,
      country: leagueEntry.country?.name ?? "World",
      season: WORLD_CUP_SEASON,
      logo: leagueEntry.league.logo ?? null,
      coverage: seasonCoverage
    },
    groups: enrichedGroups,
    fixtures: normalizedFixtures,
    rounds: normalizedRounds,
    venues: normalizedVenues,
    featuredStats
  };
}

async function apiRequest(endpoint, params, apiKey) {
  const url = new URL(`${API_BASE_URL}/${endpoint}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
      Accept: "application/json"
    }
  });

  if (response.status === 204) {
    return { response: [] };
  }

  if (!response.ok) {
    throw new Error(`API-Football ${endpoint} request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const errors = formatApiErrors(data?.errors);

  if (errors) {
    throw new Error(`API-Football ${endpoint} returned errors: ${errors}`);
  }

  return data;
}

async function optionalApiRequest(endpoint, params, apiKey) {
  try {
    return await apiRequest(endpoint, params, apiKey);
  } catch {
    return { response: [] };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) {
    return [];
  }

  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function formatApiErrors(errors) {
  if (!errors) {
    return "";
  }

  if (Array.isArray(errors)) {
    return errors.filter(Boolean).join(", ");
  }

  if (typeof errors === "object") {
    return Object.values(errors)
      .flat()
      .filter(Boolean)
      .join(", ");
  }

  return String(errors);
}

async function findWorldCupLeague(apiKey) {
  const data = await apiRequest(
    "leagues",
    {
      search: "world cup"
    },
    apiKey
  );

  const candidates = (data.response ?? [])
    .map((entry) => {
      const season = (entry.seasons ?? []).find((item) => item.year === WORLD_CUP_SEASON);

      if (!season) {
        return null;
      }

      return {
        ...entry,
        season
      };
    })
    .filter(Boolean)
    .filter((entry) => {
      const name = String(entry.league?.name || "").toLowerCase();
      return (
        name.includes("world cup") &&
        !name.includes("qualification") &&
        !name.includes("qualifying") &&
        !name.includes("women") &&
        !name.includes("club")
      );
    })
    .sort((left, right) => scoreLeague(right) - scoreLeague(left));

  if (!candidates.length) {
    throw new Error("Could not find the FIFA World Cup 2026 league in API-Football.");
  }

  return candidates[0];
}

function scoreLeague(entry) {
  const exactName = String(entry.league?.name || "").toLowerCase() === "world cup" ? 100 : 0;
  const worldCountry = String(entry.country?.name || "").toLowerCase() === "world" ? 20 : 0;
  const standingsCoverage = entry.season?.coverage?.standings ? 5 : 0;
  return exactName + worldCountry + standingsCoverage;
}

function buildTeamLookup(teamResponse = []) {
  const lookup = new Map();

  for (const entry of teamResponse) {
    lookup.set(entry.team.id, {
      id: entry.team.id,
      name: entry.team.name,
      code: entry.team.code ?? null,
      country: entry.team.country ?? null,
      national: entry.team.national ?? null,
      logo: entry.team.logo ?? null,
      venue: entry.venue ?? null
    });
  }

  return lookup;
}

async function fetchVenueLookup(rawFixtures, apiKey) {
  const venueIds = Array.from(
    new Set(
      rawFixtures
        .map((fixture) => fixture?.fixture?.venue?.id)
        .filter((venueId) => Number.isInteger(venueId))
    )
  ).slice(0, 24);

  const venueEntries = await Promise.all(
    venueIds.map(async (venueId) => {
      const response = await optionalApiRequest("venues", { id: venueId }, apiKey);
      const venue = response.response?.[0];

      if (!venue) {
        return null;
      }

      return [
        venueId,
        {
          id: venue.id,
          name: venue.name,
          city: venue.city ?? null,
          country: venue.country ?? null,
          capacity: venue.capacity ?? null,
          image: venue.image ?? null,
          address: venue.address ?? null,
          surface: venue.surface ?? null
        }
      ];
    })
  );

  return new Map(venueEntries.filter(Boolean));
}

function collectVenues(fixtures, venueLookup) {
  const venues = new Map();

  for (const fixture of fixtures) {
    const fixtureVenue = fixture.venue ?? {};
    const key =
      fixtureVenue.id != null
        ? `id:${fixtureVenue.id}`
        : `name:${fixtureVenue.name ?? ""}|city:${fixtureVenue.city ?? ""}`;

    if (!fixtureVenue.name) {
      continue;
    }

    venues.set(key, {
      id: fixtureVenue.id ?? null,
      name: fixtureVenue.name,
      city: fixtureVenue.city ?? null,
      country: fixtureVenue.country ?? null,
      capacity: fixtureVenue.capacity ?? null,
      image: fixtureVenue.image ?? null,
      address: fixtureVenue.address ?? venueLookup.get(fixtureVenue.id)?.address ?? null,
      surface: fixtureVenue.surface ?? venueLookup.get(fixtureVenue.id)?.surface ?? null
    });
  }

  return [...venues.values()].sort((left, right) =>
    `${left.city ?? ""}${left.name}`.localeCompare(`${right.city ?? ""}${right.name}`)
  );
}

function normalizeFixture(fixture, teamLookup, venueLookup) {
  const venueId = fixture?.fixture?.venue?.id ?? null;
  const venue = venueLookup.get(venueId);

  return {
    id: fixture.fixture.id,
    date: fixture.fixture.date,
    timestamp: fixture.fixture.timestamp,
    timezone: fixture.fixture.timezone,
    referee: fixture.fixture.referee ?? null,
    stage: classifyStage(fixture.league.round),
    round: fixture.league.round,
    groupLetter: extractGroupLetter(fixture.league.round),
    status: {
      long: fixture.fixture.status?.long ?? null,
      short: fixture.fixture.status?.short ?? null,
      elapsed: fixture.fixture.status?.elapsed ?? null
    },
    venue: {
      id: venueId,
      name: venue?.name ?? fixture.fixture.venue?.name ?? "TBD",
      city: venue?.city ?? fixture.fixture.venue?.city ?? null,
      country: venue?.country ?? null,
      capacity: venue?.capacity ?? null,
      image: venue?.image ?? null
    },
    teams: {
      home: normalizeFixtureTeam(fixture.teams.home, teamLookup),
      away: normalizeFixtureTeam(fixture.teams.away, teamLookup)
    },
    goals: {
      home: fixture.goals?.home ?? null,
      away: fixture.goals?.away ?? null
    },
    score: fixture.score ?? null
  };
}

function normalizeFixtureTeam(team, teamLookup) {
  const teamInfo = teamLookup.get(team.id);
  return {
    id: team.id,
    name: team.name,
    code: teamInfo?.code ?? null,
    country: teamInfo?.country ?? null,
    logo: team.logo ?? teamInfo?.logo ?? null,
    winner: team.winner ?? null
  };
}

function buildGroups({ standingsResponse = [], teamLookup, fixtures }) {
  const standingsGroups = (standingsResponse?.[0]?.league?.standings ?? [])
    .filter((group) => Array.isArray(group) && group.length)
    .filter((groupRows) => Boolean(extractGroupLetter(groupRows[0]?.group)))
    .map((groupRows, index) => normalizeStandingGroup(groupRows, index, teamLookup, fixtures));

  if (standingsGroups.length) {
    return standingsGroups;
  }

  return deriveGroupsFromFixtures(fixtures);
}

function normalizeStandingGroup(groupRows, index, teamLookup, fixtures) {
  const groupName = String(groupRows[0]?.group || `Group ${String.fromCharCode(65 + index)}`);
  const letter = extractGroupLetter(groupName) ?? String.fromCharCode(65 + index);

  const teams = [...groupRows]
    .sort((left, right) => Number(left.rank) - Number(right.rank))
    .map((row) => {
      const details = teamLookup.get(row.team.id);
      return {
        id: row.team.id,
        name: row.team.name,
        code: details?.code ?? null,
        country: details?.country ?? null,
        national: details?.national ?? null,
        logo: row.team.logo ?? details?.logo ?? null,
        groupLetter: letter,
        ...createDefaultTeamMetrics(),
        standing: {
          rank: row.rank ?? null,
          points: row.points ?? null,
          goalDifference: row.goalsDiff ?? null,
          form: row.form ?? null,
          played: row.all?.played ?? null,
          wins: row.all?.win ?? null,
          draws: row.all?.draw ?? null,
          losses: row.all?.lose ?? null,
          goalsFor: row.all?.goals?.for ?? null,
          goalsAgainst: row.all?.goals?.against ?? null,
          description: row.description ?? null,
          update: row.update ?? null
        }
      };
    });

  return {
    id: `group-${letter.toLowerCase()}`,
    letter,
    label: `Group ${letter}`,
    teams,
    fixtures: fixtures.filter((fixture) => fixture.groupLetter === letter)
  };
}

function deriveGroupsFromFixtures(fixtures) {
  const groups = new Map();

  for (const fixture of fixtures) {
    const letter = fixture.groupLetter;

    if (!letter) {
      continue;
    }

    if (!groups.has(letter)) {
      groups.set(letter, {
        id: `group-${letter.toLowerCase()}`,
        letter,
        label: `Group ${letter}`,
        teams: [],
        fixtures: []
      });
    }

    const group = groups.get(letter);
    group.fixtures.push(fixture);

    for (const team of [fixture.teams.home, fixture.teams.away]) {
      if (!group.teams.some((entry) => entry.id === team.id)) {
        group.teams.push({
          id: team.id,
          name: team.name,
          code: team.code ?? null,
          country: team.country ?? null,
          logo: team.logo ?? null,
          groupLetter: letter,
          ...createDefaultTeamMetrics(),
          standing: {
            rank: group.teams.length + 1,
            points: null,
            goalDifference: null,
            form: null,
            played: null,
            wins: null,
            draws: null,
            losses: null,
            goalsFor: null,
            goalsAgainst: null,
            description: null,
            update: null
          }
        });
      }
    }
  }

  return [...groups.values()].sort((left, right) => left.letter.localeCompare(right.letter));
}

function normalizeRounds(roundsResponse = []) {
  return roundsResponse.map((entry) => {
    const round = typeof entry === "string" ? entry : entry.round;
    const dates = typeof entry === "string" ? [] : entry.dates ?? [];

    return {
      round,
      stage: classifyStage(round),
      groupLetter: extractGroupLetter(round),
      dates
    };
  });
}

async function fetchFeaturedStats({ fixtures, apiKey, enabled }) {
  if (!enabled) {
    return [];
  }

  const finishedFixtures = fixtures
    .filter((fixture) => ["FT", "AET", "PEN"].includes(fixture.status.short))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 3);

  const stats = await Promise.all(
    finishedFixtures.map(async (fixture) => {
      const response = await optionalApiRequest(
        "fixtures/statistics",
        { fixture: fixture.id, half: "true" },
        apiKey
      );

      if (!Array.isArray(response.response) || !response.response.length) {
        return null;
      }

      return {
        fixtureId: fixture.id,
        stage: fixture.stage,
        round: fixture.round,
        date: fixture.date,
        venue: fixture.venue,
        teams: fixture.teams,
        statistics: response.response.map((entry) => ({
          team: {
            id: entry.team?.id,
            name: entry.team?.name,
            logo: entry.team?.logo ?? null
          },
          values: statisticsToRecord(entry.statistics)
        }))
      };
    })
  );

  return stats.filter(Boolean);
}

function statisticsToRecord(statistics = []) {
  const record = {};

  for (const stat of statistics) {
    record[stat.type] = stat.value;
  }

  return record;
}

function collectUniqueTeams(groups) {
  const teams = new Map();

  for (const group of groups) {
    for (const team of group.teams ?? []) {
      teams.set(team.id, team);
    }
  }

  return [...teams.values()];
}

async function fetchFifaRankings(teams) {
  const schedule = await fetchLatestFifaRankingSchedule();
  const response = await fetch(
    `https://api.fifa.com/api/v3/fifarankings/rankings/rankingsbyschedule?rankingScheduleId=${encodeURIComponent(
      schedule.id
    )}&language=en`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    return {
      lookup: new Map(),
      warnings: [`FIFA rankings request failed with status ${response.status}.`],
      meta: {
        source: FIFA_MENS_RANKING_URL,
        rankingScheduleId: schedule.id,
        lastUpdateDate: schedule.iso ?? null,
        teamsRequested: teams.length,
        teamsMapped: 0,
        teamsRanked: 0
      }
    };
  }

  const data = await response.json();
  const rows = Array.isArray(data?.Results) ? data.Results : [];
  const rankingsByCountry = new Map(
    rows
      .filter((entry) => entry?.IdCountry && Number.isFinite(Number(entry?.Rank)))
      .map((entry) => [
        String(entry.IdCountry).toUpperCase(),
        {
          countryCode: String(entry.IdCountry).toUpperCase(),
          rank: Number(entry.Rank),
          totalPoints: toNumber(entry.TotalPoints),
          previousRank: toNumber(entry.PrevRank),
          previousPoints: toNumber(entry.PrevPoints),
          rankingMovement: toNumber(entry.RankingMovement),
          ratedMatches: toNumber(entry.RatedMatches),
          confederation: entry.ConfederationName ?? null
        }
      ])
  );
  const lookup = new Map();
  const warnings = [];
  const unmappedTeams = [];
  const missingRankings = [];

  for (const team of teams) {
    const fifaCode = resolveFifaCountryCode(team);

    if (!fifaCode) {
      unmappedTeams.push(team.name);
      continue;
    }

    const ranking = rankingsByCountry.get(fifaCode);

    if (!ranking) {
      missingRankings.push(team.name);
      continue;
    }

    lookup.set(team.id, ranking);
  }

  if (unmappedTeams.length) {
    warnings.push(
      `FIFA ranking codes could not be resolved for ${unmappedTeams.length} team(s): ${unmappedTeams.join(
        ", "
      )}.`
    );
  }

  if (missingRankings.length) {
    warnings.push(
      `Official FIFA rankings were not found in the latest schedule for ${missingRankings.length} team(s): ${missingRankings.join(
        ", "
      )}.`
    );
  }

  return {
    lookup,
    warnings,
    meta: {
      source: FIFA_MENS_RANKING_URL,
      rankingScheduleId: schedule.id,
      lastUpdateDate: schedule.iso ?? null,
      matchWindowEndDate: schedule.matchWindowEndDate ?? null,
      teamsRequested: teams.length,
      teamsMapped: teams.length - unmappedTeams.length,
      teamsRanked: lookup.size
    }
  };
}

async function fetchLatestFifaRankingSchedule() {
  const response = await fetch(FIFA_MENS_RANKING_URL);

  if (!response.ok) {
    throw new Error(`FIFA rankings page request failed with status ${response.status}.`);
  }

  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (!match) {
    throw new Error("Could not parse the FIFA rankings page metadata.");
  }

  const data = JSON.parse(match[1]);
  const schedule = data?.props?.pageProps?.pageData?.ranking?.dates?.[0]?.dates?.[0];

  if (!schedule?.id) {
    throw new Error("Could not find the latest FIFA ranking schedule id.");
  }

  return schedule;
}

function resolveFifaCountryCode(team) {
  const normalizedName = normalizeLookupKey(team?.name);
  const normalizedCountry = normalizeLookupKey(team?.country);
  const byName =
    TEAM_NAME_TO_FIFA_CODE.get(normalizedName) ?? TEAM_NAME_TO_FIFA_CODE.get(normalizedCountry);

  if (byName) {
    return byName;
  }

  const rawCode = String(team?.code || "").trim().toUpperCase();

  if (!rawCode || AMBIGUOUS_API_CODES.has(rawCode)) {
    return null;
  }

  return FIFA_CODE_FIXUPS[rawCode] ?? rawCode;
}

function normalizeLookupKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

async function fetchTeamStrengthSignals({ fixtures, apiKey }) {
  const eligibleFixtures = fixtures.filter(
    (fixture) => Number.isInteger(fixture?.id) && fixture?.teams?.home?.id && fixture?.teams?.away?.id
  );
  const lookup = new Map();
  const meta = {
    fixturesConsidered: eligibleFixtures.length,
    fixturesWithPredictions: 0,
    fixturesWithOdds: 0
  };

  await mapWithConcurrency(eligibleFixtures, EXTERNAL_FETCH_CONCURRENCY, async (fixture) => {
    const [predictionResponse, oddsResponse] = await Promise.all([
      optionalApiRequest("predictions", { fixture: fixture.id }, apiKey),
      optionalApiRequest("odds", { fixture: fixture.id }, apiKey)
    ]);
    const predictionEntry = Array.isArray(predictionResponse.response)
      ? predictionResponse.response[0]
      : null;
    const oddsEntry = Array.isArray(oddsResponse.response)
      ? oddsResponse.response.find((entry) => Array.isArray(entry?.bookmakers) && entry.bookmakers.length) ??
        oddsResponse.response[0]
      : null;

    if (isUsablePredictionEntry(predictionEntry)) {
      meta.fixturesWithPredictions += 1;
      applyPredictionSignals(lookup, fixture, predictionEntry);
    }

    if (oddsEntry?.bookmakers?.length) {
      meta.fixturesWithOdds += 1;
      applyOddsSignals(lookup, fixture, oddsEntry);
    }
  });

  const warnings = [];

  if (!meta.fixturesWithPredictions) {
    warnings.push("API-Football predictions are currently unavailable for the fetched World Cup fixtures.");
  }

  if (!meta.fixturesWithOdds) {
    warnings.push(
      "API-Football pre-match odds are currently unavailable for the fetched World Cup fixtures, so team scores are leaning on FIFA rankings and prediction-side signals."
    );
  }

  return {
    lookup,
    warnings,
    meta
  };
}

function isUsablePredictionEntry(predictionEntry) {
  const advice = normalizeLookupKey(predictionEntry?.predictions?.advice);

  if (advice === "no predictions available") {
    return false;
  }

  return true;
}

function applyPredictionSignals(lookup, fixture, predictionEntry) {
  const drawPercent = parsePercent(predictionEntry?.predictions?.percent?.draw);
  const comparison = predictionEntry?.comparison ?? {};
  const predictionTeams = predictionEntry?.teams ?? {};
  const sides = [
    {
      side: "home",
      team: fixture.teams.home,
      teamMetrics: predictionTeams.home,
      winPercent: parsePercent(predictionEntry?.predictions?.percent?.home)
    },
    {
      side: "away",
      team: fixture.teams.away,
      teamMetrics: predictionTeams.away,
      winPercent: parsePercent(predictionEntry?.predictions?.percent?.away)
    }
  ];

  for (const entry of sides) {
    const bucket = getOrCreateTeamSignalBucket(lookup, entry.team.id);
    const lastFive = entry.teamMetrics?.last_5 ?? {};
    const league = entry.teamMetrics?.league ?? {};
    const playedFixtures = toNumber(league?.fixtures?.played?.total);
    const penaltyTotal = toNumber(league?.penalty?.total);
    const closeMatchScore =
      entry.winPercent == null ? null : clampNumber(100 - Math.abs(entry.winPercent - 50) * 2, 0, 100);

    pushSignal(bucket.overall, entry.winPercent, 2);
    pushSignal(bucket.overall, parsePercent(comparison.total?.[entry.side]), 2);
    pushSignal(bucket.overall, parsePercent(comparison.form?.[entry.side]), 1.5);
    pushSignal(bucket.overall, parsePercent(comparison.h2h?.[entry.side]), 1);

    pushSignal(bucket.attack, parsePercent(comparison.att?.[entry.side]), 2);
    pushSignal(bucket.attack, parsePercent(comparison.goals?.[entry.side]), 1.5);
    pushSignal(bucket.attack, parsePercent(lastFive?.att), 1.5);
    pushSignal(bucket.attack, scaleGoalsForAverage(lastFive?.goals?.for?.average), 1.25);
    pushSignal(bucket.attack, scaleGoalsForAverage(league?.goals?.for?.average?.total), 1);

    pushSignal(bucket.defense, parsePercent(comparison.def?.[entry.side]), 2);
    pushSignal(bucket.defense, parsePercent(lastFive?.def), 1.5);
    pushSignal(bucket.defense, scaleGoalsAgainstAverage(lastFive?.goals?.against?.average), 1.25);
    pushSignal(bucket.defense, scaleGoalsAgainstAverage(league?.goals?.against?.average?.total), 1);
    pushSignal(bucket.defense, ratioToPercent(league?.clean_sheet?.total, playedFixtures), 1);

    if (penaltyTotal > 0) {
      pushSignal(bucket.penalties, parsePercent(league?.penalty?.scored?.percentage), 2);
      pushSignal(bucket.penalties, invertPercent(league?.penalty?.missed?.percentage), 1.5);
    }

    pushSignal(bucket.penalties, drawPercent, 1);
    pushSignal(bucket.penalties, closeMatchScore, 1);
  }
}

function applyOddsSignals(lookup, fixture, oddsEntry) {
  const markets = extractOddsSignals(oddsEntry);

  if (markets.matchWinner) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).overall, markets.matchWinner.home * 100, 2);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).overall, markets.matchWinner.away * 100, 2);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).penalties, markets.matchWinner.draw * 100, 1.25);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).penalties, markets.matchWinner.draw * 100, 1.25);
  }

  if (markets.teamToScoreFirst) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).attack, markets.teamToScoreFirst.home * 100, 1.25);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).attack, markets.teamToScoreFirst.away * 100, 1.25);
  }

  if (markets.overUnder25) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).attack, markets.overUnder25.over * 100, 0.75);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).attack, markets.overUnder25.over * 100, 0.75);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).defense, markets.overUnder25.under * 100, 0.75);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).defense, markets.overUnder25.under * 100, 0.75);
  }

  if (markets.bttsYes != null) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).attack, markets.bttsYes * 100, 0.5);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).attack, markets.bttsYes * 100, 0.5);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).defense, (1 - markets.bttsYes) * 100, 0.5);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).defense, (1 - markets.bttsYes) * 100, 0.5);
  }

  if (markets.cleanSheetHome != null) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).defense, markets.cleanSheetHome * 100, 1.25);
  }

  if (markets.cleanSheetAway != null) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).defense, markets.cleanSheetAway * 100, 1.25);
  }

  if (markets.winToNilHome != null) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).overall, markets.winToNilHome * 100, 0.75);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.home.id).defense, markets.winToNilHome * 100, 1);
  }

  if (markets.winToNilAway != null) {
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).overall, markets.winToNilAway * 100, 0.75);
    pushSignal(getOrCreateTeamSignalBucket(lookup, fixture.teams.away.id).defense, markets.winToNilAway * 100, 1);
  }
}

function createTeamSignalBucket() {
  return {
    overall: [],
    attack: [],
    defense: [],
    penalties: []
  };
}

function getOrCreateTeamSignalBucket(lookup, teamId) {
  if (!lookup.has(teamId)) {
    lookup.set(teamId, createTeamSignalBucket());
  }

  return lookup.get(teamId);
}

function pushSignal(list, value, weight = 1) {
  if (Number.isFinite(value)) {
    list.push({ value: clampNumber(value, 0, 100), weight });
  }
}

function extractOddsSignals(oddsEntry) {
  const bookmakers = Array.isArray(oddsEntry?.bookmakers) ? oddsEntry.bookmakers : [];

  return {
    matchWinner: averageMarketProbabilities(bookmakers, ["Match Winner"], parseThreeWayBet),
    teamToScoreFirst: averageMarketProbabilities(bookmakers, ["Team To Score First"], parseThreeWayBet),
    overUnder25: averageMarketProbabilities(bookmakers, ["Goals Over/Under"], parseGoalsOverUnderBet),
    bttsYes: averageSingleProbability(bookmakers, ["Both Teams Score"], parseYesNoBet),
    cleanSheetHome: averageSingleProbability(bookmakers, ["Clean Sheet - Home"], parseYesNoBet),
    cleanSheetAway: averageSingleProbability(bookmakers, ["Clean Sheet - Away"], parseYesNoBet),
    winToNilHome: averageSingleProbability(bookmakers, ["Win To Nil - Home", "Win to Nil - Home"], parseYesNoBet),
    winToNilAway: averageSingleProbability(bookmakers, ["Win To Nil - Away", "Win to Nil - Away"], parseYesNoBet)
  };
}

function averageMarketProbabilities(bookmakers, marketNames, parser) {
  const samples = [];

  for (const bookmaker of bookmakers) {
    for (const bet of bookmaker?.bets ?? []) {
      if (!marketNames.some((name) => compareMarketName(bet?.name, name))) {
        continue;
      }

      const parsed = parser(bet?.values ?? []);

      if (parsed && Object.keys(parsed).length) {
        samples.push(parsed);
      }
    }
  }

  if (!samples.length) {
    return null;
  }

  const keys = new Set(samples.flatMap((sample) => Object.keys(sample)));
  const averaged = {};

  for (const key of keys) {
    const values = samples.map((sample) => sample[key]).filter(Number.isFinite);

    if (values.length) {
      averaged[key] = averageNumbers(values);
    }
  }

  return Object.keys(averaged).length ? averaged : null;
}

function averageSingleProbability(bookmakers, marketNames, parser) {
  const market = averageMarketProbabilities(bookmakers, marketNames, parser);
  return market?.yes ?? null;
}

function parseThreeWayBet(values) {
  const probabilities = {
    home: oddToProbability(findBetValue(values, "Home")),
    draw: oddToProbability(findBetValue(values, "Draw")),
    away: oddToProbability(findBetValue(values, "Away"))
  };
  const normalizer = Object.values(probabilities)
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);

  if (!normalizer) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(probabilities)
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => [key, value / normalizer])
  );
}

function parseGoalsOverUnderBet(values) {
  const over = oddToProbability(findBetValue(values, "Over 2.5"));
  const under = oddToProbability(findBetValue(values, "Under 2.5"));
  const normalizer = [over, under].filter(Number.isFinite).reduce((sum, value) => sum + value, 0);

  if (!normalizer) {
    return null;
  }

  return {
    over: Number.isFinite(over) ? over / normalizer : null,
    under: Number.isFinite(under) ? under / normalizer : null
  };
}

function parseYesNoBet(values) {
  const yes = oddToProbability(findBetValue(values, "Yes"));
  const no = oddToProbability(findBetValue(values, "No"));
  const normalizer = [yes, no].filter(Number.isFinite).reduce((sum, value) => sum + value, 0);

  if (!normalizer || !Number.isFinite(yes)) {
    return null;
  }

  return {
    yes: yes / normalizer
  };
}

function findBetValue(values, label) {
  const entry = values.find((value) => compareMarketName(value?.value, label));
  return entry?.odd ?? null;
}

function compareMarketName(left, right) {
  return normalizeLookupKey(left) === normalizeLookupKey(right);
}

function oddToProbability(value) {
  const odd = toNumber(value);

  if (!Number.isFinite(odd) || odd <= 0) {
    return null;
  }

  return 1 / odd;
}

function enrichGroupsWithTeamMetrics(groups, fifaRankingLookup, teamSignalLookup) {
  const metricsLookup = buildTeamMetricsLookup(groups, fifaRankingLookup, teamSignalLookup);

  return groups.map((group) => ({
    ...group,
    teams: group.teams.map((team) => ({
      ...team,
      ...(metricsLookup.get(team.id) ?? createDefaultTeamMetrics())
    }))
  }));
}

function buildTeamMetricsLookup(groups, fifaRankingLookup, teamSignalLookup) {
  const lookup = new Map();

  for (const team of collectUniqueTeams(groups)) {
    const ranking = fifaRankingLookup.get(team.id) ?? null;
    const signals = teamSignalLookup.get(team.id) ?? createTeamSignalBucket();
    const rankingStrength = ranking?.rank ? fifaRankToScore(ranking.rank) : null;
    const attack = roundScore(
      weightedAverage([
        { value: rankingStrength, weight: 1 },
        ...signals.attack
      ])
    );
    const defense = roundScore(
      weightedAverage([
        { value: rankingStrength, weight: 1 },
        ...signals.defense
      ])
    );
    const penalties = roundScore(
      weightedAverage([
        { value: 50, weight: 1 },
        { value: rankingStrength, weight: 0.5 },
        ...signals.penalties
      ])
    );
    const predictionStrength = weightedAverage(signals.overall);
    const overallStrength = roundScore(
      weightedAverage([
        { value: rankingStrength, weight: 3 },
        { value: predictionStrength, weight: 2 },
        { value: attack, weight: 1.25 },
        { value: defense, weight: 1.25 },
        { value: penalties, weight: 0.75 }
      ])
    );

    lookup.set(team.id, {
      fifaGlobalRanking: ranking?.rank ?? null,
      fifaGlobalRankingPoints: ranking?.totalPoints ?? null,
      teamScores: {
        overallStrength,
        attack,
        defense,
        penalties
      }
    });
  }

  return lookup;
}

function createDefaultTeamMetrics() {
  return {
    fifaGlobalRanking: null,
    fifaGlobalRankingPoints: null,
    teamScores: createEmptyTeamScores()
  };
}

function createEmptyTeamScores() {
  return {
    overallStrength: null,
    attack: null,
    defense: null,
    penalties: null
  };
}

function fifaRankToScore(rank) {
  if (!Number.isFinite(rank) || rank <= 0) {
    return null;
  }

  return clampNumber(((MAX_FIFA_RANK - rank + 1) / MAX_FIFA_RANK) * 100, 0, 100);
}

function weightedAverage(samples) {
  const values = samples.filter(
    (sample) => sample && Number.isFinite(sample.value) && Number.isFinite(sample.weight) && sample.weight > 0
  );

  if (!values.length) {
    return null;
  }

  const totalWeight = values.reduce((sum, sample) => sum + sample.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return values.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight;
}

function averageNumbers(values) {
  const numbers = values.filter(Number.isFinite);

  if (!numbers.length) {
    return null;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function roundScore(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePercent(value) {
  if (value == null || value === "") {
    return null;
  }

  const number = Number.parseFloat(String(value).replace("%", ""));
  return Number.isFinite(number) ? number : null;
}

function invertPercent(value) {
  const percent = parsePercent(value);
  return percent == null ? null : clampNumber(100 - percent, 0, 100);
}

function toNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ratioToPercent(part, total) {
  const numerator = toNumber(part);
  const denominator = toNumber(total);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return clampNumber((numerator / denominator) * 100, 0, 100);
}

function scaleGoalsForAverage(value) {
  const average = toNumber(value);

  if (!Number.isFinite(average)) {
    return null;
  }

  return clampNumber(average * 40, 0, 100);
}

function scaleGoalsAgainstAverage(value) {
  const average = toNumber(value);

  if (!Number.isFinite(average)) {
    return null;
  }

  return clampNumber(100 - average * 40, 0, 100);
}

function extractGroupLetter(value) {
  const match = String(value || "").match(/group\s+([a-l])/i);
  return match ? match[1].toUpperCase() : null;
}

function classifyStage(round) {
  const label = String(round || "").toLowerCase();

  if (label.includes("group")) {
    return "Group Stage";
  }

  if (label.includes("round of 32") || label.includes("32nd")) {
    return "Round of 32";
  }

  if (label.includes("round of 16") || label.includes("8th")) {
    return "Round of 16";
  }

  if (label.includes("quarter")) {
    return "Quarter-finals";
  }

  if (label.includes("semi")) {
    return "Semi-finals";
  }

  if (label.includes("third")) {
    return "Third-place play-off";
  }

  if (label.includes("final")) {
    return "Final";
  }

  return "Other";
}

function finalizeWorldCupData(base) {
  const groups = [...(base.groups ?? [])]
    .sort((left, right) => left.letter.localeCompare(right.letter))
    .map((group) => ({
      ...group,
      teams: group.teams.map((team, index) => ({
        ...team,
        groupLetter: group.letter,
        fifaGlobalRanking: team.fifaGlobalRanking ?? null,
        fifaGlobalRankingPoints: team.fifaGlobalRankingPoints ?? null,
        teamScores: {
          ...createEmptyTeamScores(),
          ...(team.teamScores ?? {})
        },
        standing: {
          rank: team.standing?.rank ?? index + 1,
          points: team.standing?.points ?? null,
          goalDifference: team.standing?.goalDifference ?? null,
          form: team.standing?.form ?? null,
          played: team.standing?.played ?? null,
          wins: team.standing?.wins ?? null,
          draws: team.standing?.draws ?? null,
          losses: team.standing?.losses ?? null,
          goalsFor: team.standing?.goalsFor ?? null,
          goalsAgainst: team.standing?.goalsAgainst ?? null,
          description: team.standing?.description ?? null,
          update: team.standing?.update ?? null
        }
      })),
      fixtures: group.fixtures ?? []
    }));

  const fixtures = [...(base.fixtures ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const rounds = [...(base.rounds ?? [])];
  const venues = [...(base.venues ?? [])];
  const thirdPlaceRanking = buildThirdPlaceRanking(groups);
  const playoffBoard = buildPlayoffBoard(groups, thirdPlaceRanking);
  const stages = buildStages(fixtures, rounds);

  return {
    source: {
      documentation: DOCUMENTATION_URL,
      scheduleSource: FIFA_SCHEDULE_URL,
      ...(base.source ?? {})
    },
    competition: base.competition ?? null,
    summary: buildSummary(groups, fixtures, venues, stages),
    groups,
    fixtures,
    rounds,
    stages,
    venues,
    featuredStats: base.featuredStats ?? [],
    thirdPlaceRanking,
    playoffBoard
  };
}

function buildThirdPlaceRanking(groups) {
  return groups
    .map((group) => group.teams[2])
    .filter(Boolean)
    .sort(compareTeamsForThirdPlace);
}

function compareTeamsForThirdPlace(left, right) {
  const pointsDelta = (right.standing?.points ?? Number.NEGATIVE_INFINITY) - (left.standing?.points ?? Number.NEGATIVE_INFINITY);
  if (pointsDelta !== 0) {
    return pointsDelta;
  }

  const gdDelta =
    (right.standing?.goalDifference ?? Number.NEGATIVE_INFINITY) -
    (left.standing?.goalDifference ?? Number.NEGATIVE_INFINITY);
  if (gdDelta !== 0) {
    return gdDelta;
  }

  const gfDelta =
    (right.standing?.goalsFor ?? Number.NEGATIVE_INFINITY) -
    (left.standing?.goalsFor ?? Number.NEGATIVE_INFINITY);
  if (gfDelta !== 0) {
    return gfDelta;
  }

  return `${left.groupLetter}${left.name}`.localeCompare(`${right.groupLetter}${right.name}`);
}

function buildPlayoffBoard(groups, thirdPlaceRanking) {
  const advancingThirdPlaces = thirdPlaceRanking.slice(0, 8);
  const groupIndex = new Map(groups.map((group) => [group.letter, group]));

  return {
    automaticQualifiers: groups.flatMap((group) => group.teams.slice(0, 2)),
    advancingThirdPlaces,
    knockoutTemplate: KNOCKOUT_TEMPLATE.map((match) => ({
      ...match,
      home: resolveTemplateSource(match.homeSource, groupIndex, advancingThirdPlaces),
      away: resolveTemplateSource(match.awaySource, groupIndex, advancingThirdPlaces)
    }))
  };
}

function resolveTemplateSource(source, groupIndex, advancingThirdPlaces) {
  if (source.type === "groupPlacement") {
    const team = groupIndex.get(source.group)?.teams?.[source.placement - 1] ?? null;
    return {
      type: "team",
      label: team ? `${team.groupLetter}${source.placement} • ${team.name}` : `${source.group}${source.placement}`,
      team
    };
  }

  if (source.type === "thirdEligible") {
    const candidates = advancingThirdPlaces.filter((team) => source.groups.includes(team.groupLetter));
    return {
      type: "thirdEligible",
      label: `Best 3rd from ${source.groups.join("/")}`,
      candidates
    };
  }

  if (source.type === "matchWinner") {
    return {
      type: "matchLink",
      label: `Winner match ${source.match}`,
      match: source.match
    };
  }

  return {
    type: "matchLink",
    label: `Loser match ${source.match}`,
    match: source.match
  };
}

function buildStages(fixtures, rounds) {
  const counts = new Map();

  for (const fixture of fixtures) {
    counts.set(fixture.stage, (counts.get(fixture.stage) ?? 0) + 1);
  }

  for (const round of rounds) {
    if (!counts.has(round.stage)) {
      counts.set(round.stage, 0);
    }
  }

  for (const match of KNOCKOUT_TEMPLATE) {
    if (!counts.has(match.stage)) {
      counts.set(match.stage, 0);
    }
  }

  return [...counts.entries()].map(([stage, fixturesCount]) => ({
    stage,
    fixturesCount
  }));
}

function buildSummary(groups, fixtures, venues, stages) {
  const uniqueVenueKeys = new Set(
    venues.map((venue) => `${venue.name}:${venue.city ?? ""}:${venue.country ?? ""}`)
  );

  const hostCountries = Array.from(
    new Set(
      venues
        .map((venue) => venue.country)
        .filter(Boolean)
        .concat(HOST_COUNTRIES)
    )
  );

  return {
    groupsCount: groups.length,
    teamsCount: groups.reduce((count, group) => count + group.teams.length, 0),
    fixturesCount: fixtures.length,
    playedFixturesCount: fixtures.filter((fixture) =>
      ["FT", "AET", "PEN"].includes(fixture.status.short)
    ).length,
    venuesCount: uniqueVenueKeys.size,
    stagesCount: stages.length,
    hostCountries,
    dateRange: fixtures.length
      ? {
          start: fixtures[0].date,
          end: fixtures[fixtures.length - 1].date
        }
      : null
  };
}

async function readCache() {
  try {
    const cacheText = await readFile(CACHE_FILE, "utf8");
    const cache = JSON.parse(cacheText);
    const fileStat = await stat(CACHE_FILE);
    return {
      cachedAt: fileStat.mtimeMs,
      payload: cache
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeCache(payload) {
  await mkdir(new URL("../data/cache/", import.meta.url), { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
