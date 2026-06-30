import "dotenv/config";
import compression from "compression";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getWorldCupData } from "./src/worldCupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const app = express();
const port = Number(process.env.PORT || 3000);
const CACHE_TTL_MS = 15 * 60 * 1000;
const WORLD_CUP_REFRESH_TIMEZONE = "GMT+3";
const WORLD_CUP_REFRESH_TIMEZONE_OFFSET_MS = 3 * 60 * 60_000;
const WORLD_CUP_DAILY_REFRESH_TIMES = [
  { hour: 8, minute: 0 },
  { hour: 12, minute: 0 },
  { hour: 16, minute: 0 },
  { hour: 20, minute: 0 },
  { hour: 22, minute: 0 },
  { hour: 24, minute: 0 }
];
const MAX_REFRESH_TIMER_DELAY_MS = 2_147_000_000;

app.use(compression());
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
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (error) {
    logServerError("Failed to load World Cup data.", error);
    res.status(500).json({ error: "Could not load the tournament right now." });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const data = await getWorldCupData();
    const fetchedAt = data?.source?.fetchedAt ?? null;
    const ageMs = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : null;
    const stale = ageMs === null || ageMs > CACHE_TTL_MS;
    res.json({
      status: stale ? "degraded" : "ok",
      cache: {
        fetchedAt,
        ageSeconds: ageMs !== null ? Math.floor(ageMs / 1000) : null,
        stale
      }
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown"
    });
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
  await refreshWorldCupDataIfNeeded("startup", { force: true });
  scheduleNextWorldCupRefresh();
}

function scheduleNextWorldCupRefresh() {
  if (scheduledWorldCupRefreshTimer) {
    clearTimeout(scheduledWorldCupRefreshTimer);
  }

  const targetRefreshAt = getNextDailyWorldCupRefreshDate();
  const delayMs = clampRefreshDelay(targetRefreshAt.getTime() - Date.now());

  scheduledWorldCupRefreshTimer = setTimeout(async () => {
    await refreshWorldCupDataIfNeeded("scheduled", { force: true });
    scheduleNextWorldCupRefresh();
  }, delayMs);

  if (typeof scheduledWorldCupRefreshTimer.unref === "function") {
    scheduledWorldCupRefreshTimer.unref();
  }

  console.log(
    `Next World Cup data refresh scheduled for ${formatWorldCupRefreshDate(targetRefreshAt)} (${targetRefreshAt.toISOString()} UTC).`
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

function getNextDailyWorldCupRefreshDate(now = new Date()) {
  const refreshLocalNow = new Date(now.getTime() + WORLD_CUP_REFRESH_TIMEZONE_OFFSET_MS);
  const todayRefreshes = WORLD_CUP_DAILY_REFRESH_TIMES.map(({ hour, minute }) =>
    createWorldCupRefreshDate(
      refreshLocalNow.getUTCFullYear(),
      refreshLocalNow.getUTCMonth(),
      refreshLocalNow.getUTCDate(),
      hour,
      minute
    )
  );
  const nextTodayRefresh = todayRefreshes.find((date) => date.getTime() > now.getTime());

  if (nextTodayRefresh) {
    return nextTodayRefresh;
  }

  const next = WORLD_CUP_DAILY_REFRESH_TIMES[0];
  return createWorldCupRefreshDate(
    refreshLocalNow.getUTCFullYear(),
    refreshLocalNow.getUTCMonth(),
    refreshLocalNow.getUTCDate() + 1,
    next.hour,
    next.minute
  );
}

function createWorldCupRefreshDate(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0) - WORLD_CUP_REFRESH_TIMEZONE_OFFSET_MS);
}

function formatWorldCupRefreshDate(date) {
  return `${new Date(date.getTime() + WORLD_CUP_REFRESH_TIMEZONE_OFFSET_MS).toISOString().replace(".000Z", "")} ${WORLD_CUP_REFRESH_TIMEZONE}`;
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
