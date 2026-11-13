"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, FormSection } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CUSTOM_SKILL_MAX, MAX_CUSTOM_SKILLS, type ApplicationAnswers } from "@/src/lib/applications/answers";
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

function Choice({ id, value, options, onChange }: { id: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <NativeSelect id={id} value={value} placeholderOption="Choose…" onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Checkbox lists: 3 across on wide screens, 32px rows from sm (phones keep the 40px tap target). */
const CHECK_GRID = "grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3";
const CHECK_ROW = "sm:min-h-8";

/** Section 1: Quick Facts. */
export function FactsStep({ answers, config, applicantName, onChange }: Props) {
  return (
    <div className="space-y-5">
      <FormSection title="About you" cols={2}>
        <Field label="Full name" htmlFor="app-name">
          <Input id="app-name" value={applicantName} readOnly disabled title="From your Portal account" />
        </Field>
        <Field label="Grade next year" htmlFor="app-grade" required>
          <Choice id="app-grade" value={answers.grade} options={config.gradeOptions} onChange={(grade) => onChange({ grade })} />
        </Field>
        <Field label="Years in InFocus (full years)" htmlFor="app-years" required>
          <Choice id="app-years" value={answers.years} options={config.yearsOptions} onChange={(years) => onChange({ years })} />
        </Field>
        <Field label="Current role in InFocus" htmlFor="app-current-role" required>
          <Choice id="app-current-role" value={answers.currentRole} options={config.roles} onChange={(currentRole) => onChange({ currentRole })} />
        </Field>
      </FormSection>

      <FormSection title="Previous roles in InFocus" aside="Optional">
        <div className={CHECK_GRID}>
          {config.roles.map((role) => (
            <Checkbox key={role} labelClassName={CHECK_ROW} checked={answers.pastRoles.includes(role)} onCheckedChange={(on) => onChange({ pastRoles: toggle(answers.pastRoles, role, on) })}>
              {role}
            </Checkbox>
          ))}
        </div>
      </FormSection>

      <FormSection title="Leadership experience outside InFocus" aside="Optional, up to 5">
        <LeadershipRows answers={answers} onChange={onChange} />
      </FormSection>

      <FormSection title="Time and commitments" cols={2}>
        <Field label="Weekly hours on other commitments (approx.)" htmlFor="app-hours" required>
          <Choice id="app-hours" value={answers.hours} options={config.hoursOptions} onChange={(hours) => onChange({ hours })} />
        </Field>
        <Field label="Other commitments" htmlFor="app-commitments" required>
          <Input id="app-commitments" value={answers.commitments} maxLength={200} placeholder="Sports, jobs, other clubs" onChange={(e) => onChange({ commitments: e.target.value })} />
        </Field>
      </FormSection>

      <FormSection title="Skills" aside="Check at least one">
        <div className={CHECK_GRID}>
          {config.skills.map((skill) => (
            <Checkbox key={skill} labelClassName={CHECK_ROW} checked={answers.skills.includes(skill)} onCheckedChange={(on) => onChange({ skills: toggle(answers.skills, skill, on) })}>
              {skill}
            </Checkbox>
          ))}
        </div>
        <CustomSkills answers={answers} onChange={onChange} />
      </FormSection>

      <FormSection title="Next year">
        <Field label="Are you enrolling in InFocus next year?" required hint="Answer Yes only if you know for sure (100%).">
          <SegmentedControl
            ariaLabel="Enrolling in InFocus next year"
            value={answers.enrollingNextYear}
            onChange={(enrollingNextYear) => onChange({ enrollingNextYear })}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
            className="w-fit"
          />
        </Field>
      </FormSection>
    </div>
  );
}

/** Up to MAX_CUSTOM_SKILLS skills of their own, CUSTOM_SKILL_MAX characters each. */
function CustomSkills({ answers, onChange }: Pick<Props, "answers" | "onChange">) {
  const [draft, setDraft] = useState("");
  const list = answers.customSkills;
  const value = draft.trim();
  const duplicate = list.some((skill) => skill.toLowerCase() === value.toLowerCase());
  const canAdd = value.length > 0 && !duplicate && list.length < MAX_CUSTOM_SKILLS;

  function add() {
    if (!canAdd) return;
    onChange({ customSkills: [...list, value] });
    setDraft("");
  }

  return (
    <div className="space-y-2">
      {list.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Your other skills">
          {list.map((skill) => (
            <li key={skill} className="inline-flex h-8 items-center gap-1 rounded-md border border-border pl-3 pr-1 text-sm">
              {skill}
              <IconButton label={`Remove ${skill}`} icon={X} size="sm" variant="ghost" className="h-6 w-6" onClick={() => onChange({ customSkills: list.filter((item) => item !== skill) })} />
            </li>
          ))}
        </ul>
      ) : null}
      {list.length < MAX_CUSTOM_SKILLS ? (
        <div className="flex max-w-md gap-2">
          <Input
            aria-label="Add another skill"
            placeholder={`Other skill (${MAX_CUSTOM_SKILLS - list.length} left)`}
            value={draft}
            maxLength={CUSTOM_SKILL_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!canAdd}>
            <Plus aria-hidden />
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LeadershipRows({ answers, onChange }: Pick<Props, "answers" | "onChange">) {
  const rows = answers.leadership;
  const update = (index: number, patch: Partial<(typeof rows)[number]>) =>
    onChange({ leadership: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  return (
    <div className="space-y-2">
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
