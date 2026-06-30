import { createRequire } from "node:module";

import { buildDemoWorldCupBase } from "./data/demoWorldCup.js";
import { KNOCKOUT_TEMPLATE } from "./data/knockoutTemplate.js";
import { fetchWithTimeout, withRetry, mapWithConcurrency } from "./lib/fetch.js";
import {
  normalizeLookupKey, normalizeTeamMatchKey, toNumber, firstDefined, firstNumber,
  createFixtureMatchKey, createDetailTeam, extractGroupLetter
} from "./lib/utils.js";
import { CACHE_TTL_MS, readCache, writeCache, getMemoryCache, setMemoryCache } from "./lib/cache.js";
import { fetchRahiminiWorldCup2026, mergeRahiminiFixtures } from "./clients/rahimini.js";
import { TEAM_NAME_TO_FIFA_CODE, FIFA_MENS_RANKING_URL, collectUniqueTeams, fetchFifaRankings, resolveFifaCountryCode } from "./clients/fifa.js";

const require = createRequire(import.meta.url);
const COUNTRY_METADATA = require("./data/countries.json");

const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json";
const DOCUMENTATION_URL = "https://www.thesportsdb.com/documentation";
const FIFA_SCHEDULE_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums";
const OPENFOOTBALL_2026_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const WORLD_CUP_SEASON = 2026;
const SPORTSDB_DEFAULT_API_KEY = "123";
const SPORTSDB_WORLD_CUP_LEAGUE_ID = "4429";
const SPORTSDB_WORLD_CUP_LEAGUE_NAME = "FIFA World Cup";
const FLAG_ICON_BASE_URL = "https://cdn.jsdelivr.net/npm/flag-icons@7.3.2/flags/4x3";
const HOST_COUNTRIES = ["Canada", "Mexico", "United States"];
const MAX_FIFA_RANK = 211;
const EXTERNAL_FETCH_CONCURRENCY = 6;
const LOCAL_COUNTRY_TEAM_LOOKUP = buildCountryTeamLookup(COUNTRY_METADATA);

let inflightRequest = null;

export async function getWorldCupData({ refresh = false, timezone = "Asia/Jerusalem" } = {}) {
  if (inflightRequest && !refresh) {
    return inflightRequest;
  }

  // Fast path: serve from memory without touching disk
  const mc = getMemoryCache();
  if (!refresh && mc && Date.now() - mc.cachedAt < CACHE_TTL_MS) {
    return mc.payload;
  }

  inflightRequest = (async () => {
    // Cold-start or memory eviction: fall back to disk once
    const cache = getMemoryCache() ?? await readCache();

    if (!getMemoryCache() && cache) {
      setMemoryCache(cache); // warm memory from disk on cold start
    }

    if (!refresh && cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
      return cache.payload;
    }

    const apiKey = String(process.env.SPORTSDB_API_KEY || SPORTSDB_DEFAULT_API_KEY).trim();

    try {
      const liveBase = await fetchLiveWorldCupBase({ apiKey, timezone });
      const payload = finalizeWorldCupData(liveBase);
      setMemoryCache({ cachedAt: Date.now(), payload });
      writeCache(payload).catch((err) => {
        console.error("Cache write failed:", err instanceof Error ? err.message : err);
      });
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (cache?.payload) {
        const stalePayload = {
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
        setMemoryCache({ cachedAt: cache.cachedAt, payload: stalePayload });
        return stalePayload;
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
  const seasonCoverage = leagueEntry.season.coverage ?? createSportsDbCoverage();

  const [standingsResult, fixturesResult, scheduleTemplate, rahiminiFixtures] = await Promise.all([
    optionalApiRequest("lookuptable.php", { l: leagueId, s: String(WORLD_CUP_SEASON) }, apiKey),
    optionalApiRequest("eventsseason.php", { id: leagueId, s: String(WORLD_CUP_SEASON) }, apiKey),
    fetchOpenFootballWorldCup2026(),
    fetchRahiminiWorldCup2026().catch(() => [])
  ]);

  const fallbackWarnings = [];
  const dailyFixturesResult = await fetchSportsDbDailyFixtures({
    apiKey,
    leagueId,
    templateFixtures: [...scheduleTemplate.fixtures, ...KNOCKOUT_TEMPLATE]
  });
  const sportsDbTeamLookup = new Map(LOCAL_COUNTRY_TEAM_LOOKUP);
  const sportsDbFixtureRows = mergeApiRowsById([
    ...extractApiRows(fixturesResult),
    ...dailyFixturesResult.rows
  ]);
  const sportsDbFixtures = sportsDbFixtureRows
    .map((fixture) => normalizeSportsDbFixture(fixture, sportsDbTeamLookup, timezone))
    .filter(Boolean);

  for (const fixture of sportsDbFixtures) {
    addSportsDbTeamToLookup(sportsDbTeamLookup, fixture.teams.home);
    addSportsDbTeamToLookup(sportsDbTeamLookup, fixture.teams.away);
  }

  const venueLookup = new Map();

  const baseFixtures = mergeSportsDbFixtures(scheduleTemplate.fixtures, sportsDbFixtures, sportsDbTeamLookup);
  const groups = mergeSportsDbGroups({
    templateGroups: scheduleTemplate.groups,
    teamLookup: sportsDbTeamLookup,
    standingsRows: extractApiRows(standingsResult),
    fixtures: baseFixtures
  });
  const knockoutStubs = projectKnockoutFixtures(groups, baseFixtures, rahiminiFixtures);
  const normalizedFixtures = mergeRahiminiFixtures(
    [...baseFixtures, ...knockoutStubs],
    rahiminiFixtures,
    { teamLookup: sportsDbTeamLookup }
  );

  if (sportsDbFixtures.length < baseFixtures.length) {
    fallbackWarnings.push(
      `TheSportsDB returned ${sportsDbFixtures.length} World Cup 2026 event(s), so the remaining calendar fixtures are filled from the public World Cup 2026 schedule template.`
    );
  }

  if (dailyFixturesResult.dateKeys.length) {
    fallbackWarnings.push(
      `TheSportsDB daily fixture feed was checked for ${dailyFixturesResult.dateKeys.length} schedule date(s) to supplement season results.`
    );
  }

  const normalizedVenues = collectVenues(normalizedFixtures, venueLookup);
  const normalizedRounds = normalizeRounds(buildRoundsFromFixtures(normalizedFixtures));
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
      provider: "TheSportsDB",
      documentation: DOCUMENTATION_URL,
      scheduleSource: FIFA_SCHEDULE_URL,
      rankingsSource: FIFA_MENS_RANKING_URL,
      scheduleTemplateSource: OPENFOOTBALL_2026_URL,
      fetchedAt: new Date().toISOString(),
      warnings: [...fallbackWarnings, ...fifaRankingsResult.warnings, ...teamSignalsResult.warnings],
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

async function fetchScheduleTemplateWorldCupBase({ warnings = [] } = {}) {
  const fallback = await fetchOpenFootballWorldCup2026();
  const fifaRankingsResult = await fetchFifaRankings(collectUniqueTeams(fallback.groups));
  const enrichedGroups = enrichGroupsWithTeamMetrics(fallback.groups, fifaRankingsResult.lookup, new Map());

  return {
    source: {
      mode: "template",
      provider: "World Cup 2026 schedule template",
      documentation: DOCUMENTATION_URL,
      scheduleSource: FIFA_SCHEDULE_URL,
      rankingsSource: FIFA_MENS_RANKING_URL,
      scheduleTemplateSource: OPENFOOTBALL_2026_URL,
      fetchedAt: new Date().toISOString(),
      warnings: [
        ...warnings,
        ...fifaRankingsResult.warnings,
        "Team strength scores are currently leaning on FIFA rankings only."
      ],
      enrichment: {
        fifaRankings: fifaRankingsResult.meta,
        teamScores: {
          fixturesConsidered: fallback.fixtures.length,
          fixturesWithPredictions: 0,
          fixturesWithOdds: 0
        }
      },
      stale: false
    },
    competition: {
      id: "template-world-cup-2026",
      name: "FIFA World Cup 2026",
      country: "World",
      season: WORLD_CUP_SEASON,
      logo: null,
      coverage: createSportsDbCoverage()
    },
    groups: enrichedGroups,
    fixtures: fallback.fixtures,
    rounds: [],
    venues: collectVenues(fallback.fixtures, new Map()),
    featuredStats: []
  };
}

async function apiRequest(endpoint, params, apiKey) {
  const url = new URL(`${API_BASE_URL}/${apiKey}/${endpoint}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return withRetry(async () => {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (response.status === 204) {
      return { response: [] };
    }

    if (!response.ok) {
      throw new Error(`TheSportsDB ${endpoint} request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const errors = formatApiErrors(data?.errors);

    if (errors || data?.message) {
      throw new Error(`TheSportsDB ${endpoint} returned errors: ${errors || data.message}`);
    }

    return data;
  });
}

async function optionalApiRequest(endpoint, params, apiKey) {
  try {
    return await apiRequest(endpoint, params, apiKey);
  } catch {
    return { response: [] };
  }
}

async function fetchSportsDbDailyFixtures({ apiKey, leagueId, templateFixtures, now = new Date() }) {
  const dateKeys = getSportsDbDailyFixtureDateKeys(templateFixtures, now);
  const responses = await mapWithConcurrency(
    dateKeys,
    EXTERNAL_FETCH_CONCURRENCY,
    (dateKey) => optionalApiRequest("eventsday.php", { d: dateKey, l: leagueId }, apiKey)
  );

  return {
    dateKeys,
    rows: responses.flatMap((response) => extractApiRows(response))
  };
}

function getSportsDbDailyFixtureDateKeys(fixtures = [], now = new Date()) {
  const todayEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2);
  const keys = new Set();

  for (const fixture of fixtures) {
    const timestampMs = getFixtureTimestampMs(fixture);

    if (!Number.isFinite(timestampMs) || timestampMs >= todayEnd) {
      continue;
    }

    keys.add(formatUtcDateKey(new Date(timestampMs)));
  }

  return [...keys].sort();
}

function getFixtureTimestampMs(fixture) {
  if (Number.isFinite(Number(fixture?.timestamp))) {
    return Number(fixture.timestamp) * 1000;
  }

  const parsed = Date.parse(fixture?.date || "");
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatUtcDateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function mergeApiRowsById(rows) {
  const merged = new Map();

  for (const row of rows) {
    const id = firstDefined(row?.idEvent, row?.id, row?.eventId);
    const key = id == null ? `row:${merged.size}` : `id:${id}`;
    merged.set(key, row);
  }

  return [...merged.values()];
}

function createSportsDbCoverage() {
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
  const rows = extractFirstArray(data);
  return rows ?? (data && typeof data === "object" ? [data] : []);
}

function extractFirstArray(value, depth = 0, visited = new Set()) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object" || depth > 4 || visited.has(value)) {
    return null;
  }

  visited.add(value);

  for (const key of [
    "response",
    "data",
    "results",
    "result",
    "matches",
    "events",
    "teams",
    "leagues",
    "standings",
    "rows",
    "list",
    "suggestions",
    "popular"
  ]) {
    const rows = extractFirstArray(value[key], depth + 1, visited);

    if (rows) {
      return rows;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const rows = extractFirstArray(nestedValue, depth + 1, visited);

    if (rows) {
      return rows;
    }
  }

  return null;
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
  const configuredLeagueId = String(process.env.SPORTSDB_WORLD_CUP_LEAGUE_ID || SPORTSDB_WORLD_CUP_LEAGUE_ID).trim();
  const detail = await optionalApiRequest("lookupleague.php", { id: configuredLeagueId }, apiKey);
  const league = extractApiRows(detail)[0] ?? {};

  return normalizeLeagueEntry({
    ...league,
    idLeague: league.idLeague ?? configuredLeagueId,
    strLeague: league.strLeague ?? SPORTSDB_WORLD_CUP_LEAGUE_NAME,
    strCountry: league.strCountry ?? "Worldwide"
  });
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
    leagueSource?.idLeague,
    leagueSource?.id,
    leagueSource?.leagueId,
    leagueSource?.leagueid,
    entry?.leagueId,
    entry?.leagueid,
    entry?.id
  );
  const name = firstDefined(
    leagueSource?.strLeague,
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
    coverage: createSportsDbCoverage()
  };

  return {
    ...entry,
    league: {
      id,
      name,
      logo: firstDefined(leagueSource?.strBadge, leagueSource?.logo, leagueSource?.image, leagueSource?.logoUrl, null)
    },
    country: {
      name: normalizeCountryName(countrySource) ?? firstDefined(leagueSource?.strCountry, "World")
    },
    season
  };
}

function buildCountryTeamLookup(countries = []) {
  const lookup = new Map();

  for (const country of countries) {
    addSportsDbTeamToLookup(lookup, normalizeCountryMetadata(country));
  }

  return lookup;
}

function normalizeCountryMetadata(country = {}) {
  const name = country.name ?? "TBD";
  const abbreviation = String(country.abbreviation ?? country.short ?? "")
    .trim()
    .toUpperCase();
  const short = String(country.short ?? abbreviation)
    .trim()
    .toUpperCase();
  const flagCode = String(country.flagCode ?? "")
    .trim()
    .toLowerCase();

  return {
    id: `country-${normalizeTeamMatchKey(name)}`,
    name,
    code: abbreviation,
    abbreviation,
    short,
    country: name,
    national: true,
    flagCode,
    flag: flagCode ? `${FLAG_ICON_BASE_URL}/${flagCode}.svg` : null,
    logo: flagCode ? `${FLAG_ICON_BASE_URL}/${flagCode}.svg` : null,
    aliases: country.aliases ?? []
  };
}

function addSportsDbTeamToLookup(lookup, team) {
  if (!team) {
    return;
  }

  const keys = [
    team.id,
    team.code,
    team.short,
    team.abbreviation,
    normalizeLookupKey(team.name),
    normalizeTeamMatchKey(team.name),
    ...(team.aliases ?? []).flatMap((alias) => [normalizeLookupKey(alias), normalizeTeamMatchKey(alias)])
  ].filter(Boolean);
  const existing = keys.map((key) => lookup.get(key)).find(Boolean);
  const merged = existing
    ? {
        ...team,
        ...existing,
        id: team.id ?? existing.id,
        winner: team.winner ?? existing.winner ?? null
      }
    : team;

  for (const key of keys) {
    lookup.set(key, merged);
  }
}

function normalizeTeamSource(source = {}, fallback = {}) {
  const id = firstDefined(
    source.idTeam,
    source.id,
    source.teamId,
    source.teamid,
    source.idTeam,
    fallback.id,
    fallback.teamId,
    fallback.teamid
  );
  const name = firstDefined(
    source.strTeam,
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
    code: firstDefined(source.strTeamShort, source.code, source.nameCode, source.abbreviation, source.slug, null),
    abbreviation: firstDefined(source.abbreviation, source.code, source.strTeamShort, null),
    short: firstDefined(source.short, source.strTeamShort, source.code, null),
    country: normalizeCountryName(countrySource) ?? source.strCountry ?? source.countryName ?? null,
    national: firstDefined(source.national, source.type === "national", source.strSport === "Soccer", null),
    flagCode: firstDefined(source.flagCode, null),
    flag: firstDefined(source.flag, null),
    logo: firstDefined(source.logo, source.flag, source.strBadge, source.strLogo, source.logoUrl, source.image, source.teamLogo, null),
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
    score: normalizeFixtureScore(fixture),
    details: normalizeFixtureDetails(fixture)
  };
}

function normalizeSportsDbFixture(event, teamLookup, timezone = "UTC") {
  const homeTeam = normalizeFixtureTeam(
    {
      id: event?.idHomeTeam,
      name: event?.strHomeTeam,
      logo: event?.strHomeTeamBadge
    },
    teamLookup
  );
  const awayTeam = normalizeFixtureTeam(
    {
      id: event?.idAwayTeam,
      name: event?.strAwayTeam,
      logo: event?.strAwayTeamBadge
    },
    teamLookup
  );

  if (!event?.idEvent || !homeTeam || !awayTeam) {
    return null;
  }

  const date = parseSportsDbTimestamp(event);
  const round = firstDefined(event?.strGroup, event?.strRound, event?.intRound ? `Round ${event.intRound}` : null, "Group Stage");

  return {
    id: event.idEvent,
    date: date ? date.toISOString() : event.dateEvent,
    timestamp: date ? Math.floor(date.getTime() / 1000) : 0,
    timezone,
    referee: null,
    stage: classifyStage(round),
    round,
    groupLetter: extractGroupLetter(round),
    status: normalizeSportsDbStatus(event),
    venue: {
      id: null,
      name: event.strVenue ?? "TBD",
      city: event.strVenue ?? null,
      country: event.strCountry ?? null,
      capacity: null,
      image: event.strThumb ?? event.strPoster ?? null
    },
    teams: {
      home: homeTeam,
      away: awayTeam
    },
    goals: {
      home: toNumber(event.intHomeScore),
      away: toNumber(event.intAwayScore)
    },
    score: {
      halftime: { home: null, away: null },
      fulltime: {
        home: toNumber(event.intHomeScore),
        away: toNumber(event.intAwayScore)
      },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null }
    },
    details: normalizeSportsDbEventDetails(event, homeTeam, awayTeam)
  };
}

function parseSportsDbTimestamp(event) {
  const timestamp = firstDefined(event?.strTimestamp, event?.dateEvent && event?.strTime ? `${event.dateEvent}T${event.strTime}` : null);

  if (!timestamp) {
    return null;
  }

  const normalized = String(timestamp).endsWith("Z") ? String(timestamp) : `${timestamp}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function normalizeSportsDbStatus(event) {
  const postponed = normalizeLookupKey(event?.strPostponed) === "yes";
  const label = postponed ? "Postponed" : firstDefined(event?.strStatus, "Not Started");

  return {
    long: label,
    short: normalizeStatusShort(label),
    elapsed: null
  };
}

function normalizeSportsDbEventDetails(event, homeTeam, awayTeam) {
  return {
    scorers: [
      ...parseSportsDbDetailList(
        firstDefined(event?.strHomeGoalDetails, event?.strHomeGoalScorers, event?.strHomeGoals),
        homeTeam
      ),
      ...parseSportsDbDetailList(
        firstDefined(event?.strAwayGoalDetails, event?.strAwayGoalScorers, event?.strAwayGoals),
        awayTeam
      )
    ],
    cards: [
      ...parseSportsDbDetailList(
        firstDefined(event?.strHomeYellowCards, event?.strHomeYellowCardDetails),
        homeTeam,
        "Yellow"
      ),
      ...parseSportsDbDetailList(
        firstDefined(event?.strAwayYellowCards, event?.strAwayYellowCardDetails),
        awayTeam,
        "Yellow"
      ),
      ...parseSportsDbDetailList(
        firstDefined(event?.strHomeRedCards, event?.strHomeRedCardDetails),
        homeTeam,
        "Red"
      ),
      ...parseSportsDbDetailList(
        firstDefined(event?.strAwayRedCards, event?.strAwayRedCardDetails),
        awayTeam,
        "Red"
      )
    ]
  };
}

function parseSportsDbDetailList(value, team, type = "") {
  return String(value || "")
    .split(/[;\n|]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ({
      team: createDetailTeam(team),
      label: entry,
      minute: null,
      type
    }));
}

function normalizeFixtureDetails(fixture) {
  const events = Array.isArray(fixture?.events) ? fixture.events : [];

  return {
    scorers: events
      .filter((event) => String(event?.type || event?.detail || "").toLowerCase().includes("goal"))
      .map((event) => normalizeFixtureEventDetail(event))
      .filter(Boolean),
    cards: events
      .filter((event) => String(event?.type || event?.detail || "").toLowerCase().includes("card"))
      .map((event) => normalizeFixtureEventDetail(event))
      .filter(Boolean)
  };
}

function normalizeFixtureEventDetail(event) {
  const label = firstDefined(
    event?.player?.name,
    event?.playerName,
    event?.player,
    event?.label,
    event?.detail,
    null
  );

  if (!label) {
    return null;
  }

  return {
    team: createDetailTeam(event?.team),
    label,
    minute: firstDefined(event?.time?.elapsed, event?.minute, event?.elapsed, null),
    type: firstDefined(event?.detail, event?.type, "")
  };
}

function mergeSportsDbFixtures(templateFixtures, sportsDbFixtures, teamLookup) {
  const sportsDbFixtureByMatch = new Map(
    sportsDbFixtures.map((fixture) => [createFixtureMatchKey(fixture), fixture])
  );

  const mergedGroupFixtures = templateFixtures.map((fixture) => {
    const sportsDbFixture = sportsDbFixtureByMatch.get(createFixtureMatchKey(fixture));
    const home = resolveSportsDbTeam(fixture.teams.home, teamLookup);
    const away = resolveSportsDbTeam(fixture.teams.away, teamLookup);

    return {
      ...fixture,
      ...(sportsDbFixture
        ? {
            id: sportsDbFixture.id,
            date: sportsDbFixture.date,
            timestamp: sportsDbFixture.timestamp,
            status: sportsDbFixture.status,
            venue: {
              ...fixture.venue,
              ...sportsDbFixture.venue
            },
            goals: sportsDbFixture.goals,
            score: sportsDbFixture.score,
            details: mergeFixtureDetails(fixture.details, sportsDbFixture.details)
          }
        : {}),
      teams: {
        home: mergeTeamDetails(fixture.teams.home, home),
        away: mergeTeamDetails(fixture.teams.away, away)
      }
    };
  });

  const groupMatchKeys = new Set(mergedGroupFixtures.map(createFixtureMatchKey));
  const knockoutDateStageMap = new Map(KNOCKOUT_TEMPLATE.map((m) => [m.date, m.stage]));
  const knockoutFixtures = sportsDbFixtures
    .filter((fixture) => fixture.stage !== "Group Stage" && !groupMatchKeys.has(createFixtureMatchKey(fixture)))
    .map((fixture) => {
      const fixtureDate = String(fixture.date || "").slice(0, 10);
      const templateStage = knockoutDateStageMap.get(fixtureDate);
      return templateStage ? { ...fixture, stage: templateStage } : fixture;
    });

  return [...mergedGroupFixtures, ...knockoutFixtures];
}

function mergeFixtureDetails(fallbackDetails = {}, providerDetails = {}) {
  return {
    scorers: providerDetails?.scorers?.length ? providerDetails.scorers : fallbackDetails?.scorers ?? [],
    cards: providerDetails?.cards?.length ? providerDetails.cards : fallbackDetails?.cards ?? []
  };
}

function mergeTeamDetails(baseTeam, providerTeam) {
  if (!providerTeam) {
    return baseTeam;
  }

  return {
    ...baseTeam,
    id: providerTeam.id ?? baseTeam.id,
    name: providerTeam.name ?? baseTeam.name,
    code: providerTeam.code ?? baseTeam.code ?? null,
    abbreviation: providerTeam.abbreviation ?? baseTeam.abbreviation ?? providerTeam.code ?? baseTeam.code ?? null,
    short: providerTeam.short ?? baseTeam.short ?? providerTeam.code ?? baseTeam.code ?? null,
    country: providerTeam.country ?? baseTeam.country ?? null,
    national: providerTeam.national ?? baseTeam.national ?? null,
    flagCode: providerTeam.flagCode ?? baseTeam.flagCode ?? null,
    flag: providerTeam.flag ?? baseTeam.flag ?? null,
    logo: providerTeam.logo ?? baseTeam.logo ?? null,
    winner: providerTeam.winner ?? baseTeam.winner ?? null
  };
}

function resolveSportsDbTeam(team, teamLookup) {
  return teamLookup.get(normalizeTeamMatchKey(team?.name)) ??
    teamLookup.get(normalizeLookupKey(team?.name)) ??
    teamLookup.get(team?.id) ??
    team;
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
    score: fixture.score ?? null,
    details: normalizeFixtureDetails(fixture)
  };
}

function normalizeFixtureTeam(team, teamLookup, fixture = {}, side = "") {
  const teamInfo = teamLookup.get(team?.id) ??
    teamLookup.get(normalizeTeamMatchKey(team?.name)) ??
    teamLookup.get(normalizeLookupKey(team?.name));
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
    abbreviation: teamInfo?.abbreviation ?? normalized.abbreviation ?? null,
    short: teamInfo?.short ?? normalized.short ?? null,
    flagCode: teamInfo?.flagCode ?? normalized.flagCode ?? null,
    flag: teamInfo?.flag ?? normalized.flag ?? null,
    logo: teamInfo?.logo ?? normalized.logo ?? null,
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
  const raw = String(status || "").trim().toUpperCase();

  if (["NS", "TBD", "FT", "AET", "PEN", "PST", "CANC", "HT", "1H", "2H", "ET", "BT", "SUSP", "INT", "AWD", "WO"].includes(raw)) {
    return raw;
  }

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
      groups.push(normalizeNestedStandingRows(nestedRows, entry));
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

function normalizeNestedStandingRows(rows, container = {}) {
  const groupName = firstDefined(container?.name, container?.group, container?.groupName, container?.title, "Group A");

  return rows.map((row) => ({
    ...row,
    group: firstDefined(row?.group, row?.groupName, groupName)
  }));
}

function mergeSportsDbGroups({ templateGroups, teamLookup, standingsRows, fixtures }) {
  const standingLookup = new Map(
    standingsRows
      .filter((row) => row?.idTeam || row?.strTeam)
      .flatMap((row) => {
        const standing = normalizeSportsDbStanding(row);
        return [
          [String(row.idTeam || normalizeLookupKey(row.strTeam)), standing],
          [normalizeLookupKey(row.strTeam), standing],
          [normalizeTeamMatchKey(row.strTeam), standing]
        ];
      })
  );

  const fixtureStandingLookup = buildFixtureStandingLookup(fixtures);

  return templateGroups.map((group) => ({
    ...group,
    teams: group.teams.map((team, index) => {
      const sportsDbTeam = resolveSportsDbTeam(team, teamLookup);
      const sportsDbStanding = standingLookup.get(String(sportsDbTeam.id)) ??
        standingLookup.get(normalizeLookupKey(sportsDbTeam.name)) ??
        null;
      const fixtureStanding = fixtureStandingLookup.get(String(sportsDbTeam.id)) ??
        fixtureStandingLookup.get(normalizeLookupKey(sportsDbTeam.name)) ??
        null;
      const standing = fixtureStanding ?? (hasUsableSportsDbStanding(sportsDbStanding) ? sportsDbStanding : null);

      return {
        ...mergeTeamDetails(team, sportsDbTeam),
        groupLetter: group.letter,
        standing: {
          ...team.standing,
          rank: standing?.rank ?? team.standing?.rank ?? index + 1,
          points: standing?.points ?? team.standing?.points ?? null,
          goalDifference: standing?.goalDifference ?? team.standing?.goalDifference ?? null,
          form: standing?.form ?? team.standing?.form ?? null,
          played: standing?.played ?? team.standing?.played ?? null,
          wins: standing?.wins ?? team.standing?.wins ?? null,
          draws: standing?.draws ?? team.standing?.draws ?? null,
          losses: standing?.losses ?? team.standing?.losses ?? null,
          goalsFor: standing?.goalsFor ?? team.standing?.goalsFor ?? null,
          goalsAgainst: standing?.goalsAgainst ?? team.standing?.goalsAgainst ?? null,
          description: standing?.description ?? team.standing?.description ?? null,
          update: standing?.update ?? team.standing?.update ?? null
        }
      };
    }),
    fixtures: fixtures.filter((fixture) => fixture.groupLetter === group.letter)
  }));
}

function buildFixtureStandingLookup(fixtures) {
  const groupTables = new Map();

  for (const fixture of fixtures ?? []) {
    if (!fixture?.groupLetter) {
      continue;
    }

    const groupTable = getOrCreateGroupTable(groupTables, fixture.groupLetter);
    const home = getOrCreateFixtureStanding(groupTable, fixture.teams?.home, fixture.groupLetter);
    const away = getOrCreateFixtureStanding(groupTable, fixture.teams?.away, fixture.groupLetter);

    if (!home || !away || !hasFixtureResultScore(fixture)) {
      continue;
    }

    const homeGoals = toNumber(fixture.goals?.home);
    const awayGoals = toNumber(fixture.goals?.away);

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
      home.form = appendFixtureForm(home.form, "W");
      away.form = appendFixtureForm(away.form, "L");
    } else if (awayGoals > homeGoals) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
      home.form = appendFixtureForm(home.form, "L");
      away.form = appendFixtureForm(away.form, "W");
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
      home.form = appendFixtureForm(home.form, "D");
      away.form = appendFixtureForm(away.form, "D");
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
    home.update = fixture.date ?? null;
    away.update = fixture.date ?? null;
  }

  const lookup = new Map();

  for (const groupTable of groupTables.values()) {
    [...groupTable.values()]
      .sort(compareFixtureStandings)
      .forEach((standing, index) => {
        const rankedStanding = {
          ...standing,
          rank: index + 1
        };

        for (const key of standing.lookupKeys) {
          lookup.set(key, rankedStanding);
        }
      });
  }

  return lookup;
}

function getOrCreateGroupTable(groupTables, groupLetter) {
  if (!groupTables.has(groupLetter)) {
    groupTables.set(groupLetter, new Map());
  }

  return groupTables.get(groupLetter);
}

function getOrCreateFixtureStanding(groupTable, team, groupLetter) {
  if (!team?.id && !team?.name) {
    return null;
  }

  const teamKey = String(team.id ?? normalizeLookupKey(team.name));

  if (!groupTable.has(teamKey)) {
    groupTable.set(teamKey, {
      rank: null,
      points: 0,
      goalDifference: 0,
      form: "",
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      description: null,
      update: null,
      groupLetter,
      teamName: team.name ?? "",
      lookupKeys: [
        String(team.id ?? ""),
        normalizeLookupKey(team.name),
        normalizeTeamMatchKey(team.name)
      ].filter(Boolean)
    });
  }

  return groupTable.get(teamKey);
}

function hasFixtureResultScore(fixture) {
  return Number.isFinite(toNumber(fixture?.goals?.home)) && Number.isFinite(toNumber(fixture?.goals?.away));
}

function hasUsableSportsDbStanding(standing) {
  return Boolean(standing && (Number.isFinite(standing.played) || Number.isFinite(standing.points)));
}

function appendFixtureForm(form, result) {
  return `${form || ""}${result}`.slice(-5);
}

function compareFixtureStandings(left, right) {
  return (
    right.points - left.points ||
    right.wins - left.wins ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    left.teamName.localeCompare(right.teamName, "en", { sensitivity: "base" })
  );
}

function normalizeSportsDbStanding(row) {
  return {
    rank: firstNumber(row.intRank),
    points: firstNumber(row.intPoints),
    goalDifference: firstNumber(row.intGoalDifference),
    form: row.strForm ?? null,
    played: firstNumber(row.intPlayed),
    wins: firstNumber(row.intWin),
    draws: firstNumber(row.intDraw),
    losses: firstNumber(row.intLoss),
    goalsFor: firstNumber(row.intGoalsFor),
    goalsAgainst: firstNumber(row.intGoalsAgainst),
    description: row.strDescription ?? null,
    update: row.dateUpdated ?? null
  };
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

function buildRoundsFromFixtures(fixtures) {
  const rounds = new Map();

  for (const fixture of fixtures) {
    const round = fixture.round || fixture.stage || "Other";

    if (!rounds.has(round)) {
      rounds.set(round, {
        round,
        dates: []
      });
    }

    if (fixture.date) {
      rounds.get(round).dates.push(fixture.date);
    }
  }

  return [...rounds.values()];
}

async function fetchOpenFootballWorldCup2026() {
  const response = await fetchWithTimeout(OPENFOOTBALL_2026_URL, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`World Cup 2026 schedule template request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  const groupMatches = matches.filter((match) => extractGroupLetter(match?.group));
  const teamsByName = buildOpenFootballTeamLookup(groupMatches);
  const fixtures = groupMatches.map((match, index) => normalizeOpenFootballFixture(match, index, teamsByName));

  return {
    groups: buildOpenFootballGroups(groupMatches, teamsByName, fixtures),
    fixtures
  };
}

function buildOpenFootballTeamLookup(matches) {
  const lookup = new Map();

  for (const match of matches) {
    for (const teamName of [match.team1, match.team2]) {
      const key = normalizeLookupKey(teamName);

      if (!key || lookup.has(key)) {
        continue;
      }

      lookup.set(key, resolveLocalCountryTeam(teamName) ?? {
        id: `template-${key}`,
        name: teamName,
        code: resolveTemplateTeamCode(teamName),
        country: teamName,
        national: true,
        logo: null
      });
    }
  }

  return lookup;
}

function normalizeOpenFootballFixture(match, index, teamsByName) {
  const home = getOpenFootballTeam(match.team1, teamsByName);
  const away = getOpenFootballTeam(match.team2, teamsByName);
  const date = parseOpenFootballDate(match.date, match.time);
  const groupLetter = extractGroupLetter(match.group);
  const fulltimeScore = normalizeOpenFootballScore(match?.score?.ft);
  const halftimeScore = normalizeOpenFootballScore(match?.score?.ht);
  const hasFulltimeScore = Number.isFinite(fulltimeScore.home) && Number.isFinite(fulltimeScore.away);

  return {
    id: `template-group-${index + 1}`,
    date: date ? date.toISOString() : match.date,
    timestamp: date ? Math.floor(date.getTime() / 1000) : 0,
    timezone: "UTC",
    referee: null,
    stage: "Group Stage",
    round: match.group ?? match.round ?? "Group Stage",
    groupLetter,
    status: hasFulltimeScore
      ? {
          long: "Match Finished",
          short: "FT",
          elapsed: null
        }
      : {
          long: "Not Started",
          short: "NS",
          elapsed: null
        },
    venue: {
      id: null,
      name: match.ground ?? "TBD",
      city: match.ground ?? null,
      country: null,
      capacity: null,
      image: null
    },
    teams: {
      home,
      away
    },
    goals: {
      home: fulltimeScore.home,
      away: fulltimeScore.away
    },
    score: {
      halftime: halftimeScore,
      fulltime: fulltimeScore,
      extratime: { home: null, away: null },
      penalty: { home: null, away: null }
    },
    details: normalizeOpenFootballDetails(match, home, away)
  };
}

function normalizeOpenFootballScore(score) {
  if (!Array.isArray(score)) {
    return { home: null, away: null };
  }

  return {
    home: toNumber(score[0]),
    away: toNumber(score[1])
  };
}

function normalizeOpenFootballDetails(match, homeTeam, awayTeam) {
  return {
    scorers: [
      ...normalizeOpenFootballGoalDetails(match?.goals1, homeTeam),
      ...normalizeOpenFootballGoalDetails(match?.goals2, awayTeam)
    ],
    cards: []
  };
}

function normalizeOpenFootballGoalDetails(goals, team) {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals
    .map((goal) => {
      if (typeof goal === "string") {
        return {
          team: createDetailTeam(team),
          label: goal,
          minute: null,
          type: ""
        };
      }

      const label = firstDefined(goal?.name, goal?.player, goal?.label, null);

      if (!label) {
        return null;
      }

      return {
        team: createDetailTeam(team),
        label,
        minute: firstDefined(goal?.minute, goal?.time, null),
        type: goal?.penalty ? "Penalty" : goal?.ownGoal ? "Own goal" : ""
      };
    })
    .filter(Boolean);
}

function buildOpenFootballGroups(matches, teamsByName, fixtures) {
  const groups = new Map();

  for (const match of matches) {
    const letter = extractGroupLetter(match.group);

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

    for (const teamName of [match.team1, match.team2]) {
      const team = getOpenFootballTeam(teamName, teamsByName);

      if (!group.teams.some((entry) => entry.id === team.id)) {
        group.teams.push({
          ...team,
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

  for (const fixture of fixtures) {
    const group = groups.get(fixture.groupLetter);

    if (group) {
      group.fixtures.push(fixture);
    }
  }

  return [...groups.values()].sort((left, right) => left.letter.localeCompare(right.letter));
}

function getOpenFootballTeam(teamName, teamsByName) {
  const key = normalizeLookupKey(teamName);
  return teamsByName.get(key) ?? resolveLocalCountryTeam(teamName) ?? {
    id: `template-${key}`,
    name: teamName,
    code: resolveTemplateTeamCode(teamName),
    country: teamName,
    national: true,
    logo: null
  };
}

function resolveLocalCountryTeam(teamName) {
  return LOCAL_COUNTRY_TEAM_LOOKUP.get(normalizeTeamMatchKey(teamName)) ??
    LOCAL_COUNTRY_TEAM_LOOKUP.get(normalizeLookupKey(teamName)) ??
    null;
}

function parseOpenFootballDate(dateValue, timeValue) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?:\s+UTC([+-]\d{1,2}))?$/i);

  if (!date) {
    return null;
  }

  if (!timeMatch) {
    const parsedDate = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(parsedDate) ? new Date(parsedDate) : null;
  }

  const [, hours, minutes, rawOffset = "+0"] = timeMatch;
  const offsetNumber = Number(rawOffset);
  const sign = offsetNumber < 0 ? "-" : "+";
  const offset = `${sign}${String(Math.abs(offsetNumber)).padStart(2, "0")}:00`;
  const parsedDate = Date.parse(`${date}T${hours.padStart(2, "0")}:${minutes}:00${offset}`);

  return Number.isFinite(parsedDate) ? new Date(parsedDate) : null;
}

function resolveTemplateTeamCode(teamName) {
  return TEAM_NAME_TO_FIFA_CODE.get(normalizeLookupKey(teamName)) ??
    String(teamName || "")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase();
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

async function fetchTeamStrengthSignals({ fixtures, apiKey }) {
  return {
    lookup: new Map(),
    warnings: [
      "TheSportsDB is being used for tournament data; team strength scores are currently leaning on FIFA rankings only."
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

function classifyStage(round) {
  const label = String(round || "").toLowerCase();

  if (label.includes("group")) {
    return "Group Stage";
  }

  if (label.includes("round of 32") || label.includes("32nd")) {
    return "Round of 32";
  }

  if (label.includes("round of 16") || label.includes("16th") || label.includes("8th")) {
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
    .map((group) => {
      const teams = [...(group.teams ?? [])]
        .sort(compareTeamsForGroup)
        .map((team, index) => ({
        ...team,
        groupLetter: group.letter,
        fifaGlobalRanking: team.fifaGlobalRanking ?? null,
        fifaGlobalRankingPoints: team.fifaGlobalRankingPoints ?? null,
        teamScores: {
          ...createEmptyTeamScores(),
          ...(team.teamScores ?? {})
        },
        standing: {
          rank: index + 1,
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
      }));

      return {
        ...group,
        teams,
        fixtures: group.fixtures ?? []
      };
    });

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

function projectKnockoutFixtures(groups, existingFixtures, rahiminiFixtures) {
  const thirdPlaceRanking = buildThirdPlaceRanking(groups);
  const advancingThirdPlaces = thirdPlaceRanking.slice(0, 8);
  const groupIndex = new Map(groups.map((g) => [g.letter, g]));

  const existingKnockoutKeys = new Set(
    existingFixtures
      .filter((f) => f.stage !== "Group Stage")
      .map(createFixtureMatchKey)
  );

  const rahiminiByKey = new Map(rahiminiFixtures.map((f) => [f.matchKey, f]));
  const stubs = [];

  for (const match of KNOCKOUT_TEMPLATE) {
    const homeCandidates = getKnockoutTemplateCandidates(match.homeSource, groupIndex, advancingThirdPlaces);
    const awayCandidates = getKnockoutTemplateCandidates(match.awaySource, groupIndex, advancingThirdPlaces);

    if (!homeCandidates.length || !awayCandidates.length) continue;

    let home = null;
    let away = null;

    outerLoop:
    for (const h of homeCandidates) {
      for (const a of awayCandidates) {
        const key = [normalizeTeamMatchKey(h.name), normalizeTeamMatchKey(a.name)].sort().join(":");
        if (rahiminiByKey.has(key)) {
          home = h;
          away = a;
          break outerLoop;
        }
      }
    }

    if (!home && homeCandidates.length === 1) home = homeCandidates[0];
    if (!away && awayCandidates.length === 1) away = awayCandidates[0];

    if (!home || !away) continue;

    const matchKey = [normalizeTeamMatchKey(home.name), normalizeTeamMatchKey(away.name)].sort().join(":");
    if (existingKnockoutKeys.has(matchKey)) continue;

    stubs.push({
      id: `ko-stub-${match.match}`,
      date: match.date ? `${match.date}T00:00:00.000Z` : new Date(match.timestamp * 1000).toISOString(),
      timestamp: match.timestamp,
      timezone: "UTC",
      referee: null,
      stage: match.stage,
      round: match.stage,
      groupLetter: null,
      status: { long: "Not Started", short: "NS", elapsed: null },
      venue: {
        id: null,
        name: match.venue,
        city: null,
        country: null,
        capacity: null,
        image: null
      },
      teams: { home, away },
      goals: { home: null, away: null },
      score: {
        halftime: { home: null, away: null },
        fulltime: { home: null, away: null },
        extratime: { home: null, away: null },
        penalty: { home: null, away: null }
      },
      details: { scorers: [], cards: [] }
    });
  }

  return stubs;
}

function getKnockoutTemplateCandidates(source, groupIndex, advancingThirdPlaces) {
  if (source.type === "groupPlacement") {
    const team = groupIndex.get(source.group)?.teams?.[source.placement - 1] ?? null;
    return team ? [team] : [];
  }
  if (source.type === "thirdEligible") {
    return advancingThirdPlaces.filter((t) => source.groups.includes(t.groupLetter));
  }
  return [];
}

function compareTeamsForGroup(left, right) {
  const pointsDelta = (right.standing?.points ?? Number.NEGATIVE_INFINITY) - (left.standing?.points ?? Number.NEGATIVE_INFINITY);
  if (pointsDelta !== 0) {
    return pointsDelta;
  }

  const winsDelta = (right.standing?.wins ?? Number.NEGATIVE_INFINITY) - (left.standing?.wins ?? Number.NEGATIVE_INFINITY);
  if (winsDelta !== 0) {
    return winsDelta;
  }

  const gdDelta =
    (right.standing?.goalDifference ?? Number.NEGATIVE_INFINITY) -
    (left.standing?.goalDifference ?? Number.NEGATIVE_INFINITY);
  if (gdDelta !== 0) {
    return gdDelta;
  }

  const rankDelta = (left.standing?.rank ?? Number.POSITIVE_INFINITY) - (right.standing?.rank ?? Number.POSITIVE_INFINITY);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  const gfDelta =
    (right.standing?.goalsFor ?? Number.NEGATIVE_INFINITY) -
    (left.standing?.goalsFor ?? Number.NEGATIVE_INFINITY);
  if (gfDelta !== 0) {
    return gfDelta;
  }

  return String(left.name || "").localeCompare(String(right.name || ""), "en", { sensitivity: "base" });
}

function compareTeamsForThirdPlace(left, right) {
  const pointsDelta = (right.standing?.points ?? Number.NEGATIVE_INFINITY) - (left.standing?.points ?? Number.NEGATIVE_INFINITY);
  if (pointsDelta !== 0) {
    return pointsDelta;
  }

  const winsDelta = (right.standing?.wins ?? Number.NEGATIVE_INFINITY) - (left.standing?.wins ?? Number.NEGATIVE_INFINITY);
  if (winsDelta !== 0) {
    return winsDelta;
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
