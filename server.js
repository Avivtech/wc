import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPicksByEmail, savePicksForEmail, validateEmail } from "./src/saveStore.js";
import { getBearerToken, getSupabasePublicConfig, isSupabaseAuthConfigured, verifySupabaseAccessToken } from "./src/supabaseAuth.js";
import { getWorldCupData } from "./src/worldCupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const supabaseBrowserBundleDir = path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd");

const app = express();
const port = Number(process.env.PORT || 3000);
const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];
const WORLD_CUP_REFRESH_TIMEZONE = "UTC";
const SECTION_LOCKS = {
  groups: ["groups"],
  thirdPlace: ["groups", "thirdPlace"],
  playoffs: ["groups", "thirdPlace", "playoffs"]
};
const SECTION_LABELS = {
  groups: "Groups",
  thirdPlace: "Third Place",
  playoffs: "Playoffs"
};

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));
app.use("/vendor/supabase", express.static(supabaseBrowserBundleDir));

function normalizeSectionSubmissionState(value, fallbackSubmittedAt = "") {
  const normalized = Object.fromEntries(SUBMISSION_SECTIONS.map((section) => [section, null]));

  if (value && typeof value === "object") {
    for (const section of SUBMISSION_SECTIONS) {
      const submittedAt = value[section];
      normalized[section] = typeof submittedAt === "string" && submittedAt.trim() ? submittedAt.trim() : null;
    }

    return normalized;
  }

  const legacySubmittedAt = typeof fallbackSubmittedAt === "string" && fallbackSubmittedAt.trim() ? fallbackSubmittedAt.trim() : null;

  if (legacySubmittedAt) {
    for (const section of SUBMISSION_SECTIONS) {
      normalized[section] = legacySubmittedAt;
    }
  }

  return normalized;
}

function getImmutableSections(saved) {
  const sectionSubmittedAt = normalizeSectionSubmissionState(saved?.sectionSubmittedAt, saved?.submittedAt);
  const immutableSections = new Set();

  for (const section of SUBMISSION_SECTIONS) {
    if (!sectionSubmittedAt[section]) {
      continue;
    }

    for (const lockedSection of SECTION_LOCKS[section] || [section]) {
      immutableSections.add(lockedSection);
    }
  }

  return immutableSections;
}

function getSectionSnapshot(payload, section) {
  if (section === "groups") {
    return {
      groupRankings: Array.isArray(payload?.groupRankings) ? payload.groupRankings : []
    };
  }

  if (section === "thirdPlace") {
    return {
      groupRankings: Array.isArray(payload?.groupRankings) ? payload.groupRankings : [],
      thirdPlaceRanking: Array.isArray(payload?.thirdPlaceRanking) ? payload.thirdPlaceRanking : [],
      bestThirdAdvancers: Array.isArray(payload?.bestThirdAdvancers) ? payload.bestThirdAdvancers : []
    };
  }

  return {
    groupRankings: Array.isArray(payload?.groupRankings) ? payload.groupRankings : [],
    thirdPlaceRanking: Array.isArray(payload?.thirdPlaceRanking) ? payload.thirdPlaceRanking : [],
    bestThirdAdvancers: Array.isArray(payload?.bestThirdAdvancers) ? payload.bestThirdAdvancers : [],
    knockoutWinners: Array.isArray(payload?.knockoutWinners) ? payload.knockoutWinners : [],
    projectedRoundOf32: Array.isArray(payload?.projectedRoundOf32) ? payload.projectedRoundOf32 : []
  };
}

app.get("/api/auth/config", (_req, res) => {
  res.json(getSupabasePublicConfig());
});

app.get("/api/world-cup", async (req, res) => {
  try {
    const refresh = req.query.refresh === "true";
    const timezone = typeof req.query.timezone === "string" && req.query.timezone.trim()
      ? req.query.timezone.trim()
      : "Asia/Jerusalem";

    const data = await getWorldCupData({ refresh, timezone });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Failed to load World Cup data.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("/api/picks/me", requireSupabaseAuth, async (req, res) => {
  try {
    const email = getAuthenticatedEmail(req);

    const saved = await loadPicksByEmail(email);

    if (!saved) {
      return res.status(404).json({ error: "No saved picks found for that email." });
    }

    return res.json(saved);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load saved picks.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("/api/picks/:email", requireSupabaseAuth, requireMatchingEmailParam, async (req, res) => {
  try {
    const email = getAuthenticatedEmail(req);
    const saved = await loadPicksByEmail(email);

    if (!saved) {
      return res.status(404).json({ error: "No saved picks found for that email." });
    }

    return res.json(saved);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load saved picks.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.post("/api/picks", requireSupabaseAuth, async (req, res) => {
  try {
    const payload = req.body;
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const authenticatedEmail = getAuthenticatedEmail(req);

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    if (email !== authenticatedEmail) {
      return res.status(403).json({ error: "You can only save picks for your signed-in email address." });
    }

    if (!Array.isArray(payload?.groupRankings) || payload.groupRankings.length === 0) {
      return res.status(400).json({ error: "Group rankings are required." });
    }

    const existing = await loadPicksByEmail(email);

    const immutableSections = getImmutableSections(existing);

    for (const section of immutableSections) {
      if (JSON.stringify(getSectionSnapshot(existing, section)) !== JSON.stringify(getSectionSnapshot(payload, section))) {
        return res.status(409).json({ error: `${SECTION_LABELS[section] || "This section"} has already been submitted and can no longer be changed.` });
      }
    }

    const saved = await savePicksForEmail(email, payload);

    return res.status(201).json({
      ok: true,
      savedAt: saved.savedAt,
      submittedAt: saved.submittedAt,
      sectionSubmittedAt: saved.sectionSubmittedAt
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to save picks.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`World Cup 2026 game running on http://localhost:${port}`);
  void initializeWorldCupRefreshScheduler();
});

async function requireSupabaseAuth(req, res, next) {
  if (!isSupabaseAuthConfigured()) {
    return res.status(503).json({ error: "Supabase Auth is not configured on the server." });
  }

  const accessToken = getBearerToken(req.headers.authorization);

  if (!accessToken) {
    return res.status(401).json({ error: "Sign in first." });
  }

  try {
    const user = await verifySupabaseAccessToken(accessToken);

    if (!user?.email || !validateEmail(user.email)) {
      return res.status(401).json({ error: "Your session is invalid. Sign in again." });
    }

    req.authUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Your session is invalid. Sign in again.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

function requireMatchingEmailParam(req, res, next) {
  const requestedEmail = decodeURIComponent(req.params.email || "").trim().toLowerCase();
  const authenticatedEmail = getAuthenticatedEmail(req);

  if (!validateEmail(requestedEmail)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  if (requestedEmail !== authenticatedEmail) {
    return res.status(403).json({ error: "You can only access your own saved picks." });
  }

  return next();
}

function getAuthenticatedEmail(req) {
  return String(req.authUser?.email || "").trim().toLowerCase();
}

let scheduledWorldCupRefreshTimer = null;
let worldCupRefreshInFlight = null;

async function initializeWorldCupRefreshScheduler() {
  await refreshWorldCupDataIfNeeded("startup");
  scheduleNextWorldCupRefresh();
}

function scheduleNextWorldCupRefresh() {
  if (scheduledWorldCupRefreshTimer) {
    clearTimeout(scheduledWorldCupRefreshTimer);
  }

  const delayMs = getMillisecondsUntilNextUtcMidnight();

  scheduledWorldCupRefreshTimer = setTimeout(async () => {
    await refreshWorldCupDataIfNeeded("scheduled");
    scheduleNextWorldCupRefresh();
  }, delayMs);

  if (typeof scheduledWorldCupRefreshTimer.unref === "function") {
    scheduledWorldCupRefreshTimer.unref();
  }

  console.log(
    `Next World Cup data refresh check scheduled for ${new Date(Date.now() + delayMs).toISOString()} (${WORLD_CUP_REFRESH_TIMEZONE}).`
  );
}

async function refreshWorldCupDataIfNeeded(reason) {
  if (worldCupRefreshInFlight) {
    return worldCupRefreshInFlight;
  }

  worldCupRefreshInFlight = (async () => {
    try {
      const cachedData = await getWorldCupData();
      const fetchedAt = cachedData?.source?.fetchedAt ?? null;

      if (isSameUtcDate(fetchedAt, new Date())) {
        console.log(
          `World Cup data refresh skipped on ${reason}; cache already refreshed today at ${fetchedAt}.`
        );
        return cachedData;
      }

      console.log(`Refreshing World Cup data on ${reason}; cached refresh date is ${fetchedAt || "missing"}.`);
      const refreshedData = await getWorldCupData({ refresh: true, timezone: "Asia/Jerusalem" });
      console.log(
        `World Cup data refreshed on ${reason} at ${refreshedData?.source?.fetchedAt ?? new Date().toISOString()}.`
      );
      return refreshedData;
    } catch (error) {
      console.error(
        `World Cup data refresh check failed on ${reason}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    } finally {
      worldCupRefreshInFlight = null;
    }
  })();

  return worldCupRefreshInFlight;
}

function getMillisecondsUntilNextUtcMidnight(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

function isSameUtcDate(value, referenceDate = new Date()) {
  if (!value) {
    return false;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === referenceDate.toISOString().slice(0, 10);
}
