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

  const groups = buildGroups({
    standingsResponse: standingsResult.response,
    teamLookup,
    fixtures: normalizedFixtures
  });

  const normalizedRounds = normalizeRounds(roundsResult.response);
  const featuredStats = await fetchFeaturedStats({
    fixtures: normalizedFixtures,
    apiKey,
    enabled: Boolean(seasonCoverage?.fixtures?.statistics_fixtures)
  });

  return {
    source: {
      mode: "live",
      provider: "API-Football",
      documentation: DOCUMENTATION_URL,
      scheduleSource: FIFA_SCHEDULE_URL,
      fetchedAt: new Date().toISOString(),
      warnings: [],
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
    groups,
    fixtures: normalizedFixtures,
    rounds: normalizedRounds,
    venues: Array.from(venueLookup.values()).sort((left, right) =>
      `${left.city ?? ""}${left.name}`.localeCompare(`${right.city ?? ""}${right.name}`)
    ),
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
      search: "world cup",
      type: "cup",
      season: WORLD_CUP_SEASON
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
