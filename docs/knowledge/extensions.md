# Extensions

Route: `/extension-requests`. `/extensions` redirects here.

The old 14-day allowance pool is gone.

1. A student requests for the **whole package group**: pick the cycle, how many days (0.1–30, one
   decimal place allowed, e.g. 1.5), and an optional reason, then **Submit** (or press Enter). You must be on a package group for that cycle. A group can
   have only one pending request at a time. The **Cycle** dropdown lists this semester's cycles and
   starts on the cycle you're working on: the current cycle, or last cycle if your group still owes
   its Final Cut.
2. Every group member must agree (**I agree** / **Decline**). The student who filed it counts as
   agreeing. Any disagreement denies it.
3. Then **two distinct producer approvals**. Any one denial blocks it. Executives, the adviser, and
   super admin can decide any request; an associate producer only decides requests for groups they
   are assigned to and not a member of. **Approve** stays disabled until every member has agreed.
   - The **first** producer to approve picks how many days to grant (0.1–30 with one decimal place,
     not just what was requested) and which group members get it (default: everyone).
   - The second producer sees those terms read-only and approves or denies them as-is.
4. On approval, the group's extension flag is set. Only the chosen members get the extra days;
   everyone else keeps the original final cut deadline.

Decimal days add exact hours to the 11:59 PM Pacific close: 1.5 days moves a Final Cut due
Oct 22 to 11:59 AM Oct 24. Check-in deadlines move the same way. A Final Cut turned in on the
day a decimal extension closes is late only if it was uploaded after that time.

An extension granted to only some members stays private to them. Members it doesn't cover don't
see it on this page, the Class Board, or in the assistant, and they get no email about it,
approved or denied.

Once a request is decided, the group gets one email with every member in To:
- **Approved:** only the members the extension covers.
- **Denied:** the whole group, including each producer's denial reason, or a note that a member
  declined. If the first producer had picked only some members, only those members get it.

Pending steps (member agreement, the first producer vote) send no email. Watch the list and the
sidebar count below.

Who sees what: producers (associate and up) see every request. Students see requests for their
own package groups, except an extension granted to other members only. Each request shows the group agreement tally and each producer's vote.

## Producer grants

Executive producers (EP, adviser, super admin) can also grant an extension directly with **Grant
an extension** at the top of the page:

1. Pick the cycle (starts on the current cycle), the package group, which members get it
   (default: everyone), how many days (0.1–30, one decimal place), and an optional reason.
2. No group agreement is needed. The granting exec's approval counts as the first one, and every
   other exec gets an email asking for the second approval.
3. A **different** exec approves (or denies) the terms as-is. Associate producers can't grant or
   approve these, and an exec can't grant or approve one for their own group.
4. On approval or denial, only the chosen students get one shared email.

An exec outside the group can also **Grant** a pending student request before every member has
agreed. It opens the same days-and-members picker as Approve. The request becomes a producer grant
in place, so no second entry appears. It still shows who requested it, member agreement is no
longer needed, and steps 2–4 above apply. **Grant** is hidden once every member agrees (use
**Approve**) or after a producer has voted.

Execs see **Email group** on every approved or denied request. It resends that decision email.
Use it for requests decided before decision emails existed, or when a student says they never
got one.

A producer who denies a request or grant must write a reason (⌘↵ / Ctrl+Enter sends it). It shows on the request as
"Denied by <name>" for the group and producers. A member's Decline needs no reason.

The header counts pending, approved, and denied requests. Denied requests and grants are
collapsed under **Denied** at the bottom of the list.

Late penalties still apply after each student's own extended deadline (20%, then 30% after 14 more days).

The **Extension Requests** sidebar link shows a count of pending requests waiting on you:
members who have not agreed yet, and producers who can decide (after full group agreement) and
have not voted.
