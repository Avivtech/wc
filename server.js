import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildScoringMatchFromFixture,
  buildScoringResultFromFixture,
  calculatePredictionScore,
  settlePredictions
} from "./src/scoring/index.js";
import {
  buildSavedPicksSettlementRequest,
  calculateCurrentScoreFromSettlement,
  calculatePredictedBonusPoints,
  calculatePredictedBonusPointsForSavedPicks,
  resolveSavedHomeTeam
} from "./src/savedPicksSettlement.js";
import {
  deletePicksForAuthUser,
  listSavedPicksForAllUsers,
  loadPicksForAuthUser,
  loadPicksForUser,
  migrateStoredPicksOutOfUserMetadata,
  savePicksForUser,
  validateEmail
} from "./src/saveStore.js";
import { getBearerToken, getServerSupabaseAdminClient, getSupabasePublicConfig, isSupabaseAuthConfigured, verifySupabaseAccessToken } from "./src/supabaseAuth.js";
import { getWorldCupData } from "./src/worldCupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const supabaseBrowserBundleDir = path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd");

const app = express();
const port = Number(process.env.PORT || 3000);
const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];
const WORLD_CUP_REFRESH_TIMEZONE = "UTC";
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

app.use(express.json({ limit: "1mb" }));

app.get("/he", (_req, res) => {
  res.sendFile(path.join(publicDir, "he", "index.html"));
});

app.get("/high-scores", (_req, res) => {
  res.sendFile(path.join(publicDir, "high-scores", "index.html"));
});

app.get("/he/high-scores", (_req, res) => {
  res.sendFile(path.join(publicDir, "he", "high-scores", "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin", "index.html"));
});

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

function logServerError(context, error) {
  console.error(context, error instanceof Error ? error.message : error);
}

function getTeamIdKey(teamId) {
  if (teamId == null) {
    return "";
  }

  return String(teamId);
}

function getWorldCupTeams(data) {
  return (data.groups || []).flatMap((group) =>
    (group.teams || []).map((team) => ({
      ...team,
      groupLetter: team.groupLetter || group.letter
    }))
  );
}

async function loadWorldCupTeamsData() {
  const data = await getWorldCupData();

  return {
    source: data.source,
    teams: getWorldCupTeams(data)
  };
}

async function loadWorldCupTeamData(teamId) {
  const teamKey = getTeamIdKey(teamId);

  if (!teamKey) {
    return null;
  }

  const teamsData = await loadWorldCupTeamsData();
  const team = teamsData.teams.find((entry) => getTeamIdKey(entry.id) === teamKey);

  if (!team) {
    return null;
  }

  return {
    source: teamsData.source,
    team
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
    logServerError("Failed to load World Cup data.", error);
    res.status(500).json({ error: "Could not load the tournament right now." });
  }
});

app.get("/api/teams", async (_req, res) => {
  try {
    res.json(await loadWorldCupTeamsData());
  } catch (error) {
    logServerError("Failed to load teams data.", error);
    res.status(500).json({ error: "Could not load teams right now." });
  }
});

app.get("/api/teams/:teamId", async (req, res) => {
  try {
    const teamId = getTeamIdKey(req.params.teamId);

    if (!teamId) {
      return res.status(400).json({ error: "A valid team id is required." });
    }

    const teamData = await loadWorldCupTeamData(teamId);

    if (!teamData) {
      return res.status(404).json({ error: "Team not found." });
    }

    return res.json(teamData);
  } catch (error) {
    logServerError("Failed to load team data.", error);
    return res.status(500).json({ error: "Could not load team data right now." });
  }
});

app.get("/api/high-scores", async (_req, res) => {
  try {
    if (!isSupabaseAuthConfigured()) {
      return res.status(503).json({ error: "High scores are not available right now." });
    }

    const worldCup = await getWorldCupData();
    const scoringContext = {
      hostCountries: worldCup.summary?.hostCountries ?? [],
      tournamentStartAt: worldCup.summary?.dateRange?.start ?? null
    };
    const savedEntries = await listSavedPicksForAllUsers();
    const entries = savedEntries
      .map(({ user, picks }) => {
        const settlementRequest = buildSavedPicksSettlementRequest(picks, worldCup);
        const settlement = settlePredictions({
          ...settlementRequest,
          context: scoringContext
        });
        const homeTeam = resolveSavedHomeTeam(picks, worldCup);
        const bonusPoints = calculatePredictedBonusPointsForSavedPicks(picks, worldCup);
        const currentScore = calculateCurrentScoreFromSettlement(settlement);

        return {
          displayName: getLeaderboardDisplayName(user),
          homeTeam,
          bonusPoints,
          currentScore,
          savedAt: picks?.savedAt ?? null
        };
      })
      .sort(
        (left, right) =>
          right.currentScore - left.currentScore ||
          right.bonusPoints - left.bonusPoints ||
          left.displayName.localeCompare(right.displayName, "en", { sensitivity: "base" })
      );

    return res.json({
      entries,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logServerError("Failed to build high scores.", error);
    return res.status(500).json({ error: "High scores are not available right now." });
  }
});

app.post("/api/scoring/matches/:matchId", async (req, res) => {
  try {
    const prediction = req.body?.prediction;
    const matchId = String(req.params.matchId || "").trim();

    if (!matchId) {
      return res.status(400).json({ error: "A valid match id is required." });
    }

    if (!prediction || typeof prediction !== "object") {
      return res.status(400).json({ error: "A prediction object is required." });
    }

    const worldCup = await getWorldCupData();
    const fixture = worldCup.fixtures.find((entry) => String(entry.id) === matchId);

    if (!fixture) {
      return res.status(404).json({ error: "Match not found." });
    }

    const scoringContext = {
      hostCountries: worldCup.summary?.hostCountries ?? [],
      tournamentStartAt: worldCup.summary?.dateRange?.start ?? null,
      ...(req.body?.context && typeof req.body.context === "object" ? req.body.context : {})
    };
    const match = buildScoringMatchFromFixture(fixture, scoringContext);
    const result = req.body?.result ?? buildScoringResultFromFixture(fixture);
    const scorecard = calculatePredictionScore({
      prediction: {
        ...prediction,
        matchId: prediction.matchId ?? fixture.id
      },
      match,
      result,
      config: req.body?.config,
      context: scoringContext
    });

    return res.json(scorecard);
  } catch (error) {
    logServerError("Failed to score match prediction.", error);
    return res.status(500).json({ error: "Could not score this prediction right now." });
  }
});

app.post("/api/scoring/settle", async (req, res) => {
  try {
    const predictions = Array.isArray(req.body?.predictions) ? req.body.predictions : null;

    if (!predictions) {
      return res.status(400).json({ error: "A predictions array is required." });
    }

    const worldCup = await getWorldCupData();
    const scoringContext = {
      hostCountries: worldCup.summary?.hostCountries ?? [],
      tournamentStartAt: worldCup.summary?.dateRange?.start ?? null,
      ...(req.body?.context && typeof req.body.context === "object" ? req.body.context : {})
    };
    const matchLookup = Object.fromEntries(
      worldCup.fixtures.map((fixture) => [
        String(fixture.id),
        buildScoringMatchFromFixture(fixture, scoringContext)
      ])
    );
    const resultLookup = Object.fromEntries(
      worldCup.fixtures.map((fixture) => [
        String(fixture.id),
        buildScoringResultFromFixture(fixture)
      ])
    );
    const settlement = settlePredictions({
      predictions,
      matchesById: {
        ...matchLookup,
        ...(req.body?.matchesById && typeof req.body.matchesById === "object" ? req.body.matchesById : {})
      },
      resultsByMatchId: {
        ...resultLookup,
        ...(req.body?.resultsByMatchId && typeof req.body.resultsByMatchId === "object" ? req.body.resultsByMatchId : {})
      },
      tournamentResults:
        req.body?.tournamentResults && typeof req.body.tournamentResults === "object"
          ? req.body.tournamentResults
          : {},
      config: req.body?.config,
      context: scoringContext
    });

    return res.json({
      ...settlement,
      currentScore: calculateCurrentScoreFromSettlement(settlement),
      predictedBonusPoints: calculatePredictedBonusPoints(predictions, req.body?.config)
    });
  } catch (error) {
    logServerError("Failed to settle predictions.", error);
    return res.status(500).json({ error: "Could not settle predictions right now." });
  }
});

app.get("/api/admin/users", requireSupabaseAuth, requireAdminAuth, async (_req, res) => {
  try {
    const users = await listAdminUsers();

    return res.json({
      users,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logServerError("Failed to list admin users.", error);
    return res.status(500).json({ error: "Could not load users right now." });
  }
});

app.post("/api/admin/users", requireSupabaseAuth, requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = sanitizeDisplayName(req.body?.displayName);
    const isAdmin = Boolean(req.body?.isAdmin);

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "A password with at least 6 characters is required." });
    }

    const { data, error } = await getServerSupabaseAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : {},
      app_metadata: isAdmin ? { is_admin: true, role: "admin" } : { is_admin: false }
    });

    if (error) {
      throw new Error(error.message);
    }

    return res.status(201).json({
      ok: true,
      user: await buildAdminUserEntry(data.user)
    });
  } catch (error) {
    logServerError("Failed to create admin user.", error);
    return res.status(500).json({ error: "Could not create user right now." });
  }
});

app.patch("/api/admin/users/:userId", requireSupabaseAuth, requireAdminAuth, async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const displayName = sanitizeDisplayName(req.body?.displayName);
    const hasAdminFlag = Object.prototype.hasOwnProperty.call(req.body || {}, "isAdmin");
    const nextIsAdmin = Boolean(req.body?.isAdmin);

    if (!userId) {
      return res.status(400).json({ error: "A valid user id is required." });
    }

    const existing = await getAdminUserById(userId);

    if (!existing) {
      return res.status(404).json({ error: "User not found." });
    }

    if (hasAdminFlag && existing.id === req.authUser.id && !nextIsAdmin && !isAdminEmail(existing.email)) {
      return res.status(400).json({ error: "You cannot remove your own admin access." });
    }

    const updates = {
      user_metadata: {
        ...(existing.user_metadata || {}),
        display_name: displayName || null
      }
    };

    if (hasAdminFlag) {
      updates.app_metadata = {
        ...(existing.app_metadata || {}),
        is_admin: nextIsAdmin,
        role: nextIsAdmin ? "admin" : null
      };
    }

    const { data, error } = await getServerSupabaseAdminClient().auth.admin.updateUserById(userId, updates);

    if (error) {
      throw new Error(error.message);
    }

    return res.json({
      ok: true,
      user: await buildAdminUserEntry(data.user)
    });
  } catch (error) {
    logServerError("Failed to update admin user.", error);
    return res.status(500).json({ error: "Could not update user right now." });
  }
});

app.delete("/api/admin/users/:userId", requireSupabaseAuth, requireAdminAuth, async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!userId) {
      return res.status(400).json({ error: "A valid user id is required." });
    }

    if (userId === req.authUser.id) {
      return res.status(400).json({ error: "You cannot delete your own account from this page." });
    }

    const existing = await getAdminUserById(userId);

    if (!existing) {
      return res.status(404).json({ error: "User not found." });
    }

    await deletePicksForAuthUser(existing);

    const { error } = await getServerSupabaseAdminClient().auth.admin.deleteUser(userId);

    if (error) {
      throw new Error(error.message);
    }

    return res.json({ ok: true });
  } catch (error) {
    logServerError("Failed to delete admin user.", error);
    return res.status(500).json({ error: "Could not delete user right now." });
  }
});

app.get("/api/picks/me", requireSupabaseAuth, async (req, res) => {
  try {
    const saved = await loadPicksForUser(req.authUser);

    if (!saved) {
      return res.status(404).json({ error: "No saved picks found for this user." });
    }

    return res.json(saved);
  } catch (error) {
    logServerError("Failed to load saved picks.", error);
    return res.status(500).json({ error: "Could not load your picks right now." });
  }
});

app.get("/api/picks/:email", requireSupabaseAuth, requireMatchingEmailParam, async (req, res) => {
  try {
    const saved = await loadPicksForUser(req.authUser);

    if (!saved) {
      return res.status(404).json({ error: "No saved picks found for this user." });
    }

    return res.json(saved);
  } catch (error) {
    logServerError("Failed to load saved picks.", error);
    return res.status(500).json({ error: "Could not load your picks right now." });
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

    const worldCup = await getWorldCupData();
    const enrichedPayload = {
      ...payload,
      bonusPoints: calculatePredictedBonusPointsForSavedPicks(payload, worldCup)
    };
    const saved = await savePicksForUser(req.authUser, enrichedPayload);

    return res.status(201).json({
      ok: true,
      savedAt: saved.savedAt,
      submittedAt: saved.submittedAt,
      sectionSubmittedAt: saved.sectionSubmittedAt
    });
  } catch (error) {
    logServerError("Failed to save picks.", error);
    return res.status(500).json({ error: "Could not save your picks right now." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`World Cup 2026 game running on http://localhost:${port}`);
  void migrateStoredPicksOutOfUserMetadata()
    .then(({ migratedUsers, clearedUsers }) => {
      if (migratedUsers || clearedUsers) {
        console.log(`Migrated ${migratedUsers} stored pick set(s) out of Supabase user metadata and cleared ${clearedUsers} auth profile(s).`);
      }
    })
    .catch((error) => {
      logServerError("Failed to migrate stored picks out of Supabase user metadata.", error);
    });
  void initializeWorldCupRefreshScheduler();
});

async function requireSupabaseAuth(req, res, next) {
  if (!isSupabaseAuthConfigured()) {
    return res.status(503).json({ error: "Sign in is currently unavailable." });
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
    logServerError("Supabase session verification failed.", error);
    return res.status(401).json({ error: "Your session is invalid. Sign in again." });
  }
}

function requireAdminAuth(req, res, next) {
  if (!isAdminUser(req.authUser)) {
    return res.status(403).json({ error: "Admin access is required." });
  }

  return next();
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

function isAdminUser(user) {
  return isAdminEmail(user?.email) || user?.app_metadata?.is_admin === true || user?.app_metadata?.role === "admin";
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());
}

async function listAdminUsers() {
  const client = getServerSupabaseAdminClient();
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });

    if (error) {
      throw new Error(error.message);
    }

    const pageUsers = Array.isArray(data?.users) ? data.users : [];

    if (!pageUsers.length) {
      break;
    }

    for (const user of pageUsers) {
      users.push(await buildAdminUserEntry(user));
    }

    if (pageUsers.length < 100) {
      break;
    }

    page += 1;
  }

  return users.sort((left, right) => {
    const leftCreated = Date.parse(left.createdAt || "") || 0;
    const rightCreated = Date.parse(right.createdAt || "") || 0;

    return rightCreated - leftCreated || left.email.localeCompare(right.email, "en", { sensitivity: "base" });
  });
}

async function getAdminUserById(userId) {
  const { data, error } = await getServerSupabaseAdminClient().auth.admin.getUserById(userId);

  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ""))) {
      return null;
    }

    throw new Error(error.message);
  }

  return data.user || null;
}

async function buildAdminUserEntry(user) {
  const picks = await loadPicksForAuthUser(user).catch((error) => {
    logServerError(`Failed to load picks summary for user ${user?.id || "unknown"}.`, error);
    return null;
  });

  return {
    id: user?.id || "",
    email: String(user?.email || "").trim().toLowerCase(),
    displayName: sanitizeDisplayName(user?.user_metadata?.display_name),
    isAdmin: isAdminUser(user),
    isAdminEmail: isAdminEmail(user?.email),
    createdAt: user?.created_at || null,
    lastSignInAt: user?.last_sign_in_at || null,
    emailConfirmedAt: user?.email_confirmed_at || user?.confirmed_at || null,
    hasSavedPicks: Boolean(picks),
    savedAt: picks?.savedAt ?? null,
    submittedAt: picks?.submittedAt ?? null
  };
}

function sanitizeDisplayName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

function getLeaderboardDisplayName(user) {
  const rawDisplayName = typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";

  if (rawDisplayName) {
    return rawDisplayName.slice(0, 60);
  }

  return "Player";
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
