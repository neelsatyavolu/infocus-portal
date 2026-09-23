# Portal assistant

Everyone signed in sees a green ✱ in the bottom-right of Portal. Hidden on bare video review so it does not cover the player. It opens a floating corner popup (full screen on phones) with two modes: **Assistant** (the chatbot) and **Messages** (group and direct chat). Unread human messages show a count on the ✱ and on **Messages**. **Clear** wipes the assistant thread only. An empty assistant chat describes what it can do, with suggested questions that rotate.

Answers come from Portal docs. Replies should read like a classmate: tab names, short bullets, no routes, tool names, or status codes. Markdown (**bold**, lists) is rendered in the popup. While it works, the popup shows plain status lines (Reading a doc, Reading grades, Preparing a grade change) instead of a generic “Looking that up.”

If you ask **where** a page, tab, or package is, a card appears: **I can show where that is**, with **Take me there**. It only offers pages in your sidebar. **Not now** skips it.

What it can look up depends on role:

- **Reporters** — how Portal works for students, their own packages (including comments and uploads on those packages), and cycle dates. Not other people’s grades, the publishing queue, producer lists, Admin, Members notes, or packages they are not on.
- **Associate producers** — assigned Groups, people, queue, and cycle dates. Ask what packages you produce and it lists those groups with current stage and status. Ask about a package and it can read comments, clip notes, approval notes, uploads, and proof of contact. Not grades.
- **Executives, adviser, super admin** — Groups (all packages), people, queue, and a student’s letter grade, percent, per-cycle final cuts and check-ins, livestream, participation, and portfolio. Ask what packages you produce and it lists the ones assigned to you (not every group in Groups). Ask about a package and it can read comments, notes, uploads, and player comments on the cuts. Check-ins stay automatic. Participation docks still need a second producer on **Participation**.

It already knows who is signed in. It should not ask for a name to look up “my” packages.

## Super admin edits

Super admin and the adviser can ask the assistant to **change** Portal data. Each change shows an Approve / Don’t card:

- Add or remove a person, set a nickname
- Add, update, or remove a package (topic, category, members, assigned producer)
- Assign or remove a producer role (associate / executive / adviser)
- Send a package to the publishing queue, pick a show, or take it off the queue
- Change cycle dates or how many cycles run per semester
- Approve or deny an access request
- Set a package-cycle quality score (out of 50) or portfolio score (out of 100), clear a cycle grade to ungraded (a dash, not 0), and publish or unpublish that cycle grade

The model only **proposes**. A card in the chat lists the exact fields. **Approve** saves it; **Don't** skips it. Tokens expire in 10 minutes and only work for the person who asked.

## Who sees it

Everyone signed in, except on bare video review.

## How it runs

- API: `POST /api/assistant/chat` (session required).
- Provider: Gemini `gemini-3.1-flash-lite` first (`GEMINI_API_KEY_CHAT`, not the teleprompter `GEMINI_API_KEY`). If Gemini fails, Groq `openai/gpt-oss-120b`, then `llama-3.3-70b-versatile`, then `llama-3.1-8b-instant`.
- Keys: `GEMINI_API_KEY_CHAT` and/or `GROQ_API_KEY` (server only). Optional `GROQ_MODEL` to pin a Groq model id.
- Chat history stays in the browser. Nothing is saved to the database.
- Usage caps (so the class stays under Gemini Flash-Lite free-tier ~15 requests/min and ~1,000/day): reporters 3 per 10 minutes / 5 a day; associates 6 / 12; executives and admin 10 / 25. The whole class shares 5 questions a minute and 400 a day.

If both keys are missing, the panel says the assistant is not configured.
