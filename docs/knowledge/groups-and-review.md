# Groups and package review

Route: `/groups`. Producer work happens here, not on student cycle tabs.

Tiles (home): topic, members, assigned AP/EP, current/pending stage, 7-segment bar: Pitch, Contact, A/B-roll, Initial 1, Initial 2, Initial 3, Final. Initial Cut bars follow current approval stages. When a cut needs revisions, the package stays at the stage that requested them, and reviewers stop seeing **Needs you** until the group uploads a new version. Unapproving moves the bars back to the reopened stage. Upload versions and check-in credit do not complete approval bars. Pending-review badges include whole elapsed hours since the latest submission became ready (for example, **A-roll/B-roll Pending Review for 36h**). Older media uses its upload time when readiness history is unavailable; statuses with no known timestamp omit the duration. Opening a tile goes to the pending stage. Bottom tabs switch stages. Each tile has a **Notes** button to the left of the stage label and check-in score for producers who can act on that group. It opens the same Notes field as Package Cycle; click Save to update it in both places. Assigned associates can edit notes on packages they are not members of; executives, the adviser, and super admin can edit any group’s notes.

Executives, adviser, and super admin see every package. Associates see assigned groups. The Portal assistant can look up the same Groups list (current stage and status) for whoever is chatting. Producers can also ask which packages they produce — that is assigned producer, not student membership. Asking about a package also surfaces stage comments (including approval notes and clip notes), uploads, proof of contact, and player comments on the cuts.

## Approval chain

Anchored to the package row, not a single file:

`DRAFT → ASSOCIATE_REVIEW → ADVISER_REVIEW → EXECUTIVE_REVIEW → APPROVED`

| Stage | Who | Artifact |
|---|---|---|
| Stage 1 | Assigned producer (AP or assigned EP/super-admin) | Initial cut |
| Stage 2 | Adviser only | Latest initial cut (the adviser decides if it needs a revision) |
| Stage 3 | Two distinct executive producers (three if marked controversial). Adviser does not count. | Latest initial cut |

`APPROVED` unlocks Final Cut. It does not mean the package is on air.

A denial keeps the package at the stage that asked for revisions. The group uploads a new version and that same stage reviews it again; it does not restart at Stage 1. A Stage 3 denial clears earlier executive approvals, so the new version needs two fresh executive sign-offs.

On both the Groups Initial Cut tab and the video review screen, use **Submit review (needs revisions)** to send the package back to the group, or **Approve** to sign off on the current stage. Review decisions apply to the latest cut. Approving sends the latest version to the next stage (Stage 1 to the adviser, Stage 2 to the executives). After a reviewer at any stage submits a review with needs revisions, they can still click **Approve anyway** to send that version on without waiting for a new upload. Everyone is notified the same way as a normal approval.

**Unapprove** withdraws your own sign-off and reopens that stage for review, provided you still have permission to review that stage. Withdrawing Stage 1 or Stage 2 also clears later sign-offs; an executive withdrawing Stage 3 preserves other executives' votes. Remove a package from the publishing queue before withdrawing an approval.

Once a package reaches Stage 2, associate producers are done reviewing its Initial Cut. They can still watch it, but they cannot approve it, send it back, withdraw their Stage 1 approval, post Initial Cut feedback on Groups, or add timeline comments on the video review screen. An executive who stood in as the assigned producer can still withdraw their Stage 1 approval. An associate who is a member of the package still comments as a student.

## Approve with optional feedback

Approving pitching, brainstorming, A-roll/B-roll, or Initial Cut can include a note. Skip approves with no note. Notes saved as `[[approved]]` are **not** revision requests.

## A-roll / B-roll needs changes

If the assigned producer posts A-roll/B-roll feedback (group note or clip note), treat it as needs changes: un-approve a-roll, show REVISIONS, email students. A later student upload returns status to pending review until the producer comments again or approves. Approval-time `[[approved]]` notes do not count as revision requests.

In the producer's A-roll/B-roll view, clips uploaded after the latest revision request have a **NEW** badge and highlighted border. Older clips stay unchanged. The highlights remain when opening a clip and clear when the producer approves or posts another revision request; uploads after that new request are highlighted again.

## Comments and mail

Stage events email and push the right people (`src/server/package-review-notify.ts`). Other stages use generic comment mail; A-roll needs-changes uses the dedicated mail.

## Associates performance

Executives, adviser, and super admin can open **Associates** beside Refresh on Groups. Associates and students cannot access the popup or its API. Choose a cycle and associate. **Overview** shows the weighted score, review habits and due milestones; **Feedback** shows AI feedback quality, anonymous group reviews, and the producer's recent feedback.

The overall 0–100 score uses **25% AI feedback quality, 25% group progress, 25% responsiveness, 10% review coverage, 10% group feedback, and 5% feedback coverage**. Missing components are excluded and the remaining weights rescaled. The popup labels partial scores **provisional** and shows the percentage of score weight available. No evidence is unscored, not zero. These are management indicators, not student grades or proof that a producer caused a group's results.

Review metrics count the first response to brainstorming, A-roll/B-roll, and initial cut v1 per assigned group. Unanswered work has a 48-elapsed-hour grace period, including nights and weekends. Attributed comments, submitted reviews and approvals count. Written-feedback coverage counts eligible groups, not comment volume. Verified historical reviews still count toward coverage without submission timestamps; missing timing affects only responsiveness. Unknown approvals are excluded and older upload creation times are labeled estimates. Current assignments define the groups shown, excluding groups where the associate is a student; historical reassignments are not reconstructed. New readiness and approval events are retained in the audit log even when signoffs reset.

**Group progress** is each group's completed / due milestones, averaged equally across eligible groups. Pitching, brainstorming approval, A-roll approval, initial cut and final cut use current roster completion flags. Future or undated milestones are excluded. Approved extension days move the final-cut deadline only. This measures current progress rather than reconstructing whether historical completion was on time. Student effort and later reviewers also influence it.

**AI feedback quality**: on Feedback, click **Score feedback**. Uses Gemini `gemini-3.1-flash-lite` with fixed rubric `producer-feedback-v1`, temperature 0, validated structured output and supporting verbatim excerpts. Specificity/actionability/reasoning/constructiveness are rated 0–4 and weighted 30/30/25/15 within quality. Known author/member names, emails and links are removed; no group titles, ratings or identities are sent as model metadata. Up to 12 excerpts (600 characters each) are sampled deterministically across groups/stages; sampled groups carry equal weight. Pitching and later-cut feedback can inform quality without changing first-review timing. No written feedback on eligible reviews gives quality 0; no eligible work stays unscored. The model judges written usefulness, not correctness about unseen footage; executives should inspect its explanations. Ordinary reads and manual scoring reuse the durable hash/model/rubric cache. Inngest refreshes feedback quality daily starting at midnight America/Los_Angeles, in stable producer-name order, with a durable 30-minute wait between producers. Each producer’s recorded cycles (including past cycles) are processed with a one-minute gap between cycles. The daily run forces one fresh evaluation per producer/cycle/day even when evidence is unchanged. Its day stamp prevents completed steps from being rerolled on retries. If a refresh of the same evidence fails, the last validated score and original evaluation time remain visible with an explanatory message. Failed/missing-key/rate-limited evaluations are unavailable, never zero; no fallback model silently changes the scale. At most one uncached evaluation per minute across instances protects the free allowance. `GEMINI_API_KEY_CHAT` must be configured server-side (shared with the Portal assistant). The model-specific cache ensures previous Groq evaluations are not reused for Gemini; click **Score feedback** or wait for the scheduled refresh to generate a new evaluation. Quality evaluations do not send mail or change grades.

**Temporarily paused (September 21, 2026):** The associate producer feedback form is disabled until the user requests re-enabling it. The Give Feedback button is hidden and its API rejects new submissions. Existing responses remain available to authorized viewers. **Anonymous group reviews**: when enabled, students have a **Give Feedback** button beside Refresh on Brainstorming, A-roll/B-roll, Initial Cut and Final Cut. It opens the producer-feedback popup with the invitation supplied by the user. Current members can submit for any of their roster cycles, including past cycles. One shared review per group and assigned associate per cycle; any current member can replace it. Three anchored 1–5 ratings (helpfulness, communication, support) are averaged, with 1 mapped to 0 and 5 to 100, then each group's review weighted equally. A 10–2,000-character comment is required. No reviews means unavailable, not zero. Only executive producers and super admin can retrieve saved group ratings/comments. Adviser access to other Associates metrics does not include these responses or their score. Students receive group choices and submission status only. The group and producer are stored; the submitting member's identity is not recorded. Members should omit names from their comments. The assigned associate cannot read reviews about them. No emails or notifications expose the content.

The video review header contains the version selector, refresh, and available review actions (including Submit review and Approve). The player panel is reserved for the video and playback controls to leave more room for the picture on smaller screens. Playback controls wrap on narrow screens.
