export function normalizeLookupKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function normalizeTeamMatchKey(value) {
  const key = normalizeLookupKey(value);
  const aliases = {
    "bosnia herzegovina": "bosnia and herzegovina",
    "bosnia and herzegovina": "bosnia and herzegovina",
    "cape verde": "cabo verde",
    "cabo verde": "cabo verde",
    "congo dr": "dr congo",
    "dr congo": "dr congo",
    "cote d ivoire": "ivory coast",
    "cote divoire": "ivory coast",
    "curacao": "curacao",
    "iran": "ir iran",
    "ir iran": "ir iran",
    "korea republic": "south korea",
    "south korea": "south korea",
    "usa": "united states",
    "united states": "united states"
  };

  return aliases[key] ?? key;
}

export function toNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function firstNumber(...values) {
  for (const value of values) {
    const number = toNumber(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

export function createFixtureMatchKey(fixture) {
  const home = normalizeTeamMatchKey(fixture?.teams?.home?.name);
  const away = normalizeTeamMatchKey(fixture?.teams?.away?.name);
  return [home, away].sort().join(":");
}

export function createDetailTeam(team) {
  if (!team) {
    return null;
  }

  return {
    id: team.id ?? null,
    name: team.name ?? null,
    code: team.code ?? team.abbreviation ?? team.short ?? null,
    short: team.short ?? team.abbreviation ?? team.code ?? null
  };
}

export function extractGroupLetter(value) {
  const match = String(value || "").match(/group\s+([a-l])/i);
  return match ? match[1].toUpperCase() : null;
}
