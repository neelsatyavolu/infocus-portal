"use client";

export type UploadHistoryStatus = "PREPARING" | "UPLOADING" | "PROCESSING" | "DONE" | "FAILED";

export type UploadHistoryItem = {
  id: string;
  name: string;
  status: UploadHistoryStatus;
  progress: number;
  bytesUploaded?: number;
  bytesTotal?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number | null;
  updatedAt: number;
};

const STORAGE_KEY = "infocus-upload-history";
const EVENT_NAME = "infocus:upload-history";
const MAX_ITEMS = 20;
const STATUS_ORDER = {
  PREPARING: 0,
  UPLOADING: 1,
  PROCESSING: 2,
  DONE: 3
} as const;

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampNonNegative(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined;
  if (typeof value !== "number") return undefined;
  return Math.max(0, value);
}

function normalizeEta(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, value);
}

function pickStatus(currentStatus: UploadHistoryStatus, nextStatus: UploadHistoryStatus): UploadHistoryStatus {
  if (currentStatus === "DONE") {
    return "DONE";
  }

  if (currentStatus === "FAILED") {
    return nextStatus === "DONE" ? "DONE" : "FAILED";
  }

  if (nextStatus === "FAILED") {
    return "FAILED";
  }

  if (nextStatus === "DONE") {
    return "DONE";
  }

  return STATUS_ORDER[nextStatus] >= STATUS_ORDER[currentStatus] ? nextStatus : currentStatus;
}

function maxOptionalNumber(a?: number, b?: number) {
  if (typeof a !== "number" && typeof b !== "number") {
    return undefined;
  }

  return Math.max(a ?? 0, b ?? 0);
}

function mergeUploadHistoryItem(existing: UploadHistoryItem | undefined, incoming: UploadHistoryItem) {
  if (!existing) {
    return incoming;
  }

  const mergedStatus = pickStatus(existing.status, incoming.status);
  let mergedProgress = Math.max(existing.progress, incoming.progress);
  if (mergedStatus === "PROCESSING" || mergedStatus === "DONE") {
    mergedProgress = 100;
  }

  const mergedBytesUploaded = maxOptionalNumber(existing.bytesUploaded, incoming.bytesUploaded);
  const mergedBytesTotal = maxOptionalNumber(existing.bytesTotal, incoming.bytesTotal);
  const mergedSpeed =
    mergedStatus === "UPLOADING"
      ? incoming.speedBytesPerSecond ?? existing.speedBytesPerSecond ?? 0
      : 0;
  const mergedEta = mergedStatus === "UPLOADING" ? incoming.etaSeconds ?? existing.etaSeconds ?? null : null;

  const didChange =
    mergedStatus !== existing.status ||
    mergedProgress !== existing.progress ||
    mergedBytesUploaded !== existing.bytesUploaded ||
    mergedBytesTotal !== existing.bytesTotal ||
    mergedSpeed !== (existing.speedBytesPerSecond ?? 0) ||
    mergedEta !== (existing.etaSeconds ?? null);

  return {
    ...existing,
    ...incoming,
    status: mergedStatus,
    progress: mergedProgress,
    bytesUploaded: mergedBytesUploaded,
    bytesTotal: mergedBytesTotal,
    speedBytesPerSecond: mergedSpeed,
    etaSeconds: mergedEta,
    updatedAt: didChange ? incoming.updatedAt : existing.updatedAt
  };
}

function readRaw() {
  if (typeof window === "undefined") {
    return [] as UploadHistoryItem[];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UploadHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeRaw(items: UploadHistoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getUploadHistory() {
  return readRaw().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertUploadHistory(item: Omit<UploadHistoryItem, "updatedAt"> & { updatedAt?: number }) {
  const current = readRaw();
  const incomingItem: UploadHistoryItem = {
    ...item,
    progress: clampProgress(item.progress),
    bytesUploaded: clampNonNegative(item.bytesUploaded),
    bytesTotal: clampNonNegative(item.bytesTotal),
    speedBytesPerSecond: clampNonNegative(item.speedBytesPerSecond),
    etaSeconds: normalizeEta(item.etaSeconds),
    updatedAt: item.updatedAt ?? Date.now()
  };

  const existing = current.find((entry) => entry.id === incomingItem.id);
  const nextItem = mergeUploadHistoryItem(existing, incomingItem);
  const without = current.filter((entry) => entry.id !== nextItem.id);
  writeRaw([nextItem, ...without]);
}

export function removeUploadHistory(id: string) {
  const current = readRaw();
  writeRaw(current.filter((entry) => entry.id !== id));
}

export function subscribeUploadHistory(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
