"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Field, FormSection } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ApplicationAnswers } from "@/src/lib/applications/answers";
import type { ApplicantConfig } from "@/src/lib/applications/config";

type Props = {
  answers: ApplicationAnswers;
  config: ApplicantConfig;
  applicantName: string;
  onChange: (patch: Partial<ApplicationAnswers>) => void;
};

function toggle(list: string[], value: string, on: boolean) {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((item) => item !== value);
}

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Section 1: Quick Facts. */
export function FactsStep({ answers, config, applicantName, onChange }: Props) {
  const ranked = answers.rolePrefs.filter((role) => config.roles.includes(role));
  const unranked = config.roles.filter((role) => !ranked.includes(role));

  return (
    <div className="space-y-6">
      <FormSection title="About you" cols={2}>
        <Field label="Full name" htmlFor="app-name" hint="From your Portal account.">
          <Input id="app-name" value={applicantName} readOnly disabled />
        </Field>
        <Field label="Grade next year" htmlFor="app-grade" required>
          <NativeSelect id="app-grade" value={answers.grade} placeholderOption="Choose…" onChange={(e) => onChange({ grade: e.target.value })}>
            {config.gradeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Years in InFocus" htmlFor="app-years" required>
          <NativeSelect id="app-years" value={answers.years} placeholderOption="Choose…" onChange={(e) => onChange({ years: e.target.value })}>
            {config.yearsOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Weekly hours for InFocus outside class" htmlFor="app-hours" required>
          <NativeSelect id="app-hours" value={answers.hours} placeholderOption="Choose…" onChange={(e) => onChange({ hours: e.target.value })}>
            {config.hoursOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormSection>

      <FormSection title="Role preferences" description="Rank every role you'd accept, best first. Roles you leave out count as not interested.">
        <div className="space-y-2">
          {ranked.length ? (
            <ol className="divide-y divide-border rounded-md border border-border">
              {ranked.map((role, index) => (
                <li key={role} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                  <span className="w-6 font-mono text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{role}</span>
                  <IconButton label={`Move ${role} up`} icon={ArrowUp} size="sm" variant="ghost" disabled={index === 0} onClick={() => onChange({ rolePrefs: move(ranked, index, index - 1) })} />
                  <IconButton
                    label={`Move ${role} down`}
                    icon={ArrowDown}
                    size="sm"
                    variant="ghost"
                    disabled={index === ranked.length - 1}
                    onClick={() => onChange({ rolePrefs: move(ranked, index, index + 1) })}
                  />
                  <IconButton label={`Not interested in ${role}`} icon={X} size="sm" variant="ghost" onClick={() => onChange({ rolePrefs: ranked.filter((item) => item !== role) })} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Add the roles you’d accept below.</p>
          )}
          {unranked.length ? (
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-[13px] text-muted-foreground">Not interested:</span>
              {unranked.map((role) => (
                <Button key={role} type="button" size="sm" variant="outline" onClick={() => onChange({ rolePrefs: [...ranked, role] })}>
                  <Plus aria-hidden />
                  {role}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <Field label="Would you accept a role other than your top choice?" required>
          <SegmentedControl
            ariaLabel="Accept another role"
            value={answers.acceptOther || ("" as "" | "yes" | "no")}
            onChange={(value) => onChange({ acceptOther: value })}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
            className="w-fit"
          />
        </Field>
      </FormSection>

      <FormSection title="Experience" description="Current or past InFocus roles. Check all that apply.">
        <div className="grid gap-2 sm:grid-cols-2">
          {[...config.roles, "Reporter"].map((role) => (
            <Checkbox key={role} checked={answers.pastRoles.includes(role)} onCheckedChange={(on) => onChange({ pastRoles: toggle(answers.pastRoles, role, on) })}>
              {role}
            </Checkbox>
          ))}
        </div>
        <Field label="Other roles" htmlFor="app-roles-other" hint="Optional.">
          <Input id="app-roles-other" value={answers.pastRolesOther} maxLength={200} onChange={(e) => onChange({ pastRolesOther: e.target.value })} />
        </Field>
        <LeadershipRows answers={answers} onChange={onChange} />
      </FormSection>

      <FormSection title="Next year" cols={1}>
        <Field label="Other major commitments next year" htmlFor="app-commitments" required hint={`Sports, jobs, other clubs. ${answers.commitments.length}/200 characters.`}>
          <Input id="app-commitments" value={answers.commitments} maxLength={200} onChange={(e) => onChange({ commitments: e.target.value })} />
        </Field>
        <Field label="Skills" required>
          <div className="grid gap-2 sm:grid-cols-2">
            {config.skills.map((skill) => (
              <Checkbox key={skill} checked={answers.skills.includes(skill)} onCheckedChange={(on) => onChange({ skills: toggle(answers.skills, skill, on) })}>
                {skill}
              </Checkbox>
            ))}
          </div>
        </Field>
      </FormSection>
    </div>
  );
}

function LeadershipRows({ answers, onChange }: Pick<Props, "answers" | "onChange">) {
  const rows = answers.leadership;
  const update = (index: number, patch: Partial<(typeof rows)[number]>) =>
    onChange({ leadership: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">Leadership outside InFocus (optional, up to 5)</p>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
          <Input aria-label={`Organization ${index + 1}`} placeholder="Organization" value={row.org} maxLength={120} onChange={(e) => update(index, { org: e.target.value })} className="max-sm:col-span-2" />
          <Input aria-label={`Role ${index + 1}`} placeholder="Role" value={row.role} maxLength={120} onChange={(e) => update(index, { role: e.target.value })} />
          <Input aria-label={`Years ${index + 1}`} placeholder="Years" value={row.years} maxLength={20} onChange={(e) => update(index, { years: e.target.value })} className="max-sm:hidden" />
          <IconButton label={`Remove row ${index + 1}`} icon={X} variant="ghost" onClick={() => onChange({ leadership: rows.filter((_, i) => i !== index) })} />
        </div>
      ))}
      {rows.length < 5 ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange({ leadership: [...rows, { org: "", role: "", years: "" }] })}>
          <Plus aria-hidden />
          Add leadership
        </Button>
      ) : null}
    </div>
  );
}
