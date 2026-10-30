"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  SaveStatus,
  SettingsCell,
  SettingsGrid,
  SettingsNotice,
  SettingsPanel,
  SettingsSection
} from "@/components/settings-layout";
import { daysInBirthdayMonth } from "@/src/lib/birthdays";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { useSavedFlash } from "./use-saved-flash";

type Profile = {
  email: string | null;
  name: string | null;
  nickname: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
};

/** The form's own copy of what's saved: strings, "" for unset. */
type Fields = { nickname: string; month: string; day: string };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function fieldsOf(data: Profile | undefined | null): Fields {
  return {
    nickname: data?.nickname ?? "",
    month: data?.birthdayMonth ? String(data.birthdayMonth) : "",
    day: data?.birthdayDay ? String(data.birthdayDay) : ""
  };
}

/** Last-seen profile (src/lib/client-cache.ts), so returning to Settings shows it at once. */
const CACHE_KEY = "settings:profile";

/** Loads GET /api/profile and saves the nickname and birthday with PATCH /api/profile. */
export function useProfile() {
  const router = useRouter();
  const [cached] = useState(() => (typeof window === "undefined" ? undefined : cachedValue<Profile>(CACHE_KEY)));
  const [profile, setProfile] = useState<Profile | null>(cached ?? null);
  const [inputs, setInputs] = useState<Fields>(() => fieldsOf(cached));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedLabel, flashSaved] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);
  /** What the server has; a quiet refresh only replaces an input while it still matches. */
  const savedFieldsRef = useRef<Fields>(fieldsOf(cached));
  /** Set once a save starts, so an older refresh can't overwrite what was just saved. */
  const savedSinceLoadRef = useRef(false);

  /** `replace`: the inputs a save just wrote, so they take the server's value even if edited. */
  const apply = useCallback((data: Profile, replace: Array<keyof Fields>) => {
    const previous = savedFieldsRef.current;
    const next = fieldsOf(data);
    savedFieldsRef.current = next;
    rememberValue(CACHE_KEY, data);
    setProfile(data);
    setInputs((current) => {
      const keep = (key: keyof Fields) => !replace.includes(key) && current[key] !== previous[key];
      return {
        nickname: keep("nickname") ? current.nickname : next.nickname,
        month: keep("month") ? current.month : next.month,
        day: keep("day") ? current.day : next.day
      };
    });
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

        if (!savedSinceLoadRef.current) apply(payload.data as Profile, []);
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

  const saved = fieldsOf(profile);
  const unchanged = inputs.nickname.trim() === saved.nickname;
  const birthdayUnchanged = inputs.month === saved.month && inputs.day === saved.day;
  /** Nothing to show yet: the first GET is still running. */
  const firstLoad = loading && !profile;

  async function patchProfile(body: Record<string, unknown>, replace: Array<keyof Fields>, failure: string) {
    savedSinceLoadRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? failure);
      }

      apply(payload.data as Profile, replace);
      flashSaved("Saved");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : failure);
    } finally {
      setSaving(false);
    }
  }

  async function saveNickname(event: FormEvent) {
    event.preventDefault();
    if (unchanged) return;
    await patchProfile({ nickname: inputs.nickname.trim() || null }, ["nickname"], "Failed to save nickname.");
  }

  async function saveBirthday(event: FormEvent) {
    event.preventDefault();
    if (birthdayUnchanged) return;
    if (Boolean(inputs.month) !== Boolean(inputs.day)) {
      setError("Pick both a month and a day, or neither.");
      return;
    }
    const birthday = inputs.month ? { month: Number(inputs.month), day: Number(inputs.day) } : null;
    await patchProfile({ birthday }, ["month", "day"], "Failed to save birthday.");
  }

  async function removeBirthday() {
    await patchProfile({ birthday: null }, ["month", "day"], "Failed to remove birthday.");
  }

  /** Picking a month keeps the day only if that month has it (no February 30). */
  function setBirthdayMonth(month: string) {
    setInputs((current) => ({
      ...current,
      month,
      day: current.day && Number(current.day) > daysInBirthdayMonth(Number(month) || null) ? "" : current.day
    }));
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
    nicknameInput: inputs.nickname,
    setNicknameInput: (nickname: string) => setInputs((current) => ({ ...current, nickname })),
    unchanged,
    saveNickname,
    birthdayMonthInput: inputs.month,
    birthdayDayInput: inputs.day,
    setBirthdayMonth,
    setBirthdayDay: (day: string) => setInputs((current) => ({ ...current, day })),
    hasBirthday: Boolean(saved.month && saved.day),
    birthdayUnchanged,
    saveBirthday,
    removeBirthday
  };
}

type ProfileState = ReturnType<typeof useProfile>;

/** Settings → Profile: the nickname Portal shows, beside the Google account it can't overwrite, and the birthday. */
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
          <BirthdayCell state={state} fullWidth={showAccount} />
        </SettingsGrid>
      </SettingsPanel>
    </SettingsSection>
  );
}

/** Month and day only. It goes on the Master Calendar (src/lib/birthdays.ts). */
function BirthdayCell({ state, fullWidth }: { state: ProfileState; fullWidth: boolean }) {
  const busy = state.loading || state.saving;
  const dayCount = daysInBirthdayMonth(Number(state.birthdayMonthInput) || null);

  return (
    <SettingsCell
      title="Birthday"
      description="Month and day only. It goes on the Master Calendar so nobody's birthday gets missed. On a weekend or a day off, it shows on the class day before."
      htmlFor="birthday-month"
      className={fullWidth ? "@2xl:col-span-2" : undefined}
    >
      <form onSubmit={(event) => void state.saveBirthday(event)} className="flex w-full flex-wrap gap-2">
        <NativeSelect
          id="birthday-month"
          aria-label="Birthday month"
          placeholderOption="Month"
          value={state.birthdayMonthInput}
          onChange={(event) => state.setBirthdayMonth(event.target.value)}
          disabled={busy}
          wrapperClassName="w-40"
        >
          {MONTHS.map((month, index) => (
            <option key={month} value={String(index + 1)}>
              {month}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Birthday day"
          placeholderOption="Day"
          value={state.birthdayDayInput}
          onChange={(event) => state.setBirthdayDay(event.target.value)}
          disabled={busy}
          wrapperClassName="w-24"
        >
          {Array.from({ length: dayCount }, (_, index) => (
            <option key={index + 1} value={String(index + 1)}>
              {index + 1}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={busy || state.birthdayUnchanged}>
          {state.saving ? "Saving…" : "Save"}
        </Button>
        {state.hasBirthday ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void state.removeBirthday()}>
            Remove
          </Button>
        ) : null}
      </form>
    </SettingsCell>
  );
}
