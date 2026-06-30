import { createRequire } from "node:module";

import { fetchWithTimeout, FIFA_FETCH_TIMEOUT_MS } from "../lib/fetch.js";
import { getFifaRankingsCache, setFifaRankingsCache, FIFA_RANKINGS_CACHE_TTL_MS } from "../lib/cache.js";
import { normalizeLookupKey, normalizeTeamMatchKey } from "../lib/utils.js";

const require = createRequire(import.meta.url);
const COUNTRY_METADATA = require("../data/countries.json");

const FIFA_MENS_RANKING_URL = "https://inside.fifa.com/fifa-world-ranking/men";
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

export const TEAM_NAME_TO_FIFA_CODE = new Map(
  COUNTRY_METADATA.flatMap((country) => [
    [normalizeLookupKey(country.name), country.abbreviation],
    [normalizeTeamMatchKey(country.name), country.abbreviation],
    ...(country.aliases ?? []).flatMap((alias) => [
      [normalizeLookupKey(alias), country.abbreviation],
      [normalizeTeamMatchKey(alias), country.abbreviation]
    ])
  ])
);

export { FIFA_MENS_RANKING_URL };

export function collectUniqueTeams(groups) {
  const teams = new Map();

  for (const group of groups) {
    for (const team of group.teams ?? []) {
      teams.set(team.id, team);
    }
  }

  return [...teams.values()];
}

async function fetchFifaRankingData() {
  const cached = getFifaRankingsCache();
  if (cached && Date.now() - cached.cachedAt < FIFA_RANKINGS_CACHE_TTL_MS) {
    return cached.data;
  }

  const schedule = await fetchLatestFifaRankingSchedule();
  const response = await fetchWithTimeout(
    `https://api.fifa.com/api/v3/fifarankings/rankings/rankingsbyschedule?rankingScheduleId=${encodeURIComponent(
      schedule.id
    )}&language=en`,
    {
      headers: {
        Accept: "application/json"
      }
    },
    FIFA_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`FIFA rankings request failed with status ${response.status}.`);
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
          totalPoints: entry.TotalPoints != null ? Number(entry.TotalPoints) || null : null,
          previousRank: entry.PrevRank != null ? Number(entry.PrevRank) || null : null,
          previousPoints: entry.PrevPoints != null ? Number(entry.PrevPoints) || null : null,
          rankingMovement: entry.RankingMovement != null ? Number(entry.RankingMovement) || null : null,
          ratedMatches: entry.RatedMatches != null ? Number(entry.RatedMatches) || null : null,
          confederation: entry.ConfederationName ?? null
        }
      ])
  );

  const rankingData = { schedule, rankingsByCountry };
  setFifaRankingsCache({ cachedAt: Date.now(), data: rankingData });
  return rankingData;
}

async function fetchLatestFifaRankingSchedule() {
  const response = await fetchWithTimeout(FIFA_MENS_RANKING_URL, {}, FIFA_FETCH_TIMEOUT_MS);

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

export function resolveFifaCountryCode(team) {
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

export async function fetchFifaRankings(teams) {
  let rankingData;

  try {
    rankingData = await fetchFifaRankingData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      lookup: new Map(),
      warnings: [`FIFA rankings fetch failed: ${message}`],
      meta: {
        source: FIFA_MENS_RANKING_URL,
        rankingScheduleId: null,
        lastUpdateDate: null,
        teamsRequested: teams.length,
        teamsMapped: 0,
        teamsRanked: 0
      }
    };
  }

  const { schedule, rankingsByCountry } = rankingData;
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
