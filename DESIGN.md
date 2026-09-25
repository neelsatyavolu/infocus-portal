# InFocus Design System

A portable guide to the visual language of **InFocus Portal**. Use it to build related websites, dashboards, tools, and other interfaces in any framework.

Updated September 25, 2026 for the new InFocus logo. Colors come from the logo files. Other tokens and component dimensions come from the website's source (`app/globals.css` is the implementation). This is a source-based specification, not a browser-verified visual audit. No framework, backend, account system, or InFocus-specific workflow is required to use it.

## 1. Visual direction

**A dark broadcast production workspace: energetic headings, quiet surfaces, precise controls.**

- Use a near-black canvas with subtly lighter panels and thin neutral borders.
- Make logo green the recognizable accent for primary actions, progress, and positive states.
- Pair oversized, condensed, italic uppercase display type with restrained, readable sans-serif UI text.
- Keep operational screens compact. Use spacing, borders, and typography to establish hierarchy.
- Reserve atmospheric green gradients for hero panels and selected tiles. Most working surfaces stay flat.
- Use logo red for live/recording indicators and destructive or error states; clarify the meaning with labels and icons.
- Build around real content: projects, media, people, dates, progress, and concise actions.

The website is dark by default. A light theme is opt-in per browser (Settings → Appearance); section 2 lists its tokens. The logo colors for light backgrounds (print, decks, documents, the light theme) are in the logo palette. For an unrelated product, replace the brand name and assets while retaining the visual system.

## 2. Color

### Logo palette

These are the exact colors in the logo files. Every other brand color is derived from them.

| Name | Hex | RGB | Where it appears in the logo |
| --- | --- | --- | --- |
| Logo green | `#2BB36E` | 43 179 110 | "in" and the "o" ring on dark backgrounds |
| Logo deep green | `#0B6E3E` | 11 110 62 | "in" and the "o" ring on light backgrounds |
| Logo red | `#EE3A2A` | 238 58 42 | The dot over the "i" (always red) |
| Logo ink | `#0F110F` | 15 17 15 | "focus" and the signal arcs on light backgrounds; the app-icon tile |
| White | `#FFFFFF` | 255 255 255 | "focus" and the signal arcs on dark backgrounds |

Pick the logo colors by background:

| Background | Green | Letters and arcs | Dot |
| --- | --- | --- | --- |
| Dark (the website, video) | `#2BB36E` | `#FFFFFF` | `#EE3A2A` |
| Light (print, documents, slides) | `#0B6E3E` | `#0F110F` | `#EE3A2A` |

### Contrast

| Pair | Ratio | Use |
| --- | --- | --- |
| Ink text `#0A0A0A` on logo green `#2BB36E` | 7.3:1 | Primary buttons. Always dark text on green. |
| White on logo green | 2.7:1 | Avoid. |
| Logo green on ink | 7.3:1 | Green text, eyebrows, icons on dark. |
| Logo red `#EE3A2A` on ink | 5.0:1 | Red text and icons on dark. |
| White on logo red | 4.0:1 | Large or bold text only. Use deep red for filled controls. |
| White on deep red `#C92B1D` | 5.5:1 | Destructive buttons, LIVE pill. |
| Ink text on deep green hover `#23955C` | 5.2:1 | Hover state of green buttons. |
| Logo deep green `#0B6E3E` on white | 6.3:1 | Green text on light backgrounds. |
| Logo green on white | 2.7:1 | Avoid for text on light backgrounds. |

### Semantic tokens (website)

Semantic HSL values are authoritative for UI components. Neutrals carry the logo ink's slight green tint (hue 120, 4–6% saturation) rather than a blue-gray.

| Semantic role | Exact CSS color | Use |
| --- | --- | --- |
| Background | `hsl(120 6% 4%)` | Page canvas |
| Foreground | `hsl(0 0% 98%)` | Main text |
| Card / popover | `hsl(120 5% 5%)` | Raised surfaces |
| Card / popover foreground | `hsl(0 0% 98%)` | Surface text |
| Primary | `hsl(150 61% 43.5%)` (≈ `#2BB36E`) | Main action, focus ring |
| Primary foreground | `hsl(0 0% 4%)` | Dark text on green |
| Secondary | `hsl(120 4% 8%)` | Secondary controls, metadata |
| Secondary foreground | `hsl(0 0% 98%)` | Secondary text |
| Muted | `hsl(120 4% 7%)` | Quiet fills |
| Muted foreground | `hsl(120 4% 65%)` | Descriptions and metadata |
| Accent | `hsl(150 30% 11%)` | Subtle green hover surface |
| Accent foreground | `hsl(150 60% 80%)` | Text on accent surface |
| Destructive | `hsl(5 75% 45%)` (≈ `#C92B1D`) | Destructive action |
| Destructive foreground | `#FFFFFF` | Text on destructive fill |
| Border / input | `hsl(120 4% 16%)` | 1px outlines and separators |

### Brand and supporting tokens

| Token | Value | Use |
| --- | --- | --- |
| `--brand-green` | `#2BB36E` | Logo green. Fills with dark text, green text on dark, tints. |
| `--brand-green-deep` | `#23955C` | Hover and pressed state of green fills; gradient middle stop. |
| `--brand-green-ink` | `#08492A` | Dark green for hero washes and gradient ends. |
| `--brand-green-soft` | `#E8F7F0` | Pale green for light contexts only. |
| `--brand-red` | `#EE3A2A` | Logo red. Rec dot, red text and icons, tints. |
| `--brand-red-deep` | `#C92B1D` | Red fills that carry white text. |
| `--brand-amber` | `#F2A516` | Warnings. |
| `--ink` | `#0A0A0A` | Sidebar and deepest surfaces. |
| `--ink-2` / `-3` / `-4` | `#1F1F1F` / `#2C2C2C` / `#3A3A3A` | Raised fills, hover fills, borders. |
| `--ink-5` | `#6B6E6B` | Dim labels. |
| `--ink-text` | `#B6B9B6` | Supporting text. |
| `--paper` / `--paper-2` | `#FFFFFF` / `#F7F7F8` | Light contexts only. |

Soft green and paper are supporting palette entries, not instructions to introduce light panels into the dark UI.

### Light theme

Opt-in from Settings → Appearance. `<html>` carries `dark` (default) or `light`. The choice is a cookie (`infocus-theme`) on `.infocuspaly.com`, so the Portal subdomains share it; a script in `<head>` applies it before first paint (`src/lib/theme.ts`).

The semantic tokens take these values under `:root.light`:

| Semantic role | Light value |
| --- | --- |
| Background | `hsl(120 9% 97%)` |
| Foreground | `hsl(120 8% 7%)` |
| Card / popover | `hsl(0 0% 100%)` |
| Primary | `hsl(151 82% 24%)` (logo deep green `#0B6E3E`) with white foreground |
| Secondary / muted | `hsl(120 6% 93%)` / `hsl(120 7% 95%)` |
| Muted foreground | `hsl(120 4% 36%)` |
| Accent / accent foreground | `hsl(150 40% 92%)` / `hsl(151 82% 18%)` |
| Border / input | `hsl(120 6% 86%)` / `hsl(120 6% 84%)` |
| Destructive | unchanged |

The ink scale and brand accents flip with the theme, so markup written against them works in both:

| Token | Light value | Meaning in both themes |
| --- | --- | --- |
| `--ink` | `#FFFFFF` | Base surface, and the text color on solid brand fills |
| `--ink-2` / `-3` / `-4` | `#F1F3F1` / `#E3E7E3` / `#CFD4CF` | Raised fills, hover fills, lines |
| `--ink-text` | `#4B514B` | Supporting text |
| `--brand-green` / `-deep` | `#0B6E3E` / `#085A32` | Green text and fills (white text on the fill) |
| `--brand-red` / `-deep` | `#C92B1D` / `#A32216` | Red text and fills |
| `--brand-amber` | `#B45309` | Warnings |

Rules for dark-first markup:

- Prefer semantic tokens and the flipping vars above. Don't use `text-white`, `border-white/N` or `bg-white/N` on theme surfaces; use `text-foreground`, `border-foreground/N`, `bg-foreground/N`.
- The `light:` variant adds a light-only override, e.g. `bg-black/40 light:bg-muted` for a recessed panel.
- In light mode the pale Tailwind tints (50–300) of amber, yellow, orange, red, rose, emerald, sky and indigo resolve to the deep end of the hue, so status text like `text-amber-200` stays readable. A solid pale fill (`bg-amber-300`) darkens too; give its text `light:text-white`.
- Video players, media overlays, modal backdrops and the teleprompter run mode stay dark in both themes. Inside them, use fixed colors (`text-white`), never flipping tokens.

Translucent tints use the logo RGB values: green `rgb(43 179 110 / α)` and red `rgb(238 58 42 / α)`. Common alphas: 0.06–0.12 for fills, 0.18 for status fills, 0.25–0.40 for borders and rings.

Chart series tokens, in order: `hsl(150 61% 43.5%)`, `hsl(5 85% 55%)`, `hsl(38 92% 50%)`, `hsl(220 90% 60%)`, `hsl(280 70% 60%)`. Label chart series and states so color is not the only identifier.

## 3. Typography

### Families

| Role | Family | Treatment |
| --- | --- | --- |
| UI / body | Geist Sans | Normal case, regular through semibold |
| Display | Barlow Condensed | Bold, extra-bold, black; usually italic uppercase |
| Numeric / technical | Geist Mono | Timecodes, compact counts, technical metadata |

Load Barlow Condensed at weights **700, 800, 900**, with both normal and italic faces. Portable fallbacks: display → Oswald, Impact, sans-serif; body → system-ui, sans-serif; mono → ui-monospace, SF Mono, Menlo, monospace. Font declarations do not load the fonts: bundle them or configure your platform's font loader. Avoid synthetic italics when the real face is available.

### Display scale

All display styles use `letter-spacing: -0.02em`, uppercase, italic, and foreground color.

| Style | Font size | Weight | Line height |
| --- | --- | --- | --- |
| XL | `clamp(3rem, 4vw + 2rem, 5.5rem)` | 900 | 0.92 |
| LG | `clamp(2.25rem, 2.5vw + 1.5rem, 3.75rem)` | 900 | 0.96 |
| MD | `clamp(1.5rem, 1vw + 1.125rem, 2.25rem)` | 800 | 1.02 |
| SM | `clamp(1.25rem, 0.5vw + 1rem, 1.75rem)` | 800 | 1.05 |

The public homepage overrides its large headline to 88px / 0.92 at desktop widths. Operational page headings generally use MD rather than a marketing-sized headline.

### Supporting type

- Eyebrow: Barlow Condensed, 12px, 700, uppercase, `0.18em` tracking, green by default. Neutral and red variants exist.
- Navigation: 13px, medium; section labels: 10px condensed bold uppercase with `0.18em` tracking.
- Body and controls: typically 14px; prominent descriptions: 16–18px.
- Metadata: typically 12px; dense labels and counts: 10–11px. Keep tiny text to secondary information.
- Standard card titles: sans-serif semibold with tight tracking. Not every title needs broadcast styling.
- Timecodes: monospace, muted, `0.04em` tracking. Use tabular numerals for changing counts and scores.
- Text wordmark utility: 14px, 600, uppercase, `0.16em` tracking. The actual site header uses an image wordmark.

## 4. Spacing, shape, and depth

Use a 4px base spacing rhythm, with small 2px adjustments for dense controls. Common gaps are 8, 12, 16, and 24px.

| Element | Observed dimensions |
| --- | --- |
| Main page padding | 16px mobile; 24px from 768px |
| Standard card sections | 24px padding; content/footer omit duplicate top padding |
| Compact page hero | 16px padding; 20px horizontal from 768px |
| Landing hero | 20px, then 28px from 640px, then 40px from 768px |
| Base radius | 10px |
| Small / medium / large / XL radius tokens | 6 / 8 / 10 / 14px |
| Larger page panels | 16px; landing hero 24px |
| Pills and avatars | Fully rounded |
| Borders | Usually 1px |

Use subtle shadows on buttons and cards; stronger shadows belong to overlays. Surface contrast and outlines do most of the work. Backdrop blur appears on sticky headers and floating controls, not every card.

## 5. Layout recipes

### Application workspace

- Fixed 240px left sidebar on desktop, with a thin right border and ink background.
- Sidebar becomes a slide-in drawer below 1024px; width is `min(240px, 85vw)` with a black 60% backdrop.
- Sidebar contains brand at top, grouped navigation, and an account row at bottom.
- Sticky main header: background at 95% opacity, backdrop blur, bottom border, breadcrumbs on the left and actions on the right. Allow wrapping.
- Main area uses 16–24px padding and `min-width: 0` to contain wide content.
- Groups uses a centered content width of 80rem (1280px), compact hero, and 12px section spacing.
- Some media project screens add a second 240px contextual sidebar. This is a specialized layout, not a requirement for every screen.
- Allow room below content for mobile and floating controls; the main shell uses 96px bottom padding on smaller screens.

### Public / landing page

- Sticky top header with image wordmark, pill-shaped navigation on desktop, and green CTA.
- Centered content, maximum 1280px wide, horizontal padding 16–24px.
- Large rounded hero with a faint green-to-ink gradient, eyebrow, condensed headline, restrained supporting paragraph, and wrapping actions.
- Small summary cards below the headline; feature cards arranged in responsive grids.
- Use larger vertical section gaps (about 40px) than on operational screens.

### Operational collection

- Compact hero: eyebrow → page title → one-line description, with filters/actions beside it.
- Optional compact metrics row with monospace counts and thin progress bars.
- Cards: one column on small screens, two from 768px in Groups, with 8px gaps.
- Table alternative: bordered rounded container, compact section header, uppercase micro-label column headings, 14px primary row text, 12px secondary text.
- Groups tables scroll horizontally within their container and retain a 720px minimum width. Adapt that minimum to the columns in a new product.
- Row hover can use ink-2 fill and a 3px inset green left edge.
- Empty states use a bordered dark panel, centered muted explanation, and a useful next action where applicable.

## 6. Component specifications

### Buttons

Sans-serif, 14px medium, 8px radius, centered inline-flex content, 8px icon gap. Icons are normally 16px.

| Size | Height | Horizontal padding |
| --- | --- | --- |
| Default | 36px | 16px |
| Small | 32px | 12px; 12px text |
| Large | 40px | 32px |
| Icon | 36 × 36px | Centered |

- Primary: logo green with dark text; hover uses primary at 90% opacity.
- Secondary: secondary surface with light text; hover uses fill at 80% opacity.
- Outline: canvas fill and input border; hover uses dark green accent and pale green text.
- Ghost: transparent until hover, then accent treatment.
- Destructive: deep red with white text; hover uses fill at 90% opacity. Name this variant `destructive`.
- Link: green text, underline on hover, 4px underline offset.
- Focus: visible green 1px ring. Disabled: 50% opacity, no pointer interaction.
- Public header CTAs are fully rounded and use `--brand-green`, changing to `--brand-green-deep` on hover.

### Cards

Standard card: 14px radius, 1px border, card background, foreground text, subtle shadow. Header stacks title and description with 6px spacing. Header/content/footer use 24px padding without double-padding between sections. Page-specific tiles may use 16px radii and denser spacing.

### Inputs

36px high, full width, 8px radius, transparent background, 1px input border, 12px horizontal padding. Muted placeholder, subtle shadow, visible green focus ring. Disabled: 50% opacity and not-allowed cursor. Input text stays **16px below 1024px** to avoid mobile zoom; desktop generally uses 14px. Always provide a label.

### Status and metadata

Broadcast status pills use condensed 12px bold uppercase text, `0.16em` tracking, 3px vertical / 8px horizontal padding, 4px internal gap, and a full radius.

| State | Background | Text | Border |
| --- | --- | --- | --- |
| Live | Deep red `#C92B1D` | White | Transparent |
| Review | Canvas | White | Neutral border |
| Approved | Green at 18% | Logo green | Green at 30% |
| Warning | Amber at 18% | Amber | Amber at 40% |
| Danger | Red at 18% | Logo red | Red at 40% |
| Neutral | Card | `#B6B9B6` | Neutral border |

Small status pills use 10px type, 2px / 6px padding, and `0.12em` tracking. Metadata pills use ordinary 12px medium sans-serif, secondary fill, neutral border, 4px / 10px padding, and a 6px gap. Generic badges are a separate pattern: 8px radius, 12px semibold sans-serif, 2px / 10px padding.

### Navigation

Sidebar items: 13px medium text, 16px icons, 10px gap, 10px radius, 10px horizontal padding, 8px vertical desktop / 10px mobile padding. Active item gets card fill, border, and foreground text. Inactive items are muted and brighten on hover. Do not make every navigation item green.

### Dialogs

Centered dark panel over an 80% black overlay. Width `calc(100vw - 2rem)`, max 512px; maximum height `min(90dvh, calc(100dvh - 2rem))` with internal vertical scrolling. Padding 16px, rising to 24px at 640px; 10px radius from 640px. Title: 18px semibold; description: 14px muted. Close control sits 16px from top/right. Footer actions stack on mobile and align right on larger screens. Preserve keyboard focus management, Escape dismissal, accessible title, and focus return.

### Icons and avatars

Use Lucide-style outline icons, usually 16px; compact icons 14px and mobile menu icon 20px. Give icon-only controls accessible names. Circular account images are typically 28–32px, with subtle borders. Initials can replace missing images. Initial-avatar palettes: green (`#2BB36E → #23955C`, black text), red (`#C92B1D → #781A11`, white text), purple, blue, and gray.

## 7. Gradients and brand assets

Primary hero wash:

```css
background: linear-gradient(135deg, #08492A 0%, #0A0A0A 60%, #1F1F1F 100%);
```

Layer it at 40% opacity on compact operational heroes and 50% on the public homepage, keeping content in a separate foreground layer. Full-opacity heroes (Grade Editor, Livestreams) use `#08492A → #0A2517 → #0A0A0A` with a `rgb(43 179 110 / 0.18)` radial glow.

Additional source gradients:

| Variant | Stops at 135 degrees |
| --- | --- |
| Green | `#2BB36E, #23955C, #08492A` |
| Red | `#EE3A2A, #781A11, #0A0A0A` |
| Ink | `#1c1c1c, #2c2c2c, #0a0a0a` |
| Tile 1 | `#6f3cff, #f0648f, #8d4bff` |
| Tile 2 | `#00b07c, #27d39e, #4f6dff` |
| Tile 3 | `#3d63ff, #6c7dff, #cf4be2` |
| Tile 4 | `#ff7b4a, #ff5ca8, #7e4dff` |
| Tile 5 | `#00a3ff, #3ec7ff, #6d6cff` |

Progress bars run left to right from `--brand-green` to `--brand-green-deep`.

The multicolor variants are available tile treatments; they do not replace the green-led core palette. Optional tile decoration uses clipped circular light/shadow washes with 20px blur.

### Logo

The logo is a lowercase **infocus** wordmark. The "o" is a camera aperture inside a green ring, with two signal arcs, and a red dot sits over the "i". The icon is the "o" mark with the red dot, on its own.

Asset locations in this repository:

- `public/favicon/infocus-wordmark.png`: header wordmark (green and white on transparent, for dark backgrounds). Rendered 36px high with automatic width and contain fit.
- `public/favicon/infocus-wordmark-light.png`: the same wordmark with ink letters and deep green, for the light theme. `components/brand-wordmark.tsx` renders the right one for the theme.
- `public/favicon/infocus-logo.png`: icon mark for dark backgrounds (email header).
- `public/favicon/infocus-hub-icon.png`: icon on the ink tile (Slack bot avatar).
- `public/favicon/`: favicon, Apple touch icon, and Android icons (icon on a rounded ink tile).

Assets are referenced, not embedded in this document. Copy the actual assets separately when needed. Preserve their aspect ratio and colors. Do not recreate the logo with ordinary text, recolor it, or stretch it. The website name is **InFocus Portal**; **InFocus News** and **InFocus Drive** are separate names.

## 8. Motion and responsive behavior

- Card entrance: 320ms ease; opacity 0 → 1, translateY 8px → 0, scale 0.99 → 1.
- Route entrance: 320ms `cubic-bezier(0.22, 1, 0.36, 1)`; opacity 0 → 1, translateY 10px → 0.
- Sidebar slide: 200ms ease-out. Dialog styles specify 200ms transitions.
- Live dot: 8px logo-red circle, 1.4s repeating outward red shadow pulse. Reserve for actual live/recording status.
- Disable decorative entrances and live-dot animation when reduced motion is requested.
- Breakpoints used throughout: 640px small, 768px medium, 1024px desktop navigation, 1280px wider grids.
- Wrap action rows, collapse grids, scroll wide tables locally, and honor device safe-area insets.

Accessibility requirements for reuse: retain visible keyboard focus, semantic controls and heading order, descriptive labels, and textual status cues. Check contrast in the target implementation, especially tiny colored text and translucent layers. Preserve the visual size of compact icons while enlarging touch hit areas when necessary. These are implementation checks, not a claim that every existing screen has passed an accessibility audit.

## 9. Framework-independent CSS starter

This is a portable subset, not a full copy of the original stylesheet. It stores complete CSS colors rather than bare HSL channels and uses an `if-` prefix to avoid collisions. Load the fonts separately. Extend it with the specifications above.

```css
:root {
  color-scheme: dark;
  --if-bg: hsl(120 6% 4%);
  --if-fg: hsl(0 0% 98%);
  --if-card: hsl(120 5% 5%);
  --if-secondary: hsl(120 4% 8%);
  --if-muted: hsl(120 4% 7%);
  --if-muted-fg: hsl(120 4% 65%);
  --if-border: hsl(120 4% 16%);
  --if-primary: #2BB36E;
  --if-primary-hover: #23955C;
  --if-accent: hsl(150 30% 11%);
  --if-accent-fg: hsl(150 60% 80%);
  --if-danger: #C92B1D;
  --if-green: #2BB36E;
  --if-red: #EE3A2A;
  --if-amber: #F2A516;
  --if-sans: "Geist Sans", system-ui, sans-serif;
  --if-display: "Barlow Condensed", "Oswald", Impact, sans-serif;
  --if-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--if-bg);
  color: var(--if-fg);
  font-family: var(--if-sans);
  line-height: 1.5;
}
.if-page { width: 100%; max-width: 1280px; margin-inline: auto; padding: 16px; }
.if-card { background: var(--if-card); border: 1px solid var(--if-border); border-radius: 14px; padding: 24px; }
.if-hero { position: relative; isolation: isolate; overflow: hidden; border-radius: 16px; }
.if-hero::before {
  content: ""; position: absolute; inset: 0; z-index: -1; opacity: .4;
  background: linear-gradient(135deg, #08492A 0%, #0A0A0A 60%, #1F1F1F 100%);
  pointer-events: none;
}
.if-title {
  margin: 0;
  font-family: var(--if-display);
  font-size: clamp(1.5rem, 1vw + 1.125rem, 2.25rem);
  font-weight: 800; font-style: italic;
  line-height: 1.02; letter-spacing: -.02em; text-transform: uppercase;
}
.if-eyebrow {
  font-family: var(--if-display); font-size: 12px; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase; color: var(--if-green);
}
.if-description { color: var(--if-muted-fg); font-size: 14px; }
.if-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 36px; padding: 8px 16px; border: 1px solid transparent;
  border-radius: 8px; background: var(--if-primary); color: #0A0A0A;
  font: 500 14px/1.25 var(--if-sans); cursor: pointer;
  transition: background-color 150ms, color 150ms;
}
.if-button:hover { background: var(--if-primary-hover); }
.if-button--outline { background: var(--if-bg); color: var(--if-fg); border-color: var(--if-border); }
.if-button--outline:hover { background: var(--if-accent); color: var(--if-accent-fg); }
.if-button--destructive { background: var(--if-danger); color: white; }
.if-button--destructive:hover { background: color-mix(in srgb, var(--if-danger) 90%, transparent); }
.if-button:disabled { opacity: .5; pointer-events: none; }
.if-input {
  width: 100%; height: 36px; padding: 4px 12px; border: 1px solid var(--if-border);
  border-radius: 8px; background: transparent; color: var(--if-fg);
  font: 400 16px/1.5 var(--if-sans);
}
.if-input::placeholder { color: var(--if-muted-fg); }
.if-input:disabled { cursor: not-allowed; opacity: .5; }
.if-button:focus-visible, .if-input:focus-visible {
  outline: 1px solid var(--if-primary); outline-offset: 2px;
}
.if-status {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border: 1px solid var(--if-border); border-radius: 9999px;
  font: 700 12px/1.5 var(--if-display); letter-spacing: .16em;
  text-transform: uppercase; white-space: nowrap;
}
.if-status--approved { background: rgb(43 179 110 / .18); color: var(--if-green); border-color: rgb(43 179 110 / .30); }
.if-status--danger { background: rgb(238 58 42 / .18); color: var(--if-red); border-color: rgb(238 58 42 / .40); }
.if-status--live { background: var(--if-danger); color: white; border-color: transparent; }
.if-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.if-enter { animation: if-enter 320ms cubic-bezier(.22, 1, .36, 1) both; }
@keyframes if-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (min-width: 768px) {
  .if-page { padding: 24px; }
  .if-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) { .if-input { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .if-enter { animation: none; } }
```

The starter's 150ms button transition and offset focus outline are explicit portable defaults, rather than exact copies of every original utility. A CSS framework is optional; the original implementation uses Tailwind, React, Radix primitives, and Lucide icons.

## 10. Reuse checklist

- Start with the dark semantic palette and real fonts.
- Take brand colors from the logo palette; pick the dark-background or light-background set to match the surface.
- Choose the workspace or public-page layout according to the content.
- Keep display headings bold and expressive; keep controls and body text calm.
- Make the primary action logo green with dark text. Put white text only on deep red, never on green.
- Use consistent border, radius, spacing, and status recipes.
- Keep gradients localized and subordinate to content.
- Support mobile wrapping, table overflow, keyboard focus, and reduced motion.
- Use short, specific action labels such as "Save," "Upload," or "View details."
- Avoid bright white content panels, excessive glass effects, large shadows on every surface, and oversized display type in dense tables.
- Do not carry InFocus-specific roles, routes, or business rules into unrelated products just to reproduce the appearance.

## Source references

Paths are relative to the InFocus Packages repository and are provenance only; this document works independently of them.

| Source | What it establishes |
| --- | --- |
| `app/globals.css` | Palette, type utilities, gradients, pills, radii, motion |
| `src/show-roles/index.css` | Show Roles app tokens (same palette) |
| `src/lib/email-layout.ts` | Email colors |
| `app/layout.tsx` | Font loading, dark mode, product naming, icons |
| `components/ui/{button,card,input,badge,dialog}.tsx` | Shared component measurements and states |
| `components/app-shell.tsx` | Sidebar, header, navigation, responsive workspace |
| `components/marketing-header.tsx` | Public header, wordmark, CTA styles |
| `app/page.tsx` | Landing hero and feature grid |
| `app/(app)/groups/groups-client.tsx` | Compact operational hero, tiles, tables, controls |
