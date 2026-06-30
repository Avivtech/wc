import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

export const CACHE_TTL_MS = 15 * 60 * 1000;
export const FIFA_RANKINGS_CACHE_TTL_MS = 12 * 60 * 60_000;

const CACHE_FILE = new URL("../../data/cache/world-cup-2026.json", import.meta.url);

let _memoryCache = null;
let _fifaRankingsCache = null;

export function getMemoryCache() {
  return _memoryCache;
}

export function setMemoryCache(cache) {
  _memoryCache = cache;
}

export function getFifaRankingsCache() {
  return _fifaRankingsCache;
}

export function setFifaRankingsCache(cache) {
  _fifaRankingsCache = cache;
}

export async function readCache() {
  try {
    const cacheText = await readFile(CACHE_FILE, "utf8");
    const cache = JSON.parse(cacheText);
    const fileStat = await stat(CACHE_FILE);
    return {
      cachedAt: fileStat.mtimeMs,
      payload: cache
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeCache(payload) {
  await mkdir(new URL("../../data/cache/", import.meta.url), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(payload), "utf8");
}
