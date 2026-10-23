# InFocus Portal UI kit

Shared building blocks for every Portal screen. They follow `DESIGN.md` §10, §13 and §14:
square plates, 6px cards, 4px tags, 1px lines, no shadows or gradients, InFocus Green fills with
Soft White text, Green on Dark for small marks, Lexend for words, Geist Mono (tabular) for data,
semantic tokens only (so Light mode works), visible focus rings, and 40px touch targets on phones.

**Importing.** Import from the file (`@/components/kit/status-tag`) or from the barrel
(`@/components/kit`). Client components on hot paths should import from the file. Files marked
"(client)" below have `"use client"`; every other file is server-safe. The hook files
(`hotkeys.ts`, `remembered-state.ts`) are client-only, so the barrel is safe to import from a
server component.

**Naming conventions.**
- Sizes: controls take `size?: ControlSize` = `"sm"` (32px) | `"md"` (36px, the default) |
  `"touch"` (40px on phones, 36px from md). `CONTROL_HEIGHT[size]` is the class.
- Labels: widgets whose name is required take `ariaLabel` (SegmentedControl, FilterChips,
  ViewTabs, SegmentNav, PhoneTabBar, SearchField, pickers). Plain containers take an optional
  `aria-label` (ActionBar, Toolbar, ButtonGroup, List, GridList, ScrollStrip, Panel). Icon-only
  buttons take `label`, which is both the accessible name and the tooltip.
- Icons: pass a Lucide component (`icon={Check}`) or an element (`icon={<Check />}`). Both are
  drawn at the slot's size (16px in buttons and rows, 12px in tags).

---

## The four layout rules (every screen)

1. **One content column.** The app shell owns the page width. It renders the hub tabs, the
   package stage bar and the page inside one container, `mx-auto w-full max-w-[80rem]`. Wide
   routes use the full main width instead; the shell decides with `isWideRoute(pathname)` in
   `src/lib/sidebar-nav.ts`. The wide routes are `/projects/*`, `/groups/<row>`,
   `/groups/<row>/<stage>`, `/master-calendar`, `/grade-editor`, `/package-progress`,
   `/class-board` and `/teleprompter`. **Pages never add their own outer `mx-auto max-w-*`
   wrapper**; remove the ones that exist. Inner reading widths for prose are fine. Everything on
   a page shares the same left and right edges.
2. **Matched controls.** Controls in one row share one height (`h-9` by default, `h-8` small)
   and one family (primary plus outline or ghost), with 16px icons. Use at most one primary
   (filled) button per view, and put it last. `ActionBar` and `Toolbar` hold every direct child
   to the row height (Tailwind `*:h-9`, which beats a child's own `h-8`). Composite controls
   (`ButtonGroup`, `DateStepper`, `SegmentedControl`, `SearchField`) fill whatever height the row
   gives them. `FilterChips` sizes itself (it can wrap), so give it the row's `size`.
3. **Status is a tag, not a button.** Stage, approval, revisions, locked, due, live and saved
   are all shown with a `StatusTag`. Put it beside the title or eyebrow (`PageHeader status`,
   `Panel status`, `SectionHeader status`, `SettingsHeader status`) or in a row's status slot.
   Never put it in an actions row, and never make it button-sized. `.status-pill-lg` is now
   tag-sized and deprecated; the owner of `StageStatusChip` should drop `size="lg"` and render
   through `StatusTag`.
4. **Grid and rhythm.** Use the 4px scale (`gap-2/3/4/5/6/8`). Cards in a grid are equal
   height: `Panel`, `EntityCard`, `StatTile`, `MediaTile` fill their cell, and `StatGrid` and
   `CardGrid` stretch them. Card padding is `p-4`, or `p-4 md:p-5`; panel footers use the same
   side padding as the body. Sections use `space-y-5` or `space-y-6`. Labels and values line up
   in columns (`KeyValueList`, `GridList`, `DataTable`).

**Gotcha:** these classes in `app/globals.css` are unlayered CSS, so they beat Tailwind
utilities: `.status-pill`, `.status-*`, `.eyebrow`, `.brand-hero-panel`, `.display-*` and
`.rec-dot`. To change a tag's display, padding or white-space, use `!` (for example
`whitespace-normal!`) or style a wrapping span.

### Page skeleton

```tsx
<div className="space-y-5">
  <PageHeader
    eyebrow="Producing"
    status={<StatusTag tone="warning">2 waiting</StatusTag>}
    title="Groups"
    description="One line of context."
    actions={<Button>New group</Button>}
  />
  <Toolbar
    aria-label="Filters"
    start={<FilterChips ariaLabel="Show" value={filter} onChange={setFilter} options={…} />}
    end={<IconButton label="Refresh" icon={RotateCw} variant="outline" busy={loading} onClick={reload} />}
  />
  <CardGrid>{groups.map((group) => <Panel key={group.id} … />)}</CardGrid>
</div>
```

---

## Status vocabulary: `tone.ts`

`StatusTone = "neutral" | "success" | "warning" | "danger" | "review" | "info" | "live" | "muted"`.

`StatusToneInput` also accepts aliases: `ok` and `approved` → success, `warn` and `caution` →
warning, `error` → danger. So `GroupTileStatusTone` plugs in directly.

| Helper | Use |
|---|---|
| `resolveTone(tone)` | Turns an alias into the canonical tone |
| `statusTagClass(tone)` | The tag class (`status-approved`, `status-warn`, `status-muted`, …) |
| `toneFromStatusClass(cls)` | Turns an existing class map (`CYCLE_STAGE_STATUS_CLASS[status]`, `groupTileStatusClass(t)`) into a tone |
| `toneTextClass(tone)` | Text color for an icon or number in that tone |
| `formatCount(n, max = 99)` | Caps the number ("99+"), never negative |
| `relativeDaysLabel(days)` / `dueTone(days)` | "Today", "in 3d", "2d ago"; danger below 0, warning at 0 or 1 |
| `cycleLabel(n, focus?)` (`format.ts`) | "Cycle 03 · Sports" |

---

## Status marks: `status-tag.tsx`

### StatusTag (alias StatusBadge)
THE tag. A `<span>`, 20px tall (18px for `sm`), 11px caps, 4px radius, tinted by tone. Long
labels truncate and show the full label on hover.

```ts
{ tone?: StatusToneInput = "neutral"; size?: "sm" | "md"; icon?: KitIcon | ReactNode; dot?: boolean;
  spinner?: boolean; title?: string; srLabel?: string; wrap?: boolean; className?: string; children: ReactNode }
```

```tsx
<StatusTag tone="danger">Revisions</StatusTag>
<StatusTag tone={toneFromStatusClass(CYCLE_STAGE_STATUS_CLASS[s])} dot={s === "approved"}>{CYCLE_STAGE_STATUS_LABELS[s]}</StatusTag>
<StatusTag tone="live">Live</StatusTag> {/* Ink tag with the one Record Red dot */}
```

### StatusDot
The "something happened" mark for the sidebar rail, phone tabs, tabs and list rows.

`{ tone?: "new" | "warning" | "danger" | "live" | "neutral" = "new"; size?: 6 | 8; label?: string; className? }`

`new` is Green on Dark. `live` is pulsing Record Red; use it only for something on air. Without
`label` the dot is decorative, so say the meaning in nearby text.

### CountBadge
A Geist Mono tabular count: 18px, 4px radius, caps at "99+". It renders nothing below 1 unless
`showZero` is set.

`{ count: number; max?: number = 99; tone?: "brand" | "onBrand" | "neutral" | "warning" | "danger" | "quiet" = "brand"; srLabel?: string; showZero?: boolean; className? }`

- `brand`: unread, or waiting on you.
- `onBrand`: on an active green nav item.
- `neutral`: a plain total.
- `quiet`: a bare green number.

```tsx
<CountBadge count={unread} srLabel={`${unread} unread`} />
```

### SaveState
Autosave state as a tag (Saving… / Saved / 3 unsaved / Couldn't save), announced politely.

`{ state: "idle" | "saving" | "saved" | "dirty" | "error"; count?; idleLabel?; savedLabel?; savingLabel?; errorLabel?; title?; className? }`

### DueTag
`{ days: number; label?; tone?; title?; size?; className? }`: "Today", "in 3d" or "2d ago" in the
matching due tone. The caller computes whole `days` from today.

### Spinner (`spinner.tsx`)
`{ size?: "sm" | "md"; label?: string; className? }`: Loader2 at 12px or 16px. It stops spinning
under reduced motion. Pass `label` only when nothing nearby says it is busy.

---

## Headers and sections

### PageHeader: `@/components/page-header`
The square Ink 2 nameplate with the green strip. Backward compatible.

`{ eyebrow?; status?; title: ReactNode; description?; actions?; size?: "compact" | "default" | "display"; className? }`

- `status`: StatusTags in the eyebrow row, above the title.
- `actions`: controls only, held to h-9 through ActionBar. One primary, last. On phones they
  share the full width; square icon buttons stay square.
- `size`: `compact` (py-4, smaller title) for tool pages; `display` for landing heroes.

```tsx
<PageHeader
  eyebrow="Cycle 03 · Initial Cut"
  status={<><StatusTag tone="review">Stage 1</StatusTag><StatusTag tone="danger">Revisions</StatusTag></>}
  title="Robotics team"
  description="Upload a new version after the notes."
  actions={<><IconButton label="Refresh" icon={RotateCw} variant="outline" /><Button variant="outline">View feedback</Button><Button>Upload</Button></>}
/>
```

### SectionHeader: `section.tsx`
A heading row for a section outside a Panel: H2 or H3, a mono count, status tags, one muted
line, h-8 actions on the right.

`{ title; as?: "h2" | "h3"; id?; eyebrow?; count?: number | null; status?; description?; actions?; collapsible?: { open; onToggle; controlsId }; className? }`

`collapsible` turns the title into a disclosure button; you own the open state.

### SectionLabel: `section.tsx`
An 11px caps label with an end slot, for field groups, list group labels and day headers
("MATERIALS … 3 of 4 in").

`{ children; end?; count?: number | null; rule?: boolean; as?: "div" | "h2" | "h3" | "h4" | "label" | "legend"; htmlFor?; id?; className? }`

With `as="legend"` the whole row is the `<legend>`; put it first in its `<fieldset>`.
`htmlFor` makes the label a `<label>`.

### Disclosure, DisclosureToggle: `disclosure.tsx` (client)
- `Disclosure { summary; count?; actions?; open?; onOpenChange?; defaultOpen? = false; storageKey?; variant?: "row" | "section" = "row"; headingAs?: "h2" | "h3" | "h4" = "h3"; className?; bodyClassName?; children }`:
  a section whose body folds away. `row` is a 40px caps row (folded lists); `section` is a real
  heading whose text is the toggle. Actions (h-8) never toggle it. Control `open`, or remember
  it per browser with `storageKey` (version it, e.g. `"grades:how:v1"`).
- `DisclosureToggle { open; onToggle; closedLabel; openLabel; controls?; className? }`: a
  full-width "Show 12 reviewed" / "Hide reviewed" footer for a long list.

### HubTabs: `@/components/hub-tabs`
Rendered by the shell above the page. Each tab can carry a status:

`HubTabWithStatus = HubTab & { count?: number; countLabel?: string; countTone?: CountBadgeTone = "brand"; dot?: StatusDotTone; dotLabel?: string }`

A count reads as "waiting on you" by default; pass `countTone: "neutral"` for a plain total.

---

## Rows of controls

### ActionBar, ActionBarDivider: `action-bar.tsx`
`ActionBar { size?: ControlSize = "md"; align?: "start" | "end" | "between"; fullWidthOnPhone?: boolean; className?; children; "aria-label"? }`

Every direct child gets the row height. `fullWidthOnPhone` makes children share the width below
sm (elements with `aspect-square`, like IconButton, stay square). With `aria-label` it is a
labelled group. `ActionBarDivider` is a short vertical hairline between groups.

Exports: `ControlSize`, `CONTROL_HEIGHT[size]` (one control's height class) and
`CONTROL_ROW_HEIGHT[size]` (the `*:h-*` class a row puts on its children).

```tsx
<ActionBar align="end"><Button variant="outline">Cancel</Button><Button>Save</Button></ActionBar>
```

### Toolbar: `action-bar.tsx`
The one row under the page header.

`{ start?; end?; meta?; size?: ControlSize; busy?: boolean; className?; "aria-label"? }`

Filters and search go at the start, secondary actions at the end, and a muted count in `meta`
(Geist Mono for the number). It wraps on phones. `busy` draws a 2px progress line under the row
and sets aria-busy. With `aria-label` it is a labelled group (not `role="toolbar"`, which would
promise arrow-key movement).

### IconButton: `icon-button.tsx` (client)
A square button that matches the buttons in its row, with a tooltip built in.

```ts
{ label: string; icon: KitIcon | ReactNode; size?: ControlSize = "md"; variant?: "ghost" | "outline" | "default" = "ghost";
  tone?: "default" | "danger"; busy?; active?; pressed?; badge?: ReactNode;
  tooltip?: boolean | "top" | "right" | "bottom" | "left" = true; href?; external?; …button props }
```

- `active` is a visual "on" tint; `pressed` makes it a toggle (aria-pressed).
- `badge` is a corner mark (`<CountBadge count={3} />` or `<StatusDot />`).
- `href` renders a link; `external` opens a new tab and says so.
- It forwards its ref, so it works as a Popover or Dialog trigger.

```tsx
<IconButton label="Refresh" icon={RotateCw} variant="outline" busy={loading} onClick={reload} />
```

### ButtonGroup, DateStepper, PrevNextNav, BackLink: `button-group.tsx`
- `ButtonGroup { size?: ControlSize; className?; children; "aria-label"? }`: joined outline
  buttons that share their borders. Children fill the group's height, so inside an ActionBar it
  follows the row.
- `DateStepper { label?; onPrevious; onNext; previousLabel; nextLabel; previousDisabled?; nextDisabled?; onReset?; resetLabel? = "Today"; isCurrent?; size?; labelClassName?; children? }`:
  a grouped [‹ label ›] control plus a reset button. `isCurrent` disables the reset but keeps it
  in place. `children` replaces the label (for example a Select).
- `PrevNextNav { previousHref; nextHref; previousLabel; nextLabel; position?: { index; total }; keys?: [prev, next]; size?; children? }`:
  a missing href keeps a disabled twin in place (a link with aria-disabled), so nothing shifts.
  `keys` adds the letters to the hover text; bind them with `useListHotkeys`.
- `BackLink { href; children; className? }`: an h-8 "← Back" link, flush with the left edge.

### SegmentedControl: `segmented-control.tsx` (client)
A joined one-of-N choice.

```ts
{ value: T; onChange?: (value: T) => void;
  options: { value: T; label?; icon?; count?; disabled?; title?; href?; ariaLabel? }[];
  ariaLabel: string; size?: ControlSize = "md"; fullWidth?: boolean; iconOnly?: boolean; className? }
```

- The outer box is exactly the row height, so it lines up with buttons.
- The active segment uses the green fill.
- It is a radiogroup with ←/→/Home/End. Options with `href` render as links with aria-current.
- It scrolls inside itself if the options don't fit.

The `SegmentedControl` in `settings-layout` delegates to this one.

### FilterChips: `filter-chips.tsx` (client)
Single-select chips with mono counts. They scroll sideways on phones and wrap from sm.

`{ options: { value; label; count?; tone?; hidden?; hideWhenZero?; title? }[]; value; onChange; ariaLabel: string; size?: ControlSize = "md"; className? }`

- Match the row: `md` in a Toolbar beside h-9 buttons, `sm` in a panel header.
- `tone` colors the count while the chip is not selected (`warning` for "Needs you").
- `hideWhenZero` hides an empty chip, but never the selected one.
- To remember the choice, keep `value` in `useRememberedState`.

### ViewTabs, ViewTabPanel: `view-tabs.tsx` (client)
In-page tabs that look exactly like HubTabs (40px, 2px green underline).

- `ViewTabs { items: { value; label; count?; countTone?; countLabel?; dot?; dotLabel?; disabled?; title? }[]; value; onChange; ariaLabel; idPrefix?; size?: "md" | "lg"; className? }`
- `ViewTabPanel { idPrefix; value; active; className?; children }`

A tablist with ←/→/Home/End; the selected tab scrolls into view on phones. Give both the same
`idPrefix` to link tabs and panels. Inactive panels stay mounted but hidden. `TAB_LIST_CLASS` and
`tabItemClass(active, size?)` in `tab-styles.ts` share the look with HubTabs.

### SearchField: `search-field.tsx` (client)
`{ value; onChange; placeholder? = "Search"; ariaLabel?; size?: ControlSize; shortcut?: "/"; autoFocus?; inputRef?; onKeyDown?; onClear?; id?; name?; className? }`

A leading icon and a clear button. Esc clears the field. Text is 16px on phones. `shortcut="/"`
focuses it from anywhere on the page. Set a width with `className` (for example `w-64`).

### CyclePicker, NameSortSelect: `pickers.tsx` (client)
- **Decision:** every cycle screen (Groups, Package Cycle, Members, Grades, Grade Editor,
  Brainstorming) switches cycles with `CyclePicker`, in the PageHeader actions or the Toolbar.
  It replaces the floating BottomTabDock.
  `CyclePicker { cycles: { cycleNumber; focus? }[]; value; onChange; currentCycle?; leadingOptions?: { value; label }[]; ariaLabel? = "Cycle"; size?: "sm" | "md"; hideWhenSingle? = true; className? }`
  For Members: `leadingOptions={[{ value: 0, label: "General" }]}`.
- `NameSortSelect { value: NameSortKey; onChange; ariaLabel? = "Sort by"; size?: "sm" | "md"; className? }`:
  Last name, First name or Email, with the sort icon inside the trigger.

---

## Cards and content

### Panel, PanelHeader, PanelFooter, PanelSection, PanelLink: `panel.tsx`
THE card section. It fills its grid cell, and the footer is pinned to the bottom, so cards in a
row are equal height with aligned footers.

```ts
Panel {
  title?; titleAs?: "h2" | "h3" | "h4" = "h3"; eyebrow?; count?: number | null; status?; description?;
  actions? (h-8); footer?; padding?: "none" | "md" | "lg" = "lg"; divided?: boolean;
  tone?: "default" | "danger" | "brand"; as?: "section" | "div" | "article" | "form" = "section";
  id?; className?; bodyClassName?; "aria-label"?; children
}
PanelSection { title? (caps label); status?; actions?; id?; grow?: boolean; className?; children }  // inside <Panel divided>
PanelHeader  { title?; titleAs?; titleId?; eyebrow?; count?; status?; description?; actions?; className? }
PanelFooter  { children; justify?: "between" | "end" | "start"; className? }
PanelLink    { href; children; className? }  // the one "See all →" style
```

- `padding="lg"` is p-4, and p-5 from md. `md` is p-4 everywhere. The footer follows the same
  side padding.
- `padding="none"` is for flush lists and tables; the header gets its own padding and a rule.
- `id` also names the title `${id}-title` and labels the section with it (`as="div"` is not
  labelled, since a plain div can't carry a name).
- `tone="danger"` draws a Danger-tinted edge (danger zones); `brand` a green edge for the one
  item that needs attention.

```tsx
<Panel id="media" title="Media" status={<StatusTag tone="success">Approved</StatusTag>} actions={<PanelLink href="/drive">Open</PanelLink>}>…</Panel>
<Panel divided title="This week"><PanelSection title="Due">…</PanelSection><PanelSection title="Activity" grow>…</PanelSection></Panel>
```

### EntityCard: `panel.tsx`
A card whose whole surface is one link (a stretched title link). Action buttons sit above the
link layer, so there is never a button inside an anchor.

`{ href; title; eyebrow?; icon? (drawn in a brand IconTile); meta?; status?; actions? (h-8); footer?; className?; children? }`

### StatTile, StatGrid, MetricStrip: `stat-tile.tsx`
- `StatTile { label; value; mono? = true; unit?; hint?; tag?; icon?; tone?; progress? (0–1 or null); loading?; href?; onClick?; pressed?; className? }`:
  a caps label over a 22px mono value. With `href` or `onClick` the whole tile is the control;
  with `onClick` + `pressed` it is a filter toggle.
- `StatGrid { columns?: 2 | 3 | 4 | 5 | 6 = 4; className?; children }`: two tiles across on
  phones, `columns` across from lg, all equal height.
- `MetricStrip { items: (StatTile fields + { key?; href?; title? })[]; columns?; className? }`:
  several numbers in ONE card, split by hairlines. Use it for summary bands, card footers and
  KPI rows.

### KeyValueList, KeyValueRow: `key-value.tsx`
A `<dl>` with caps labels in a fixed column and aligned values. Labels stack above values on
phones.

```ts
KeyValueList { items?: { key?; label; value; mono?; trailing?; tone?; hidden? }[]; children? (KeyValueRow);
               layout?: "columns" | "stacked"; columns?: 1 | 2; labelWidth? = "8rem"; dense?; divided? = true;
               valueAlign?: "start" | "end"; className? }
```

### List, ListRow, NavList, NavListItem: `list-row.tsx`
- `List { label?; className?; children; "aria-label"? }`: a bordered card of rows with hairlines
  between them.
- `ListRow { leading?; title; tags?; meta?; subtitle?; trailing?; href?; external?; onClick?; active?; emphasized?; busy?; disabled?; size?: "md" | "lg"; className? }`:
  56px rows (64px with `lg`). It renders its own `<li>`.
  - `leading`: an Avatar or IconTile element, or an icon component drawn in a 32px tile.
  - `tags` sit right after the title; `meta` (a mono time or count) sits at the right of line 1.
  - `trailing` is a right column outside the link, so it can hold controls.
  - `active` marks the selected row in a list/detail: an Ink 3 fill under the whole row, a 3px
    green bar, and aria-current. `emphasized` is a SemiBold title for unread rows.
- `NavList { label?; className?; children }` and `NavListItem { href?; onClick?; icon?; label; active?; trailing?; depth?; title? }`:
  secondary navigation such as the Settings and Admin rails or a folder tree. The active item
  uses the green fill and aria-current.

### DataTable, TableShell, GridList: `data-table.tsx`
- `DataTable<T>`:

  ```ts
  { columns: { key; header; align?: "start" | "end" | "center"; mono?; width?; hideBelow?: "sm" | "md" | "lg";
               render(row, index); className?; headerTitle? }[];
    rows?: T[] | groups?: { key; header; rows: T[] }[]; rowKey(row, index); rowHref?(row); onRowClick?(row, event);
    rowClassName?(row); rowActions?(row); actionsHeader?; renderMobileRow?(row, index); stackBelow?: "sm" | "md" | "lg" = "md";
    empty?; loading?; skeletonRows? = 5; stickyFirstColumn?; minWidth?; maxHeight?; dense?; caption?; className? }
  ```

  - Label-style header, 48px rows (40px `dense`), Ink 3 hover, mono right-aligned numbers, and a
    right-aligned actions column (h-8 buttons or an ActionMenu).
  - `groups` render one `<tbody>` per group with a header row.
  - `rowHref`: the first cell's link covers the whole row (with `stickyFirstColumn` it covers
    only that cell). `onRowClick` is a mouse convenience; keep a keyboard path too.
  - Wide tables scroll inside their own box. With `renderMobileRow`, the table swaps to stacked
    cards below `stackBelow` instead (with its own loading and empty states).
  - `hideBelow` hides a column and its `<col>` below that width.
- `TableShell { minWidth?; maxHeight?; stickyFirstColumn?; dense?; busy?; caption?; className?; tableClassName?; children }`:
  the same chrome for hand-written `<table>`s (the `TABLE_CHROME` class). With `maxHeight` the
  table gets its own vertical scroll and the header sticks.
- `GridList { columns (grid-template-columns from md); header?: { label; align? }[]; className?; children; "aria-label"? }`,
  with `GridListRow { href?; onClick?; active?; sub?; className?; children }` and
  `GridListCell { label?; align?: "start" | "end"; mono?; className?; children }`: rows that share
  one grid template, with a caps header from md. On phones each row stacks its cells and shows
  each cell's label. `sub` is a full-width second line aligned with the cells.

### Alert, InlineNote, InlineError: `alert.tsx`
- `Alert { tone?: "info" | "success" | "warning" | "danger" | "neutral" = "info"; icon?: KitIcon | ReactNode | false; title?; children?; action? (h-8); onDismiss?; dismissLabel?; role?: "alert" | "status" | "note"; compact?; className? }`:
  tint, a 1px line in the same hue, an icon and plain words. Its role is alert for danger and
  status otherwise. It replaces the hand-rolled `text-amber-100` banners.
- `InlineNote { icon?; tone?: "muted" | "warning"; children; className? }`: a quiet one-line
  caveat with no box.
- `InlineError { id?; children; className? }`: the error line (icon + Danger words, role alert)
  under one field or tile.

### EmptyState, ErrorState: `empty-state.tsx`
- `EmptyState { icon?; eyebrow?; title; description?; meta?; action?; tone?: "neutral" | "danger"; size?: "page" | "panel" | "inline" = "panel"; align?: "center" | "start"; role?; className? }`:
  a monochrome icon (48px page, 32px panel), one SemiBold line, one muted line and at most one
  action. `inline` is one compact row for filter-empty results.
- `ErrorState { title? = "Couldn't load this"; message?; onRetry?; retryLabel? = "Try again"; busy?; size?; className? }`:
  a Danger icon, what went wrong, and an outline "Try again" that shows a spinner while `busy`.

### ProgressBar, ProgressSegments: `progress.tsx`
- `ProgressBar { value: number | null; max? = 100; tone?: "brand" | "success" | "warning" | "danger" | "neutral" | "auto"; size?: "xs" | "sm"; label (aria); caption?; showValue?; className? }`.
  `auto` is green from 80%, amber from 50%, Danger below. Pure helpers: `clampPercent`,
  `autoProgressTone`.
- `ProgressSegments { segments: ("done" | "current" | "later")[]; label; size?: "xs" | "sm"; className? }`:
  the tiny N-segment stage bar from the mockups.

### SegmentNav, StepList: `segment-nav.tsx`
- `SegmentNav { items: SegmentItem[]; ariaLabel; columns?: 2–6; scrollOnPhone?; trailing?; className? }`, with
  `SegmentItem { key; index?; label; state: "done" | "current" | "upcoming" | "locked"; active?; href?; onSelect?; tag?; count?; countLabel?; meta?; title? }`:
  the flat stage strip with a 4px top rule per cell. One look for the package stage bar, Home's
  stage steps, a group's stage tabs, and (without hrefs) the read-only approval path.
  - `active` is the cell whose page is open (aria-current="page"). Without it, the `current`
    stage gets the tint and aria-current="step".
  - `locked` cells are not links; put the reason in `title`.
  - Two cells per row on phones, or one scrolling row with `scrollOnPhone`; all in a row from sm.
- `StepList { steps: { key?; title; body?; state?: "done" | "current" | "upcoming" | "blocked" | "skipped"; tag?; tally? }[]; className? }`:
  numbered vertical steps, for the cycle guide or agreement → approvals.

### Avatar, AvatarStack, IconTile: `avatar.tsx`
- `Avatar { name?; email?; initials?; imageUrl?; size?: 20 | 24 | 28 | 32 | 36 | 40 = 32; shape?: "circle" | "square"; title?; className? }`:
  one neutral tone, no rotating palette. Helper: `initialsFor(name, email)`.
- `AvatarStack { people: { id; name?; email?; imageUrl? }[]; max? = 3; size?: 20 | 24 | 28 | 32; className? }`.
- `IconTile { icon; tone?: "brand" | "neutral" = "neutral"; size?: 32 | 36 | 40 = 40; className? }`:
  `brand` is a Green on Dark icon on a green tint (works in Light mode).

### MediaThumb, MediaTile, MediaBadge: `media.tsx` (client)
- `MediaThumb { src?; alt?; size?: "xs" | "sm" | "md" | "fill"; fit?: "cover" | "contain"; sizes?; priority?; topLeft?; topRight?; bottomLeft?; bottomRight?; fallback?; className? }`:
  16:9 on a dark frame (media stays dark in both themes), with a Play-icon fallback when there is
  no image or it fails to load.
- `MediaTile { thumbnailUrl; title; meta?; status?; topLeft?; topRight?; bottomLeft?; bottomRight?; highlight?: "new" | "active"; href?; onClick?; sizes?; className? }`.
- `MediaBadge { children; mono? = true; className? }`: a dark label on media (duration, version).

### VideoPlayer: `video-player.tsx` (client)
- `VideoPlayer { src; label; poster?; preload? = "metadata"; chapters?; className?; ref?; onError?; onLoadedMetadata? }`:
  the Portal's player. Use it for every playable video instead of `<video controls>` (the review
  page keeps its own timeline player; meeting tiles are live feeds). A black 16:9 frame with a
  flat control plate: green progress, chapter marks and a hover time on the seek bar
  (`video-seek-bar.tsx`), Geist Mono time, speed, picture in picture, full screen. Controls hide
  while playing. Keys once focused: Space/K, J/L, arrows, M, F, 0–9. Pass the frame's border and
  radius in `className`; `ref` reaches the `<video>`.

---

## Layout: `layout.tsx`

None of these adds a max-width.

- `ListDetail { list; detail; showDetailOnPhone; onBack?; backLabel? = "Back"; listWidth? = "22rem"; breakpoint?: "md" | "lg" = "lg"; variant?: "split" | "card"; stickyList? = true; className? }`:
  on phones it shows one pane at a time, with a back bar on the detail. From the breakpoint the
  list sticks with its own scroll.
- `MainWithRail { rail; children; railWidth? = "22rem"; breakpoint?: "lg" | "xl" = "xl"; railFirstOnPhone?; stickyRail?; className? }`.
- `CardGrid { minItemWidth? = "18rem"; gap?: 3 | 4 | 5 = 4; className?; children }`: an
  auto-fill grid of equal-height cards. Columns follow the container's width, not the viewport's.
- `ScrollStrip { children; gridClassName? = "sm:grid-cols-3"; itemWidth? = "80%"; className?; "aria-label"? }`:
  snaps sideways on phones and becomes a grid from sm.
- `JumpLinks { links: { href: "#id"; label }[]; hideFrom?: "lg"; className? }`.

Sticky panes sit below `--app-header-h` (falls back to 0).

---

## Overlays

- **Sheet** (`sheet.tsx`, client):
  `{ open; onOpenChange; title; eyebrow?; description?; headerExtra?; footer?; side?: "right" | "bottom" | "auto" = "auto"; width?: "sm" | "md" | "lg" | "xl" = "md"; modal? = true; dismissOnOutside? = true; hideClose?; trigger?; className?; bodyClassName?; children }`.
  A right drawer on desktop and a bottom sheet on phones, with a fixed header, one scrolling body,
  a fixed footer (buttons right-aligned at one height, full width on phones) and safe-area
  padding. `modal={false}` docks it beside the page: no scrim, the page stays usable and page
  shortcuts keep working; add `dismissOnOutside={false}` so working on the page doesn't close it.
- **ActionMenu** (`menu.tsx`, client):
  `{ items: (MenuItem | "separator" | { type: "label"; label })[]; label; trigger?; triggerIcon? = MoreHorizontal; triggerText?; variant?: "ghost" | "outline"; size?: "sm" | "md"; align?; side?; open?; onOpenChange?; anchorPoint?: { x; y } | null; disabled?; busy?; className? }`,
  with `MenuItem { key?; label; icon?; hint?; onSelect?; href?; external?; tone?: "default" | "danger"; disabled?; checked?; hidden? }`.
  - The trigger announces a menu; the list has menu roles with ↑/↓/Home/End, and Esc closes it.
  - Link items, check marks (`checked` makes it a menuitemcheckbox), disabled items with a
    reason in `hint`, group labels, and a quiet danger tone (the confirm step still uses
    ConfirmDialog).
  - Right-click menus: pass `anchorPoint` with a controlled `open`.
  - `visibleMenuEntries(items)` drops hidden items and stray separators.
- **Dialog** (`ui/dialog.tsx`): `DialogContent hideClose?` and `DialogFooter sticky?` (a pinned
  footer with a hairline for long dialogs). The scrim is 60% black, per DESIGN.
- **ConfirmDialog** (`ui/confirm-dialog.tsx`): adds `children?` (a preview of what will be
  deleted), `busyLabel?` ("Deleting…") and `error?` (shown inside the dialog).
- **Popover** (`ui/popover.tsx`, client): `Popover`, `PopoverTrigger`, `PopoverAnchor`,
  `PopoverClose`, `PopoverContent` (the Ink 2 menu surface, portaled, start-aligned).

---

## Forms

- **Field** (`field.tsx`): `Field { label; htmlFor?; hint?; error?; required?; span?: 1 | 2; className?; children }`
  and `FormSection { title?; aside?; description?; cols?: 1 | 2; className?; children }`. The
  hint has id `${htmlFor}-hint` and the error `${htmlFor}-error`; point the control's
  `aria-describedby` at them and set `aria-invalid`. The file also exports `fieldClass` (the
  text-field look) and `fieldLabelClass`.
- **NativeSelect** (`ui/native-select.tsx`): a native `<select>` styled like Input. Adds
  `size?: "sm" | "default"`, `placeholderOption?`, `wrapperClassName?`.
- **Checkbox** (`ui/checkbox.tsx`, client): a real `<input type="checkbox">`, so `required` and
  form validation work. `checked?: boolean | "indeterminate"` (leave it out for an uncontrolled
  box with `defaultChecked`), `onCheckedChange?(checked)`, `onChange?`, `size?: "sm" | "md"`,
  `labelClassName?`, and optional label `children`. A lone `md` box is a 40px clickable area;
  give it an `aria-label`.
- **RadioCards** (`radio-cards.tsx`): `{ name; value; onChange; options: { value; label; description?; disabled? }[]; legend; hideLegend?; required?; columns?: 1 | 2 | 3 | 4 = 2; size?: "default" | "sm"; className? }`.
  Equal-height option cards on real radio inputs; also the A-roll vs B-roll picker.
- **Dropzone** (`dropzone.tsx`): `{ bind; dragging; disabled?; overlayLabel? = "Drop to upload"; className?; children }`.
  Wraps `useFileDrop` from `src/lib/use-file-drop.ts`.
- **CopyButton** (same component as `CopyTextButton`, `components/copy-text-button.tsx`):
  `{ text?; getText?; label? = "Copy"; copiedLabel? = "Copied"; size?: "sm" | "default" | "icon" | "icon-sm"; variant?: "outline" | "ghost" | "secondary"; onError?; className? }`.
  Without `size` or `variant` it keeps the old 40px look.
- **Button** (`ui/button.tsx`): adds `size="icon-sm"`, a 32px square.

---

## Bottom bars and standalone screens

- **StickyActionBar** (`sticky-action-bar.tsx`): `{ status?; children; visible? = true; mode?: "inline" | "sticky" = "inline"; inlineFrom?: "md" | "lg" = "lg"; reserveLauncher? = true; className? }`.
  On phones it is fixed above `--phone-tabbar-h` and the safe area, with a right gutter so the ✱
  launcher never covers an action, plus a spacer so the end of the page stays reachable. From
  `inlineFrom` up it sits in the page (`inline`) or sticks to the bottom of its scroller
  (`sticky`). The `status` slot holds a SaveState or why the primary is disabled.
- **PhoneTabBar** (`phone-tab-bar.tsx`): `{ items: { key; label; icon; active; href?; onSelect?; badge? }[]; ariaLabel; hideFrom?: "md" | "lg" = "lg"; className? }`.
  For shells outside AppShell (/live, equipment). Put `PHONE_TABBAR_ROOT_CLASS.lg` (or `.md`) on
  that shell's root so fixed bottom elements sit above it.
- **StatusPlate** (`status-plate.tsx`): `{ eyebrow?; tag?; title; body?; children?; actions?; ariaLive?; fullHeight? = true; className? }`.
  A centred nameplate for a lobby, "the call ended", not found, access denied or maintenance.
- **Toasts** (`ui/sonner.tsx`): brand-styled (Lexend, card surface, 6px radius). To lift them
  above a bottom bar, set `--toast-offset-bottom` or `--toast-offset-right` on `<html>`.
- **UploadProgressToast** (`components/upload-progress-toast.tsx`): same props as before. It sits
  above the ✱ launcher, uses kit tags, counts and bars, and announces only "N of M uploaded"
  changes to screen readers (not every percent).

---

## Loading: `skeleton.tsx`

- `Skeleton { className?; aspect?: "16/9" | "9/16" | "4/5" | "1/1" }`
- `LoadingRegion { label? = "Loading"; className?; children }`: wrap a whole loading view in it.
- `SkeletonText { lines? = 3; widths?; className? }`
- `PageHeaderSkeleton { actions? = 1; className? }`
- `ToolbarSkeleton { start? = 3; end? = 1 }`
- `PanelSkeleton { rows? = 3; className? }`
- `CardGridSkeleton { count? = 3; className? (grid classes, CardGrid's by default); itemClassName? = "h-40" }`
- `ListSkeleton { rows? = 6; leading? = true; lines?: 1 | 2; className? }`
- `TableSkeleton { rows? = 6; columns?: string[]; className? }`
- `SegmentNavSkeleton { count? = 4 }`
- `ListDetailSkeleton { rows? = 8 }`

```tsx
export default function Loading() {
  return (
    <LoadingRegion className="space-y-5">
      <PageHeaderSkeleton actions={1} />
      <ToolbarSkeleton />
      <CardGridSkeleton count={6} />
    </LoadingRegion>
  );
}
```

---

## Hooks and helpers (client)

- **useRememberedState** (`remembered-state.ts`): `useRememberedState<T>(key, initial, validate?) → [value, setValue, loaded]`.
  Stored in localStorage under `infocus:ui:`, with try/catch on every read and write. The first
  render uses `initial` and the stored value is applied after mount, so there is no hydration
  mismatch. Version the key (`"groups:filter:v1"`). An empty key turns storage off. Pure
  `readRemembered` and `writeRemembered` are exported for tests.
- **useMediaQuery** (`remembered-state.ts`): `useMediaQuery(query, serverValue = true)`. Picks one
  layout instead of rendering both.
- **useHotkeys** (`hotkeys.ts`): `useHotkeys(map, { enabled?, allowInDialogs? })`. Single-key
  shortcuts that skip presses with a modifier, inside text fields, already handled, or while a
  dialog is open (a docked non-modal Sheet doesn't count).
- **useListHotkeys** (`hotkeys.ts`): `useListHotkeys({ onNext, onPrevious, enabled? })`. J/K,
  built on `src/lib/keyboard-nav.ts`.
- **Pure guards** (`hotkeys.ts`): `isTypingTarget(target)`, `shouldHandleHotkey(event)`.
- **Keys** (`kbd.tsx`, server-safe): `Kbd { children; className? }`,
  `KeyHints { items: { keys; label }[]; showOnTouch?; className? }` (hidden below lg) and
  `shortcutKeys("mod+s", isMac)`.
- **Roving** (`roving.ts`, server-safe): `rovingIndex(current, key, disabled[])` and
  `centerInStrip(strip, child)`.

---

## Settings and Admin: `components/settings-layout.tsx` (client; all old exports kept)

- No outer max-width; it fills the shell's column. The phone section strip is sticky under
  `--app-header-h`. The content column is an `@container`.
- `SettingsHeader { eyebrow; title; description?; status?; actions?; meta? }`: `status` (tags
  such as the role or "3 pending") sits in the eyebrow row; `actions` holds controls. `meta` is
  the older name for `status` and renders in the same place.
- `SettingsNavItem.status?: { label; tone: "ok" | "warn" | "danger" | "neutral" } | null`: a tag
  on the rail. On the phone strip, warn and danger show an icon with screen-reader words.
- `SettingsSection { id; title; description?; status?; actions?; tone?; children }`: tags right
  after the H2; actions (h-8 controls or a SaveStatus) stay on the right.
- `SettingsRow { title; description?; htmlFor?; inline?; className?; children? }`: `inline`
  keeps a compact control on the right at every width.
- `SettingsGrid { columns?: 2 | 3; className?; children }` and
  `SettingsCell { id?; title; description?; htmlFor?; inline?; className?; children? }`: equal
  cells with hairlines in both directions.
- `SettingsPanel`, `SettingsPanelBody`, `SettingsPanelHeader` (PanelHeader with row padding).
- `SettingsNotice` renders `Alert`. `SegmentedControl { label; value; options; onChange; size?: "default" | "sm" }`
  delegates to the kit one. `SaveStatus { text; pending? }` is unchanged.

---

## For the shell owner (not built in the kit)

- Set `--app-header-h` on the AppShell root (0 when the chrome is hidden) so sticky panes clear
  the top bar.
- Sidebar statuses: `CountBadge` for unread and needs-you counts (`onBrand` on the active
  item), and `StatusDot` on the rail and phone tabs (`danger` when a My package stage is in
  REVISIONS, `new` for unread).
- Hub tab statuses: pass `count` or `dot` on `HubTabWithStatus`.
- Put the refresh events in `src/lib`, next to `EXTENSION_REQUESTS_CHANGED_EVENT`:
  `PACKAGE_NAV_REFRESH_EVENT`, `PARTICIPATION_REQUESTS_CHANGED_EVENT`,
  `ACCESS_REQUESTS_CHANGED_EVENT`.
- Set `--toast-offset-bottom` on `<html>` so toasts clear the phone tab bar.

## Left to screens (build them in your screen's folder from these parts)

PinPad, ToggleChip, CopyField, SelectButton, DateChip, Legend, ClampText, InlineEditField,
SavedSecret, MemberChecklist, QueueList, SplitButton, PaginationBar, ResizableSplit,
FreshnessTag, Combobox, ToolLayout, GroupedNav, ActionTile, LabelDivider. The StageComments
and ProducerFeedbackDialog trigger props belong to the package-stages owner.
