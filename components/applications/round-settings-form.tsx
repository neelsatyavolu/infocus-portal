"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { Field, FormSection } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { Panel } from "@/components/kit/panel";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationConfig } from "@/src/lib/applications/config";
import { pacificInputToIso, toPacificInput } from "@/src/lib/applications/format";

export type RoundSettingsValue = {
  id: string;
  title: string;
  positionLabel: string;
  intro: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  opensAt: string | null;
  dueAt: string;
  allowUnsubmit: boolean;
  roughCutSource: string;
  config: ApplicationConfig;
};

const lines = (value: string[]) => value.join("\n");
const fromLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || `option_${Date.now().toString(36)}`;

/** Everything editable about a round: window, wording, limits, rough cut, rubric and decision labels. */
export function RoundSettingsForm({ initial, readOnly }: { initial: RoundSettingsValue; readOnly: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [opensAt, setOpensAt] = useState(toPacificInput(initial.opensAt));
  const [dueAt, setDueAt] = useState(toPacificInput(initial.dueAt));
  const [saving, setSaving] = useState(false);
  const config = value.config;
  const set = (patch: Partial<RoundSettingsValue>) => setValue((current) => ({ ...current, ...patch }));
  const setConfig = (patch: Partial<ApplicationConfig>) => set({ config: { ...config, ...patch } });
  const setCut = (patch: Partial<ApplicationConfig["roughCut"]>) => setConfig({ roughCut: { ...config.roughCut, ...patch } });

  async function save() {
    setSaving(true);
    try {
      await send(`/api/applications/rounds/${value.id}`, "PATCH", {
        title: value.title,
        positionLabel: value.positionLabel,
        intro: value.intro,
        status: value.status,
        allowUnsubmit: value.allowUnsubmit,
        roughCutSource: value.roughCutSource,
        config: value.config,
        opensAt: opensAt ? pacificInputToIso(opensAt) : null,
        dueAt: pacificInputToIso(dueAt)
      });
      toast.success("Settings saved.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save. Check every field is filled in."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-5">
      <Panel title="Window" description="Students only see a round once it's published and its open time has passed. Times are Pacific.">
        <div className="space-y-5">
          <Field label="Visibility">
            <SegmentedControl
              ariaLabel="Visibility"
              value={value.status}
              onChange={(status) => set({ status })}
              options={[
                { value: "DRAFT", label: "Hidden draft" },
                { value: "PUBLISHED", label: "Published" },
                { value: "CLOSED", label: "Closed" }
              ]}
              className="w-fit"
            />
          </Field>
          <FormSection cols={2}>
            <Field label="Title" htmlFor="round-title" required>
              <Input id="round-title" value={value.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Position" htmlFor="round-position" required hint="Shown above the title, e.g. Executive Producer.">
              <Input id="round-position" value={value.positionLabel} maxLength={120} onChange={(e) => set({ positionLabel: e.target.value })} />
            </Field>
            <Field label="Opens" htmlFor="round-opens" hint="Empty: as soon as it's published.">
              <Input id="round-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </Field>
            <Field label="Due" htmlFor="round-due" required hint="Enforced on the server. Extensions are per applicant.">
              <Input id="round-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
            <Field label="Intro" htmlFor="round-intro" span={2}>
              <Textarea id="round-intro" rows={3} value={value.intro} maxLength={4000} onChange={(e) => set({ intro: e.target.value })} />
            </Field>
          </FormSection>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={value.allowUnsubmit} onCheckedChange={(allowUnsubmit) => set({ allowUnsubmit })} />
            Applicants can unsubmit and edit before the deadline
          </label>
        </div>
      </Panel>

      <Panel title="Section 1: Quick facts" description="One option per line.">
        <FormSection cols={2}>
          <LinesField label="Roles" value={config.roles} onChange={(roles) => setConfig({ roles })} />
          <LinesField label="Skills" value={config.skills} onChange={(skills) => setConfig({ skills })} />
          <LinesField label="Grade options" value={config.gradeOptions} onChange={(gradeOptions) => setConfig({ gradeOptions })} rows={3} />
          <LinesField label="Years options" value={config.yearsOptions} onChange={(yearsOptions) => setConfig({ yearsOptions })} rows={3} />
          <LinesField label="Weekly hours options" value={config.hoursOptions} onChange={(hoursOptions) => setConfig({ hoursOptions })} rows={4} />
        </FormSection>
      </Panel>

      <Panel title="Section 2: Short answers">
        <div className="space-y-5">
          {config.questions.map((question, index) => (
            <FormSection key={index} title={`Question ${index + 1}`} cols={2}>
              <Field label="Prompt" htmlFor={`q${index}`} span={2} required>
                <Textarea
                  id={`q${index}`}
                  rows={2}
                  value={question.prompt}
                  onChange={(e) => setConfig({ questions: config.questions.map((q, i) => (i === index ? { ...q, prompt: e.target.value } : q)) })}
                />
              </Field>
              <NumberField label="Word limit" value={question.maxWords} onChange={(maxWords) => setConfig({ questions: config.questions.map((q, i) => (i === index ? { ...q, maxWords } : q)) })} />
              <NumberField label="Soft minimum (warning only)" value={question.softMinWords} onChange={(softMinWords) => setConfig({ questions: config.questions.map((q, i) => (i === index ? { ...q, softMinWords } : q)) })} />
            </FormSection>
          ))}
        </div>
      </Panel>

      <Panel title="Section 3: Rough cut" description="Applicants only ever see the video, instructions and context. The answer key is for reviewers and the AI read.">
        <FormSection cols={2}>
          <Field label="Rough cut video" htmlFor="cut-source" span={2} hint="Paste the Portal link to the uploaded video (or its id), or an https video URL. Only signed-in people can play it.">
            <Input id="cut-source" value={value.roughCutSource} maxLength={500} onChange={(e) => set({ roughCutSource: e.target.value })} placeholder="https://infocuspaly.com/projects/…" />
          </Field>
          <Field label="Instructions" htmlFor="cut-instructions" span={2}>
            <Textarea id="cut-instructions" rows={2} value={config.roughCut.instructions} onChange={(e) => setCut({ instructions: e.target.value })} />
          </Field>
          <Field label="Context" htmlFor="cut-context" span={2} hint='e.g. "Features package, 2:40, airs Friday. The reporter has one more day."'>
            <Textarea id="cut-context" rows={2} value={config.roughCut.context} onChange={(e) => setCut({ context: e.target.value })} />
          </Field>
          <Field label="Answer key (reviewers only)" htmlFor="cut-key" span={2} hint="The real problems in the cut, with timestamps. The AI read scores notes against this.">
            <Textarea id="cut-key" rows={5} value={config.roughCut.answerKey} onChange={(e) => setCut({ answerKey: e.target.value })} />
          </Field>
          <LinesField label="Note categories" value={config.roughCut.categories} onChange={(categories) => setCut({ categories })} />
          <LinesField label="Air decision options" value={config.roughCut.airOptions} onChange={(airOptions) => setCut({ airOptions })} rows={3} />
          <NumberField label="Minimum notes" value={config.roughCut.minNotes} onChange={(minNotes) => setCut({ minNotes })} />
          <NumberField label="Maximum notes" value={config.roughCut.maxNotes} onChange={(maxNotes) => setCut({ maxNotes })} />
          <NumberField label="Characters per note" value={config.roughCut.noteMaxChars} onChange={(noteMaxChars) => setCut({ noteMaxChars })} />
          <NumberField label="Air reasoning word limit" value={config.roughCut.airReasonMaxWords} onChange={(airReasonMaxWords) => setCut({ airReasonMaxWords })} />
          <Field label="Summary prompt" htmlFor="cut-summary" span={2}>
            <Input id="cut-summary" value={config.roughCut.summaryPrompt} onChange={(e) => setCut({ summaryPrompt: e.target.value })} />
          </Field>
          <NumberField label="Summary word limit" value={config.roughCut.summaryMaxWords} onChange={(summaryMaxWords) => setCut({ summaryMaxWords })} />
          <Field label="Attestation checkbox" htmlFor="attestation" span={2}>
            <Input id="attestation" value={config.attestation} maxLength={300} onChange={(e) => setConfig({ attestation: e.target.value })} />
          </Field>
        </FormSection>
      </Panel>

      <Panel title="AI read rubric" description="Each criterion is scored 1–5 for reference. Describe what a 5 looks like.">
        <div className="space-y-2">
          {config.rubric.map((criterion, index) => (
            <div key={criterion.key} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
              <Input aria-label="Criterion" value={criterion.label} maxLength={80} onChange={(e) => setConfig({ rubric: config.rubric.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)) })} />
              <Input aria-label="What a 5 looks like" value={criterion.description} maxLength={300} onChange={(e) => setConfig({ rubric: config.rubric.map((c, i) => (i === index ? { ...c, description: e.target.value } : c)) })} />
              <IconButton label={`Remove ${criterion.label}`} icon={X} variant="ghost" disabled={config.rubric.length <= 1} onClick={() => setConfig({ rubric: config.rubric.filter((_, i) => i !== index) })} />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" disabled={config.rubric.length >= 10} onClick={() => setConfig({ rubric: [...config.rubric, { key: slug(`criterion ${Date.now().toString(36)}`), label: "New criterion", description: "" }] })}>
            <Plus aria-hidden />
            Add criterion
          </Button>
        </div>
      </Panel>

      <Panel title="Decisions" description="The outcomes execs vote on and applicants see after release. Each applicant sees only their own label and message.">
        <div className="space-y-4">
          {config.decisions.map((decision, index) => {
            const update = (patch: Partial<typeof decision>) => setConfig({ decisions: config.decisions.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
            return (
              <div key={decision.key} className="space-y-2 rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                  <Input aria-label="Decision label" value={decision.label} maxLength={80} onChange={(e) => update({ label: e.target.value })} />
                  <NativeSelect aria-label="Color" value={decision.tone} onChange={(e) => update({ tone: e.target.value as typeof decision.tone })}>
                    <option value="success">Green</option>
                    <option value="info">Blue</option>
                    <option value="neutral">Gray</option>
                    <option value="danger">Red</option>
                  </NativeSelect>
                  <IconButton label={`Remove ${decision.label}`} icon={X} variant="ghost" disabled={config.decisions.length <= 1} onClick={() => setConfig({ decisions: config.decisions.filter((_, i) => i !== index) })} />
                </div>
                <Textarea aria-label="Message to the applicant" rows={2} value={decision.message} maxLength={2000} onChange={(e) => update({ message: e.target.value })} />
              </div>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={config.decisions.length >= 8}
            onClick={() => setConfig({ decisions: [...config.decisions, { key: slug(`decision ${Date.now().toString(36)}`), label: "New decision", message: "", tone: "neutral" }] })}
          >
            <Plus aria-hidden />
            Add decision
          </Button>
        </div>
      </Panel>

      {readOnly ? null : (
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-border bg-background/95 px-4 py-3 md:-mx-6 md:px-6">
          <Button onClick={() => void save()} disabled={saving || !dueAt}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function LinesField({ label, value, onChange, rows = 6 }: { label: string; value: string[]; onChange: (value: string[]) => void; rows?: number }) {
  const [text, setText] = useState(lines(value));
  return (
    <Field label={label}>
      <Textarea
        aria-label={label}
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(fromLines(e.target.value));
        }}
      />
    </Field>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <Input aria-label={label} type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-28 font-mono tabular-nums" />
    </Field>
  );
}
