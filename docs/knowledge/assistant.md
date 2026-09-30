# Portal assistant

Everyone signed in sees a green ✱ in the bottom-right of Portal. It is hidden on bare video review (so it does not cover the player) and on the Class Board. It opens a floating corner popup (full screen on phones) with two modes: **Assistant** (the chatbot) and **Messages** (group and direct chat, see `messages.md`). Unread human messages show a count on the ✱ and on **Messages**. **Esc** closes the popup. **Clear** wipes the assistant thread only. An empty assistant chat describes what it can do, with suggested questions (**Try**) that rotate every few seconds and change with your role.

Answers come from the Portal docs (this folder plus the class rules, Drive storage, and hosts docs). Reporters cannot read the producer-only docs (Admin and accounts, Groups and review, Members, Drive storage, Publishing Queue). Replies should read like a classmate: tab names, short bullets, no routes, tool names, or status codes. Markdown (**bold**, lists) is rendered in the popup. While it works, the popup shows plain status lines (Reading a doc, Reading grades, Preparing a grade change) instead of a generic “Looking that up.” If the docs do not say, it should say it does not know. If the docs say to type something (like `\` for Final Cut exempt), it says exactly that instead of inventing a button.

If you ask **where** a page, tab, or package is, a card appears: **I can show where that is**, with **Take me there**. It only offers pages in your sidebar; ask for one you cannot open and it says that page is not in your sidebar. For a package, students go to that stage's tab in **The Cycle**, and producers go to the package in **Groups** at its current stage. A student on one package can just say “my package.” **Not now** skips it.

What it can look up depends on role:

- **Reporters** — how Portal works for students, their own packages (including comments and uploads on those packages), and cycle dates. Not other people’s grades, the people list, the publishing queue, producer lists, Admin, Members notes, or packages they are not on.
- **Associate producers** — Groups they can see (assigned packages and unassigned ones), people, producers, the publishing queue, and cycle dates. Ask what packages you produce and it lists those groups with current stage and status. Ask about a package and it can read comments, clip notes, approval notes, uploads, and proof of contact. Not grades.
- **Executives, adviser, super admin** — Groups (all packages), people, producers, queue, and a student’s letter grade, percent, per-cycle final cuts and check-ins, livestream, participation, and portfolio. Ask what packages you produce and it lists the ones assigned to you (not every group in Groups). Ask about a package and it can read comments, notes, uploads, and player comments on the cuts. Check-ins stay automatic. Participation docks still need a second producer on **Participation**.

It already knows who is signed in. It should not ask for a name to look up “my” packages.

## Super admin edits

Super admin and the adviser can ask the assistant to **change** Portal data. Each change shows a **Needs approval** card with **Approve** / **Don’t**:

- Add or remove a person, set a nickname. Adding someone emails them an invite unless you ask it not to.
- Add, update, or remove a package (topic, category, members, assigned producer)
- Assign or remove a producer role (associate / executive / adviser)
- Send a package to the publishing queue, pick a show (or the next empty one), or take it off the queue
- Change cycle dates or how many cycles run per semester
- List pending access requests and approve or deny one. The requester gets an email with the decision.
- Set a package-cycle quality score (out of 50) or portfolio score (out of 100), clear a cycle grade to ungraded (a dash, not 0), and publish or unpublish that cycle grade

The model only **proposes**. The card lists the exact fields. **Approve** saves it; **Don’t** skips it. Nothing changes until you approve. A card expires after 10 minutes and only works for the person who asked. You can approve up to 20 cards per 10 minutes. Check-ins and participation docks cannot be set from chat.

## Who sees it

Everyone signed in, except on bare video review and the Class Board.

## How it runs

- API: `POST /api/assistant/chat` (session required; streams status lines, then the reply). Approving a card calls `POST /api/assistant/actions` (super admin and adviser only).
- Provider: Gemini `gemini-3.1-flash-lite` first (`GEMINI_API_KEY_CHAT`, not the teleprompter `GEMINI_API_KEY`). If Gemini fails, Groq `openai/gpt-oss-120b`, then `llama-3.3-70b-versatile`, then `llama-3.1-8b-instant`.
- Keys: `GEMINI_API_KEY_CHAT` and/or `GROQ_API_KEY` (server only). Optional `GROQ_MODEL` to pin a Groq model id.
- Chat history lives only in the open page. It survives moving between Portal pages but is gone after a reload or closing the tab. Nothing is saved to the database. Each question sends the last 12 messages, each cut to 2,000 characters.
- Usage caps (so the class stays under Gemini Flash-Lite free-tier ~15 requests/min and ~1,000/day): reporters 3 per 10 minutes / 5 a day; associates 6 / 12; executives and admin 10 / 25. The whole class shares 5 questions a minute and 400 a day. Over a cap, it says “You've asked enough for now. Try again later.” Counts are kept in server memory, so a server restart resets them.

If both keys are missing, the panel says the assistant is not configured.
