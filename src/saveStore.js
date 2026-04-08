import { readFile } from "node:fs/promises";

import { getServerSupabaseAdminClient, isSupabaseAuthConfigured } from "./supabaseAuth.js";

const PICKS_METADATA_KEY = "world_cup_2026_picks";
const PICKS_STORAGE_BUCKET = "world-cup-2026-picks";
const PICKS_STORAGE_OBJECT_NAME = "picks.json";
const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];
const LEGACY_PICKS_DIR = new URL("../data/picks/", import.meta.url);

let bucketReadyPromise = null;

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export async function loadPicksForUser(user) {
  const authUser = await getAuthUserById(user?.id);
  const remoteStored = await loadRemotePicks(authUser);

  if (remoteStored) {
    await clearPicksMetadata(authUser);
    return remoteStored;
  }

  const metadataStored = authUser?.user_metadata?.[PICKS_METADATA_KEY];

  if (metadataStored && typeof metadataStored === "object" && !Array.isArray(metadataStored)) {
    const normalized = normalizeStoredPayload(authUser, metadataStored, {
      savedAt:
        typeof metadataStored.savedAt === "string" && metadataStored.savedAt.trim()
          ? metadataStored.savedAt.trim()
          : new Date().toISOString(),
    });

    await writeRemotePicks(authUser, normalized);
    await clearPicksMetadata(authUser);
    return normalized;
  }

  const legacyStored = await loadLegacyPicksByEmail(authUser.email);

  if (!legacyStored) {
    return null;
  }

  const normalized = normalizeStoredPayload(authUser, legacyStored, {
    savedAt:
      typeof legacyStored.savedAt === "string" && legacyStored.savedAt.trim()
        ? legacyStored.savedAt.trim()
        : new Date().toISOString(),
  });

  await writeRemotePicks(authUser, normalized);
  return normalized;
}

export async function savePicksForUser(user, payload, options = {}) {
  const authUser = await getAuthUserById(user?.id);
  const normalized = normalizeStoredPayload(authUser, payload, {
    savedAt: typeof options.savedAt === "string" && options.savedAt.trim() ? options.savedAt.trim() : new Date().toISOString(),
  });

  await writeRemotePicks(authUser, normalized);
  await clearPicksMetadata(authUser);
  return normalized;
}

export async function migrateStoredPicksOutOfUserMetadata() {
  if (!isSupabaseAuthConfigured()) {
    return { migratedUsers: 0, clearedUsers: 0 };
  }

  await ensurePicksBucket();

  const client = getServerSupabaseAdminClient();
  let page = 1;
  let migratedUsers = 0;
  let clearedUsers = 0;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });

    if (error) {
      throw new Error(error.message);
    }

    const users = Array.isArray(data?.users) ? data.users : [];

    if (!users.length) {
      break;
    }

    for (const user of users) {
      const stored = user?.user_metadata?.[PICKS_METADATA_KEY];

      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        const normalized = normalizeStoredPayload(user, stored, {
          savedAt:
            typeof stored.savedAt === "string" && stored.savedAt.trim()
              ? stored.savedAt.trim()
              : new Date().toISOString(),
        });

        await writeRemotePicks(user, normalized);
        migratedUsers += 1;
      }

      if (await clearPicksMetadata(user)) {
        clearedUsers += 1;
      }
    }

    if (users.length < 100) {
      break;
    }

    page += 1;
  }

  return { migratedUsers, clearedUsers };
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
          : null,
    ]),
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
    knockoutScorePredictions: Array.isArray(payload?.knockoutScorePredictions) ? payload.knockoutScorePredictions : [],
    projectedRoundOf32: Array.isArray(payload?.projectedRoundOf32) ? payload.projectedRoundOf32 : [],
  };
}

async function ensurePicksBucket() {
  if (bucketReadyPromise) {
    return bucketReadyPromise;
  }

  bucketReadyPromise = (async () => {
    const client = getServerSupabaseAdminClient();
    const { data, error } = await client.storage.getBucket(PICKS_STORAGE_BUCKET);

    if (!error && data?.id) {
      return;
    }

    const { error: createError } = await client.storage.createBucket(PICKS_STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: "1MB",
    });

    if (createError && !isBucketAlreadyExistsError(createError)) {
      throw new Error(createError.message);
    }
  })().catch((error) => {
    bucketReadyPromise = null;
    throw error;
  });

  return bucketReadyPromise;
}

async function loadRemotePicks(user) {
  await ensurePicksBucket();

  const client = getServerSupabaseAdminClient();
  const { data, error } = await client.storage.from(PICKS_STORAGE_BUCKET).download(getRemotePicksPath(user));

  if (error) {
    if (isStorageObjectMissingError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  const rawText = typeof data?.text === "function" ? await data.text() : "";

  if (!rawText.trim()) {
    return null;
  }

  const parsed = JSON.parse(rawText);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return normalizeStoredPayload(user, parsed, {
    savedAt:
      typeof parsed.savedAt === "string" && parsed.savedAt.trim()
        ? parsed.savedAt.trim()
        : new Date().toISOString(),
  });
}

async function writeRemotePicks(user, normalized) {
  await ensurePicksBucket();

  const client = getServerSupabaseAdminClient();
  const { error } = await client.storage.from(PICKS_STORAGE_BUCKET).upload(
    getRemotePicksPath(user),
    JSON.stringify(normalized, null, 2),
    {
      upsert: true,
      contentType: "application/json; charset=utf-8",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function clearPicksMetadata(user) {
  const currentMetadata = user?.user_metadata;

  if (!currentMetadata || !(PICKS_METADATA_KEY in currentMetadata)) {
    return false;
  }

  if (currentMetadata[PICKS_METADATA_KEY] === null) {
    return false;
  }

  const nextUserMetadata = {
    ...currentMetadata,
    [PICKS_METADATA_KEY]: null,
  };

  const { error } = await getServerSupabaseAdminClient().auth.admin.updateUserById(user.id, {
    user_metadata: nextUserMetadata,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

function getRemotePicksPath(user) {
  return `${String(user?.id || "").trim()}/${PICKS_STORAGE_OBJECT_NAME}`;
}

function isBucketAlreadyExistsError(error) {
  return /already exists/i.test(String(error?.message || ""));
}

function isStorageObjectMissingError(error) {
  const message = String(error?.message || "");
  const statusCode = Number(error?.statusCode || error?.status || 0);

  return statusCode === 404 || /not found|does not exist|object not found/i.test(message);
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
