import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionBar, Toolbar } from "@/components/kit/action-bar";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { KeyValueList } from "@/components/kit/key-value";
import { Panel } from "@/components/kit/panel";
import { MetricStrip } from "@/components/kit/stat-tile";
import { CountBadge, DueTag, SaveState, StatusDot, StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { IconTile } from "@/components/kit/avatar";
import { ButtonGroup, PrevNextNav } from "@/components/kit/button-group";
import { DataTable } from "@/components/kit/data-table";
import { FilterChips } from "@/components/kit/filter-chips";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionLabel } from "@/components/kit/section";
import { SegmentNav } from "@/components/kit/segment-nav";
import { ViewTabs } from "@/components/kit/view-tabs";
import { SettingsHeader } from "@/components/settings-layout";
import { Checkbox } from "@/components/ui/checkbox";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("StatusTag", () => {
  it("is a fixed-height tag span with the tone class, never a button", () => {
    const markup = html(<StatusTag tone="approved">Approved</StatusTag>);
    expect(markup.startsWith("<span")).toBe(true);
    expect(markup).toContain("status-pill");
    expect(markup).toContain("status-approved");
    expect(markup).toContain("h-5");
    expect(markup).toContain('title="Approved"');
    expect(markup).not.toContain("<button");
  });

  it("has a small size and a wrap mode", () => {
    expect(html(<StatusTag size="sm">Locked</StatusTag>)).toContain("status-pill-sm");
    const wrapped = html(<StatusTag wrap>Initial Cut V4 Pending Review</StatusTag>);
    expect(wrapped).toContain("whitespace-normal");
    expect(wrapped).not.toContain(" h-5");
  });
});

describe("CountBadge and StatusDot", () => {
  it("renders nothing below 1 unless asked", () => {
    expect(html(<CountBadge count={0} />)).toBe("");
    expect(html(<CountBadge count={0} showZero />)).toContain(">0<");
  });

  it("caps at 99+ and keeps the meaning for screen readers", () => {
    const markup = html(<CountBadge count={140} srLabel="140 unread" />);
    expect(markup).toContain("99+");
    expect(markup).toContain("140 unread");
    expect(markup).toContain("tabular-nums");
  });

  it("is decorative without a label and an image with one", () => {
    expect(html(<StatusDot />)).toContain('aria-hidden="true"');
    expect(html(<StatusDot tone="live" label="Live now" />)).toContain('role="img"');
  });
});

describe("SaveState and DueTag", () => {
  it("shows the save states as tags", () => {
    expect(html(<SaveState state="idle" />)).not.toContain("status-pill");
    expect(html(<SaveState state="saved" />)).toContain("status-approved");
    expect(html(<SaveState state="dirty" count={3} />)).toContain("3 unsaved");
    expect(html(<SaveState state="error" />)).toContain("Couldn&#x27;t save");
  });

  it("words and tones due dates", () => {
    const overdue = html(<DueTag days={-2} />);
    expect(overdue).toContain("2d ago");
    expect(overdue).toContain("status-danger");
    expect(html(<DueTag days={4} />)).toContain("in 4d");
  });
});

describe("PageHeader", () => {
  it("puts status tags in the eyebrow row, not with the actions", () => {
    const markup = html(
      <PageHeader
        eyebrow="Initial Cut"
        status={<StatusTag tone="danger">Revisions</StatusTag>}
        title="Our package"
        description="One line of context."
        actions={<button type="button">Refresh</button>}
      />
    );
    const statusAt = markup.indexOf("Revisions");
    const titleAt = markup.indexOf("<h1");
    const actionsAt = markup.indexOf("Refresh");
    expect(statusAt).toBeGreaterThan(-1);
    expect(statusAt).toBeLessThan(titleAt);
    expect(actionsAt).toBeGreaterThan(titleAt);
    // Actions are held to one control height.
    expect(markup).toContain("*:h-9");
  });

  it("stays compatible with the old props", () => {
    const markup = html(<PageHeader title="Grades" />);
    expect(markup).toContain("brand-hero-panel");
    expect(markup).toContain("Grades");
  });
});

describe("layout pieces", () => {
  it("ActionBar and Toolbar hold controls to one height", () => {
    expect(html(<ActionBar size="sm">x</ActionBar>)).toContain("*:h-8");
    const toolbar = html(<Toolbar aria-label="Filters" start={<span>Filters</span>} end={<span>Add</span>} meta="12 groups" />);
    expect(toolbar).toContain('role="group"');
    expect(toolbar).not.toContain('role="toolbar"');
    expect(toolbar).toContain("*:h-9");
    expect(toolbar).toContain("12 groups");
  });

  it("Panel labels itself by its title and fills its grid cell", () => {
    const markup = html(
      <Panel id="media" title="Media" status={<StatusTag>New</StatusTag>} footer="Footer">
        Body
      </Panel>
    );
    expect(markup).toContain('aria-labelledby="media-title"');
    expect(markup).toContain('id="media-title"');
    expect(markup).toContain("h-full");
    expect(markup).toContain("mt-auto");
  });

  it("KeyValueList renders a description list and skips hidden rows", () => {
    const markup = html(
      <KeyValueList
        items={[
          { label: "Air date", value: "Thu", mono: true },
          { label: "Secret", value: "x", hidden: true }
        ]}
      />
    );
    expect(markup.startsWith("<dl")).toBe(true);
    expect(markup).toContain("<dt");
    expect(markup).toContain("Air date");
    expect(markup).not.toContain("Secret");
  });

  it("MetricStrip draws every number in one card", () => {
    const markup = html(
      <MetricStrip
        items={[
          { label: "Deadline", value: "Thu", mono: false },
          { label: "Submitted", value: 3 },
          { label: "Deduction", value: "0", unit: "pts" }
        ]}
      />
    );
    expect(markup.match(/rounded-md border/g)?.length).toBe(1);
    expect(markup).toContain("md:grid-cols-3");
    expect(markup).toContain("pts");
  });

  it("EmptyState and Alert follow the DESIGN recipes", () => {
    const empty = html(<EmptyState title="No groups yet" description="Groups appear here." />);
    expect(empty).toContain("font-semibold");
    expect(empty).toContain("No groups yet");
    const alert = html(<Alert tone="danger">Couldn&apos;t load.</Alert>);
    expect(alert).toContain('role="alert"');
    expect(alert).toContain("bg-danger-tint");
    expect(html(<Alert tone="warning">Heads up</Alert>)).toContain('role="status"');
  });
});

describe("review fixes", () => {
  it("SegmentNav marks the open page as page and the current stage as a step", () => {
    const home = html(
      <SegmentNav
        ariaLabel="Stages"
        items={[
          { key: "a", label: "Pitch", state: "done", href: "/a" },
          { key: "b", label: "A-roll", state: "current", href: "/b" }
        ]}
      />
    );
    expect(home).toContain('aria-current="step"');
    expect(home).not.toContain('aria-current="page"');
    const onPage = html(
      <SegmentNav ariaLabel="Stages" items={[{ key: "b", label: "A-roll", state: "current", href: "/b", active: true }]} />
    );
    expect(onPage).toContain('aria-current="page"');
  });

  it("ListRow selection is aria-current, and the row fill covers the trailing slot", () => {
    const markup = html(
      <List>
        <ListRow title="Abby" onClick={() => undefined} active trailing={<span>3</span>} />
      </List>
    );
    expect(markup).toContain('aria-current="true"');
    expect(markup).not.toContain("aria-pressed");
    expect(markup).toMatch(/<li class="[^"]*bg-\[var\(--ink-3\)\]/);
  });

  it("FilterChips match the row height and never get clipped when they wrap", () => {
    const markup = html(
      <FilterChips ariaLabel="Filter" value="all" onChange={() => undefined} options={[{ value: "all", label: "All", count: 3 }]} />
    );
    expect(markup).toContain("h-auto!");
    expect(markup).toContain("h-9");
    expect(html(<FilterChips ariaLabel="Filter" size="sm" value="a" onChange={() => undefined} options={[{ value: "a", label: "A" }]} />)).toContain(
      "h-8"
    );
  });

  it("ButtonGroup children fill the group, so they follow a parent row's height", () => {
    expect(html(<ButtonGroup>x</ButtonGroup>)).toContain("*:h-full");
    const nav = html(<PrevNextNav previousHref={null} nextHref={null} previousLabel="Previous" nextLabel="Next" />);
    expect(nav).toContain('role="link"');
    expect(nav).toContain('aria-disabled="true"');
  });

  it("ViewTabs keeps a tab stop when the value matches no tab", () => {
    const markup = html(
      <ViewTabs
        ariaLabel="Views"
        value={"none" as "a" | "b" | "none"}
        onChange={() => undefined}
        items={[
          { value: "a", label: "A" },
          { value: "b", label: "B" }
        ]}
      />
    );
    expect(markup.match(/tabindex="0"/g)?.length).toBe(1);
  });

  it("Checkbox stays uncontrolled without `checked` and never sets aria-checked", () => {
    const loose = html(<Checkbox aria-label="Pick" defaultChecked />);
    expect(loose).not.toContain("aria-checked");
    expect(loose).toContain('checked=""');
    expect(html(<Checkbox aria-label="Pick" checked="indeterminate" />)).not.toContain("aria-checked");
    expect(html(<Checkbox aria-label="Pick" size="md" />).startsWith("<label")).toBe(true);
  });

  it("DataTable gives each group its own tbody and hides sized columns with their cells", () => {
    const markup = html(
      <DataTable
        rowKey={(row: { id: string }) => row.id}
        columns={[
          { key: "name", header: "Name", render: (row: { id: string }) => row.id },
          { key: "due", header: "Due", width: "8rem", hideBelow: "md", render: () => "Thu" }
        ]}
        groups={[
          { key: "today", header: "Today", rows: [{ id: "a" }] },
          { key: "later", header: "Later", rows: [{ id: "b" }] }
        ]}
      />
    );
    expect(markup.match(/<tbody/g)?.length).toBe(2);
    expect(markup).toContain('scope="rowgroup"');
    expect(markup).toMatch(/<col class="max-md:hidden"/);
  });

  it("a legend SectionLabel is the legend itself, and IconTile's brand tone works in Light mode", () => {
    expect(html(<SectionLabel as="legend">Who</SectionLabel>).startsWith("<legend")).toBe(true);
    const tile = html(<IconTile icon={<svg />} tone="brand" />);
    expect(tile).not.toContain("bg-[var(--ink)]");
  });

  it("SettingsHeader shows meta as tags in the eyebrow row, not as stretched actions", () => {
    const markup = html(<SettingsHeader eyebrow="Platform" title="Admin" meta={<span className="meta-pill">Adviser</span>} />);
    expect(markup.indexOf("Adviser")).toBeLessThan(markup.indexOf("<h1"));
    expect(markup).not.toContain("*:h-9");
  });

  it("a div Panel is not given a name it can't carry", () => {
    const markup = html(
      <Panel as="div" id="x" title="Title" padding="md" footer="F">
        Body
      </Panel>
    );
    expect(markup).not.toContain("aria-labelledby");
    expect(markup).toContain("md:px-4");
  });
});
