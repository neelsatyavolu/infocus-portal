import { KeyValueList } from "@/components/kit/key-value";
import { EntryPanel } from "@/components/public-entry/entry-panel";

/**
 * What the old intro box said that the form doesn't. The show-day limit is in the End date hint
 * (with the computed last day) and the policy; review is in the page header and the policy.
 */
const RULES = [
  { label: "Runs on", value: "InFocus (Wednesday and Friday broadcasts) and the Friday Schoology update" },
  { label: "Schoology deadline", value: "4 p.m. Thursday" }
];

/**
 * "How it works": two short rows read before the form on phones (one line from sm), and a single
 * column in the desktop rail beside the form.
 */
export function AnnouncementRulesPanel() {
  return (
    <EntryPanel id="announcement-rules" title="How it works">
      <KeyValueList
        layout="stacked"
        columns={2}
        className="lg:grid-cols-1 lg:[&>*:nth-child(2)]:border-t"
        items={RULES}
      />
    </EntryPanel>
  );
}
