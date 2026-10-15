"use client";

import { SegmentedControl } from "@/components/kit/segmented-control";
import type { ControlSize } from "@/components/kit/action-bar";

/**
 * The call's one-of-N choice (background, send/receive quality, the cut picker's filter): the
 * kit SegmentedControl at full width, 40px on phones and 36px from md so it matches the fields
 * beside it. Selected = InFocus Green fill; ←/→ move the choice.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "touch"
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  size?: ControlSize;
}) {
  return (
    <SegmentedControl<T>
      ariaLabel={label}
      value={value}
      onChange={onChange}
      options={options.map((option) => ({ value: option.value, label: option.label }))}
      size={size}
      fullWidth
    />
  );
}
