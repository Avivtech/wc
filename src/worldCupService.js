import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import { buildDemoWorldCupBase } from "./data/demoWorldCup.js";
import { KNOCKOUT_TEMPLATE } from "./data/knockoutTemplate.js";

const RAPIDAPI_HOST = "free-api-live-football-data.p.rapidapi.com";
const API_BASE_URL = `https://${RAPIDAPI_HOST}`;
const DOCUMENTATION_URL = "https://rapidapi.com/Creativesdev/api/free-api-live-football-data";
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
const RAPIDAPI_ENDPOINTS = {
  leaguesSearch: "football-leagues-search",
  leaguesAll: "football-get-all-leagues",
  standings: "football-get-standing-all",
  teams: "football-get-list-all-team",
  fixtures: "football-get-all-matches-by-league",
  rounds: "football-get-all-rounds"
};
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

    const apiKey = String(process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || "").trim();

    if (!apiKey) {
      return finalizeWorldCupData(buildDemoWorldCupBase("No RAPIDAPI_KEY was found in the environment."));
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
  const seasonCoverage = leagueEntry.season.coverage ?? createRapidApiCoverage();

  const [standingsResult, teamsResult, fixturesResult, roundsResult] = await Promise.all([
    optionalApiRequest(RAPIDAPI_ENDPOINTS.standings, leagueQueryParams(leagueId), apiKey),
    optionalApiRequest(RAPIDAPI_ENDPOINTS.teams, leagueQueryParams(leagueId), apiKey),
    optionalApiRequest(RAPIDAPI_ENDPOINTS.fixtures, leagueQueryParams(leagueId), apiKey),
    optionalApiRequest(RAPIDAPI_ENDPOINTS.rounds, leagueQueryParams(leagueId), apiKey)
  ]);

  const teamLookup = buildTeamLookup(extractApiRows(teamsResult));
  const rawFixtures = extractApiRows(fixturesResult);
  const venueLookup = new Map();

  const normalizedFixtures = rawFixtures.map((fixture) =>
    normalizeFixture(fixture, teamLookup, venueLookup, timezone)
  ).filter(Boolean);
  const normalizedVenues = collectVenues(normalizedFixtures, venueLookup);

  const groups = buildGroups({
    standingsResponse: extractApiRows(standingsResult),
    teamLookup,
    fixtures: normalizedFixtures
  });

  const normalizedRounds = normalizeRounds(extractApiRows(roundsResult));
  const [featuredStats, fifaRankingsResult, teamSignalsResult] = await Promise.all([
    fetchFeaturedStats({
      fixtures: normalizedFixtures,
      apiKey,
      enabled: false
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
      provider: "RapidAPI Free API Live Football Data",
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
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": RAPIDAPI_HOST,
      Accept: "application/json"
    }
  });

  if (response.status === 204) {
    return { response: [] };
  }

  if (!response.ok) {
    throw new Error(`RapidAPI football ${endpoint} request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const errors = formatApiErrors(data?.errors);

  if (errors || data?.message) {
    throw new Error(`RapidAPI football ${endpoint} returned errors: ${errors || data.message}`);
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

function leagueQueryParams(leagueId) {
  return {
    leagueid: leagueId
  };
}

function createRapidApiCoverage() {
  return {
    standings: true,
    fixtures: {
      events: true,
      lineups: true,
      statistics_fixtures: true,
      statistics_players: false
    },
    players: true,
    predictions: false,
    odds: true
  };
}

function extractApiRows(data) {
  if (Array.isArray(data)) {
    return data;
  }

  for (const value of [
    data?.response,
    data?.data,
    data?.results,
    data?.result,
    data?.events,
    data?.matches,
    data?.teams,
    data?.leagues,
    data?.standings,
    data?.rows
  ]) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  for (const value of Object.values(data ?? {})) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return data && typeof data === "object" ? [data] : [];
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
  const configuredLeagueId = String(process.env.RAPIDAPI_WORLD_CUP_LEAGUE_ID || "").trim();

  if (configuredLeagueId) {
    const detail = await optionalApiRequest("football-get-league-detail", leagueQueryParams(configuredLeagueId), apiKey);
    const league = extractApiRows(detail)[0] ?? {};
    return normalizeLeagueEntry({
      id: configuredLeagueId,
      name: league.name ?? league.leagueName ?? league.title ?? "World Cup",
      country: league.country ?? league.category ?? league.countryName ?? "World",
      raw: league
    });
  }

  const [searchResult, allResult] = await Promise.all([
    optionalApiRequest(
      RAPIDAPI_ENDPOINTS.leaguesSearch,
      {
        q: "world cup",
        query: "world cup",
        search: "world cup"
      },
      apiKey
    ),
    optionalApiRequest(RAPIDAPI_ENDPOINTS.leaguesAll, {}, apiKey)
  ]);

  const candidates = [...extractApiRows(searchResult), ...extractApiRows(allResult)]
    .map(normalizeLeagueEntry)
    .filter(Boolean)
    .filter((entry) => {
      const name = normalizeLookupKey(entry.league?.name);
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
    throw new Error("Could not find the FIFA World Cup league in RapidAPI Free API Live Football Data. Set RAPIDAPI_WORLD_CUP_LEAGUE_ID if the provider search does not expose it.");
  }

  return candidates[0];
}

function scoreLeague(entry) {
  const exactName = String(entry.league?.name || "").toLowerCase() === "world cup" ? 100 : 0;
  const worldCountry = String(entry.country?.name || "").toLowerCase() === "world" ? 20 : 0;
  const standingsCoverage = entry.season?.coverage?.standings ? 5 : 0;
  return exactName + worldCountry + standingsCoverage;
}

function normalizeLeagueEntry(entry) {
  const leagueSource = entry?.league ?? entry?.uniqueTournament ?? entry?.tournament ?? entry;
  const id = firstDefined(
    leagueSource?.id,
    leagueSource?.leagueId,
    leagueSource?.leagueid,
    entry?.leagueId,
    entry?.leagueid,
    entry?.id
  );
  const name = firstDefined(
    leagueSource?.name,
    leagueSource?.leagueName,
    leagueSource?.title,
    entry?.leagueName,
    entry?.name,
    entry?.title
  );

  if (id == null || !name) {
    return null;
  }

  const countrySource = entry?.country ?? entry?.category ?? leagueSource?.country ?? {};
  const season = {
    year: WORLD_CUP_SEASON,
    coverage: createRapidApiCoverage()
  };

  return {
    ...entry,
    league: {
      id,
      name,
      logo: firstDefined(leagueSource?.logo, leagueSource?.image, leagueSource?.logoUrl, null)
    },
    country: {
      name: normalizeCountryName(countrySource) ?? "World"
    },
    season
  };
}

function buildTeamLookup(teamResponse = []) {
  const lookup = new Map();

  for (const entry of teamResponse) {
    const team = normalizeTeamSource(entry?.team ?? entry);

    if (team?.id != null) {
      lookup.set(team.id, team);
    }
  }

  return lookup;
}

function normalizeTeamSource(source = {}, fallback = {}) {
  const id = firstDefined(
    source.id,
    source.teamId,
    source.teamid,
    source.idTeam,
    fallback.id,
    fallback.teamId,
    fallback.teamid
  );
  const name = firstDefined(
    source.name,
    source.shortName,
    source.teamName,
    source.homeTeam,
    source.awayTeam,
    fallback.name,
    fallback.teamName
  );

  if (id == null && !name) {
    return null;
  }

  const countrySource = source.country ?? source.category ?? fallback.country ?? fallback.category ?? {};

  return {
    id: id ?? normalizeLookupKey(name),
    name: name ?? "TBD",
    code: firstDefined(source.code, source.nameCode, source.abbreviation, source.slug, null),
    country: normalizeCountryName(countrySource) ?? source.countryName ?? null,
    national: firstDefined(source.national, source.type === "national", null),
    logo: firstDefined(source.logo, source.logoUrl, source.image, source.teamLogo, source.flag, null),
    venue: source.venue ?? fallback.venue ?? null
  };
}

function normalizeCountryName(countrySource) {
  if (!countrySource) {
    return null;
  }

  if (typeof countrySource === "string") {
    return countrySource;
  }

  return firstDefined(countrySource.name, countrySource.countryName, countrySource.alpha2, countrySource.slug, null);
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

function normalizeFixture(fixture, teamLookup, venueLookup, timezone = "UTC") {
  if (fixture?.fixture?.id != null) {
    return normalizeApiFootballFixture(fixture, teamLookup, venueLookup);
  }

  const homeTeam = normalizeFixtureTeam(fixture?.homeTeam ?? fixture?.home ?? {}, teamLookup, fixture, "home");
  const awayTeam = normalizeFixtureTeam(fixture?.awayTeam ?? fixture?.away ?? {}, teamLookup, fixture, "away");
  const id = firstDefined(fixture?.id, fixture?.eventId, fixture?.eventid, fixture?.matchId, fixture?.matchid);

  if (id == null || !homeTeam || !awayTeam) {
    return null;
  }

  const timestamp = normalizeFixtureTimestamp(fixture);
  const date = normalizeFixtureDate(fixture, timestamp);
  const round = normalizeFixtureRound(fixture);
  const venue = fixture?.venue ?? fixture?.stadium ?? fixture?.location ?? {};

  return {
    id,
    date,
    timestamp,
    timezone,
    referee: firstDefined(fixture?.referee?.name, fixture?.referee, null),
    stage: classifyStage(round),
    round,
    groupLetter: extractGroupLetter(round),
    status: normalizeFixtureStatus(fixture),
    venue: {
      id: firstDefined(venue?.id, venue?.venueId, null),
      name: firstDefined(venue?.name, venue?.venueName, fixture?.venueName, "TBD"),
      city: firstDefined(venue?.city, venue?.cityName, fixture?.city, null),
      country: firstDefined(venue?.country?.name, venue?.countryName, venue?.country, null),
      capacity: toNumber(venue?.capacity),
      image: firstDefined(venue?.image, venue?.imageUrl, null)
    },
    teams: {
      home: homeTeam,
      away: awayTeam
    },
    goals: normalizeFixtureGoals(fixture),
    score: normalizeFixtureScore(fixture)
  };
}

function normalizeApiFootballFixture(fixture, teamLookup, venueLookup) {
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

function normalizeFixtureTeam(team, teamLookup, fixture = {}, side = "") {
  const teamInfo = teamLookup.get(team?.id);
  const fallback = side
    ? {
        id: firstDefined(fixture?.[`${side}TeamId`], fixture?.[`${side}Id`]),
        name: firstDefined(fixture?.[`${side}TeamName`], fixture?.[`${side}Team`]),
        logo: firstDefined(fixture?.[`${side}TeamLogo`], fixture?.[`${side}Logo`])
      }
    : {};
  const normalized = normalizeTeamSource(team, fallback);

  if (!normalized) {
    return null;
  }

  return {
    id: normalized.id,
    name: normalized.name,
    code: teamInfo?.code ?? normalized.code ?? null,
    country: teamInfo?.country ?? normalized.country ?? null,
    logo: normalized.logo ?? teamInfo?.logo ?? null,
    winner: firstDefined(team?.winner, null)
  };
}

function normalizeFixtureTimestamp(fixture) {
  const raw = firstDefined(fixture?.startTimestamp, fixture?.timestamp, fixture?.time, fixture?.startTime);
  const number = toNumber(raw);

  if (Number.isFinite(number)) {
    return number > 9999999999 ? Math.floor(number / 1000) : number;
  }

  const parsed = Date.parse(firstDefined(fixture?.date, fixture?.startDate, fixture?.startTime, ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function normalizeFixtureDate(fixture, timestamp) {
  const raw = firstDefined(fixture?.date, fixture?.startDate, fixture?.startTime, null);

  if (raw && Number.isNaN(Number(raw))) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function normalizeFixtureRound(fixture) {
  return firstDefined(
    fixture?.round,
    fixture?.roundName,
    fixture?.roundInfo?.name,
    fixture?.roundInfo?.round,
    fixture?.stage,
    fixture?.tournament?.name,
    fixture?.league?.round,
    "Other"
  );
}

function normalizeFixtureStatus(fixture) {
  const status = fixture?.status ?? {};
  const raw = typeof status === "string" ? status : firstDefined(status.description, status.type, status.short, status.long, fixture?.statusText, "");
  const short = normalizeStatusShort(raw);

  return {
    long: raw || null,
    short,
    elapsed: toNumber(firstDefined(status.elapsed, fixture?.elapsed, fixture?.minute, null))
  };
}

function normalizeStatusShort(status) {
  const label = normalizeLookupKey(status);

  if (!label || label.includes("not started") || label.includes("scheduled")) {
    return "NS";
  }

  if (label.includes("finished") || label === "ft") {
    return "FT";
  }

  if (label.includes("postponed")) {
    return "PST";
  }

  if (label.includes("cancel")) {
    return "CANC";
  }

  if (label.includes("halftime") || label === "ht") {
    return "HT";
  }

  return "LIVE";
}

function normalizeFixtureGoals(fixture) {
  const homeScore = fixture?.homeScore ?? fixture?.score?.home ?? {};
  const awayScore = fixture?.awayScore ?? fixture?.score?.away ?? {};

  return {
    home: firstNumber(
      fixture?.homeScore,
      fixture?.homeGoals,
      fixture?.goals?.home,
      homeScore?.current,
      homeScore?.display,
      homeScore?.normaltime
    ),
    away: firstNumber(
      fixture?.awayScore,
      fixture?.awayGoals,
      fixture?.goals?.away,
      awayScore?.current,
      awayScore?.display,
      awayScore?.normaltime
    )
  };
}

function normalizeFixtureScore(fixture) {
  const goals = normalizeFixtureGoals(fixture);

  return {
    halftime: {
      home: firstNumber(fixture?.score?.halftime?.home, fixture?.homeScore?.period1, fixture?.homeScore?.halfTime),
      away: firstNumber(fixture?.score?.halftime?.away, fixture?.awayScore?.period1, fixture?.awayScore?.halfTime)
    },
    fulltime: {
      home: goals.home,
      away: goals.away
    },
    extratime: {
      home: firstNumber(fixture?.score?.extratime?.home, fixture?.homeScore?.extraTime),
      away: firstNumber(fixture?.score?.extratime?.away, fixture?.awayScore?.extraTime)
    },
    penalty: {
      home: firstNumber(fixture?.score?.penalty?.home, fixture?.homeScore?.penalties),
      away: firstNumber(fixture?.score?.penalty?.away, fixture?.awayScore?.penalties)
    }
  };
}

function buildGroups({ standingsResponse = [], teamLookup, fixtures }) {
  const standingsGroups = normalizeStandingGroupsResponse(standingsResponse)
    .filter((group) => Array.isArray(group) && group.length)
    .filter((groupRows) => Boolean(extractGroupLetter(groupRows[0]?.group)))
    .map((groupRows, index) => normalizeStandingGroup(groupRows, index, teamLookup, fixtures));

  if (standingsGroups.length) {
    return standingsGroups;
  }

  return deriveGroupsFromFixtures(fixtures);
}

function normalizeStandingGroupsResponse(standingsResponse = []) {
  const directGroups = standingsResponse?.[0]?.league?.standings;

  if (Array.isArray(directGroups)) {
    return directGroups;
  }

  const groups = [];

  for (const entry of standingsResponse) {
    const nestedRows = [
      entry?.rows,
      entry?.standings,
      entry?.table,
      entry?.data,
      entry?.response
    ].find(Array.isArray);

    if (nestedRows) {
      groups.push(normalizeRapidStandingRows(nestedRows, entry));
      continue;
    }

    if (entry?.team || entry?.teamName || entry?.position || entry?.rank) {
      const group = extractGroupLetter(firstDefined(entry.group, entry.groupName, entry.name, entry.tournament?.name, ""));
      groups.push([
        {
          ...entry,
          group: group ? `Group ${group}` : firstDefined(entry.group, entry.groupName, "Group A")
        }
      ]);
    }
  }

  if (groups.length > 1 && groups.every((group) => group.length === 1)) {
    const byGroup = new Map();

    for (const [row] of groups) {
      const groupName = row.group ?? "Group A";
      if (!byGroup.has(groupName)) {
        byGroup.set(groupName, []);
      }
      byGroup.get(groupName).push(row);
    }

    return [...byGroup.values()];
  }

  return groups.filter((group) => group.length);
}

function normalizeRapidStandingRows(rows, container = {}) {
  const groupName = firstDefined(container?.name, container?.group, container?.groupName, container?.title, "Group A");

  return rows.map((row) => ({
    ...row,
    group: firstDefined(row?.group, row?.groupName, groupName)
  }));
}

function normalizeStandingGroup(groupRows, index, teamLookup, fixtures) {
  const groupName = String(groupRows[0]?.group || `Group ${String.fromCharCode(65 + index)}`);
  const letter = extractGroupLetter(groupName) ?? String.fromCharCode(65 + index);

  const teams = [...groupRows]
    .sort((left, right) => Number(firstDefined(left.rank, left.position, left.pos, 0)) - Number(firstDefined(right.rank, right.position, right.pos, 0)))
    .map((row) => {
      const team = normalizeTeamSource(row.team ?? row);

      if (!team) {
        return null;
      }

      const details = teamLookup.get(team.id);
      return {
        id: team.id,
        name: team.name,
        code: details?.code ?? team.code ?? null,
        country: details?.country ?? team.country ?? null,
        national: details?.national ?? team.national ?? null,
        logo: team.logo ?? details?.logo ?? null,
        groupLetter: letter,
        ...createDefaultTeamMetrics(),
        standing: {
          rank: firstNumber(row.rank, row.position, row.pos),
          points: firstNumber(row.points, row.pts),
          goalDifference: firstNumber(row.goalsDiff, row.goalDifference, row.diff),
          form: row.form ?? null,
          played: firstNumber(row.all?.played, row.played, row.matches, row.gamesPlayed),
          wins: firstNumber(row.all?.win, row.wins),
          draws: firstNumber(row.all?.draw, row.draws),
          losses: firstNumber(row.all?.lose, row.losses),
          goalsFor: firstNumber(row.all?.goals?.for, row.goalsFor, row.scoresFor),
          goalsAgainst: firstNumber(row.all?.goals?.against, row.goalsAgainst, row.scoresAgainst),
          description: row.description ?? null,
          update: row.update ?? null
        }
      };
    })
    .filter(Boolean);

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
    const round = typeof entry === "string"
      ? entry
      : firstDefined(entry.round, entry.name, entry.title, entry.roundName, entry.slug, "Other");
    const dates = typeof entry === "string" ? [] : entry.dates ?? entry.events ?? [];

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
  return {
    lookup: new Map(),
    warnings: [
      "RapidAPI Free API Live Football Data is being used for tournament data; team strength scores are currently leaning on FIFA rankings only."
    ],
    meta: {
      fixturesConsidered: fixtures.length,
      fixturesWithPredictions: 0,
      fixturesWithOdds: 0
    }
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

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstNumber(...values) {
  for (const value of values) {
    const number = toNumber(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
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
