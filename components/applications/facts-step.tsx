"use client";

import { Plus, X } from "lucide-react";
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

/** Section 1: Quick Facts. */
export function FactsStep({ answers, config, applicantName, onChange }: Props) {
  return (
    <div className="space-y-6">
      <FormSection cols={2}>
        <Field label="Full name" htmlFor="app-name" hint="From your Portal account.">
          <Input id="app-name" value={applicantName} readOnly disabled />
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

      <FormSection title="Previous roles in InFocus" description="Check any you've held before. Leave it empty if this is your first role.">
        <div className="grid gap-2 sm:grid-cols-2">
          {config.roles.map((role) => (
            <Checkbox key={role} checked={answers.pastRoles.includes(role)} onCheckedChange={(on) => onChange({ pastRoles: toggle(answers.pastRoles, role, on) })}>
              {role}
            </Checkbox>
          ))}
        </div>
      </FormSection>

      <FormSection title="Leadership experience" description="Outside InFocus. Optional, up to 5.">
        <LeadershipRows answers={answers} onChange={onChange} />
      </FormSection>

      <FormSection cols={2}>
        <Field label="Weekly hours spent on other commitments (approx.)" htmlFor="app-hours" required>
          <Choice id="app-hours" value={answers.hours} options={config.hoursOptions} onChange={(hours) => onChange({ hours })} />
        </Field>
        <Field label="Other commitments" htmlFor="app-commitments" required hint={`Sports, jobs, other clubs. ${answers.commitments.length}/200 characters.`}>
          <Input id="app-commitments" value={answers.commitments} maxLength={200} onChange={(e) => onChange({ commitments: e.target.value })} />
        </Field>
      </FormSection>

      <FormSection title="Skills">
        <div className="grid gap-2 sm:grid-cols-2">
          {config.skills.map((skill) => (
            <Checkbox key={skill} checked={answers.skills.includes(skill)} onCheckedChange={(on) => onChange({ skills: toggle(answers.skills, skill, on) })}>
              {skill}
            </Checkbox>
          ))}
        </div>
      </FormSection>

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
