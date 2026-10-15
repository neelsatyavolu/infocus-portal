"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SaveStatus,
  SettingsCell,
  SettingsGrid,
  SettingsNotice,
  SettingsPanel,
  SettingsSection
} from "@/components/settings-layout";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { useSavedFlash } from "./use-saved-flash";

type Profile = { email: string | null; name: string | null; nickname: string | null };

/** Last-seen profile (src/lib/client-cache.ts), so returning to Settings shows it at once. */
const CACHE_KEY = "settings:profile";

/** Loads GET /api/profile and saves the nickname with PATCH /api/profile. */
export function useProfile() {
  const router = useRouter();
  const [cached] = useState(() => (typeof window === "undefined" ? undefined : cachedValue<Profile>(CACHE_KEY)));
  const [profile, setProfile] = useState<Profile | null>(cached ?? null);
  const [nicknameInput, setNicknameInput] = useState(cached?.nickname ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedLabel, flashSaved] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);
  /** The nickname the server has; a quiet refresh only replaces the input while it matches. */
  const savedNicknameRef = useRef(cached?.nickname ?? "");
  /** Set once a save starts, so an older refresh can't overwrite what was just saved. */
  const savedSinceLoadRef = useRef(false);

  const apply = useCallback((data: Profile, replaceInput: boolean) => {
    const previous = savedNicknameRef.current;
    const next = data.nickname ?? "";
    savedNicknameRef.current = next;
    rememberValue(CACHE_KEY, data);
    setProfile(data);
    setNicknameInput((current) => (replaceInput || current === previous ? next : current));
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "Failed to load profile.");
        }

        if (!savedSinceLoadRef.current) apply(payload.data as Profile, false);
      } catch (caught) {
        if (!active) {
          return;
        }

        setError(caught instanceof Error ? caught.message : "Failed to load profile.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [apply]);

  const unchanged = nicknameInput.trim() === (profile?.nickname ?? "");
  /** Nothing to show yet: the first GET is still running. */
  const firstLoad = loading && !profile;

  async function saveNickname(event: FormEvent) {
    event.preventDefault();
    if (unchanged) return;
    savedSinceLoadRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nicknameInput.trim() || null })
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "Failed to save nickname.");
      }

      apply(payload.data as Profile, true);
      flashSaved("Saved");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save nickname.");
    } finally {
      setSaving(false);
    }
  }

  return {
    profile,
    /** Any GET is running (the first one, or a quiet refresh of a remembered copy). */
    loading,
    firstLoad,
    saving,
    savedLabel,
    error,
    clearError: () => setError(null),
    nicknameInput,
    setNicknameInput,
    unchanged,
    saveNickname
  };
}

type ProfileState = ReturnType<typeof useProfile>;

/** Settings → Profile: the nickname Portal shows, beside the Google account it can't overwrite. */
export function ProfileSection({ state }: { state: ProfileState }) {
  const { profile } = state;
  const showAccount = state.firstLoad || Boolean(profile?.name || profile?.email);

  return (
    <SettingsSection
      id="profile"
      title="Profile"
      description="How you appear to everyone in InFocus."
      actions={<SaveStatus text={state.firstLoad ? "Loading…" : state.savedLabel} pending={state.firstLoad} />}
    >
      {state.error ? (
        <SettingsNotice tone="error" onDismiss={state.clearError}>
          {state.error}
        </SettingsNotice>
      ) : null}
      <SettingsPanel>
        <SettingsGrid className={showAccount ? "@2xl:grid-cols-[3fr_2fr]" : "@2xl:grid-cols-1"}>
          <SettingsCell
            title="Nickname"
            description="Shown on rosters, calendars, and comments. Signing in with Google won't overwrite it."
            htmlFor="nickname"
          >
            {/* Locked while any GET runs (as before), so a refresh never lands on top of typing. */}
            <form onSubmit={(event) => void state.saveNickname(event)} className="flex w-full gap-2">
              <Input
                id="nickname"
                value={state.nicknameInput}
                onChange={(event) => state.setNicknameInput(event.target.value)}
                placeholder="What should we call you?"
                maxLength={60}
                disabled={state.loading || state.saving}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="outline" disabled={state.loading || state.saving || state.unchanged}>
                {state.saving ? "Saving…" : "Save"}
              </Button>
            </form>
          </SettingsCell>
          {showAccount ? (
            <SettingsCell
              title="Google account"
              description={
                state.firstLoad ? <Skeleton className="mt-1 h-3.5 w-32" /> : (profile?.name ?? undefined)
              }
            >
              <div className="flex h-9 min-w-0 items-center">
                {state.firstLoad ? (
                  <Skeleton className="h-3.5 w-48 max-w-full" />
                ) : profile?.email ? (
                  <span className="truncate text-sm text-muted-foreground" title={profile.email}>
                    {profile.email}
                  </span>
                ) : null}
              </div>
            </SettingsCell>
          ) : null}
        </SettingsGrid>
      </SettingsPanel>
    </SettingsSection>
  );
}
