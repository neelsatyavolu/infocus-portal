# InFocus Design System — 2026

The visual language of InFocus, Palo Alto High School's student broadcast network: the 2026 logo, colors, type, shapes, motion, and every on-air graphic built from them. Use this to make anything new (a graphic, a thumbnail, a slide, a web page) look like it belongs.

**Where to look:**
- Brand basics (everyone): sections 1–5 and 9
- On-air graphics: sections 6–8
- Websites and apps: section 10 (Portal code: section 14)
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

The icon carries the system: it sits in the square Ink **tile** at the end of every nameplate, the **red dot** is the "live" accent, and the **aperture** is the outro's closing move.

### Files (`01 Logos`)
| File | Use |
|---|---|
| `Wordmark/infocus-wordmark-color.png` | Default, on white or light backgrounds |
| `Wordmark/infocus-wordmark-white.png` | On dark footage or Ink (Soft White letters, green "in", red dot) |
| `Wordmark/infocus-wordmark-on-black.png` | Color wordmark pre-set on a black field |
| `Wordmark/infocus-wordmark-mono-black.png` / `-mono-white.png` | One-color uses (print, embossing, busy photos) |
| `Icon/infocus-icon-color.png` / `-white.png` | Square spaces, watermarks, nameplate tile |
| `Icon/infocus-channel-avatar-1800.png` | YouTube / Instagram / TikTok profile picture |
| `Favicon/favicon-16/32/512.png` | Browser tabs and app icons |

Wordmark masters are 4107 × 1100 px, and the icon is 1024 px. The email signature logo is in `Branding & Design/Email Signature`.

Every "white" version of the logo (white wordmark, on-black, mono-white, white icon, avatar, favicons) uses **Soft White `#ECEFEA`**, not pure `#FFFFFF`. Pure white letters read harsh on screen. The pure-white originals are kept in `_Working Files/Logo Backups (pure white, before 2026-09-26)`.

### Rules
- **Clear space:** keep empty space around the logo at least the diameter of the red dot on every side.
- **Minimum size:** wordmark 120 px wide on screen (0.75 in in print). Below that, use the icon.
- **Don't** recolor the parts, swap the red dot for another color, stretch, rotate, add shadows/outlines/glows, rebuild the lettering in another font, or put the color wordmark on mid-tone or busy backgrounds. Use the white or mono version there.
- Old logos (`Branding & Design/Old Logos`, `Show Resources/Old Graphics`) are retired.

---

## 2. Color

| Token | Hex | Role |
|---|---|---|
| **Ink** | `#0F110F` | Primary dark for on-air graphics, slides, print and email: plates, cards, TV standby, the "f"/"cus" of the logo. Use instead of pure black there. Screens use a true-black canvas instead (section 10). |
| **InFocus Green** | `#0B6E3E` | Primary brand color. Role strips, panels, the logo's "in" and ring. Carries Soft White text. |
| **Green on Dark** | `#2BB36E` | Brighter green for *text and small marks on Ink*: kickers, bullets, URLs. Never a large fill. |
| **Record Red** | `#EE3A2A` | Accent only: the record dot and small "live" markers. Never text, never large areas. |
| **Soft White** | `#ECEFEA` | Every "white" on dark: names, titles, primary text, and the white parts of the logo. Never pure `#FFFFFF` for text or the logo. Pure white is still fine as a *background* (light pages, the white card behind a QR code). |
| **Mist** | `#DCE2DE` | Secondary text on dark: announcement points, taglines. |
| Dot (unlit) | `#2E1412` | Only in the outro, the record dot before it lights. |

**Balance:** mostly Ink, a band of Green, one touch of Red. If red is in more than one spot on screen, it's too much.
**Contrast:** Soft White on Ink (about 16:1) and on InFocus Green (about 5.5:1) both pass WCAG AA for text. Don't put Green-on-Dark text on InFocus Green.
**Errors and delete buttons** don't use Record Red. Interfaces use the separate Danger colors in section 10.
**Screens** (the Portal and other web interfaces) use these colors as accents on a true-black canvas, and swap them during the holiday seasons. See section 10.

---

## 3. Typography

**Lexend** is the brand typeface (`02 Fonts`: Regular 400, Medium 500, SemiBold 600, Bold 700) for on-air graphics, slides, documents, email and social: every name, title, label and sentence. It's the only typeface in the on-air graphics.

**Geist Mono** is the one allowed companion there, for *data only*: timecodes, timers, counts that change live, IDs and codes. Lexend's digits are all different widths and it has no tabular-figures option, so changing numbers set in Lexend shift side to side. Install both on every editing computer first; the `Install … Graphics` files inside the InFocus 2026 Package folder do it for you.

**Screens use the Geist family instead:** Geist for words, Geist Serif for page titles, Geist Mono for data. Section 10 has the details. The table below is for on-air graphics, slides and print.

| Use | Weight | Style |
|---|---|---|
| Names, headline titles | SemiBold 600 | Tight tracking (−1 to −2%), sentence or title case |
| Roles, labels, kickers | Medium 500 / Bold 700 | **ALL CAPS**, wide tracking (+11% roles, +18% kickers) |
| Body, bullet points, handles | Regular 400 / Medium 500 | Normal tracking |
| URLs | SemiBold 600 | +6% tracking, Green on Dark |

Keep it to two weights per graphic. Don't use italics, underlines, or all-caps for names.

---

## 4. Shape language

- **Square corners.** Nameplates, plates, panels and cards have **square corners** on air, on slides and on thumbnails. (Until Sept 2026 the plates had one curved corner. It was dropped because a single rounded edge looked odd.) The only round shapes are the logo itself and small dots: the record dot, bullets and status dots. Screens have their own radius scale (section 10).
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
- Entrances take about 1.0 s, with the pieces landing one after another (tile, then plate, strip, name and role) so each step reads. Exits take about 0.7 s. Leave on-screen time to the editor. The templates keep their in/out timing however long the clip is stretched.

---

## 6. On-air graphics

All are 1920 × 1080. MOGRT (Premiere) and `.drfx` (DaVinci Resolve) versions match the rendered ProRes versions.

### Lower third (`05 Lower Thirds`)
- Ink tile (126 px, icon inside) + Ink name plate (81 px tall) + Green role strip (45 px tall). All corners square.
- Name: Lexend SemiBold 45 px, Soft White. Role: Medium 20.8 px, ALL CAPS, +11% tracking.
- Bottom-left: 150 px from the left, bottom edge on y = 972.
- **In:** the tile opens from its center, then the icon turns into place, the plate wipes out, the name rises in, and the strip and role follow. **Out** is the reverse, ending with the icon turning away and the tile closing.
- **Length:** 5.3 s from open to close by default: about 1.0 s in, 3.5 s readable, and 0.7 s out. The templates can be stretched, and the in and out keep their timing.
- A ready-made transparent clip for everyone on staff is in `Roster (ProRes)`.

### Dual third (`06 Dual Thirds`)
- Two lower thirds, the right one mirrored (tile on the outside), each 290 px in from its edge so it sits under its anchor.
- Both plates share one width (the wider of the two) so the pair looks balanced. Same timing and 5.3 s default length as the lower third.

### Announcement (`07 Announcements`)
- A full-frame Ink card, made to be seen on the set TVs (about 58% size), so the type is large.
- Header: red dot + **ANNOUNCEMENTS** kicker (Bold 38 px, Green on Dark, +18%) on the left, Soft White wordmark (70 px tall) on the right, with a 3 px Soft White rule at 30% opacity under it. Margins are 120 px.
- Title: SemiBold 116 px, Soft White. Points: Regular 64 px, Mist, with Green-on-Dark bullet dots. **Up to 5 points, short phrases.** Text shrinks to at most 80% to fit, and past that the card should be split into two.
- Optional image on the right (e.g. a QR code) on a pure white 440 px card with 14 px corners (QR codes need true white to scan).
- **Sequence:** the card is solid from the first frame to the last. It opens on the centered icon (the TV Standby frame), the icon turns away, then the header, rule, title and points build in. At the end the content fades and the icon turns back in and holds, ending on the TV Standby frame again. Full screen over footage, the editor adds a short dissolve at each end.

### TV standby (`09 TV Standby`)
- Ink with the icon centered (300 px). It's exactly the first and last frame of the announcement.
- The Left/Right set TVs show this whenever no announcement is up, so they **never show the blue key color**. On the TVs, an announcement reads as logo → announcement → logo, with no pop.
- **Live setup:** the TriCaster holds the sets and this still; the announcements come from a Premiere laptop over NDI. Because each announcement starts and ends on this exact frame, the TriCaster cuts its TVs from the still to the NDI feed (parked on the announcement's first frame) and back with no flash. In the Premiere sequence the TV Standby sits on V1 so the gaps between announcements show the logo, not black.

### Follow InFocus (`08 Follow InFocus`)
- A corner card at the **top left** (x 48, y 40): Ink tile + Ink "Follow InFocus" plate (square, like the lower third), with a Green panel below listing the handles in Soft White Medium 26 px:
  - Instagram + YouTube **@infocusnews**
  - TikTok + X **@palyinfocus**
  - Web **infocusnews.tv**
- Transparent ProRes 4444, 7 s. It opens exactly like a lower third (logo square, then the plate and a green strip wipe out), then the logo column and green panel unroll down together as one block while the handles land. The exit is the reverse: the column and panel roll up together, the strip and plate wipe back, and the square closes on the logo. The column and panel always share one bottom edge, so the card never shows stepped shapes.

### Intro (`03 Intro & Outro`)
- 13.8 s, 1080p. A fast, music-cut montage of our own footage (spirit week, packages, drone, class photos) that lands on the 2026 wordmark on the music hit. It holds the logo, then fades to black over the last 0.5 s as the music ends, so the switcher cuts from black to the studio.

### Outro (`03 Intro & Outro`)
- On black: the Soft White wordmark (1180 px wide) reveals left to right with the original InFocus outro music, and the red dot lights on the music's peak (1.32 s).
- Below it: "Palo Alto High School's Student Broadcast Network" (Regular 32 px, Mist) and **infocusnews.tv** (SemiBold 38 px, Green on Dark). The legal line "© 2026 InFocus and Palo Alto High School" sits on title-safe.
- **Ending:** the dot fades fully out, the frame closes like an aperture into the "o", then fades to black.

---

## 7. Virtual sets (`04 Virtual Sets`)

Three still backgrounds (1920 × 1080 PNG) for the switcher, keeping the classic three-camera layout:

- **Middle:** two-anchor desk, with a wide window onto **Paly's Tower Building** behind. The window and slat walls run to the top of frame, with no header bar across the top. The desk follows the 2024 set's footprint (deep top, ends curving toward the camera) so the anchors' arms rest on it instead of floating.
- **Left / Right:** angled views (about 28°) of the same room with the curved round desk, each with a TV on a floor stand. The TV screens are pure key blue `#0047BB`, at Left x 57–1176, y 114–739 and Right x 743–1860, y 110–738, the same pixels as the old sets.
- **No header bar on any angle:** the windows and slat walls run past the top of frame in all three shots, with no ceiling soffit.
- Materials: warm light-wood slat walls with thin InFocus Green reveals, gray desk with a curved front edge, and daylight through the windows. The brand colors only appear as accents, so the anchors stand out.

---

## 8. Formats & delivery

| Asset | Format |
|---|---|
| Intro / outro | 1080p H.264 MP4, high bitrate |
| Lower thirds, Follow InFocus | ProRes 4444 with alpha (transparent), 1080p, 29.97 fps |
| Announcements | ProRes 4444, 1080p, 29.97 fps, fully opaque (starts and ends on the TV Standby frame) |
| Editable templates | `.mogrt` (Premiere), `.drfx` (DaVinci Resolve) |
| Virtual sets, TV standby | 1920 × 1080 PNG |
| Logos | PNG with transparency |

Show frame rate is 29.97 fps (59.94 for studio recordings).

---

## 9. Making something new

1. Start from Ink, add one Green element, and use Red only once (or not at all). On screens, start from true black and let InFocus color be the one accent (section 10).
2. Use Lexend, with SemiBold for the main line and CAPS Medium for labels. Screens use Geist in sentence case instead.
3. Keep broadcast containers square. Screens use the radius scale in section 10, and never a single curved corner.
4. Animate it in pieces with the easings above, and turn the icon when it appears.
5. Check it on the actual footage or set, and at the size it'll really be seen (a TV on set is about half size).
6. For show graphics, edit `graphics.html` and re-run the render scripts rather than editing renders by hand. See the package README.

---

## 10. Web and interfaces (InFocus Portal, InFocus Drive, infocusnews.tv, dashboards)

Screens people use get a quieter look than the on-air graphics: a true-black canvas, depth from small steps in brightness and thin hairlines, Geist type with a Geist Serif page title, and a white primary button. InFocus color is the one accent. It marks the accent button, links, focus rings, the selected tab and row, and small status marks. In a holiday season the same tokens swap it for the season's colors.

The broadcast rules in sections 3–6 (Lexend, square plates, ALL CAPS kickers, the green strip) stay on air, on slides, in print and in email. They don't carry over to UI. The CSS in section 13 is the starting point for any new site.

### Surfaces and color

The Portal follows the device's light or dark setting by default (System). Settings → Appearance can pin Light or Dark.

| Role | Dark | Light |
|---|---|---|
| Canvas | `#000000` | `#FCFCFD` |
| Card (level 1) | `#0A0A0C` | `#FFFFFF` |
| Elevated (level 2: secondary buttons, chips, menus, popovers) | `#111114` | `#F4F5F7` |
| Hover fill | `#161619` | `#EEEEF0` |
| Hairline (row dividers, nav edges) | white at 6% | black at 6% |
| Strong hairline (card, input and button edges) | white at 14% | black at 12% |
| Primary text | `#FCFDFF` | `#0A0A0C` |
| Body text (long prose) | `#C4C6C8` | `#4B4E50` |
| Muted text (metadata, labels, placeholders) | `#A1A4A5` | `#5F6366` |
| Primary button | `#FCFDFF` fill, black text, hover `#E3E5EA` | `#0A0A0C` fill, `#FCFDFF` text, hover `#26262B` |
| Accent fill (accent button, switches, progress) | InFocus Green `#0B6E3E` + Soft White, hover `#0E7D47` | InFocus Green `#0B6E3E` + Soft White, hover `#085A32` |
| Brand text, links, icons, focus ring | Green on Dark `#2BB36E` | InFocus Green `#0B6E3E` |
| Brand tint (selected row, success tag) | `#2BB36E` at 12% | `#0B6E3E` at 8% |
| Warning (UI only) | Amber `#F2A516` | `#B45309` |
| Record Red | `#EE3A2A`, dot only | `#EE3A2A`, dot only |

- **Depth is brightness plus a hairline.** Canvas, then card, then elevated. No shadows, glows, gradients, blur or glass. The one exception is a flat black scrim at 60% behind dialogs and over video that needs legible text.
- **Keep brand color small**, about 3% of the screen at most. Big green panels, headers, bands and strips become cards.
- Green on Dark is for text and small marks, never a fill. Never put it on InFocus Green.
- Record Red is only a tiny marker, like a LIVE or rec dot. Never use it for buttons, errors or large areas.
- Use tokens, not hexes, in UI chrome, so Light mode and the seasons work. Never hardcode the old green-tinted Inks (`#0F110F`, `#1A1D1A`, `#252925`) or the green hexes there. Hexes are fine inside on-air graphics, video overlays, canvases and OG images.

### Seasons

The holiday seasons swap the brand colors through the same tokens. Surfaces, text, type and the white primary button stay the same.

| Season | When | Replaces Green on Dark | Replaces InFocus Green | Replaces Record Red |
|---|---|---|---|---|
| Halloween | Oct 15–31 | Pumpkin `#FF7A1A` (light: `#B4440A`) | Deep Pumpkin `#B4440A` | Witch Purple `#9B5CFF` |
| Thanksgiving | November | Harvest Gold `#F2A93B` (light: `#9A4A10`) | Maple `#A4471C` | Cranberry `#C23A52` |

- Approved and success tags stay green in every season so they never read as warnings.
- The seasonal art (pumpkins, turkeys, bats, the seasonal logos, easter eggs and their animations) keeps its own look. Only the chrome around it (dialogs, buttons, cards) follows this section.

### Danger colors (errors, destructive actions, warning badges)
Record Red is a *brand* color and stays reserved for the dot. For "something is wrong / this will delete something", interfaces use a separate **Danger** set: a cooler crimson that reads as an alert, not as InFocus branding.

| Token | Hex | Use |
|---|---|---|
| **Danger** | `#C21F3A` | The final destructive confirm with Soft White text, error text and icons on light backgrounds, error input borders |
| **Danger on Dark** | `#FF7A8A` | Error text, icons and borders on dark backgrounds |
| **Danger tint (light)** | `#FDECEE` | Background of error banners and danger tags on light pages |
| **Danger tint (dark)** | `#2A0E13` | Background of error banners and danger tags on dark pages |

All pass WCAG AA contrast: Soft White on Danger is about 5.1:1, and Danger on white about 5.9:1.

- **Destructive buttons:** use the Danger fill only for the final "are you sure?" confirm. Everywhere else, use the quiet destructive button (Danger text on the elevated surface) so pages aren't full of red.
- **Errors:** always pair the color with an icon and words ("Couldn't save: …"). Never rely on color alone.
- **Tags** ("Overdue", "Missing", "Failed"): the Danger tint with Danger text.
- Don't put Danger and Record Red next to each other, and don't use Danger for anything decorative.

### Type on the web
- **Geist** for everything people read: body, labels, buttons, headings.
- **Geist Serif** (Regular 400) for page titles and hero headlines only, at 40px or larger. Below 40px a heading is Geist Medium. Dense tool screens (teleprompter run mode, the review player, the grade editor grid) can use an 18–22px Geist title instead.
- **Geist Mono for data that must line up or updates live:**
  - timecodes and durations (`00:12:48:15`, `4:32`)
  - countdowns and timers, including the teleprompter's clock, elapsed time and word/line counters
  - live counts and numbers in table columns
  - IDs, codes, versions and file names (`EP-0925`, checkout codes)
- Always turn on tabular figures (`font-variant-numeric: tabular-nums`).
- **Static numbers inside sentences or headings stay Geist** ("5 announcements", "Class of 2027"). Use mono only when the number is data to scan, compare or watch tick. Never use mono for headings or buttons.
- **Sentence case everywhere:** headings, buttons, menu items, labels, eyebrows, tags and table headers. No ALL CAPS tracked labels. The exceptions are the wordmark, LIVE and REC markers, keyboard keys, and anything rendered into video or on-air output (live overlays, scoreboards, lower thirds, OG images, the teleprompter script).
- Two weights: Regular 400 for body, Medium 500 for headings, labels and buttons. Don't use SemiBold or Bold for emphasis.
- Lexend, other serifs and other monos are off-brand in UI.

| Style | Size / line height | Font and weight | Tracking |
|---|---|---|---|
| Hero headline | 48–72px / 1.0 | Geist Serif 400 | −2% |
| Page title (H1) | 40–48px / 1.0 | Geist Serif 400 | −2% |
| Section heading (H2) | 18–22px / 1.3 | Geist 500 | −1.5% |
| Card title (H3) | 15–16px / 1.4 | Geist 500 | −1% |
| Body | 14–15px / 1.5 | Geist 400 | 0 |
| Small, metadata, label, eyebrow, table header | 12–13px / 1.4 | Geist 500, muted | 0 |
| Tag | 12px / 1.33 | Geist 500 | 0 |
| Data | 0.9× neighbouring size | Geist Mono 400/500 | 0, tabular |

Keep lines of body text under about 65 characters.

### Spacing and layout
- Use a 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Page gutter: 16px on phones, 24px from 768px. Keep content at a maximum of about 1280px wide (about 720px for reading pages).
- Card padding is 16–24px. Put 16–24px between cards and 32–48px between sections.
- Breakpoints: 640, 768, 1024 (sidebar appears), 1280.
- Design at phone width first. Wide tables scroll inside their own container, never the whole page.

### Corners

| Radius | Use |
|---|---|
| 6px | Small parts inside a control: menu items, segments, keyboard keys, skeleton bars |
| 8px | Buttons, text fields, selects, tooltips |
| 12px | Cards, panels, page headers, dialogs, popovers, media wells, alerts |
| Full | Tags, badges, avatars, dots, switches, progress bars |

- Never round only one corner.
- Full-bleed pieces stay square: edge-to-edge bars, the sidebar, video that fills the viewport.
- The square Ink plate with a green strip is a broadcast shape. On the web the page header is a 12px card.

### Components

| Component | Recipe |
|---|---|
| **Primary button** | 36px tall (32 small, 40 large), 16px side padding, 8px radius, Geist Medium 14px. White fill with black text in Dark, black with white in Light. One per view, placed last. |
| **Accent button** | Same shape, brand fill (InFocus Green, or the season's fill) with Soft White text. For the single most important action on a page: Submit, Send to queue, Start show, Approve. Use it *instead of* the primary, never beside it, and at most once per view. |
| **Secondary / outline** | Same size. Elevated surface, 1px strong hairline, hover fill. Sits beside a primary. |
| **Ghost** | Text only, hover fill. Toolbars, icon buttons, tertiary actions. |
| **Quiet destructive** | Danger text on the elevated surface, Danger tint on hover. |
| **Destructive confirm** | Danger fill, Soft White text. Only inside the "are you sure?" step. |
| **Link** | Brand text, underline on hover. |
| **Text field / select** | 36px tall, 8px radius, 1px field border, card fill, 16px text on phones (prevents iOS zoom). Focus: a ring-colored border and a 3px ring at 30%. Error: Danger border, and a message below with an icon. |
| **Card** | Card surface on the canvas, 1px strong hairline, 12px radius, no shadow. |
| **Table** | Header cells 13px Geist Medium, muted, sentence case. Hairline row dividers, no zebra stripes. Numbers right-aligned in Geist Mono. Row hover is a faint fill; the selected row gets the brand tint. |
| **Tag / badge** | A pill: 2px × 8px padding, Geist Medium 12px, sentence case, a 1px border in its tone. Success: brand tint and brand text. Warning: amber tint and amber. Danger: Danger tint and Danger text. Neutral: elevated surface and body text. Muted: no fill. |
| **Eyebrow** | 13px Geist Medium, muted, sentence case, above a title. Brand-colored only when it marks something. |
| **Tabs / nav** | Active: foreground text and a 1px brand underline. Inactive: muted text, foreground on hover. In a segmented control the active segment is an elevated pill with a strong hairline. |
| **Alert / banner** | Tint background, a 1px line in the same hue, an icon, and plain words. 12px radius. |
| **Dialog** | Card surface, strong hairline, 12px radius, black scrim at 60% (no blur), title in section-heading style. The primary action goes on the right. |
| **Tooltip / menu** | Elevated surface with a strong hairline, 13px text. Tooltips 8px radius, menus and popovers 12px. |
| **Empty state** | A monochrome icon (48–64px), one Geist Medium line, one muted line, and one primary button. |
| **Loading** | Skeleton blocks in the elevated or hover fill with a pulsing opacity, or a spinner. Turning the icon (±30°) is allowed for a full-page load. |
| **LIVE / recording** | A neutral tag with the one Record Red dot and the word Live. |

### Motion on the web
- Hover and focus changes take 150ms on `cubic-bezier(0.2, 0, 0, 1)`.
- Entrances use the ease out curve from section 5: 150–300ms for UI, up to about 600ms for a hero. An entrance is an 8px rise plus a fade. Things never fly in from off-screen.
- The icon turn (±30°) is for the logo only, like a loading state or page intro. Don't rotate other UI.
- Respect "reduce motion" settings.

### Accessibility
- Text contrast must pass WCAG AA: 4.5:1 for body text and 3:1 for large text. Every *text* pairing in this section passes when used as described.
- Hairlines are for decorative dividers and card edges. Borders that show where a control is (text fields, checkboxes) need 3:1 against their background.
- Every control needs a visible focus ring. Touch targets are at least 40px (44px is better).
- Status is never color alone: use an icon, a word, or both.

---

## 11. Slides and presentations

Use this section for class decks, pitch decks, info-night slides, and anything shown on a projector or the set TVs. Build at **1920 × 1080 (16:9)**. In Google Slides, that's the default "Widescreen 16:9". Install Lexend and Geist Mono first; both are free on Google Fonts (in Google Slides, use Font → More fonts).

### Two looks
- **Ink deck (default):** Ink background, Soft White titles, Mist body text, and a Green band for emphasis. Use it for anything projected, on TV, or on screen.
- **Light deck:** white background, Ink titles, `#4B524D` body text, and InFocus Green for kickers, bullets, and bands. Green on Dark is never used on white. Use it for decks that will be printed or read as a handout.

### Grid
- Margins are **120px** on every side. Content sits on a 12-column grid with 24px gutters.
- **Header band** (from the announcement card): at the top left, a red dot and an ALL CAPS kicker (Lexend Bold 32–38px, Green on Dark, +18% tracking). At the top right, the white (Soft White) wordmark about 70px tall. Below both, a 3px Soft White rule at 30% opacity, about 200px from the top. On a light deck, the rule is Ink at 15% and the wordmark is the color one.
- Put the page number bottom-right in Geist Mono 20px, in Mist at 60%. It's optional.

### Type scale (1080p)

| Element | Size | Weight / color |
|---|---|---|
| Title slide headline | 116–140px | SemiBold, Soft White, −2% |
| Slide title | 72–96px | SemiBold, Soft White, −2% |
| Kicker / section label | 32–38px, ALL CAPS | Bold or Medium, Green on Dark, +18% |
| Body / bullets | 40–64px | Regular, Mist |
| Big stat | 160–220px | SemiBold, Soft White |
| Stat label | 28–32px, ALL CAPS | Medium, Mist, +11% |
| Captions, sources | 24–28px | Regular, Mist at 70% |

- **Nothing smaller than 24px.** On the set TVs a slide is seen at about half size, so for TV slides use body text of 56px or more.
- **At most 5 bullets, as short phrases.** Bullets are Green on Dark dots. If it doesn't fit at 80% size, split it into two slides.
- Keep each slide to two weights.

### Slide types
1. **Title:** Ink. The icon centered (300px) or the wordmark (about 1180px wide), with a headline and one Mist line below. The red dot is the only red.
2. **Section divider:** Ink, with one square InFocus Green plate across the lower third. It holds the section number as a kicker and the section title in Soft White. This is the lower third at slide scale.
3. **Content:** the header band, a slide title, then 3–5 bullets, or a two-column split with bullets on the left and an image on the right.
4. **Big number:** one stat, its label, and one line of context.
5. **Image:** a full-bleed photo or footage frame, with the title on a square Ink plate with a green strip in the lower-left. Don't put text straight on a busy photo.
6. **Quote:** the quote in SemiBold 64–72px Soft White (no italics, no giant quote marks), and the name and role underneath as a lower third (Ink plate, Green role strip).
7. **QR / link:** the QR code on a pure white 440px card with 14px corners, and the URL in SemiBold Green on Dark with +6% tracking.
8. **Closing:** the same as the title slide, with the Soft White wordmark and **infocusnews.tv**.

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
- Layout: a 600px column. Use either an Ink background with an Ink 2 card, or white with Ink text. Put a 4px InFocus Green band under the header, which holds the wordmark (the white (Soft White) wordmark on Ink, the color wordmark on white).
- Buttons are InFocus Green with Soft White text (`#ECEFEA`) and a 6px radius (never pills). Labels are ALL CAPS with +11% tracking.
- No gradients, no shadows, no italics.
- The email signature logo is in `Branding & Design/Email Signature`.

### Social and thumbnails
- **YouTube thumbnail (1280 × 720):** a real frame from the package, with a square Ink plate in the lower-left that has a green strip. The plate holds a headline of 3–5 words in Lexend SemiBold, at least 96px. Put the icon tile in one corner. Only one red dot, if any.
- **Instagram post (1080 × 1350) and story (1080 × 1920):** the same plate system. Keep text out of the top and bottom 250px on stories (UI overlaps there); the header nameplate (icon tile and section label) may start at y = 200. Handles: **@infocusnews** (Instagram, YouTube), **@palyinfocus** (TikTok, X), and **infocusnews.tv**.
- **Profile pictures:** `Icon/infocus-channel-avatar-1800.png` only.

### Signage, posters, and the set TVs
- Use the Ink look with a 120px margin, a headline of 116px or more at 1080p (scale up for print), and a QR code on a pure white card.
- For the set TVs, check it at half size. When nothing else is up, the TVs show the TV standby (section 6).

---

## 13. Token reference

Copy this into any new web project. The values match the InFocus Portal (`app/globals.css`).

```css
/* Fonts: Geist, Geist Serif and Geist Mono (the `geist` npm package, or Google Fonts) */
:root {
  /* Brand */
  --green: #0B6E3E;          /* InFocus Green: the accent button, Soft White text on it */
  --green-hover: #0E7D47;
  --green-on-dark: #2BB36E;  /* text, links and small marks */
  --brand-tint: rgb(43 179 110 / 0.12);
  --record-red: #EE3A2A;     /* the dot only */
  --soft-white: #ECEFEA;     /* text on green and Danger fills, the logo's white */

  /* Danger */
  --danger: #C21F3A;
  --danger-text: #FF7A8A;
  --danger-tint: #2A0E13;

  /* Surfaces (dark) */
  --bg: #000000;
  --card: #0A0A0C;
  --elevated: #111114;
  --hover: #161619;
  --line: rgba(255, 255, 255, 0.06);
  --line-strong: rgba(255, 255, 255, 0.14);
  --text: #FCFDFF;
  --text-body: #C4C6C8;
  --text-muted: #A1A4A5;
  --cta: #FCFDFF;            /* primary button */
  --cta-on: #000000;
  --cta-hover: #E3E5EA;
  --focus: #2BB36E;
  --warning: #F2A516;

  /* Type */
  --font-sans: "Geist", system-ui, sans-serif;
  --font-serif: "Geist Serif", Georgia, serif;   /* page titles, 40px and up */
  --font-mono: "Geist Mono", ui-monospace, Menlo, monospace;

  /* Shape */
  --radius-sm: 6px;          /* parts inside a control */
  --radius: 8px;             /* buttons, inputs */
  --radius-lg: 12px;         /* cards, dialogs, popovers */

  /* Motion */
  --ease-ui: cubic-bezier(0.2, 0, 0, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-back-out: cubic-bezier(0.34, 1.56, 0.64, 1); /* the red dot only */
  --duration: 150ms;
}

.light {
  --bg: #FCFCFD;
  --card: #FFFFFF;
  --elevated: #F4F5F7;
  --hover: #EEEEF0;
  --line: rgba(0, 0, 0, 0.06);
  --line-strong: rgba(0, 0, 0, 0.12);
  --text: #0A0A0C;
  --text-body: #4B4E50;
  --text-muted: #5F6366;
  --cta: #0A0A0C;
  --cta-on: #FCFDFF;
  --cta-hover: #26262B;
  --green-on-dark: #0B6E3E;
  --green-hover: #085A32;
  --brand-tint: rgb(11 110 62 / 0.08);
  --focus: #0B6E3E;
  --danger-text: #C21F3A;
  --danger-tint: #FDECEE;
  --warning: #B45309;
}

body { background: var(--bg); color: var(--text); font: 400 15px/1.5 var(--font-sans); }
.card { background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius-lg); }
.page-title { font: 400 40px/1 var(--font-serif); letter-spacing: -0.02em; }
.eyebrow { font: 500 13px/1.4 var(--font-sans); color: var(--text-muted); }
.btn-primary { background: var(--cta); color: var(--cta-on); border-radius: var(--radius); height: 36px; padding: 0 16px; font-weight: 500; }
.btn-accent { background: var(--green); color: var(--soft-white); border-radius: var(--radius); height: 36px; padding: 0 16px; font-weight: 500; }
.tag { border-radius: 9999px; padding: 2px 8px; font: 500 12px/1.33 var(--font-sans); }
.data { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.rec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--record-red); }
```

**Tailwind:** map these to theme colors (`background`, `card`, `secondary`, `line`, `line-strong`, `cta`, `brand-fill`, `brand-green`, `danger`, …). Set `radius-sm` to 6px, `radius-md` to 8px and `radius-lg`/`radius-xl` to 12px, and set the `shadow` scale to none. Use `font-sans` for Geist, `font-serif` for Geist Serif and `font-mono` for Geist Mono.

### Quick check
If a screen or slide has any of the following, it's drifting from the brand.

On air, on slides and in print:
- a single rounded corner, or rounded plates and panels
- pure `#FFFFFF` text or logo on dark (use Soft White `#ECEFEA`)
- any font other than Lexend (plus Geist Mono for data)

On screens:
- a green-tinted Ink canvas instead of true black, or hardcoded brand hexes in chrome
- more than one white primary button, or an accent button next to a primary
- big brand-colored panels, headers or bands
- ALL CAPS tracked labels, eyebrows or tags
- square cards, or pill-shaped buttons

Everywhere:
- more than one spot of red
- gradients, glows or drop shadows
- italics

---

## 14. InFocus Portal implementation

How sections 10 and 13 map to the Portal's code. Tokens live in `app/globals.css`; fonts load in `app/layout.tsx`; shared components are in `components/ui/` and `components/kit/`.

### Color tokens

The theme follows the device by default (System); Settings → Appearance can pin Light or Dark (`<html class="light">` / `dark`). Tokens marked "flips" change value in Light.

| Role | CSS token | Tailwind class | Notes |
|---|---|---|---|
| Canvas `#000` | `--background` (flips), `--ink` (flips) | `bg-background` | Page canvas. |
| Card `#0A0A0C` | `--card` (flips), `--ink-2` | `bg-card border border-line-strong` | Level 1: cards, panels, dialogs, inputs. |
| Elevated `#111114` | `--secondary`, `--popover` (flip) | `bg-secondary`, `bg-popover` | Level 2: secondary buttons, chips, menus. Hover is `bg-[var(--ink-3)]`. |
| Hairlines | `--line`, `--line-2` (flip) | `border-line`, `border-line-strong` | Row dividers / card, input and button edges. `border-border` is close to `line-strong`. |
| Text | `--foreground`, `--ink-text`, `--muted-foreground` (flip) | `text-foreground`, `text-[var(--ink-text)]`, `text-muted-foreground` | Primary, body prose, muted. Don't use `text-white` or `bg-black` on theme surfaces. |
| Primary button | `--cta`, `--cta-on`, `--cta-hover` (flip) | `bg-cta text-cta-foreground hover:bg-cta-hover` | White in Dark, black in Light. |
| InFocus Green `#0B6E3E` | `--brand-fill`, `--primary` | `bg-[var(--brand-fill)] text-on-brand hover:bg-[var(--brand-fill-hover)]`, `bg-primary` | The accent button, switches, progress. `--primary` is the brand fill, not the default button. |
| Green on Dark `#2BB36E` | `--brand-green` (flips to `#0B6E3E`) | `text-brand-green` | Links, icons, small marks, focus ring. The name is historical: it is Pumpkin or Gold in a season. |
| Brand tint | `--brand-tint` (flips) | `bg-brand-tint` | Selected rows, success tags. |
| Record Red `#EE3A2A` | `--brand-red` | `rec-dot rec-dot-red`, `bg-brand-red` on a dot | The rec dot and LIVE markers only. |
| Soft White `#ECEFEA` | `--on-brand`, `--soft-white` | `text-on-brand` | Text on brand and Danger fills. |
| Danger `#C21F3A` | `--danger`, `--destructive` | `bg-destructive text-destructive-foreground`, `bg-danger-fill` | The final destructive confirm. |
| Danger on Dark `#FF7A8A` | `--danger-text` (flips to `#C21F3A`) | `text-danger`, `border-danger` | Error text, icons, borders. |
| Danger tints `#2A0E13` / `#FDECEE` | `--danger-tint` (flips) | `bg-danger-tint` | Error banners, danger tags. |

**Seasons:** `<html class="halloween">` (`src/lib/halloween.ts`) and `<html class="thanksgiving">` (`src/lib/thanksgiving.ts`) override `--brand-green`, `--brand-fill`, `--brand-fill-hover`, `--brand-tint`, `--brand-red`, `--primary`, `--accent` and `--ring`, with separate Light values. Anything drawn with those tokens recolors itself. Hardcoded green hexes don't, so keep them out of UI chrome.

### Type

- `font-sans` is **Geist** (variable, 400–700), the default for all text. `font-serif`, `font-display` and `.display-xl`/`.display-lg` are **Geist Serif** 400 for page titles (40px and up). `font-mono`, `.font-mono-broadcast` and `.timecode` are **Geist Mono**, for data only, with `tabular-nums`. All three load locally from the `geist` package.
- `.display-md` / `.display-sm`: Geist Medium 22px / 18px section headings.
- `.eyebrow`: 13px Geist Medium, muted, sentence case. `.eyebrow-brand` uses the brand color.
- `.status-pill` + `.status-*`: sentence-case 12px pills. New code uses `<StatusTag>` (`components/kit/status-tag.tsx`).
- Live overlays, story graphics, OG images and thumbnails are on-air output and keep Lexend (sections 3 and 6).

### Shape

- `rounded-sm` is 6px, `rounded-md` 8px (buttons, inputs), `rounded-lg` and `rounded-xl` 12px (cards, dialogs, popovers, wells), `rounded-2xl` and up 16px, `rounded-full` for pills and dots.
- `.brand-hero-panel` / `.brand-hero-gradient` page heroes are 12px cards with a strong hairline, without a colored strip. `PageHeader` (`components/page-header.tsx`) uses the same card.
- Flat: every `shadow-*` / `drop-shadow-*` utility resolves to nothing. No gradients or `backdrop-blur`. The legacy `.brand-gradient-*` and `.av-*` classes are flat tones.

### Buttons

`components/ui/button.tsx`. Sizes: `default` h-9, `sm` h-8, `lg` h-10, `icon` 36px, `icon-sm` 32px. Links styled as buttons use `buttonVariants({ variant, size })`.

| Variant | Use |
|---|---|
| `default` | The view's primary action: white with black text (inverted in Light). One per view. |
| `accent` | The page's most important action, in the brand fill (season-aware). Use instead of `default`, never next to it. |
| `outline` / `secondary` | Secondary actions: elevated surface and a strong hairline. |
| `ghost` | Toolbars, icon buttons, tertiary actions. |
| `destructive-quiet` | Danger text on the elevated surface. Delete, Remove and Revoke everywhere except the final confirm. |
| `destructive` | Solid Danger. Only for the final "are you sure?" confirm. |
| `link` | Brand text, underline on hover. |

### Motion

`--default-transition-duration` is 150ms and `--default-transition-timing-function` is `--ease-ui` (`cubic-bezier(0.2, 0, 0, 1)`), so hover and focus changes use `duration-150 ease-[var(--ease-ui)]`. `ease-in`, `ease-out` and `ease-in-out` are the section 5 curves. Card and route entrances run 280ms ease out; the Portal page swap (`.route-fade`) is a 150ms opacity-only fade. The rec dot fades in and out and never glows. Reduced motion turns off the entrances and the dot animation.

### Emails

`src/lib/email-layout.ts` uses literal hexes (email clients don't support CSS variables) and follows section 12: the Ink card, a Lexend font stack, and InFocus Green buttons with Soft White text (`#ECEFEA`).

### Livestream graphics

`components/live/live.css` draws the OBS overlays and livestream dashboard graphics on a 1920 × 1080 stage, following sections 4–6: square Ink plates, one green strip, the icon tile, Soft White text, flat color. The livestream wordmark and icon (`public/live/`) are the Soft White versions.

### Not covered

The Show Roles Vite app (`src/show-roles/`) and the Mac app wrapper still use their older styles.
