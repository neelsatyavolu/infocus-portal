# InFocus Design System — 2026

The visual language of InFocus, Palo Alto High School's student broadcast network: the 2026 logo, colors, type, shapes, motion, and every on-air graphic built from them. Use this to make anything new (a graphic, a thumbnail, a slide, a web page) look like it belongs.

All files live in `Show Resources/InFocus 2026 Package`. The single design source for the on-air graphics is `_Working Files/Graphics Source/graphics.html`; every number below comes from it.

---

## 1. Logo

### Anatomy
The wordmark is **infocus** in heavy, rounded geometric lowercase:

- **"in"** in InFocus Green, with the **red record dot** as the dot of the i.
- **"f"** and **"cus"** in Ink.
- The **"o" is the icon**: a green three-quarter ring (the lens barrel) around a six-blade camera aperture, with two ink **broadcast arcs** radiating from the top right.

The icon on its own (ring + aperture + arcs + red dot) is the mark for small and square spaces.

The icon's shapes are the whole system in miniature. The **arc** becomes the curved corner of the nameplates. The **red dot** is the "live" accent. The **aperture** is the outro's closing move.

### Files (`01 Logos`)
| File | Use |
|---|---|
| `Wordmark/infocus-wordmark-color.png` | Default, on white or light backgrounds |
| `Wordmark/infocus-wordmark-white.png` | On dark footage or Ink (white letters, green "in", red dot) |
| `Wordmark/infocus-wordmark-on-black.png` | Color wordmark pre-set on a black field |
| `Wordmark/infocus-wordmark-mono-black.png` / `-mono-white.png` | One-color uses (print, embossing, busy photos) |
| `Icon/infocus-icon-color.png` / `-white.png` | Square spaces, watermarks, nameplate tile |
| `Icon/infocus-channel-avatar-1800.png` | YouTube / Instagram / TikTok profile picture |
| `Favicon/favicon-16/32/512.png` | Browser tabs and app icons |

Wordmark masters are 4107 × 1100 px, and the icon is 1024 px. The email signature logo is in `Branding & Design/Email Signature`.

### Rules
- **Clear space:** keep empty space around the logo at least the diameter of the red dot on every side.
- **Minimum size:** wordmark 120 px wide on screen (0.75 in in print). Below that, use the icon.
- **Don't** recolor the parts, swap the red dot for another color, stretch, rotate, add shadows/outlines/glows, rebuild the lettering in another font, or put the color wordmark on mid-tone or busy backgrounds. Use the white or mono version there.
- Old logos (`Branding & Design/Old Logos`, `Show Resources/Old Graphics`) are retired.

---

## 2. Color

| Token | Hex | Role |
|---|---|---|
| **Ink** | `#0F110F` | Primary dark. Plates, cards, TV standby, the "f"/"cus" of the logo. Use instead of pure black. |
| **InFocus Green** | `#0B6E3E` | Primary brand color. Role strips, panels, the logo's "in" and ring. Carries white text. |
| **Green on Dark** | `#2BB36E` | Brighter green for *text and small marks on Ink*: kickers, bullets, URLs. Never a large fill. |
| **Record Red** | `#EE3A2A` | Accent only: the record dot and small "live" markers. Never text, never large areas. |
| **White** | `#FFFFFF` | Names, titles, primary text on dark. |
| **Mist** | `#DCE2DE` | Secondary text on dark: announcement points, taglines. |
| Dot (unlit) | `#2E1412` | Only in the outro, the record dot before it lights. |

**Balance:** mostly Ink, a band of Green, one touch of Red. If red is in more than one spot on screen, it's too much.
**Contrast:** white on Ink and white on InFocus Green both pass WCAG AA for text. Don't put Green-on-Dark text on InFocus Green.
**Errors and delete buttons** don't use Record Red. Interfaces use the separate Danger colors in section 10.

---

## 3. Typography

**Lexend** is the brand typeface (`02 Fonts`: Regular 400, Medium 500, SemiBold 600, Bold 700): every name, title, label and sentence. It's the only typeface in the on-air graphics.

**Geist Mono** is the one allowed companion, for *data only* in software (the portal, teleprompter, dashboards): timecodes, timers, counts that change live, IDs and codes. Lexend's digits are all different widths and it has no tabular-figures option, so changing numbers set in Lexend shift side to side. See section 10 for exactly where each one goes. Install it on every editing computer first; the `Install … Graphics` files in Show Resources do it for you.

| Use | Weight | Style |
|---|---|---|
| Names, headline titles | SemiBold 600 | Tight tracking (−1 to −2%), sentence or title case |
| Roles, labels, kickers | Medium 500 / Bold 700 | **ALL CAPS**, wide tracking (+11% roles, +18% kickers) |
| Body, bullet points, handles | Regular 400 / Medium 500 | Normal tracking |
| URLs | SemiBold 600 | +6% tracking, Green on Dark |

Keep it to two weights per graphic. Don't use italics, underlines, or all-caps for names.

---

## 4. Shape language

- **The arc corner.** On the on-air nameplates, the plate has one rounded corner: the outer top corner (the top corner farthest from the logo tile) is a **quarter circle as tall as the plate**, echoing the logo's arc. All other corners are square. There's no outline or stroke on the arc. This exact rule is for the broadcast graphics. Websites, slides and other interfaces use it as an accent only (see section 10).
- **The tile.** A square Ink tile holds the icon at the inner end of every nameplate.
- **Stacked bars.** Ink plate on top (name), InFocus Green strip below (role), always the same width. The width is set by whichever text is longer.
- **Flat color.** No gradients, bevels, drop shadows, or glass. Depth comes from the footage, not the graphic.
- **Safe areas.** Lower-third graphics sit on the title-safe line (bottom edge at y = 972 in 1080p), 150 px in from the side.

---

## 5. Motion

Everything builds *in pieces*, not as one block: the container opens, then the text arrives. The exit is roughly the entrance in reverse, and a little faster.

| Easing | Curve | Use |
|---|---|---|
| Ease out | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances: fast start, soft landing |
| Ease in | `cubic-bezier(0.7, 0, 0.84, 0)` | Exits |
| Ease in-out | `cubic-bezier(0.65, 0, 0.35, 1)` | Full-frame moves, fades, dissolves |
| Back out | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Tiny pops only (the red dot) |

- **The icon turns.** Whenever the mark appears or leaves, it rotates ±30° and scales to 80–86%, as if a lens were focusing.
- **Wipes, not slides.** Bars reveal with a clip/wipe from the tile outward. They don't fly in from off-screen.
- Nothing bounces except the red dot. No spins, no blur-in, no typewriter text.
- Entrances take about 0.8 s and exits about 0.7 s. Leave on-screen time to the editor. The templates keep their in/out timing however long the clip is stretched.

---

## 6. On-air graphics

All are 1920 × 1080. MOGRT (Premiere) and `.drfx` (DaVinci Resolve) versions match the rendered ProRes versions.

### Lower third (`05 Lower Thirds`)
- Ink tile (126 px, icon inside) + Ink name plate (81 px tall) + Green role strip (45 px tall). The plate has the arc corner.
- Name: Lexend SemiBold 45 px, white. Role: Medium 20.8 px, ALL CAPS, +11% tracking.
- Bottom-left: 150 px from the left, bottom edge on y = 972.
- **In:** the tile opens from its center, then the icon turns into place, the plate wipes out, the name rises in, and the strip and role follow. **Out** is the reverse, ending with the icon turning away and the tile closing.
- A ready-made transparent clip for everyone on staff is in `Roster (ProRes)`.

### Dual third (`06 Dual Thirds`)
- Two lower thirds, the right one mirrored (tile on the outside, arc corner on the inside), each 290 px in from its edge so it sits under its anchor.
- Both plates share one width (the wider of the two) so the pair looks balanced.

### Announcement (`07 Announcements`)
- A full-frame Ink card, made to be seen on the set TVs (about 58% size), so the type is large.
- Header: red dot + **ANNOUNCEMENTS** kicker (Bold 38 px, Green on Dark, +18%) on the left, white wordmark (70 px tall) on the right, with a 3 px white rule at 30% opacity under it. Margins are 120 px.
- Title: SemiBold 116 px, white. Points: Regular 64 px, Mist, with Green-on-Dark bullet dots. **Up to 5 points, short phrases.** Text shrinks to at most 80% to fit, and past that the card should be split into two.
- Optional image on the right (e.g. a QR code) on a white 440 px card with 14 px corners.
- **Sequence:** the card fades up on the centered icon, the icon turns away, then the header, rule, title and points build in. At the end the content fades, the icon turns back in and holds, and the whole card dissolves to transparent.

### TV standby (`09 TV Standby`)
- Ink with the icon centered (300 px). It's exactly the first and last frame of the announcement.
- The Left/Right set TVs show this whenever no announcement is up, so they **never show the blue key color**. On the TVs, an announcement reads as logo → announcement → logo, with no pop.

### Follow InFocus (`08 Follow InFocus`)
- A corner card at the **top left** (x 48, y 40): Ink tile + Ink "Follow InFocus" plate, with a Green panel below listing the handles in white Medium 26 px:
  - Instagram + YouTube **@infocusnews**
  - TikTok + X **@palyinfocus**
  - Web **infocusnews.tv**
- Transparent ProRes 4444, 7 s. It builds like a lower third.

### Intro (`03 Intro & Outro`)
- 13.8 s, 1080p. A fast, music-cut montage of our own footage (spirit week, packages, drone, class photos) that lands on the 2026 wordmark on the music hit.

### Outro (`03 Intro & Outro`)
- On black: the white wordmark (1180 px wide) reveals left to right with the original InFocus outro music, and the red dot lights on the music's peak (1.32 s).
- Below it: "Palo Alto High School's Student Broadcast Network" (Regular 32 px, Mist) and **infocusnews.tv** (SemiBold 38 px, Green on Dark). The legal line "© 2026 InFocus and Palo Alto High School" sits on title-safe.
- **Ending:** the dot fades fully out, the frame closes like an aperture into the "o", then fades to black.

---

## 7. Virtual sets (`04 Virtual Sets`)

Three still backgrounds (1920 × 1080 PNG) for the switcher, keeping the classic three-camera layout:

- **Middle:** two-anchor desk, with a wide window onto **Paly's Tower Building** behind.
- **Left / Right:** angled views (about 28°) of the same room with the curved round desk, each with a TV on a floor stand. The TV screens are pure key blue `#0047BB`, at Left x 57–1176, y 114–739 and Right x 743–1860, y 110–738, the same pixels as the old sets.
- Materials: warm light-wood slat walls with thin InFocus Green reveals, gray desk with a curved front edge, and daylight through the windows. The brand colors only appear as accents, so the anchors stand out.

---

## 8. Formats & delivery

| Asset | Format |
|---|---|
| Intro / outro | 1080p H.264 MP4, high bitrate |
| Lower thirds, announcements, Follow InFocus | ProRes 4444 with alpha (transparent), 1080p, 29.97 fps |
| Editable templates | `.mogrt` (Premiere), `.drfx` (DaVinci Resolve) |
| Virtual sets, TV standby | 1920 × 1080 PNG |
| Logos | PNG with transparency |

Show frame rate is 29.97 fps (59.94 for studio recordings).

---

## 9. Making something new

1. Start from Ink, add one Green element, and use Red only once (or not at all).
2. Use Lexend, with SemiBold for the main line and CAPS Medium for labels.
3. Use the arc corner on the one or two most important containers, not everywhere. Everything else stays square or gets a small, consistent radius (see section 10 for websites).
4. Animate it in pieces with the easings above, and turn the icon when it appears.
5. Check it on the actual footage or set, and at the size it'll really be seen (a TV on set is about half size).
6. For show graphics, edit `graphics.html` and re-run the render scripts rather than editing renders by hand. See the package README.

---

## 10. Using this on the web (InFocus Portal, infocusnews.tv, dashboards)

The colors, type and flat style apply as written. The shape and motion rules were made for 1080p broadcast graphics, so on a website they're used as **accents**, not copied onto every element.

### The arc corner = a signature, used sparingly
- **Use it on the few big "plate" pieces:** the hero/header banner, section title bars, featured story cards, and the active nav tab. That's usually 1–3 per screen.
- **One curved corner, the other three square.** Put the curve on the top-right for left-aligned elements, or the top-left for right-aligned or mirrored ones.
- **Cap the curve size.** On TV the curve is as tall as the bar because the bars are short. On the web, use a fixed radius instead: **32 px** (24 px on phones, 48 px on very large hero panels). Never let a tall card get a curve as tall as the card.
- **Don't use it on everyday UI.** Buttons, text fields, dropdowns, checkboxes, tables, tags, tooltips, modals and small list cards stay **square or use one consistent small radius (4–6 px)**. Pick one and use it everywhere.
- Never round all four corners into a pill or blob, and never add an outline or stroke along the arc.

### Colors on the web
- **Page backgrounds:** Ink for dark pages, or white or a very light Mist for light pages.
- **InFocus Green** for primary buttons, active states and header bands, with white text on it.
- **Green on Dark** (`#2BB36E`) only for text, links and icons on Ink backgrounds.
- **Record Red** only as a tiny marker, like a "LIVE" dot or a new-item dot. Never use it for buttons, errors, or big areas.

### Danger colors (errors, destructive actions, warning badges)
Record Red is a *brand* color and stays reserved for the dot. For "something is wrong / this will delete something", the portal uses a separate **Danger** set: a cooler crimson that reads as an alert, not as InFocus branding.

| Token | Hex | Use |
|---|---|---|
| **Danger** | `#C21F3A` | Destructive buttons (Delete, Remove, Revoke) with white text, error text and icons on light backgrounds, danger badge fill, error input borders |
| **Danger on Dark** | `#FF7A8A` | Error text, icons and borders on Ink backgrounds |
| **Danger tint (light)** | `#FDECEE` | Background of error banners/alerts on light pages |
| **Danger tint (dark)** | `#3A1218` | Background of error banners/alerts on Ink pages |

All pass WCAG AA contrast: white on Danger is about 5.9:1, Danger on white about 5.9:1, and Danger on Dark on Ink about 7.6:1.

- **Destructive buttons:** use a Danger fill with white text only for the final "are you sure?" confirm. Elsewhere, use a quiet button (Danger text, no fill) so pages aren't full of red.
- **Errors:** always pair the color with an icon and words ("Couldn't save: …"). Never rely on color alone.
- **Badges** ("Overdue", "Missing", "Failed"): use the Danger fill with white text, or the tint background with Danger text. Keep them small.
- Don't put Danger and Record Red next to each other, and don't use Danger for anything decorative.

### Type on the web
- Lexend for everything people *read*. Headings in SemiBold, body in Regular, labels and eyebrow text in ALL CAPS Medium with wide tracking (+11–18%).
- **Geist Mono for data that must line up or updates live:**
  - timecodes and durations (`00:12:48:15`, `4:32`)
  - countdowns and timers, including the teleprompter's clock, elapsed time and word/line counters
  - live counts and numbers in table columns
  - IDs, codes and file names (`EP-0925`, checkout codes)
- **The teleprompter script itself stays in Lexend.** Lexend was designed for reading ease, and that's exactly what a prompter needs. Only its numbers and timers are mono.
- **Static numbers inside sentences or headings stay Lexend** ("5 announcements", "Class of 2027"). Use mono only when the number is data to scan, compare or watch tick.
- Match Geist Mono's size so its lowercase letters line up with Lexend's (usually about 0.9× the Lexend size). Use Regular or Medium, and never Mono for headings or buttons.
- Anything else, like a third font, a serif, or a different mono, is off-brand.
- Scale the TV sizes down to normal web sizes. Keep the relationships (big confident headline, calm body, small tracked label), not the pixel values.

### Motion on the web
- Use the same easing curves (section 5), but shorter: 150–300 ms for UI, and up to about 600 ms for a hero entrance.
- The icon turn (±30°) is for the logo only, like a loading state or page intro. Don't rotate other UI.
- Respect "reduce motion" settings.

### Quick check
If a screen has more than a few arc corners, more than one spot of red, gradients or drop shadows, or any font other than Lexend (plus Geist Mono for data), it's drifting from the brand.

---

## 11. InFocus Portal implementation

How sections 2–5 and 10 map to the Portal's code. Tokens live in `app/globals.css`; fonts load in `app/layout.tsx`; shared components are in `components/ui/`.

### Color tokens

Dark (Ink) is the default. Light is opt-in (Settings → Appearance, `<html class="light">`). Tokens marked "flips" change value in light mode.

| Brand color | CSS token | Tailwind class | Notes |
|---|---|---|---|
| Ink `#0F110F` | `--background` (dark), `--ink` (flips) | `bg-background`, `bg-[var(--ink)]` | Page canvas. `--card` / `--ink-2…4` are slightly raised Ink surfaces and lines. |
| InFocus Green `#0B6E3E` | `--primary`, `--brand-fill` | `bg-primary text-primary-foreground`, `bg-[var(--brand-fill)] text-[var(--on-brand)]` | Primary buttons, active states, header bands. Always white text. Hover `--brand-fill-hover`. |
| Green on Dark `#2BB36E` | `--brand-green` (flips to `#0B6E3E` in light) | `text-brand-green`, `text-[var(--brand-green)]` | Text, links, icons, small marks, focus ring. Low-opacity tints (`/10`) are fine; never a solid large fill. |
| Record Red `#EE3A2A` | `--brand-red` | `rec-dot rec-dot-red`, `bg-[var(--brand-red)]` on a dot | The rec dot and tiny LIVE markers only. `.status-live` is an Ink tag with the red dot. |
| Mist `#DCE2DE` | `--mist`, `--ink-text` (flips) | `text-[var(--ink-text)]`, `text-muted-foreground` (dimmer) | Secondary text on dark. |
| Danger `#C21F3A` | `--danger`, `--destructive` | `bg-destructive text-destructive-foreground`, `bg-danger-fill` | Destructive fills with white text. |
| Danger on Dark `#FF7A8A` | `--danger-text` (flips to `#C21F3A`) | `text-danger`, `border-danger` | Error text, icons, borders. |
| Danger tints `#3A1218` / `#FDECEE` | `--danger-tint` (flips) | `bg-danger-tint` | Error banner backgrounds. |

Light theme: background is a very light Mist (`hsl(141 12% 96%)`), cards are white, text is Ink, and primary stays InFocus Green with white text.

### Type

- `font-sans` and `font-display` are **Lexend** (400/500/600/700, `next/font/google`). `font-mono` and `.timecode` are **Geist Mono**, for data only (section 10), with `tabular-nums`.
- `.display-xl/lg/md/sm`: Lexend SemiBold, tight tracking, no italics, no forced caps.
- `.eyebrow`: ALL CAPS Medium, +18% tracking, Green on Dark. Labels and badges: ALL CAPS Medium, +11% tracking.

### Shape

- One small radius everywhere: every Tailwind radius (`rounded-md` … `rounded-3xl`) resolves to **6px**, `rounded-sm` to 4px. `rounded-full` is only for true circles (avatars, dots, spinners, switches, progress bars).
- The arc corner is `.arc-corner` (top-right) or `.arc-corner-left` (mirrored): 24px on phones, 32px from 640px. `.brand-hero-panel` / `.brand-hero-gradient` page heroes include it automatically, as an Ink plate with a 4px InFocus Green strip below (the lower third, flattened). The active sidebar item uses a smaller single top-right curve.
- Flat color: every `shadow-*` / `drop-shadow-*` utility is flattened to nothing in the theme. There are no gradients and no glass (`backdrop-blur`). The legacy `.brand-gradient-*` and `.av-*` classes are now flat brand tones.

### Buttons

| Variant | Use |
|---|---|
| `default` | Primary action: InFocus Green, white text |
| `destructive` | Solid Danger. Only for the final "are you sure?" confirm |
| `destructive-quiet` | Danger text, no fill. Delete/Remove/Revoke everywhere else |
| `outline` / `secondary` / `ghost` / `link` | Everything else (`link` is Green on Dark) |

### Motion

The Tailwind defaults are the brand curves: `--default-transition-timing-function` is ease out `cubic-bezier(0.16, 1, 0.3, 1)` at 200ms, and `ease-in`, `ease-out`, `ease-in-out` are the section 5 curves. Card and route entrances run 280ms ease out. The rec dot fades in and out and never glows. Reduced motion disables the entrances and the dot animation.

### Emails

`src/lib/email-layout.ts` uses literal hexes (email clients don't support CSS variables), with the same roles as above, a Lexend font stack, and InFocus Green buttons with white text.

### Not covered

The Show Roles Vite app (`src/show-roles/`) and the Mac app wrapper still use their older styles.
