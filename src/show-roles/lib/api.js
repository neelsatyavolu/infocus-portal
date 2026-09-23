import { STORAGE_KEY } from "./constants";
import { normalizeHistory } from "./assignments";

const AUTH_ENDPOINT = "/api/show-roles/auth";
const DATA_ENDPOINT = "/api/show-roles/data";
const MEMBERS_ENDPOINT = "/api/show-roles/members";
const NON_ANCHORS_ENDPOINT = "/api/show-roles/non-anchors";

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

  const response = await fetch(DATA_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalized),
  });

  const payload = await parseJson(response);

  if (response.status === 401) {
    throw new Error("Session expired. Please sign in again.");
  }

  if (response.status === 403) {
    throw new Error("Access denied.");
  }

  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || "Failed to save data.");
  }

  const saved = normalizeHistory({ shows: payload.shows ?? normalized.shows });
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
    return list.filter((value) => typeof value === "string");
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

  const response = await fetch(NON_ANCHORS_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonAnchors: list }),
  });

  const payload = await parseJson(response);

  if (response.status === 401) throw new Error("Session expired. Please sign in again.");
  if (response.status === 403) throw new Error("Access denied.");
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || "Failed to save non-anchors.");
  }

  return Array.isArray(payload.nonAnchors) ? payload.nonAnchors : list;
}
