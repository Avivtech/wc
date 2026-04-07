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

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));
app.use("/vendor/supabase", express.static(supabaseBrowserBundleDir));

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

app.get("/api/picks/me/download", requireSupabaseAuth, async (req, res) => {
  try {
    const email = getAuthenticatedEmail(req);

    const saved = await loadPicksByEmail(email);

    if (!saved) {
      return res.status(404).json({ error: "No saved picks found for that email." });
    }

    const fileName = `${email.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "wc2026"}-world-cup-2026.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(JSON.stringify(saved, null, 2));
  } catch (error) {
    return res.status(500).json({
      error: "Failed to download saved picks.",
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

app.get("/api/picks/:email/download", requireSupabaseAuth, requireMatchingEmailParam, async (req, res) => {
  try {
    const email = getAuthenticatedEmail(req);
    const saved = await loadPicksByEmail(email);

    if (!saved) {
      return res.status(404).json({ error: "No saved picks found for that email." });
    }

    const fileName = `${email.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "wc2026"}-world-cup-2026.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(JSON.stringify(saved, null, 2));
  } catch (error) {
    return res.status(500).json({
      error: "Failed to download saved picks.",
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

    const saved = await savePicksForEmail(email, payload);

    return res.status(201).json({
      ok: true,
      savedAt: saved.savedAt,
      downloadUrl: "/api/picks/me/download"
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
