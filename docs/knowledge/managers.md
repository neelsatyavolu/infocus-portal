# Managers

`/managers` (sidebar → Production → **Managers**) is where appointed managers find their tool. Everyone signed in sees the tab. It shows one card per area:

| Area | Opens | Who can open it |
|---|---|---|
| Equipment | Equipment manager (`/equipment/manage`) | Producers and appointed equipment managers |
| Livestream | Livestream Tracker (`/livestreams`) | Everyone can view; producers and livestream managers edit |
| Website | Publishing Queue (`/publishing-queue`) | Producers; appointed website managers read-only |
| Social media | Story Maker (`/managers/social-media`) | Producers and appointed social media managers |

A card the person can't open is greyed out with a lock and says who can. Only producers (associate and up) appoint managers, from each tool: equipment, livestreams, the Publishing Queue's **Managers** button, and the Story Maker's **Managers** button. Appointing someone never grants producer permissions, and removing them takes the access away on their next page load.

## Story Maker (Managers → Social media)

Makes on-brand Instagram stories (1080 × 1920 PNG) following `DESIGN.md` §12: square Ink plates with a green strip, Lexend, Soft White text, and text kept out of the top and bottom 250px that Instagram's buttons cover. **Show Instagram's UI zones** shades those areas.

Templates:

| Template | Use it for |
|---|---|
| Headline cover | First slide: full photo, headline on an Ink plate, credit on the green strip |
| Quote | Pull quote over a photo with the speaker's name and role |
| Photo gallery | Two or three photos with a one-line caption |
| New package | A frame from a package, its title and reporters, and where to watch |
| Livestream | The livestream thumbnail as a story (Matchup or Event, date, time, location). Same design and renderer as the thumbnails on the livestream dashboard (`livestreams.md`) |
| Announcement | A title and up to five short points |
| Big number | One stat, what it counts, and context |
| Read the story | Photo, headline, and a marked spot for the link sticker (the box is not in the PNG) |

How it works:

- Add photos with **Choose photo** or by dragging onto the preview; sliders move and zoom the crop. Photos are processed in the browser and are never uploaded or saved. iPhone HEIC photos may need to be exported as JPG first (outside Safari).
- Long text shrinks to fit (down to 75%). If it still doesn't fit, a yellow warning asks for shorter text.
- **Download PNG** saves `infocus-story-<template>-<date>.png`. The Livestream template downloads from the thumbnail renderer.
- Text drafts are remembered in that browser (not synced between devices). **Reset text** restores a template's sample text.
