import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getWorldCupData } from "./src/worldCupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const app = express();
const port = Number(process.env.PORT || 3000);
const WORLD_CUP_REFRESH_TIMEZONE = "UTC";
const WORLD_CUP_REFRESH_OFFSETS_MS = [0, 45 * 60_000, 150 * 60_000];
const WORLD_CUP_FALLBACK_REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_REFRESH_TIMER_DELAY_MS = 2_147_000_000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

function logServerError(context, error) {
  console.error(context, error instanceof Error ? error.message : error);
}

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

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`World Cup 2026 live results running on http://localhost:${port}`);
  void initializeWorldCupRefreshScheduler();
});

let scheduledWorldCupRefreshTimer = null;
let worldCupRefreshInFlight = null;

async function initializeWorldCupRefreshScheduler() {
  const data = await refreshWorldCupDataIfNeeded("startup");
  scheduleNextWorldCupRefresh(data);
}

async function scheduleNextWorldCupRefresh(data = null) {
  if (scheduledWorldCupRefreshTimer) {
    clearTimeout(scheduledWorldCupRefreshTimer);
  }

  const scheduleData = data ?? await getWorldCupData().catch((error) => {
    logServerError("Failed to load World Cup data while scheduling refresh.", error);
    return null;
  });
  const nextRefreshAt = getNextFixtureRefreshDate(scheduleData?.fixtures);
  const targetRefreshAt = nextRefreshAt ?? new Date(Date.now() + WORLD_CUP_FALLBACK_REFRESH_INTERVAL_MS);
  const delayMs = clampRefreshDelay(targetRefreshAt.getTime() - Date.now());

  scheduledWorldCupRefreshTimer = setTimeout(async () => {
    const refreshedData = await refreshWorldCupDataIfNeeded("scheduled", { force: true });
    void scheduleNextWorldCupRefresh(refreshedData);
  }, delayMs);

  if (typeof scheduledWorldCupRefreshTimer.unref === "function") {
    scheduledWorldCupRefreshTimer.unref();
  }

  console.log(
    `Next World Cup data refresh scheduled for ${new Date(Date.now() + delayMs).toISOString()} (${WORLD_CUP_REFRESH_TIMEZONE}).`
  );
}

async function refreshWorldCupDataIfNeeded(reason, { force = false } = {}) {
  if (worldCupRefreshInFlight) {
    return worldCupRefreshInFlight;
  }

  worldCupRefreshInFlight = (async () => {
    try {
      const cachedData = await getWorldCupData();
      const fetchedAt = cachedData?.source?.fetchedAt ?? null;

      if (!force && isSameUtcDate(fetchedAt, new Date())) {
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
      logServerError(
        `World Cup data refresh check failed on ${reason}:`,
        error
      );
      return null;
    } finally {
      worldCupRefreshInFlight = null;
    }
  })();

  return worldCupRefreshInFlight;
}

function getNextFixtureRefreshDate(fixtures = [], now = new Date()) {
  const nowMs = now.getTime();
  const refreshTimes = [];

  for (const fixture of fixtures ?? []) {
    const kickoffMs = getFixtureKickoffTime(fixture);

    if (!Number.isFinite(kickoffMs)) {
      continue;
    }

    for (const offsetMs of WORLD_CUP_REFRESH_OFFSETS_MS) {
      const refreshMs = kickoffMs + offsetMs;

      if (refreshMs > nowMs) {
        refreshTimes.push(refreshMs);
      }
    }
  }

  if (!refreshTimes.length) {
    return null;
  }

  return new Date(Math.min(...refreshTimes));
}

function getFixtureKickoffTime(fixture) {
  if (Number.isFinite(fixture?.timestamp)) {
    return Number(fixture.timestamp) * 1000;
  }

  const parsed = new Date(fixture?.date);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function clampRefreshDelay(delayMs) {
  return Math.min(Math.max(delayMs, 5_000), MAX_REFRESH_TIMER_DELAY_MS);
}

function isSameUtcDate(value, date) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getUTCFullYear() === date.getUTCFullYear() &&
    parsed.getUTCMonth() === date.getUTCMonth() &&
    parsed.getUTCDate() === date.getUTCDate();
}
