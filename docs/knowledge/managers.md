# Managers

`/managers` (sidebar → Class → **Managers**) is where appointed managers find their tool. Everyone signed in sees the tab. The page is titled **Manager tools** and shows one row per area:

| Area | Opens | Who can open it |
|---|---|---|
| Equipment | Equipment Dashboard (`/equipment/manage`) | Producers and appointed equipment managers |
| Livestream | Livestream Tracker (`/livestreams`) | Everyone can view; producers and livestream managers edit |
| Website | Publishing Queue (`/publishing-queue`) | Producers; appointed website managers read-only |
| Social media | Instagram Post Maker (`/managers/social-media`) | Producers and appointed social media managers |

The header shows a tag for each manager role you hold, or **Producer**. The rows put your areas first, then the other tools you can open, then the ones you can't (in the table's order within each). Each row shows its appointed managers by display name (never email; producers aren't listed because they can open every tool) and who can open it, and marks **Your role** where you're appointed. On a wide screen these are the **Managers** and **Access** columns. Click a row to open its tool. A row the person can't open has a **Locked** tag and adds "Ask a producer if you need it." A **How manager roles work** panel sits under the list. Only producers (associate and up) appoint managers, from each tool: equipment, livestreams, the Publishing Queue's **Managers** button, and the Instagram Post Maker's **Managers** button. Appointing someone never grants producer permissions, and removing them takes the access away on their next page load.

## Instagram Post Maker (Managers → Social media)

Makes on-brand Instagram posts (1080 × 1350 PNG) and stories (1080 × 1920) following `docs/SOCIAL-MEDIA-DESIGN.md`: the section label and wordmark over a thin rule, the headline, a date or byline in Geist Mono, the body, and a footer with the source (or infocusnews.tv) and @infocusnews. Lexend for words, Geist Mono for numbers, square corners, flat color.

Under the preview, **Post 4:5 / Story 9:16** picks the format and **White / Dark** the background (Warm White by default; Dark matches the on-air graphics). Both are remembered in that browser and apply to every template. On a story, text stays out of the top and bottom 250px that Instagram's buttons cover, and **Show Instagram's UI zones** (only shown for stories) shades those areas.

The **Managers** link above the title goes back to `/managers`. Producers also get a **Managers** button in the header to appoint or remove social media managers.

The page has three parts: the template list, the preview with **Download** above it, and the fields. On a wide screen they sit side by side (the preview stays in view while you scroll the fields); when there isn't room for three columns (for example a laptop with the sidebar open) the template list becomes a menu showing the current template's name, above the fields. On phones everything is one column: the template menu, the preview, then the fields. The list groups the templates: **From the Portal** (Show recap, Livestream), **Templates**, **Results and data**, and **Freeform** (Custom).

Templates:

| Template | Use it for |
|---|---|
| Headline | First slide: a photo with its credit, the headline and a date or byline |
| Show recap | One show as a set of slides: recap with the anchors, the announcements, and one slide per package (see below) |
| Quote | Pull quote with the speaker's name and role, and a photo if there is one |
| Photo gallery | Two to four photos with a one-line caption |
| New package | A frame from a package, a label (e.g. "Now on YouTube"), its title and reporters |
| Livestream | The livestream thumbnail as a post or story (Matchup or Event, date, time, location). Same design and renderer as the thumbnails on the livestream dashboard (`livestreams.md`), so it stays dark |
| Announcement | A title and up to five short points |
| Text | A headline and a paragraph or two: explainers, corrections, statements |
| Big number | One stat, what it counts, and context |
| Read the story | Photo and headline; on a story, a marked spot for the link sticker (the box is not in the PNG) |
| Race results | Candidates typed one per line (`Name \| Party \| Votes or 48.2% \| Label`), with shares worked out from votes (plus optional write-ins), bars, an optional photo for each of the first four, one seat or several (a line under the winning spots), and a status: no tag, Leading, Too close to call, or Called (only then a check and "wins") |
| Yes / No | A measure's Yes and No (votes or shares), the share it needs (50, 55, 66.67), how far over or short it is, and a status (Leading, Too close to call, Called: passes or fails) |
| Seats | Seats for each party, the majority line, and a status tag once control is called |
| Winner | The big first slide once a race is called: photo, name, one line, a tag and up to three figures (`Figure \| Label \| Party`) |
| Key figures | Up to four big figures, each with what it is and a line of detail (`Figure \| Title \| Detail \| Party`) |
| Custom | Freeform layout: place text, photos, shapes and brand pieces anywhere (see below) |

Results templates have an **As of** field, a **Note** and a **Source**; every results post should show all three.

How it works:

- Add photos with **Choose photo** or by dragging onto the preview; the sliders under each photo move and zoom the crop. Photos are processed in the browser and are never uploaded or saved. iPhone HEIC photos may need to be exported as JPG first (outside Safari).
- Long text shrinks to fit (down to 75%). If it still doesn't fit, a yellow **Text too long** tag above the preview asks for shorter text (hover it for the full message). When nothing needs attention, that line shows the format and size (Post · 1080 × 1350 or Story · 1080 × 1920).
- **Download PNG** (above the preview) saves `infocus-post-<template>-<date>.png` (or `infocus-story-…` for a story). The Livestream template downloads from the thumbnail renderer. On a phone, Download sits in a bar just above the tab bar, with a button that jumps between the preview and the fields.
- Text drafts are remembered in that browser (not synced between devices). **Reset text** (beside the template name, above the fields) restores a template's sample text; the message that confirms it has **Undo**.

### Show recap template

Loads a show from the Portal and turns it into slides (posts or stories, whichever format is picked). Pick the show from the list: recent shows (newest first) and the next upcoming one. It opens on the latest show that has aired.

1. **Recap**: a headline (default "Today on InFocus"), the anchors, and "In this show" (Announcements plus each package title). An optional photo of the anchors goes above the text.
2. **Announcements**: a title (default "Around Paly") and up to five short lines. Press **Generate summaries** and Gemini writes one short line (12 words or fewer, AP style, no invented facts) per announcement. Check every line against the originals (fold open the list of announcements above the button) before posting, and edit them freely.
3. **Package** slides: one per package queued for that show in the Publishing Queue. It uses the New package layout: frame, a label over the title (default "Now on YouTube"), title and reporters.

Where the data comes from:

- **Anchors**: Master Calendar, the same names The Show uses.
- **Announcements**: the show's teleprompter A2 script, as aired. If there's no script yet, it uses the announcements scheduled for that day, in the submitters' words. On the Announcements slide, a **Teleprompter** or **Scheduled** tag next to **Slides** says which one it used.
- **Packages**: the headline, or the group topic when there's no headline. Reporters are shown by display name.

Everything can be edited, but edits and photos are not saved; **Reload** (beside the show picker) starts over from the Portal, and choosing a different show replaces them too. The **Slides** tabs in the fields switch the preview and the fields together: only the open slide's fields are shown. The **Slide N of M** tag above the preview jumps to the tabs. Dropping a photo on the preview adds it to that slide: a package frame, or otherwise the recap photo. **Download slide** saves the slide on screen. **Download all** saves every slide as `infocus-story-show-<date>-<n>-<slide>.png`; the browser may ask once to allow multiple downloads.

### Custom template

Starts from a photo-led layout like the Headline template, sized for the chosen format: the header, a large empty photo box with the credit under it, the headline, today's date, and the footer. Only the photo is left to add. **Add** places pieces (up to 60): text, number (Geist Mono), photo, shape, green strip, rule, header, wordmark, icon tile, footer (with an optional source), and the follow panel. The background is Plain (White or Dark, from the switch under the preview) or a full photo.

- Dropping a photo on the preview fills the selected photo box; otherwise it fills an empty photo background, or adds a new photo piece. A photo piece can **Fill the whole canvas**.
- Click a piece to select it; its settings appear under **Selected** at the top of the fields (beside the preview on a wider screen, below it on a phone). Drag to move; pieces snap to the margins, centre, the top and bottom margins (Instagram's safe lines on a story), and other pieces' edges (hold Option/Alt while dragging or resizing to place freely). Drag the green handle to resize: icons stay square, the wordmark keeps its shape, and text, header, footer and follow panel only change width. Arrow keys nudge (Shift for bigger steps); Delete removes; Esc deselects; ⌘D duplicates; ⌘Z / ⇧⌘Z undo and redo (the **Undo** and **Redo** buttons sit beside Download). On Windows and Chromebooks use Ctrl instead of ⌘. Double-click text to edit it. Layer buttons under **Arrange** send pieces forward or back, and **Center horizontally** centers the selected piece. Until you select a piece, the full list of shortcuts shows under **Selected**, below the line that says to click (or, on a touch screen, tap) a piece to edit it, with the keys for your device (touch gestures on phones and tablets). While a piece is selected, the list moves to a **Shortcuts** fold-out at the end of the fields (open or closed is remembered in that browser). On a computer, the line under the preview says you can drop a photo on the story to add it.
- Choices stay on brand: text styles only (title, headline, subhead, quote, body, note, big number, kicker and label in Lexend; number and date in Geist Mono) at 75–150% size and never under 24px; text colors Primary, Secondary, Muted, Green, Democrat, Republican (these follow White or Dark) and On dark / On light (fixed, for text on a plate or photo); shape fills Ink, Raised Ink, Warm White, Panel, Line, InFocus Green, Democrat, Republican, Yes and No; square corners, no rotation, shadows or gradients. Only one header, wordmark or icon can be added, so the logo and its red dot appear once.
- **Brand check** lists what still drifts: text in Instagram's UI zones (stories only), text straight on a photo without a plate, green text on a green plate, words set in a mono style, a missing footer, empty photo boxes, pieces off the edge, and more than one logo. Click an item to select the piece. The count also shows as a tag above the preview (click it to jump to the list). These are warnings; the PNG still downloads.
- The layout (not photos) is remembered in that browser, one for posts and one for stories (layouts made before posts existed open as the story). **Start over** (beside the template name) returns to the starting layout (undo brings yours back).
