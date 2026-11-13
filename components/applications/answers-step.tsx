"use client";

import { Field } from "@/components/kit/field";
import { Textarea } from "@/components/ui/textarea";
import { WordCount } from "@/components/applications/word-count";
import type { ApplicationAnswers } from "@/src/lib/applications/answers";
import type { ApplicantConfig } from "@/src/lib/applications/config";

/** Section 2: two short answers with live word counts (the server counts too). */
export function AnswersStep({
  answers,
  config,
  onChange
}: {
  answers: ApplicationAnswers;
  config: ApplicantConfig;
  onChange: (patch: Partial<ApplicationAnswers>) => void;
}) {
  return (
    <div className="space-y-6">
      {config.questions.map((question, index) => {
        const field = index === 0 ? "answer1" : "answer2";
        const id = `app-${field}`;
        return (
          <Field key={field} label={`Question ${index + 1}`} htmlFor={id} required>
            <p className="max-w-[70ch] text-[15px] font-medium leading-snug text-foreground">{question.prompt}</p>
            <Textarea
              id={id}
              rows={8}
              value={answers[field]}
              aria-describedby={`${id}-count`}
              onChange={(event) => onChange({ [field]: event.target.value })}
              className="min-h-44"
            />
            <WordCount id={`${id}-count`} value={answers[field]} max={question.maxWords} softMin={question.softMinWords} />
          </Field>
        );
      })}
    </div>
  );
}
