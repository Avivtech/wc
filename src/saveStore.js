import { mkdir, readFile, writeFile } from "node:fs/promises";

const PICKS_DIR = new URL("../data/picks/", import.meta.url);
const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function emailKey(email) {
  return encodeURIComponent(String(email).trim().toLowerCase());
}

function picksPath(email) {
  return new URL(`${emailKey(email)}.json`, PICKS_DIR);
}

export async function loadPicksByEmail(email) {
  try {
    const file = await readFile(picksPath(email), "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function savePicksForEmail(email, payload) {
  await mkdir(PICKS_DIR, { recursive: true });
  const legacySubmittedAt = typeof payload.submittedAt === "string" && payload.submittedAt.trim() ? payload.submittedAt.trim() : null;
  const hasExplicitSectionSubmission = payload?.sectionSubmittedAt && typeof payload.sectionSubmittedAt === "object";

  const sectionSubmittedAt = Object.fromEntries(
    SUBMISSION_SECTIONS.map((section) => [
      section,
      typeof payload?.sectionSubmittedAt?.[section] === "string" && payload.sectionSubmittedAt[section].trim()
        ? payload.sectionSubmittedAt[section].trim()
        : !hasExplicitSectionSubmission && legacySubmittedAt
          ? legacySubmittedAt
          : null
    ])
  );
  const latestSubmittedAt = [...Object.values(sectionSubmittedAt), legacySubmittedAt]
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const normalized = {
    email: email.trim().toLowerCase(),
    userId: typeof payload.userId === "string" ? payload.userId : null,
    savedAt: new Date().toISOString(),
    submittedAt: latestSubmittedAt,
    sectionSubmittedAt,
    season: 2026,
    competition: payload.competition ?? null,
    source: payload.source ?? null,
    summary: payload.summary ?? null,
    groupRankings: payload.groupRankings,
    thirdPlaceRanking: Array.isArray(payload.thirdPlaceRanking) ? payload.thirdPlaceRanking : [],
    bestThirdAdvancers: Array.isArray(payload.bestThirdAdvancers) ? payload.bestThirdAdvancers : [],
    knockoutWinners: Array.isArray(payload.knockoutWinners) ? payload.knockoutWinners : [],
    projectedRoundOf32: Array.isArray(payload.projectedRoundOf32) ? payload.projectedRoundOf32 : []
  };

  await writeFile(picksPath(email), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}
