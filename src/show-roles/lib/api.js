import { STORAGE_KEY } from "./constants";
import { normalizeHistory } from "./assignments";

const AUTH_ENDPOINT = "/api/show-roles/auth";
const DATA_ENDPOINT = "/api/show-roles/data";
const MEMBERS_ENDPOINT = "/api/show-roles/members";
const NON_ANCHORS_ENDPOINT = "/api/show-roles/non-anchors";

const CONFLICT_MESSAGE = "Someone else changed this — reload to see their changes.";

// What this tab last loaded from (or saved to) the server, per show date and for non-anchors.
// Saves send only the difference from this, so a stale tab never replaces the whole list.
let showBaseline = new Map();
let nonAnchorBaseline = new Set();

function showContent(show) {
  return {
    assignments: show?.assignments && typeof show.assignments === "object" ? show.assignments : {},
    anchors: Array.isArray(show?.anchors) ? show.anchors : [],
    confirmed: show?.confirmed && typeof show.confirmed === "object" ? show.confirmed : {},
  };
}

/** Deep equality for JSON values; object key order is ignored (the database reorders keys). */
function jsonEqual(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => jsonEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && jsonEqual(left[key], right[key]));
}

function rememberShows(shows) {
  showBaseline = new Map(shows.map((show) => [show.date, showContent(show)]));
}

async function parseJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

function readLocalHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shows: [] };
    const parsed = JSON.parse(raw);
    return normalizeHistory(parsed);
  } catch {
    return { shows: [] };
  }
}

function writeLocalHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeHistory(history)));
}

export async function checkSession() {
  const response = await fetch(AUTH_ENDPOINT, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  const data = await parseJson(response);
  return { authenticated: Boolean(data?.authenticated) };
}

export async function loadHistory() {
  try {
    const response = await fetch(DATA_ENDPOINT, {
      method: "GET",
      credentials: "include",
    });

    if (response.status === 401) {
      throw new Error("Session expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Access denied.");
    }

    if (!response.ok) {
      throw new Error("Failed to load from database.");
    }

    const payload = await parseJson(response);
    const history = normalizeHistory(payload || { shows: [] });
    rememberShows(history.shows);
    writeLocalHistory(history);
    return history;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("session")) {
      throw error;
    }
    const fallback = readLocalHistory();
    if (fallback.shows.length > 0) {
      return fallback;
    }
    throw error;
  }
}

export async function saveHistory(history) {
  const normalized = normalizeHistory(history);
  const currentDates = new Set(normalized.shows.map((show) => show.date));
  const changed = normalized.shows.filter((show) => !jsonEqual(showBaseline.get(show.date), showContent(show)));
  const deletedDates = [...showBaseline.keys()].filter((date) => !currentDates.has(date));

  if (changed.length === 0 && deletedDates.length === 0) {
    writeLocalHistory(normalized);
    return normalized;
  }

  const base = {};
  for (const date of [...changed.map((show) => show.date), ...deletedDates]) {
    base[date] = showBaseline.get(date) ?? null;
  }

  const response = await fetch(DATA_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shows: changed.map((show) => ({ date: show.date, ...showContent(show) })),
      base,
      deletedDates,
    }),
  });

  const payload = await parseJson(response);

  if (response.status === 401) {
    throw new Error("Session expired. Please sign in again.");
  }

  if (response.status === 403) {
    throw new Error("Access denied.");
  }

  if (response.status === 409) {
    throw new Error(payload?.error || CONFLICT_MESSAGE);
  }

  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || "Failed to save data.");
  }

  const savedByDate = new Map(
    (Array.isArray(payload.shows) ? payload.shows : []).map((show) => [show.date, show]),
  );
  const saved = normalizeHistory({
    shows: normalized.shows.map((show) => savedByDate.get(show.date) ?? show),
  });
  const nextBaseline = new Map(showBaseline);
  for (const date of deletedDates) nextBaseline.delete(date);
  for (const show of changed) nextBaseline.set(show.date, showContent(savedByDate.get(show.date) ?? show));
  showBaseline = nextBaseline;
  writeLocalHistory(saved);
  return saved;
}

export async function loadCastPool() {
  const response = await fetch(MEMBERS_ENDPOINT, {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 401) throw new Error("Session expired. Please sign in again.");
  if (response.status === 403) throw new Error("Access denied.");
  if (!response.ok) throw new Error("Failed to load members.");

  const payload = await parseJson(response);
  const pool = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const members = Array.isArray(pool?.members)
    ? pool.members.filter((value) => typeof value === "string" && value.length > 0)
    : [];
  const randomExempt = Array.isArray(pool?.randomExempt)
    ? pool.randomExempt.filter((value) => typeof value === "string" && value.length > 0)
    : [];
  return { members, randomExempt };
}

export async function loadNonAnchors() {
  try {
    const response = await fetch(NON_ANCHORS_ENDPOINT, {
      method: "GET",
      credentials: "include",
    });

    if (response.status === 401) throw new Error("Session expired. Please sign in again.");
    if (response.status === 403) throw new Error("Access denied.");
    if (!response.ok) throw new Error("Failed to load non-anchors.");

    const payload = await parseJson(response);
    const list = Array.isArray(payload?.nonAnchors) ? payload.nonAnchors : [];
    const names = list.filter((value) => typeof value === "string");
    nonAnchorBaseline = new Set(names);
    return names;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("session")) {
      throw error;
    }
    return [];
  }
}

export async function saveNonAnchors(nonAnchors) {
  const list = Array.isArray(nonAnchors)
    ? nonAnchors.filter((value) => typeof value === "string" && value.length > 0)
    : [];
  const next = new Set(list);
  const add = list.filter((name) => !nonAnchorBaseline.has(name));
  const remove = [...nonAnchorBaseline].filter((name) => !next.has(name));

  const response = await fetch(NON_ANCHORS_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add, remove }),
  });

  const payload = await parseJson(response);

  if (response.status === 401) throw new Error("Session expired. Please sign in again.");
  if (response.status === 403) throw new Error("Access denied.");
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || "Failed to save non-anchors.");
  }

  const saved = Array.isArray(payload.nonAnchors) ? payload.nonAnchors : list;
  nonAnchorBaseline = new Set(saved);
  return saved;
}
