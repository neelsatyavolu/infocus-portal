import { z } from "zod";
import { AGENDA_TEXT_MAX, cleanAgendaText } from "./agenda";

/** Agenda text at the API boundary: whitespace collapsed and trimmed, 1–300 characters. */
export const agendaTextSchema = z
  .string()
  .max(AGENDA_TEXT_MAX * 2)
  .transform((raw, ctx) => {
    const text = cleanAgendaText(raw);
    if (!text) {
      ctx.addIssue({ code: "custom", message: `Agenda items need 1–${AGENDA_TEXT_MAX} characters.` });
      return z.NEVER;
    }
    return text;
  });
