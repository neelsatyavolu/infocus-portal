# InFocus Design System — 2026

The visual language of InFocus, Palo Alto High School's student broadcast network: the 2026 logo, colors, type, shapes, motion, and every on-air graphic built from them. Use this to make anything new (a graphic, a thumbnail, a slide, a web page) look like it belongs.

**Where to look:**
- Brand basics (everyone): sections 1–5 and 9
- On-air graphics: sections 6–8
- Websites and apps: section 10
- Slides: section 11
- Documents, email, social, and posters: section 12
- Copy-paste tokens: section 13

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
3. Use the arc corner on the one or two most important containers, not everywhere. Everything else stays square or gets a small, consistent radius (6px on screens; see section 10).
4. Animate it in pieces with the easings above, and turn the icon when it appears.
5. Check it on the actual footage or set, and at the size it'll really be seen (a TV on set is about half size).
6. For show graphics, edit `graphics.html` and re-run the render scripts rather than editing renders by hand. See the package README.

---

## 10. Web and interfaces (InFocus Portal, InFocus Drive, infocusnews.tv, dashboards)

The colors, type, and flat style apply exactly as written above. The shape and motion rules were made for 1080p broadcast graphics, so on a screen people *use* they become **accents**, not something copied onto every element. The CSS in section 13 is the starting point for any new site.

### Surfaces and color

Dark (Ink) is the default for InFocus interfaces. A light theme is allowed, for example for documents or when a user opts in.

| Role | Dark | Light |
|---|---|---|
| Page background | Ink `#0F110F` | Mist 20 `#F4F6F5` |
| Card / panel | Ink 2 `#1A1D1A` | White `#FFFFFF` |
| Hover / raised fill | Ink 3 `#252925` | `#E9EEEB` |
| Lines and borders | `#2B302B` | `#D5DCD7` |
| Primary text | White `#FFFFFF` | Ink `#0F110F` |
| Secondary text | Mist `#DCE2DE` | `#4B524D` |
| Muted text (metadata, placeholders) | `#A3ABA6` | `#535A55` |
| Primary fill (buttons, active state, header band) | InFocus Green `#0B6E3E` + white text | InFocus Green `#0B6E3E` + white text |
| Green text, links, icons, small marks | Green on Dark `#2BB36E` | InFocus Green `#0B6E3E` |
| Focus ring | Green on Dark `#2BB36E` | InFocus Green `#0B6E3E` |
| Warning (UI only) | Amber `#F2A516` | `#B45309` |
| Record Red | `#EE3A2A`, dot only | `#EE3A2A`, dot only |

- Green on Dark is only for text and small marks. It is never a button fill. Never put it on InFocus Green.
- Record Red is only a tiny marker, like a "LIVE" dot or a new-item dot. Never use it for buttons, errors, or big areas.
- A tint (the color at 10–18% opacity) is fine for a selected row or a success banner background.

### Danger colors (errors, destructive actions, warning badges)
Record Red is a *brand* color and stays reserved for the dot. For "something is wrong / this will delete something", interfaces use a separate **Danger** set: a cooler crimson that reads as an alert, not as InFocus branding.

| Token | Hex | Use |
|---|---|---|
| **Danger** | `#C21F3A` | Destructive buttons (Delete, Remove, Revoke) with white text, error text and icons on light backgrounds, danger badge fill, error input borders |
| **Danger on Dark** | `#FF7A8A` | Error text, icons and borders on Ink backgrounds |
| **Danger tint (light)** | `#FDECEE` | Background of error banners/alerts on light pages |
| **Danger tint (dark)** | `#3A1218` | Background of error banners/alerts on Ink pages |

All pass WCAG AA contrast: white on Danger is about 5.9:1, Danger on white about 5.9:1, and Danger on Dark on Ink about 7.6:1.

- **Destructive buttons:** use a Danger fill with white text only for the final "are you sure?" confirm. Everywhere else, use a quiet button (Danger text, no fill) so pages aren't full of red.
- **Errors:** always pair the color with an icon and words ("Couldn't save: …"). Never rely on color alone.
- **Badges** ("Overdue", "Missing", "Failed"): use the Danger fill with white text, or the tint background with Danger text. Keep them small.
- Don't put Danger and Record Red next to each other, and don't use Danger for anything decorative.

### Type on the web
- **Lexend** for everything people *read*: headings in SemiBold, body in Regular, and labels and eyebrow text in ALL CAPS Medium with wide tracking (+11–18%).
- **Geist Mono for data that must line up or updates live:**
  - timecodes and durations (`00:12:48:15`, `4:32`)
  - countdowns and timers, including the teleprompter's clock, elapsed time and word/line counters
  - live counts and numbers in table columns
  - IDs, codes and file names (`EP-0925`, checkout codes)
- Always turn on tabular figures (`font-variant-numeric: tabular-nums`).
- **The teleprompter script itself stays in Lexend.** Lexend was designed for reading ease, and that's exactly what a prompter needs. Only its numbers and timers are mono.
- **Static numbers inside sentences or headings stay Lexend** ("5 announcements", "Class of 2027"). Use mono only when the number is data to scan, compare or watch tick.
- Match Geist Mono's size so its lowercase letters line up with Lexend's (usually about 0.9× the Lexend size). Use Regular or Medium, and never Mono for headings or buttons.
- Anything else, like a third font, a serif, or a different mono, is off-brand.

| Style | Size / line height | Weight | Tracking |
|---|---|---|---|
| Display (landing hero) | 48–56px / 1.05 | SemiBold 600 | −2% |
| H1 (page title) | 32–36px / 1.1 | SemiBold 600 | −2% |
| H2 (section) | 24–28px / 1.15 | SemiBold 600 | −1% |
| H3 (card title) | 18–20px / 1.25 | SemiBold 600 | −1% |
| Body | 15–16px / 1.5 (14px in dense tools) | Regular 400 | 0 |
| Small / metadata | 13px / 1.4 | Regular 400 | 0 |
| Label, eyebrow, table header, tag | 11–12px / 1.2, ALL CAPS | Medium 500 | +11% (labels) to +18% (eyebrows) |
| Data | 0.9× neighbouring size | Geist Mono 400/500 | 0, tabular |

Keep lines of body text under about 70 characters. Use sentence case for headings, buttons, and menu items.

### Spacing and layout
- Use a 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Page gutter: 16px on phones, 24px from 768px. Keep content at a maximum of about 1280px wide (about 720px for reading pages).
- Card padding is 16–24px. Put 16–24px between cards and 32–48px between sections.
- Breakpoints: 640, 768, 1024 (sidebar appears), 1280.
- Design at phone width first. Wide tables scroll inside their own container, never the whole page.

### The arc corner = a signature, used sparingly
- **Use it on the few big "plate" pieces:** the hero/header banner, section title bars, featured story cards, and the active nav tab. That's usually 1–3 per screen.
- **One curved corner, the other three square.** Put the curve on the top-right for left-aligned elements, or the top-left for right-aligned or mirrored ones.
- **Cap the curve size.** On TV the curve is as tall as the bar because the bars are short. On the web, use a fixed radius instead: **32px** (24px on phones, 48px on very large hero panels, about 14px on a nav item). Never let a tall card get a curve as tall as the card.
- **Don't use it on everyday UI.** Buttons, text fields, dropdowns, checkboxes, tables, tags, tooltips, modals and small list cards all use **one consistent small radius: 6px** (4px for tiny tags).
- Never round all four corners into a pill or blob. Circles are only for avatars, status dots, spinners, and toggle switches. Never add an outline or stroke along the arc.
- **The web nameplate:** a page header is an Ink 2 plate with the arc corner and a 4px InFocus Green strip along the bottom. It's the lower third, flattened: an eyebrow, a SemiBold headline, and at most one line of Mist text.

### Components

| Component | Recipe |
|---|---|
| **Primary button** | 36px tall (32 small, 40 large), 16px side padding, 6px radius, Lexend Medium 14px, InFocus Green fill, white text. Hover `#0E7D47` (light `#085A32`). One per view. |
| **Secondary / outline / ghost** | Same size. Outline: 1px line, transparent fill, Ink 3 on hover. Ghost: no border. |
| **Quiet destructive** | Outline style with Danger text; tint on hover. |
| **Destructive confirm** | Danger fill, white text. Only inside the "are you sure?" step. |
| **Text field / select** | 36px tall, 6px radius, 1px field border (`#6B726D` dark / `#7F8782` light), transparent fill, 16px text on phones (prevents iOS zoom). Focus: 2px Green on Dark ring. Error: Danger border, and a message below with an icon. |
| **Card** | Ink 2 on Ink (White on Mist 20 in light), 1px line, 6px radius, no shadow. |
| **Table** | Header row in label style (caps, muted). 1px row lines, no zebra stripes. Numbers right-aligned in Geist Mono. The row hover is the Ink 3 fill. |
| **Tag / badge** | 4px radius, 2px × 8px padding, label style 11px. Success: green tint + Green on Dark text. Warning: amber tint + amber. Danger: Danger tint + Danger text. Neutral: Ink 2 + Mist. |
| **Tabs / nav** | Active item: InFocus Green fill with white text (a sidebar item may take a small single arc) or a 2px green underline. Inactive items use muted text, with Ink 3 on hover. |
| **Alert / banner** | Tint background, a 1px line in the same hue, an icon, and plain words. |
| **Dialog** | Ink 2 panel, 6px radius, black scrim at 60% (no blur), title in H3 style. The primary action goes on the right. |
| **Tooltip / menu** | Ink 2 with a 1px line, 6px radius, 13px text. |
| **Empty state** | The icon (monochrome, 48–64px), one SemiBold line, one Mist line, and one primary button. |
| **Loading** | Skeleton blocks in Ink 3 pulsing opacity, or a spinner. Turning the icon (±30°) is allowed for a full-page load. |
| **LIVE / recording** | An Ink tag with the one Record Red dot, and the word LIVE in label style. |

### Motion on the web
- Use the same easing curves (section 5), but shorter: 150–300ms for UI, and up to about 600ms for a hero entrance.
- Entrances are an 8px rise plus a fade on ease out. Things never fly in from off-screen.
- The icon turn (±30°) is for the logo only, like a loading state or page intro. Don't rotate other UI.
- Respect "reduce motion" settings.

### Accessibility
- Text contrast must pass WCAG AA: 4.5:1 for body text and 3:1 for large text. Every *text* pairing in this document passes when used as described.
- The plain line color (`#2B302B` / `#D5DCD7`) is only for decorative dividers and card edges. Borders that show where a control is (text fields, checkboxes) need 3:1: use `#6B726D` on dark and `#7F8782` on light.
- Every control needs a visible focus ring. Touch targets are at least 40px (44px is better).
- Status is never color alone: use an icon, a word, or both.

---

## 11. Slides and presentations

Use this section for class decks, pitch decks, info-night slides, and anything shown on a projector or the set TVs. Build at **1920 × 1080 (16:9)**. In Google Slides, that's the default "Widescreen 16:9". Install Lexend and Geist Mono first; both are free on Google Fonts (in Google Slides, use Font → More fonts).

### Two looks
- **Ink deck (default):** Ink background, white titles, Mist body text, and a Green band for emphasis. Use it for anything projected, on TV, or on screen.
- **Light deck:** white background, Ink titles, `#4B524D` body text, and InFocus Green for kickers, bullets, and bands. Green on Dark is never used on white. Use it for decks that will be printed or read as a handout.

### Grid
- Margins are **120px** on every side. Content sits on a 12-column grid with 24px gutters.
- **Header band** (from the announcement card): at the top left, a red dot and an ALL CAPS kicker (Lexend Bold 32–38px, Green on Dark, +18% tracking). At the top right, the white wordmark about 70px tall. Below both, a 3px white rule at 30% opacity, about 200px from the top. On a light deck, the rule is Ink at 15% and the wordmark is the color one.
- Put the page number bottom-right in Geist Mono 20px, in Mist at 60%. It's optional.

### Type scale (1080p)

| Element | Size | Weight / color |
|---|---|---|
| Title slide headline | 116–140px | SemiBold, white, −2% |
| Slide title | 72–96px | SemiBold, white, −2% |
| Kicker / section label | 32–38px, ALL CAPS | Bold or Medium, Green on Dark, +18% |
| Body / bullets | 40–64px | Regular, Mist |
| Big stat | 160–220px | SemiBold, white |
| Stat label | 28–32px, ALL CAPS | Medium, Mist, +11% |
| Captions, sources | 24–28px | Regular, Mist at 70% |

- **Nothing smaller than 24px.** On the set TVs a slide is seen at about half size, so for TV slides use body text of 56px or more.
- **At most 5 bullets, as short phrases.** Bullets are Green on Dark dots. If it doesn't fit at 80% size, split it into two slides.
- Keep each slide to two weights.

### Slide types
1. **Title:** Ink. The icon centered (300px) or the wordmark (about 1180px wide), with a headline and one Mist line below. The red dot is the only red.
2. **Section divider:** Ink, with one InFocus Green plate across the lower third. The plate has the arc corner (top-right, about 48px) and holds the section number as a kicker and the section title in white. This is the lower third at slide scale.
3. **Content:** the header band, a slide title, then 3–5 bullets, or a two-column split with bullets on the left and an image on the right.
4. **Big number:** one stat, its label, and one line of context.
5. **Image:** a full-bleed photo or footage frame, with the title on an Ink plate (arc corner and green strip) in the lower-left. Don't put text straight on a busy photo.
6. **Quote:** the quote in SemiBold 64–72px white (no italics, no giant quote marks), and the name and role underneath as a lower third (Ink plate, Green role strip).
7. **QR / link:** the QR code on a white 440px card with 14px corners, and the URL in SemiBold Green on Dark with +6% tracking.
8. **Closing:** the same as the title slide, with the white wordmark and **infocusnews.tv**.

### Charts on slides and dashboards
- Series colors, in order: Green on Dark `#2BB36E` (on light, InFocus Green `#0B6E3E`), Mist `#DCE2DE` (on light, `#8F9892`), deep green `#08492A` (on light, `#7FC9A2`), then Amber `#F2A516` only to highlight one thing.
- Never use Record Red. Use Danger only for a value that's actually bad.
- Draw flat: no 3D, no gradients, no shadows. Use thin Ink 3 gridlines or none.
- Label values and series directly instead of using a legend where you can. Axis labels are in label style; numbers are in Geist Mono.

### Animation
Use a dissolve (ease in-out) or a wipe between slides. Build bullets in one at a time on ease out. Don't use spins, bounces, zooms, or "fly in". If the logo animates, it turns ±30° as it appears.

---

## 12. Documents, print, email, and social

### Documents (Google Docs, PDFs, handouts, rubrics)
- Use the white page (light look). Put the color wordmark top-left at 1.25–1.5in wide, with clear space around it.
- Title: Lexend SemiBold 24–28pt, Ink. Headings: SemiBold 14–18pt, Ink. Labels and table headers: Medium 9pt ALL CAPS, InFocus Green, +11%. Body: Regular 10.5–11pt with 1.4 line spacing, `#0F110F` or `#4B524D`.
- Tables use thin `#D5DCD7` rules and no fills, except an optional Mist 20 header row.
- Accents: one InFocus Green rule or band. Red appears only as the logo's dot.
- For print, don't flood pages with Ink backgrounds. Use White with Ink text.

### Email
- Email clients can't load CSS variables, so use literal hexes. Use the font stack `Lexend, 'Helvetica Neue', Arial, sans-serif`.
- Layout: a 600px column. Use either an Ink background with an Ink 2 card, or white with Ink text. Put a 4px InFocus Green band under the header, which holds the wordmark (white wordmark on Ink, color wordmark on white).
- Buttons are InFocus Green with white text and a 6px radius (never pills). Labels are ALL CAPS with +11% tracking.
- No gradients, no shadows, no italics.
- The email signature logo is in `Branding & Design/Email Signature`.

### Social and thumbnails
- **YouTube thumbnail (1280 × 720):** a real frame from the package, with an Ink plate in the lower-left that has the arc corner and a green strip. The plate holds a headline of 3–5 words in Lexend SemiBold, at least 96px. Put the icon tile in one corner. Only one red dot, if any.
- **Instagram post (1080 × 1350) and story (1080 × 1920):** the same plate system. Keep text out of the top and bottom 250px on stories (UI overlaps there). Handles: **@infocusnews** (Instagram, YouTube), **@palyinfocus** (TikTok, X), and **infocusnews.tv**.
- **Profile pictures:** `Icon/infocus-channel-avatar-1800.png` only.

### Signage, posters, and the set TVs
- Use the Ink look with a 120px margin, a headline of 116px or more at 1080p (scale up for print), and a QR code on a white card.
- For the set TVs, check it at half size. When nothing else is up, the TVs show the TV standby (section 6).

---

## 13. Token reference

Copy this into any new web project. The values match InFocus Portal and InFocus Drive exactly.

```css
/* Fonts: https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap */
:root {
  /* Brand */
  --ink: #0F110F;            /* Ink */
  --green: #0B6E3E;          /* InFocus Green: fills, white text on it */
  --green-hover: #0E7D47;
  --green-on-dark: #2BB36E;  /* text and small marks on Ink */
  --record-red: #EE3A2A;     /* the dot only */
  --mist: #DCE2DE;
  --on-brand: #FFFFFF;

  /* Danger */
  --danger: #C21F3A;
  --danger-text: #FF7A8A;
  --danger-tint: #3A1218;

  /* Surfaces (dark) */
  --bg: #0F110F;
  --surface: #1A1D1A;
  --surface-hover: #252925;
  --line: #2B302B;
  --text: #FFFFFF;
  --text-2: #DCE2DE;
  --text-muted: #A3ABA6;
  --accent-text: #2BB36E;    /* green text */
  --focus: #2BB36E;
  --warning: #F2A516;

  /* Type */
  --font-sans: "Lexend", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, Menlo, monospace;

  /* Shape */
  --radius: 6px;
  --radius-sm: 4px;
  --arc: 24px;               /* 32px from 640px; 48px on very large heroes */

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-back-out: cubic-bezier(0.34, 1.56, 0.64, 1); /* the red dot only */
  --duration: 200ms;
}
@media (min-width: 640px) { :root { --arc: 32px; } }

.light {
  --bg: #F4F6F5;
  --surface: #FFFFFF;
  --surface-hover: #E9EEEB;
  --line: #D5DCD7;
  --text: #0F110F;
  --text-2: #4B524D;
  --text-muted: #535A55;
  --accent-text: #0B6E3E;
  --focus: #0B6E3E;
  --green-hover: #085A32;
  --danger-text: #C21F3A;
  --danger-tint: #FDECEE;
  --warning: #B45309;
}

body { background: var(--bg); color: var(--text); font: 400 15px/1.5 var(--font-sans); }
.plate { background: var(--surface); border-bottom: 4px solid var(--green); border-radius: 0 var(--arc) 0 0; }
.eyebrow { font: 500 12px/1.2 var(--font-sans); letter-spacing: .18em; text-transform: uppercase; color: var(--accent-text); }
.btn-primary { background: var(--green); color: var(--on-brand); border-radius: var(--radius); height: 36px; padding: 0 16px; font-weight: 500; }
.data { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.rec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--record-red); }
```

**Tailwind:** map these to theme colors (`ink`, `green`, `green-on-dark`, `mist`, `danger`, …). Set every `radius` step to 6px, and set the `shadow` scale to none. Use `font-sans` for Lexend and `font-mono` for Geist Mono.

### Quick check
If a screen or slide has any of the following, it's drifting from the brand:
- more than a few arc corners
- more than one spot of red
- gradients or drop shadows
- pill-shaped buttons
- italics
- any font other than Lexend (plus Geist Mono for data)

---

## 14. InFocus Portal implementation

How sections 2–5, 10 and 13 map to the Portal's code. Tokens live in `app/globals.css`; fonts load in `app/layout.tsx`; shared components are in `components/ui/`.

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
