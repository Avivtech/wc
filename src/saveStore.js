import { readFile } from "node:fs/promises";

import { getServerSupabaseAdminClient, isSupabaseAuthConfigured } from "./supabaseAuth.js";

const PICKS_METADATA_KEY = "world_cup_2026_picks";
const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];
const LEGACY_PICKS_DIR = new URL("../data/picks/", import.meta.url);

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export async function loadPicksForUser(user) {
  const authUser = await getAuthUserById(user?.id);
  const stored = authUser?.user_metadata?.[PICKS_METADATA_KEY];

  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    return normalizeStoredPayload(authUser, stored, {
      savedAt: typeof stored.savedAt === "string" && stored.savedAt.trim() ? stored.savedAt.trim() : new Date().toISOString()
    });
  }

  const legacyStored = await loadLegacyPicksByEmail(authUser.email);

  if (!legacyStored) {
    return null;
  }

  return savePicksForUser(authUser, legacyStored, {
    savedAt: typeof legacyStored.savedAt === "string" && legacyStored.savedAt.trim() ? legacyStored.savedAt.trim() : new Date().toISOString()
  });
}

export async function savePicksForUser(user, payload, options = {}) {
  const authUser = await getAuthUserById(user?.id);
  const normalized = normalizeStoredPayload(authUser, payload, {
    savedAt: typeof options.savedAt === "string" && options.savedAt.trim() ? options.savedAt.trim() : new Date().toISOString()
  });
  const nextUserMetadata = {
    ...(authUser.user_metadata || {}),
    [PICKS_METADATA_KEY]: normalized
  };

  const { error } = await getServerSupabaseAdminClient().auth.admin.updateUserById(authUser.id, {
    user_metadata: nextUserMetadata
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalized;
}

async function getAuthUserById(userId) {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Supabase Auth is not configured.");
  }

  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    throw new Error("A valid authenticated user id is required.");
  }

  const { data, error } = await getServerSupabaseAdminClient().auth.admin.getUserById(normalizedUserId);

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user?.email || !validateEmail(data.user.email)) {
    throw new Error("Authenticated Supabase user is missing a valid email address.");
  }

  return data.user;
}

function normalizeStoredPayload(user, payload, options = {}) {
  const email = String(user?.email || "").trim().toLowerCase();
  const legacySubmittedAt = typeof payload?.submittedAt === "string" && payload.submittedAt.trim() ? payload.submittedAt.trim() : null;
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

  return {
    email,
    userId: typeof user?.id === "string" ? user.id : null,
    savedAt: options.savedAt,
    submittedAt: latestSubmittedAt,
    sectionSubmittedAt,
    season: 2026,
    competition: payload?.competition ?? null,
    source: payload?.source ?? null,
    summary: payload?.summary ?? null,
    groupRankings: Array.isArray(payload?.groupRankings) ? payload.groupRankings : [],
    thirdPlaceRanking: Array.isArray(payload?.thirdPlaceRanking) ? payload.thirdPlaceRanking : [],
    bestThirdAdvancers: Array.isArray(payload?.bestThirdAdvancers) ? payload.bestThirdAdvancers : [],
    knockoutWinners: Array.isArray(payload?.knockoutWinners) ? payload.knockoutWinners : [],
    projectedRoundOf32: Array.isArray(payload?.projectedRoundOf32) ? payload.projectedRoundOf32 : []
  };
}

async function loadLegacyPicksByEmail(email) {
  try {
    const file = await readFile(legacyPicksPath(email), "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function legacyPicksPath(email) {
  return new URL(`${encodeURIComponent(String(email).trim().toLowerCase())}.json`, LEGACY_PICKS_DIR);
}
