"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, MessageCircleReply, Upload, Video } from "lucide-react";

type ActivityEvent = {
  id: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown> | null;
};

type NotificationSettingKey = "newVideoUpload" | "newVersionUpload" | "newComment" | "newReply";
type NotificationSettings = Record<NotificationSettingKey, boolean>;

const STORAGE_KEY = "infocus-notification-settings";

const defaults: NotificationSettings = {
  newVideoUpload: true,
  newVersionUpload: true,
  newComment: true,
  newReply: true
};

function parseSettings() {
  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      newVideoUpload: parsed.newVideoUpload ?? true,
      newVersionUpload: parsed.newVersionUpload ?? true,
      newComment: parsed.newComment ?? true,
      newReply: parsed.newReply ?? true
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function classifyEvent(type: string): NotificationSettingKey | null {
  if (type === "media.upload.initialized") return "newVideoUpload";
  if (type === "media.version.upload.initialized") return "newVersionUpload";
  if (type === "comment.created" || type === "comment.created.guest") return "newComment";
  if (type === "comment.reply" || type === "comment.reply.guest") return "newReply";
  return null;
}

function renderEvent(type: string) {
  if (type === "media.upload.initialized") {
    return {
      title: "New video uploaded",
      description: "A new video asset was added to a project.",
      icon: Video
    };
  }

  if (type === "media.version.upload.initialized") {
    return {
      title: "New version uploaded",
      description: "A new version was uploaded to an existing asset.",
      icon: Upload
    };
  }

  if (type === "comment.created" || type === "comment.created.guest") {
    return {
      title: "New comment",
      description: "A reviewer added a new timeline comment.",
      icon: MessageCircle
    };
  }

  return {
    title: "New reply",
    description: "A reply was added to an existing comment thread.",
    icon: MessageCircleReply
  };
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<NotificationSettings>(defaults);

  useEffect(() => {
    setSettings(parseSettings());
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchEvents() {
      setLoading(true);
      const response = await fetch("/api/activity", { cache: "no-store" });
      const payload = await response.json();

      if (!active) return;

      if (response.ok) {
        setEvents((payload.data as ActivityEvent[]) ?? []);
      } else {
        setEvents([]);
      }

      setLoading(false);
    }

    void fetchEvents();

    return () => {
      active = false;
    };
  }, []);

  function updateSetting(key: NotificationSettingKey, value: boolean) {
    const next = {
      ...settings,
      [key]: value
    };
    setSettings(next);
    saveSettings(next);
  }

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      const category = classifyEvent(event.type);
      if (!category) return false;
      return settings[category];
    });
  }, [events, settings]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-3xl font-semibold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">Only user-friendly activity updates are shown here.</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Notification settings</p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
            <span>New video uploads</span>
            <input
              type="checkbox"
              checked={settings.newVideoUpload}
              onChange={(event) => updateSetting("newVideoUpload", event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
            <span>New version uploads</span>
            <input
              type="checkbox"
              checked={settings.newVersionUpload}
              onChange={(event) => updateSetting("newVersionUpload", event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
            <span>New comments</span>
            <input
              type="checkbox"
              checked={settings.newComment}
              onChange={(event) => updateSetting("newComment", event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
            <span>New replies</span>
            <input
              type="checkbox"
              checked={settings.newReply}
              onChange={(event) => updateSetting("newReply", event.target.checked)}
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        {loading ? (
          <article className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading notifications...</article>
        ) : visibleEvents.length === 0 ? (
          <article className="rounded-xl border border-dashed border-border bg-muted/50 p-6 text-sm text-muted-foreground">
            No notifications match your current preferences.
          </article>
        ) : (
          visibleEvents.map((event) => {
            const rendered = renderEvent(event.type);
            const Icon = rendered.icon;

            return (
              <article key={event.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 rounded-md border border-border bg-accent p-1 text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{rendered.title}</p>
                    <p className="text-xs text-muted-foreground">{rendered.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
