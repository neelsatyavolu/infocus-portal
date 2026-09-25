import { Sparkles } from "lucide-react";
import { scorePassword } from "@/src/lib/password-strength";
import { cn } from "@/src/lib/utils";

const SEGMENTS = 4;
const SCORE_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-400", "bg-yellow-300", "bg-[var(--brand-green)]"];
const LABEL_COLORS = ["text-red-400", "text-red-400", "text-amber-300", "text-yellow-200", "text-[var(--brand-green)]"];

/** Four-segment strength bar with a button that fills in a generated password. */
export function PasswordStrengthMeter({ password, onSuggest }: { password: string; onSuggest: () => void }) {
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
              strength && index < filled ? SCORE_COLORS[strength.score] : "bg-foreground/10"
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={cn(strength ? LABEL_COLORS[strength.score] : "text-muted-foreground")} aria-live="polite">
          {strength ? `Strength: ${strength.label}` : "Use 16+ characters, or let Portal make one."}
        </span>
        <button
          type="button"
          onClick={onSuggest}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-foreground hover:text-[var(--brand-green)]"
        >
          <Sparkles className="h-3 w-3" />
          Suggest strong password
        </button>
      </div>
    </div>
  );
}
