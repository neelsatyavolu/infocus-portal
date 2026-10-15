import { scorePassword } from "@/src/lib/password-strength";
import { cn } from "@/src/lib/utils";

const SEGMENTS = 4;
/** Very weak, Weak, Fair, Good, Strong. Brand tokens only. */
const SCORE_BARS = ["bg-danger-fill", "bg-danger-fill", "bg-brand-amber", "bg-[var(--brand-green)]/60", "bg-[var(--brand-green)]"];
const SCORE_TEXT = ["text-danger", "text-danger", "text-brand-amber", "text-[var(--brand-green)]", "text-[var(--brand-green)]"];

/**
 * Four-segment strength bar and its label. Any non-empty password lights at least one segment;
 * the label (not the bar) is what screen readers hear.
 */
export function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  const strength = scorePassword(password);
  const filled = strength ? Math.max(1, strength.score) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              strength && index < filled ? SCORE_BARS[strength.score] : "bg-foreground/10"
            )}
          />
        ))}
      </div>
      <p id={id} className={cn("text-xs", strength ? SCORE_TEXT[strength.score] : "text-muted-foreground")} aria-live="polite">
        {strength ? `Strength: ${strength.label}` : "Use 16+ characters, or let Portal make one."}
      </p>
    </div>
  );
}
