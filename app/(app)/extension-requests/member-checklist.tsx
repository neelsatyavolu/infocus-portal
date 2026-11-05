"use client";

import { fieldLabelClass } from "@/components/kit/field";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/src/lib/utils";

type Member = { userId: string; label: string };

/**
 * Who an extension covers: a bordered list of 40px checkbox rows under a caps legend with a
 * "2 of 3" count. Used by the Approve/Grant dialogs.
 */
export function MemberChecklist({
  members,
  selected,
  onChange
}: {
  members: Member[];
  selected: string[];
  onChange: (userIds: string[]) => void;
}) {
  function toggle(userId: string, checked: boolean) {
    const rest = selected.filter((id) => id !== userId);
    onChange(checked ? [...rest, userId] : rest);
  }

  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className={cn(fieldLabelClass, "flex w-full items-center gap-2")}>
        <span>Students</span>
        <span className="font-mono-broadcast tabular-nums tracking-normal">
          {selected.length} of {members.length}
        </span>
      </legend>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {members.map((member) => (
          <li key={member.userId}>
            <Checkbox
              checked={selected.includes(member.userId)}
              onCheckedChange={(checked) => toggle(member.userId, checked)}
              labelClassName="flex w-full px-3"
            >
              {member.label}
            </Checkbox>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
