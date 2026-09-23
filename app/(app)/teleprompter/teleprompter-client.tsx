"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Expand,
  Minimize2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Settings2,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  TELEPROMPTER_PLAYHEAD_TOP_PX,
  advanceTeleprompterPosition,
  teleprompterArrowState,
  sectionIdAtPosition,
  teleprompterContentTransform,
  teleprompterMaxPosition,
  teleprompterSectionJumpPosition
} from "@/src/lib/teleprompter-motion";
import { classifyRunScriptLine, getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";
import { cn } from "@/src/lib/utils";

type TeleprompterSection = {
  id: string;
  label: string;
  content: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type TeleprompterDoc = {
  id: string;
  title: string;
  orderIndex: number;
  showDate: string | null;
  createdAt: string;
  updatedAt: string;
  sections: TeleprompterSection[];
};

type TeleprompterAutofillStatus = {
  status: "ok" | "warning" | "unavailable";
  message?: string;
};

type TeleprompterPayload = {
  workspaceId: string;
  canEdit: boolean;
  nextShowDateIso: string;
  docs: TeleprompterDoc[];
  autofill: TeleprompterAutofillStatus;
};

type WorkspaceSummary = {
  id: string;
  name: string;
};

type SectionDraft = {
  id: string | null;
  label: string;
  content: string;
};

type ReformatState = {
  scope: "doc" | "section" | null;
  targetId: string | null;
  progress: number;
};

type StyledSegment = {
  text: string;
  tone: "default" | "red" | "yellow";
};

type RunModeSettings = {
  bodyScale: number;
  cueScale: number;
};

const STYLE_PATTERN = /(\[(?:RED|YELLOW)\].*?\[\/(?:RED|YELLOW)\])/gi;
const RUN_MODE_SETTINGS_KEY = "teleprompter-run-mode-settings-v2";
const DEFAULT_RUN_MODE_SETTINGS: RunModeSettings = {
  bodyScale: 1,
  cueScale: 1
};

function buildClamp(minRem: number, preferredVw: number, maxRem: number, scale: number) {
  return `clamp(${(minRem * scale).toFixed(3)}rem, ${(preferredVw * scale).toFixed(3)}vw, ${(maxRem * scale).toFixed(3)}rem)`;
}

function readRunModeSettings(): RunModeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_RUN_MODE_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(RUN_MODE_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_RUN_MODE_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<RunModeSettings>;
    return {
      bodyScale:
        typeof parsed.bodyScale === "number" && Number.isFinite(parsed.bodyScale) ? parsed.bodyScale : DEFAULT_RUN_MODE_SETTINGS.bodyScale,
      cueScale:
        typeof parsed.cueScale === "number" && Number.isFinite(parsed.cueScale) ? parsed.cueScale : DEFAULT_RUN_MODE_SETTINGS.cueScale
    };
  } catch {
    return DEFAULT_RUN_MODE_SETTINGS;
  }
}

function saveRunModeSettings(settings: RunModeSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(RUN_MODE_SETTINGS_KEY, JSON.stringify(settings));
}

function getDocSortTimestamp(doc: TeleprompterDoc) {
  const timestamp = Date.parse(doc.showDate ?? doc.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortDocsByRecent(docs: TeleprompterDoc[]) {
  return [...docs].sort((left, right) => {
    const timestampDelta = getDocSortTimestamp(right) - getDocSortTimestamp(left);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    const createdAtDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return right.orderIndex - left.orderIndex;
  });
}

function formatShowDateLabel(showDate: string | null) {
  if (!showDate) {
    return null;
  }

  const iso = showDate.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        destructive && "hover:bg-destructive/15 hover:text-destructive"
      )}
    >
      {children}
    </button>
  );
}

async function readData<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Request failed.");
  }

  return payload.data as T;
}

function splitStyledSegments(text: string): StyledSegment[] {
  if (!text) {
    return [];
  }

  const chunks = text.split(STYLE_PATTERN).filter(Boolean);
  return chunks.map((chunk) => {
    const upper = chunk.toUpperCase();
    if (upper.startsWith("[RED]") && upper.endsWith("[/RED]")) {
      return {
        text: chunk.slice(5, -6),
        tone: "red"
      };
    }

    if (upper.startsWith("[YELLOW]") && upper.endsWith("[/YELLOW]")) {
      return {
        text: chunk.slice(8, -9),
        tone: "yellow"
      };
    }

    return {
      text: chunk,
      tone: "default"
    };
  });
}

function CueHighlight({ text, settings }: { text: string; settings: RunModeSettings }) {
  return (
    <span
      className="inline-block bg-[#fff200] px-[0.22em] py-[0.04em] font-extrabold uppercase leading-[1.05] text-[#ff0000]"
      style={{
        fontSize: buildClamp(2.35, 5.1, 5.8, settings.cueScale)
      }}
    >
      {text}
    </span>
  );
}

function SpokenLine({
  text,
  lineIndex,
  settings
}: {
  text: string;
  lineIndex: number;
  settings: RunModeSettings;
}) {
  const segments = splitStyledSegments(text);
  if (segments.length === 0) {
    return null;
  }

  return (
    <p
      key={`line-${lineIndex}`}
      className="text-white"
      style={{
        fontSize: buildClamp(2.5, 5.4, 6.2, settings.bodyScale),
        lineHeight: 1.12
      }}
    >
      {segments.map((segment, segmentIndex) => (
        <span
          key={`${lineIndex}-${segmentIndex}-${segment.tone}`}
          className={cn(
            segment.tone === "red" ? "text-red-500" : "",
            segment.tone === "yellow" ? "text-yellow-300" : ""
          )}
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
}

function renderScriptLine(line: string, lineIndex: number, settings: RunModeSettings) {
  const classified = classifyRunScriptLine(line);

  if (classified.kind === "gap") {
    return <div key={`line-gap-${lineIndex}`} className="h-8 md:h-14" />;
  }

  if (classified.kind === "camera") {
    return (
      <p
        key={`line-camera-${lineIndex}`}
        className="uppercase text-white"
        style={{
          fontSize: buildClamp(2.5, 5.4, 6.2, settings.bodyScale),
          lineHeight: 1.08
        }}
      >
        {classified.text}
      </p>
    );
  }

  if (classified.kind === "cue") {
    return (
      <div key={`line-cue-${lineIndex}`} className="space-y-3 md:space-y-5">
        <div>
          <CueHighlight text={classified.text} settings={settings} />
        </div>
        {classified.spoken ? <SpokenLine text={classified.spoken} lineIndex={lineIndex} settings={settings} /> : null}
      </div>
    );
  }

  return <SpokenLine text={classified.text} lineIndex={lineIndex} settings={settings} />;
}

function FullscreenRunMode({
  doc,
  docs,
  onSelectDoc,
  onClose
}: {
  doc: TeleprompterDoc;
  docs: TeleprompterDoc[];
  onSelectDoc: (docId: string) => void;
  onClose: () => void;
}) {
  const [speed, setSpeed] = useState(72);
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<RunModeSettings>(() => readRunModeSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(doc.sections[0]?.id ?? "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionEls = useRef<Record<string, HTMLElement | null>>({});
  const positionRef = useRef(0);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const contentHeightRef = useRef(0);
  const activeSectionIdRef = useRef(activeSectionId);
  const sectionsRef = useRef(doc.sections);
  pausedRef.current = paused;
  speedRef.current = speed;
  activeSectionIdRef.current = activeSectionId;
  sectionsRef.current = doc.sections;
  const sectionOptions = useMemo(
    () =>
      doc.sections.map((section) => ({
        id: section.id,
        label: getSectionDisplayParts(section).badgeLabel.toUpperCase()
      })),
    [doc.sections]
  );

  useEffect(() => {
    saveRunModeSettings(settings);
  }, [settings]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsBrowserFullscreen(document.fullscreenElement === containerRef.current);
    }

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const firstSectionId = doc.sections[0]?.id ?? "";

  const applyPosition = useCallback((next: number) => {
    positionRef.current = next;
    const node = contentRef.current;
    if (node) {
      node.style.transform = teleprompterContentTransform(next);
    }
  }, []);

  useEffect(() => {
    applyPosition(0);
    setActiveSectionId(firstSectionId);
  }, [applyPosition, doc.id, firstSectionId]);

  useEffect(() => {
    function measure() {
      contentHeightRef.current = contentRef.current?.offsetHeight ?? 0;
    }

    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [doc.id, settings.bodyScale, settings.cueScale]);

  useEffect(() => {
    let rafId = 0;
    let lastFrame = performance.now();

    function tick(now: number) {
      const deltaMs = Math.min(now - lastFrame, 48);
      lastFrame = now;
      const contentHeight = contentHeightRef.current;

      if (!pausedRef.current && contentHeight > 0) {
        const maxPosition = teleprompterMaxPosition(contentHeight);
        applyPosition(
          advanceTeleprompterPosition(positionRef.current, speedRef.current, deltaMs, maxPosition)
        );

        const nextId = sectionIdAtPosition(
          sectionsRef.current.map((section) => ({
            id: section.id,
            top: sectionEls.current[section.id]?.offsetTop ?? 0
          })),
          positionRef.current
        );

        if (nextId && nextId !== activeSectionIdRef.current) {
          activeSectionIdRef.current = nextId;
          setActiveSectionId(nextId);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [applyPosition]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") {
          return;
        }
      }

      if (event.key === " ") {
        event.preventDefault();
        const next = teleprompterArrowState({ paused: pausedRef.current, speed: speedRef.current }, "space");
        setSpeed(next.speed);
        setPaused(next.paused);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = teleprompterArrowState({ paused: pausedRef.current, speed: speedRef.current }, "up");
        setSpeed(next.speed);
        setPaused(next.paused);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = teleprompterArrowState({ paused: pausedRef.current, speed: speedRef.current }, "down");
        setSpeed(next.speed);
        setPaused(next.paused);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const next = teleprompterArrowState({ paused: pausedRef.current, speed: speedRef.current }, "left");
        setSpeed(next.speed);
        setPaused(next.paused);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = teleprompterArrowState({ paused: pausedRef.current, speed: speedRef.current }, "right");
        setSpeed(next.speed);
        setPaused(next.paused);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function jumpToSection(sectionId: string) {
    activeSectionIdRef.current = sectionId;
    setActiveSectionId(sectionId);
    applyPosition(teleprompterSectionJumpPosition(sectionEls.current[sectionId]?.offsetTop ?? 0));
  }

  async function toggleBrowserFullscreen() {
    if (!containerRef.current) {
      return;
    }

    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }

    await containerRef.current.requestFullscreen();
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[130] flex flex-col bg-black text-white antialiased"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <header className="relative z-20 flex h-9 shrink-0 items-center gap-1.5 border-b border-[#cfcfcf] bg-[#e6e6e6] px-2 text-[#222]">
        <select
          aria-label="Show"
          className="h-[22px] max-w-[280px] rounded-[3px] border border-[#b5b5b5] bg-white px-1.5 text-[12px] font-medium text-[#222]"
          value={doc.id}
          onChange={(event) => onSelectDoc(event.target.value)}
        >
          {docs.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </select>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8a8a8a]" />
        <select
          aria-label="Section"
          className="h-[22px] max-w-[220px] rounded-[3px] border border-[#b5b5b5] bg-white px-1.5 text-[12px] font-medium text-[#222]"
          value={activeSectionId}
          disabled={sectionOptions.length === 0}
          onMouseDown={(event) => {
            event.currentTarget.value = "";
          }}
          onBlur={(event) => {
            event.currentTarget.value = activeSectionId;
          }}
          onChange={(event) => {
            if (event.target.value) {
              jumpToSection(event.target.value);
            }
          }}
        >
          <option value="" disabled hidden />
          {sectionOptions.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#333] hover:bg-black/10",
              settingsOpen && "bg-black/10"
            )}
            onClick={() => setSettingsOpen((current) => !current)}
            aria-label="Font settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#333] hover:bg-black/10"
            onClick={() => void toggleBrowserFullscreen()}
            aria-label={isBrowserFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isBrowserFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#333] hover:bg-black/10"
            onClick={onClose}
            aria-label="Exit teleprompter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <div className="absolute right-2 top-11 z-30 w-[280px] rounded-md border border-white/15 bg-black/92 p-3 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Font Settings</p>
            <button type="button" className="text-xs text-white/60 hover:text-white" onClick={() => setSettings(DEFAULT_RUN_MODE_SETTINGS)}>
              Reset
            </button>
          </div>
          <div className="space-y-3">
            <label className="block text-[11px] uppercase tracking-[0.12em] text-white/55">
              Script Size {Math.round(settings.bodyScale * 100)}%
              <input
                type="range"
                min="0.55"
                max="1.3"
                step="0.05"
                value={settings.bodyScale}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    bodyScale: Number(event.target.value)
                  }))
                }
                className="mt-2 w-full"
              />
            </label>
            <label className="block text-[11px] uppercase tracking-[0.12em] text-white/55">
              Cue Size {Math.round(settings.cueScale * 100)}%
              <input
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                value={settings.cueScale}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    cueScale: Number(event.target.value)
                  }))
                }
                className="mt-2 w-full"
              />
            </label>
            <p className="text-[11px] tabular-nums text-white/45">
              Space pause · ↓ through 0 reverses · {speed} px/s
            </p>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-black via-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-black via-black/75 to-transparent" />
        <div
          className="pointer-events-none absolute left-16 z-20 md:left-20"
          style={{
            top: TELEPROMPTER_PLAYHEAD_TOP_PX,
            transform: "translateY(-50%)"
          }}
          aria-hidden="true"
        >
          <div
            className="h-0 w-0"
            style={{
              borderBottom: "22px solid transparent",
              borderLeft: "34px solid #fff",
              borderTop: "22px solid transparent"
            }}
          />
        </div>
        <div
          ref={contentRef}
          className="absolute left-0 right-0 pl-28 pr-16 pt-2 md:pl-32 md:pr-20"
          style={{
            transform: teleprompterContentTransform(0),
            willChange: "transform",
            backfaceVisibility: "hidden"
          }}
        >
          {doc.sections.map((section) => {
            const display = getSectionDisplayParts(section);
            const lines = display.content.split(/\r?\n/);
            return (
              <section
                key={section.id}
                ref={(node) => {
                  sectionEls.current[section.id] = node;
                }}
                className="mb-16 space-y-3 last:mb-0 md:mb-24 md:space-y-4"
              >
                {lines.map((line, index) => renderScriptLine(line, index, settings))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TeleprompterClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId")?.trim() ?? "";
  const requestedDocId = searchParams.get("doc")?.trim() ?? "";
  const requestedShowDate = searchParams.get("showDate")?.trim() ?? "";
  const [docs, setDocs] = useState<TeleprompterDoc[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [autofillStatus, setAutofillStatus] = useState<TeleprompterAutofillStatus>({
    status: "ok"
  });
  const [canEdit, setCanEdit] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docTitleDraft, setDocTitleDraft] = useState("");
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft>({
    id: null,
    label: "",
    content: ""
  });
  const [runModeOpen, setRunModeOpen] = useState(false);
  const [docsSidebarCollapsed, setDocsSidebarCollapsed] = useState(false);
  /** Full-app shell on teleprompter.infocuspaly.com (no packages sidebar). */
  const [standaloneApp, setStandaloneApp] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [reformatState, setReformatState] = useState<ReformatState>({
    scope: null,
    targetId: null,
    progress: 0
  });
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);
  const reformatIntervalRef = useRef<number | null>(null);
  const orderedDocs = useMemo(() => sortDocsByRecent(docs), [docs]);
  const RECENT_DOCS_LIMIT = 9;
  const visibleDocs = useMemo(
    () => (showAllDocs ? orderedDocs : orderedDocs.slice(0, RECENT_DOCS_LIMIT)),
    [orderedDocs, showAllDocs]
  );
  const hiddenDocsCount = Math.max(0, orderedDocs.length - RECENT_DOCS_LIMIT);

  const activeDoc = useMemo(
    () => orderedDocs.find((doc) => doc.id === selectedDocId) ?? orderedDocs[0] ?? null,
    [orderedDocs, selectedDocId]
  );

  useEffect(() => {
    if (!activeDoc) {
      setSelectedDocId(null);
      return;
    }

    if (!selectedDocId || !orderedDocs.some((doc) => doc.id === selectedDocId)) {
      setSelectedDocId(activeDoc.id);
    }
  }, [activeDoc, selectedDocId, orderedDocs]);

  useEffect(() => {
    if (!activeDoc) {
      setCollapsedSections({});
      return;
    }

    setCollapsedSections((current) => {
      const next: Record<string, boolean> = {};
      for (const section of activeDoc.sections) {
        next[section.id] = current[section.id] ?? true;
      }
      return next;
    });
  }, [activeDoc]);

  useEffect(() => {
    return () => {
      if (reformatIntervalRef.current !== null) {
        window.clearInterval(reformatIntervalRef.current);
      }
    };
  }, []);

  const setWorkspaceInUrl = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (workspaceId) {
        params.set("workspaceId", workspaceId);
      } else {
        params.delete("workspaceId");
      }

      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      router.replace(href as never, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const refreshWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    try {
      const data = await readData<WorkspaceSummary[]>("/api/workspaces");
      setWorkspaces(data);
    } catch {
      setWorkspaces([]);
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (requestedWorkspaceId) {
        params.set("workspaceId", requestedWorkspaceId);
      }
      if (requestedShowDate) {
        params.set("showDate", requestedShowDate);
      }
      const query = params.toString();
      const data = await readData<TeleprompterPayload>(query ? `/api/teleprompter?${query}` : "/api/teleprompter");
      setDocs(data.docs);
      setCanEdit(data.canEdit);
      setActiveWorkspaceId(data.workspaceId);
      setAutofillStatus(data.autofill);

      const matchedById = requestedDocId ? data.docs.find((doc) => doc.id === requestedDocId) : null;
      const matchedByDate = requestedShowDate
        ? data.docs.find((doc) => doc.showDate?.slice(0, 10) === requestedShowDate)
        : null;
      if (matchedById || matchedByDate) {
        setSelectedDocId((matchedById ?? matchedByDate)?.id ?? null);
      }

      if (data.workspaceId !== requestedWorkspaceId) {
        setWorkspaceInUrl(data.workspaceId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load scripts.");
    } finally {
      setLoading(false);
    }
  }, [requestedDocId, requestedShowDate, requestedWorkspaceId, setWorkspaceInUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    setStandaloneApp(host.startsWith("teleprompter."));
  }, []);

  const workspaceOptions = useMemo(
    () =>
      workspaces.map((workspace) => ({
        value: workspace.id,
        label: workspace.name
      })),
    [workspaces]
  );

  const selectedWorkspaceValue = useMemo(() => {
    if (activeWorkspaceId && workspaceOptions.some((option) => option.value === activeWorkspaceId)) {
      return activeWorkspaceId;
    }

    if (requestedWorkspaceId && workspaceOptions.some((option) => option.value === requestedWorkspaceId)) {
      return requestedWorkspaceId;
    }

    return workspaceOptions[0]?.value ?? "";
  }, [activeWorkspaceId, requestedWorkspaceId, workspaceOptions]);

  function openCreateDocModal() {
    setEditingDocId(null);
    setDocTitleDraft("");
    setDocModalOpen(true);
  }

  function openRenameDocModal(doc: TeleprompterDoc) {
    setEditingDocId(doc.id);
    setDocTitleDraft(doc.title);
    setDocModalOpen(true);
  }

  function openCreateSectionModal() {
    const sectionNumber = (activeDoc?.sections.length ?? 0) + 1;
    setSectionDraft({
      id: null,
      label: `A${sectionNumber}`,
      content: ""
    });
    setSectionModalOpen(true);
  }

  function openEditSectionModal(section: TeleprompterSection) {
    setSectionDraft({
      id: section.id,
      label: section.label,
      content: section.content
    });
    setSectionModalOpen(true);
  }

  async function saveDoc() {
    const title = docTitleDraft.trim();

    if (!title) {
      return;
    }

    if (!activeWorkspaceId) {
      setMessage("Select a workspace before creating a script.");
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      if (editingDocId) {
        const updated = await readData<{ id: string; title: string }>(
          `/api/teleprompter/docs/${editingDocId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title
            })
          }
        );

        setDocs((current) =>
          current.map((entry) =>
            entry.id === updated.id
              ? {
                  ...entry,
                  title: updated.title
                }
              : entry
          )
        );
      } else {
        const created = await readData<TeleprompterDoc>("/api/teleprompter", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            workspaceId: activeWorkspaceId,
            title
          })
        });

        setDocs((current) => [...current, created]);
        setSelectedDocId(created.id);
      }

      setDocModalOpen(false);
      setDocTitleDraft("");
      setEditingDocId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save script.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteDoc(doc: TeleprompterDoc) {
    const confirmed = window.confirm(`Delete \"${doc.title}\" and all of its sections?`);
    if (!confirmed) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      await readData<{ id: string }>(`/api/teleprompter/docs/${doc.id}`, {
        method: "DELETE"
      });

      setDocs((current) => current.filter((entry) => entry.id !== doc.id));
      if (selectedDocId === doc.id) {
        setSelectedDocId(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete script.");
    } finally {
      setWorking(false);
    }
  }

  async function saveSection() {
    if (!activeDoc) {
      return;
    }

    const label = sectionDraft.label.trim();
    if (!label) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      if (sectionDraft.id) {
        const updated = await readData<TeleprompterSection>(
          `/api/teleprompter/sections/${sectionDraft.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              label,
              content: sectionDraft.content
            })
          }
        );

        setDocs((current) =>
          current.map((doc) =>
            doc.id === activeDoc.id
              ? {
                  ...doc,
                  sections: doc.sections.map((section) =>
                    section.id === updated.id
                      ? {
                          ...section,
                          ...updated
                        }
                      : section
                  )
                }
              : doc
          )
        );
      } else {
        const created = await readData<TeleprompterSection>(
          `/api/teleprompter/docs/${activeDoc.id}/sections`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              label,
              content: sectionDraft.content
            })
          }
        );

        setDocs((current) =>
          current.map((doc) =>
            doc.id === activeDoc.id
              ? {
                  ...doc,
                  sections: [...doc.sections, created]
                }
              : doc
          )
        );
      }

      setSectionModalOpen(false);
      setSectionDraft({
        id: null,
        label: "",
        content: ""
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save section.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteSection(sectionId: string) {
    if (!activeDoc) {
      return;
    }

    const confirmed = window.confirm("Delete this section?");
    if (!confirmed) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      await readData<{ id: string }>(`/api/teleprompter/sections/${sectionId}`, {
        method: "DELETE"
      });

      setDocs((current) =>
        current.map((doc) =>
          doc.id === activeDoc.id
            ? {
                ...doc,
                sections: doc.sections.filter((section) => section.id !== sectionId)
              }
            : doc
        )
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete section.");
    } finally {
      setWorking(false);
    }
  }

  function toggleSectionCollapsed(sectionId: string) {
    setCollapsedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId]
    }));
  }

  function startReformatProgress(scope: "doc" | "section", targetId: string) {
    if (reformatIntervalRef.current !== null) {
      window.clearInterval(reformatIntervalRef.current);
    }

    setReformatState({
      scope,
      targetId,
      progress: 8
    });

    reformatIntervalRef.current = window.setInterval(() => {
      setReformatState((current) => {
        if (current.scope !== scope || current.targetId !== targetId) {
          return current;
        }

        return {
          scope: current.scope,
          targetId: current.targetId,
          progress: Math.min(88, current.progress + 9)
        };
      });
    }, 180);
  }

  function clearReformatProgress() {
    if (reformatIntervalRef.current !== null) {
      window.clearInterval(reformatIntervalRef.current);
      reformatIntervalRef.current = null;
    }
  }

  function finishReformatProgress(scope: "doc" | "section", targetId: string) {
    setReformatState({
      scope,
      targetId,
      progress: 100
    });
    window.setTimeout(() => {
      setReformatState((current) =>
        current.scope === scope && current.targetId === targetId
          ? {
              scope: null,
              targetId: null,
              progress: 0
            }
          : current
      );
    }, 600);
  }

  function resetReformatProgress() {
    setReformatState({
      scope: null,
      targetId: null,
      progress: 0
    });
  }

  async function reformatSection(section: TeleprompterSection) {
    if (!activeDoc) {
      return;
    }

    setWorking(true);
    setMessage(null);
    startReformatProgress("section", section.id);

    try {
      const updated = await readData<TeleprompterSection>(`/api/teleprompter/sections/${section.id}/reformat`, {
        method: "POST"
      });

      setDocs((current) =>
        current.map((doc) =>
          doc.id === activeDoc.id
            ? {
                ...doc,
                sections: doc.sections.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry))
              }
            : doc
        )
      );
      setCollapsedSections((current) => ({
        ...current,
        [section.id]: false
      }));
      finishReformatProgress("section", section.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to reformat section.");
      resetReformatProgress();
    } finally {
      clearReformatProgress();
      setWorking(false);
    }
  }

  async function refetchBulletinSection(section: TeleprompterSection) {
    if (!activeDoc) {
      return;
    }

    setWorking(true);
    setMessage(null);
    startReformatProgress("section", section.id);

    try {
      const updated = await readData<TeleprompterSection>(`/api/teleprompter/sections/${section.id}/refetch`, {
        method: "POST"
      });

      setDocs((current) =>
        current.map((doc) =>
          doc.id === activeDoc.id
            ? {
                ...doc,
                sections: doc.sections.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry))
              }
            : doc
        )
      );
      setCollapsedSections((current) => ({
        ...current,
        [section.id]: false
      }));
      finishReformatProgress("section", section.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to refetch announcements.");
      resetReformatProgress();
    } finally {
      clearReformatProgress();
      setWorking(false);
    }
  }

  async function copySectionContent(section: TeleprompterSection) {
    const display = getSectionDisplayParts(section);
    const text = display.content || section.content || "";
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSectionId(section.id);
      setMessage(null);
      window.setTimeout(() => {
        setCopiedSectionId((current) => (current === section.id ? null : current));
      }, 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to copy section.");
    }
  }

  async function reformatDoc(doc: TeleprompterDoc) {
    setWorking(true);
    setMessage(null);
    startReformatProgress("doc", doc.id);

    try {
      const updated = await readData<TeleprompterDoc>(`/api/teleprompter/docs/${doc.id}/reformat`, {
        method: "POST"
      });

      setDocs((current) => current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)));
      setCollapsedSections(
        updated.sections.reduce<Record<string, boolean>>((next, section) => {
          next[section.id] = false;
          return next;
        }, {})
      );
      finishReformatProgress("doc", doc.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to reformat script.");
      resetReformatProgress();
    } finally {
      clearReformatProgress();
      setWorking(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "route-enter mx-auto w-full max-w-[80rem] space-y-5 pb-24",
          standaloneApp && "flex min-h-[calc(100vh-3rem)] flex-col px-3 py-3 pb-6 sm:px-4"
        )}
      >
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="eyebrow flex items-center gap-2">
                <ScrollText className="h-3 w-3" />
                Show script
              </div>
              <h1 className="display-md mt-2 text-balance text-foreground">Teleprompter</h1>
              <p className="mt-1 text-sm text-muted-foreground">Edit the rundown, then run it fullscreen.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="meta-pill tabular-nums">
                {orderedDocs.length} script{orderedDocs.length === 1 ? "" : "s"}
              </span>
              {!standaloneApp && workspaceOptions.length > 1 ? (
                <div className="w-[220px]">
                  <Select
                    value={selectedWorkspaceValue}
                    onValueChange={(workspaceId) => setWorkspaceInUrl(workspaceId)}
                    disabled={loading || loadingWorkspaces || working}
                  >
                    <SelectTrigger className="h-9" aria-label="Select workspace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaceOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {canEdit ? (
                <Button type="button" variant="secondary" size="sm" onClick={openCreateDocModal} disabled={working}>
                  <Plus className="h-4 w-4" />
                  New script
                </Button>
              ) : null}
            </div>
          </div>

          {message ? (
            <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              {message}
            </p>
          ) : null}
          {autofillStatus.status !== "ok" && autofillStatus.message ? (
            <p className="relative mt-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              {autofillStatus.message}
            </p>
          ) : null}
        </section>

        <section
          className={cn(
            "overflow-hidden rounded-2xl border border-border bg-card",
            standaloneApp && "flex min-h-0 flex-1 flex-col"
          )}
        >
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading scripts…</p>
          ) : orderedDocs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No scripts yet.</p>
              {canEdit ? (
                <Button type="button" size="sm" className="mt-3" onClick={openCreateDocModal} disabled={working}>
                  <Plus className="h-4 w-4" />
                  New script
                </Button>
              ) : null}
            </div>
          ) : (
            <div
              className={cn(
                "grid min-h-0",
                docsSidebarCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-[16.5rem_minmax(0,1fr)]",
                standaloneApp && "h-full flex-1"
              )}
            >
              {!docsSidebarCollapsed ? (
                <aside className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between gap-1 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Scripts</p>
                    <div className="flex items-center">
                      <IconButton label="Refresh" onClick={() => void refresh()} disabled={loading || working}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Hide scripts" onClick={() => setDocsSidebarCollapsed(true)}>
                        <PanelLeftClose className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                  <div className={cn("min-h-0 flex-1", standaloneApp && "overflow-y-auto")}>
                    {visibleDocs.map((doc) => {
                      const selected = (activeDoc?.id ?? null) === doc.id;
                      const dateLabel = formatShowDateLabel(doc.showDate);
                      return (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-start gap-1 border-b border-border last:border-b-0",
                            selected ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDocId(doc.id)}
                            className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left"
                          >
                            <span
                              className={cn(
                                "mt-1 h-8 w-0.5 shrink-0 rounded-full",
                                selected ? "bg-[var(--brand-green)]" : "bg-transparent"
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">{doc.title}</span>
                              <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                                {dateLabel ? `${dateLabel} · ` : ""}
                                {doc.sections.length} {doc.sections.length === 1 ? "section" : "sections"}
                              </span>
                            </span>
                          </button>
                          {canEdit ? (
                            <div className="flex shrink-0 py-1.5 pr-1.5">
                              <IconButton label="Rename script" onClick={() => openRenameDocModal(doc)}>
                                <Edit3 className="h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton label="Delete script" destructive onClick={() => void deleteDoc(doc)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconButton>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {hiddenDocsCount > 0 || showAllDocs ? (
                      <button
                        type="button"
                        onClick={() => setShowAllDocs((current) => !current)}
                        className="w-full px-3 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {showAllDocs ? "Show less" : `Show ${hiddenDocsCount} more`}
                      </button>
                    ) : null}
                  </div>
                </aside>
              ) : null}

              <div className={cn("min-w-0", standaloneApp && "min-h-0 overflow-y-auto")}>
                {!activeDoc ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">Select a script to edit.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {docsSidebarCollapsed ? (
                          <IconButton label="Show scripts" onClick={() => setDocsSidebarCollapsed(false)}>
                            <PanelLeftOpen className="h-3.5 w-3.5" />
                          </IconButton>
                        ) : null}
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-foreground">{activeDoc.title}</h2>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {activeDoc.sections.length} {activeDoc.sections.length === 1 ? "section" : "sections"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {canEdit ? (
                          <Button type="button" variant="secondary" size="sm" onClick={openCreateSectionModal} disabled={working}>
                            <Plus className="h-4 w-4" />
                            Add section
                          </Button>
                        ) : null}
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void reformatDoc(activeDoc)}
                            disabled={working || activeDoc.sections.length === 0}
                          >
                            <Sparkles className="h-4 w-4" />
                            Reformat
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setRunModeOpen(true)}
                          disabled={activeDoc.sections.length === 0}
                        >
                          <Monitor className="h-4 w-4" />
                          Run
                        </Button>
                      </div>
                    </div>

                    {reformatState.scope === "doc" && reformatState.targetId === activeDoc.id ? (
                      <div className="border-b border-border px-4 py-3">
                        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          <span>Reformatting script</span>
                          <span className="tabular-nums">{Math.round(reformatState.progress)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-200"
                            style={{ width: `${reformatState.progress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {activeDoc.sections.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <p className="text-sm text-muted-foreground">No sections in this script yet.</p>
                        {canEdit ? (
                          <Button type="button" size="sm" className="mt-3" onClick={openCreateSectionModal} disabled={working}>
                            <Plus className="h-4 w-4" />
                            Add section
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        {activeDoc.sections.map((section) => {
                          const collapsed = collapsedSections[section.id] ?? true;
                          const isReformatting = reformatState.scope === "section" && reformatState.targetId === section.id;
                          const display = getSectionDisplayParts(section);

                          return (
                            <article key={section.id} className="border-b border-border last:border-b-0">
                              <div className="flex items-center gap-1 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSectionCollapsed(section.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent/60"
                                  aria-expanded={!collapsed}
                                >
                                  {collapsed ? (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="min-w-0 truncate font-display text-xs font-bold uppercase tracking-wide text-foreground">
                                    {display.badgeLabel}
                                  </span>
                                </button>

                                {canEdit ? (
                                  <div className="flex shrink-0 items-center">
                                    <IconButton
                                      label="Reformat section"
                                      disabled={working}
                                      onClick={() => void reformatSection(section)}
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                    </IconButton>
                                    <IconButton
                                      label={copiedSectionId === section.id ? "Copied" : "Copy section"}
                                      onClick={() => void copySectionContent(section)}
                                    >
                                      {copiedSectionId === section.id ? (
                                        <Check className="h-3.5 w-3.5" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </IconButton>
                                    {section.label === "A2" ? (
                                      <IconButton
                                        label="Refetch bulletin"
                                        disabled={working}
                                        onClick={() => void refetchBulletinSection(section)}
                                      >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                      </IconButton>
                                    ) : null}
                                    <IconButton label="Edit section" onClick={() => openEditSectionModal(section)}>
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </IconButton>
                                    <IconButton
                                      label="Delete section"
                                      destructive
                                      onClick={() => void deleteSection(section.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </IconButton>
                                  </div>
                                ) : null}
                              </div>

                              {isReformatting ? (
                                <div className="px-4 pb-3 pl-11">
                                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    <span>Reformatting</span>
                                    <span className="tabular-nums">{Math.round(reformatState.progress)}%</span>
                                  </div>
                                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                    <div
                                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                                      style={{ width: `${reformatState.progress}%` }}
                                    />
                                  </div>
                                </div>
                              ) : null}

                              {!collapsed ? (
                                <p className="whitespace-pre-wrap px-4 pb-4 pl-11 text-[15px] leading-6 text-pretty text-foreground">
                                  {display.content || "Empty section."}
                                </p>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={docModalOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && working) return;
          setDocModalOpen(isOpen);
          if (!isOpen) {
            setEditingDocId(null);
            setDocTitleDraft("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDocId ? "Rename script" : "New script"}</DialogTitle>
            <DialogDescription>Name this show script.</DialogDescription>
          </DialogHeader>
          <Input
            value={docTitleDraft}
            onChange={(event) => setDocTitleDraft(event.target.value)}
            placeholder="Friday show"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDocModalOpen(false);
                setEditingDocId(null);
                setDocTitleDraft("");
              }}
              disabled={working}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveDoc()} disabled={working || !docTitleDraft.trim()}>
              {working ? "Saving..." : editingDocId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sectionModalOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && working) return;
          setSectionModalOpen(isOpen);
          if (!isOpen) {
            setSectionDraft({ id: null, label: "", content: "" });
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{sectionDraft.id ? "Edit section" : "Add section"}</DialogTitle>
            <DialogDescription>Labels like A1, A2, B1. Write the spoken copy below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Label
              </label>
              <Input
                value={sectionDraft.label}
                onChange={(event) =>
                  setSectionDraft((current) => ({
                    ...current,
                    label: event.target.value
                  }))
                }
                placeholder="A1"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Script
              </label>
              <textarea
                value={sectionDraft.content}
                onChange={(event) =>
                  setSectionDraft((current) => ({
                    ...current,
                    content: event.target.value
                  }))
                }
                rows={14}
                placeholder="ANCHOR: Good morning everyone..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="mt-2 text-xs text-muted-foreground">Optional run-mode color: [RED]text[/RED] and [YELLOW]text[/YELLOW].</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSectionModalOpen(false);
                setSectionDraft({ id: null, label: "", content: "" });
              }}
              disabled={working}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveSection()} disabled={working || !sectionDraft.label.trim()}>
              {working ? "Saving..." : sectionDraft.id ? "Save" : "Add section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {runModeOpen && activeDoc ? (
        <FullscreenRunMode
          doc={activeDoc}
          docs={orderedDocs}
          onSelectDoc={setSelectedDocId}
          onClose={() => setRunModeOpen(false)}
        />
      ) : null}
    </>
  );
}
