# Equipment

Host: `equipment.infocusportal.com` (also `/equipment` on the main Portal origin). The old `equipment.infocuspaly.com` still works. Manager passkeys belong to infocuspaly.com and work on both addresses in Safari and Chrome; in Firefox, a passkey works only on infocuspaly.com, so sign in with Google or an email code on infocusportal.com.

Pages: **Checkout** (`/equipment`), **Request** (`/equipment/request`), and **Manage** (`/equipment/manage`, shown as **Dashboard sign-in** to people who can't open it). The tabs sit in the top bar on a computer and in a bottom tab bar on a phone. **Back to InFocus Portal** (top right; an arrow on a phone) returns to the main dashboard. Managers also reach Manage from the Equipment row on `/managers` (`managers.md`).

Checkout page and requests are public; using checkout requires a separate manager Google sign-in. In the InFocus Portal iPhone app (More → Equipment), signed-in members see the gear they have out (and when it becomes overdue), items held for them, and their requests, matched by their Portal email (`GET /api/equipment/mine`); they can request available gear there too. Managers also get Requests (approve or deny) and Out (force-return, release a hold) there; Inventory and the checkout kiosk stay on the web. Manage uses Portal sign-in (Google, email code, or a registered manager passkey). There are no reservations.

## Checkout (kiosk)

Checkout uses an equipment-only Google session, separate from the main Portal login.

1. Select **Sign in with Google to unlock checkout** and use an equipment manager or producer’s registered Portal Google account. This unlocks checkout only; it does not create, replace, or sign out the main Portal session.
2. Enter **Student name** and **Student email** (both required), then scan or type each item code and press **Add** (or Enter). Typing part of a code or item name shows matching inventory codes beneath the field; select a match (click it, or highlight it with ↑/↓ and press Enter) to fill its exact code, then press **Add**. The item name appears in muted text beneath the selected code and beneath each code in the added-items list. Matches ignore capitalization, exclude items already added, and include checked-out items for returns. Archived items are hidden. Suggestions require an unlocked station; checkout still validates availability when submitted. Added codes are listed under the field; remove any unwanted codes before submitting. **This batch** (beside the form on a computer, below it on a phone) shows how many items are listed, the SD card box and **Submit**. You can submit up to 50 items together; a code still in the input is included too. Cmd/Ctrl+Enter also submits.
3. If taking an SD card, check **I took an SD card** in **This batch**. This starts unchecked and resets after submission or a student name or email change. No code is needed for the SD card. The yes/no declaration applies to the entire checkout batch, not one card per item.
4. Submit once for all listed items (on a phone, Submit stays at the bottom of the screen and shows the result beside it). The same student email + code while the item is out returns it. Duplicate, unknown, unavailable, or conflicting items reject the whole batch without changing any items. Leave the SD card box unchecked for returns; return-only submissions with it checked are rejected.
5. **Lock** (in the page header) when you leave the station. A tag above the page title shows when checkout locks (for example **Unlocked · locks 3:42 PM**); in the last ten minutes it turns amber and reads **Locks 3:42 PM**. Checkout also locks automatically one hour after Google sign-in, even if you keep using it. Sign in with Google again to continue. Server-side expiry protects checkout and item lookups even if the page stays open.

Checkout matches students by email, ignoring capitalization. Existing PAUSD student IDs are retained internally to preserve holds and checkout history; students no longer type an ID at checkout. A valid email is required and saved with the borrower for overdue notices. Conflicting existing records require an equipment manager to review the student details.

Passcodes and passkey unlock are no longer accepted for checkout. Existing main Portal sessions do not automatically unlock it. Manager and Portal access are rechecked for checkout requests. Locking checkout or its hourly expiry does not sign you out of the main Portal.

## Request

Anyone with the URL. No Portal login.

Open `/equipment/request`. Pick one or more available items (search by name or code; **Add** marks an item **Selected**), then give your name, student ID and email under **Your request** (beside the list on a computer, below it on a phone) and select **Submit request**. On a phone the Submit button stays at the bottom of the screen. Producers and appointed equipment managers get an email. Approving a request **holds** those items for that student ID; checking out with the matching student email + code completes the hold. Nobody else can take a held item.

Requests show **Pending**, **Approved**, **Denied**, or **Fulfilled** (approved and every held item checked out). **Approve** only appears while every item is still in, unheld, and not archived. A manager can still **Deny** an approved request while none of its items are out; that releases its holds.

## Manage

Portal sign-in (same account as the rest of Portal; Google, email code, or a registered manager passkey). Use **Dashboard sign-in** on the equipment page when signed out. Associate producers and up, plus extra managers producers appoint. Anyone else who signs in is sent to the access-denied page.

| Tab | What it does |
|---|---|
| Out | Who has what, since when, held vs out, and whether an SD card was taken with the checkout batch. Filter **All**, **Out**, **Held** or **Overdue** (items out 72 hours or more, tagged Overdue). Force-return an out item. Release a hold that has not been checked out. |
| Requests | A list of requests (pending first) beside the open request. Filter **All** or **Pending**; J/K moves through the list. Approve or deny the whole request. Approve holds the items. On a phone, tap a request to open it. |
| Inventory | Add items (name + code). Find an item with the filter box. Edit name/code in the row (Enter saves, Esc cancels). Archive only if the item is in (not out, not held). |
| Settings | Register or remove your Touch ID/passkeys for dashboard sign-in. Appoint or remove extra managers (producers only): find a member, choose them in the list, then press **Add**. |

When there are any, the **Out** tab shows a count of overdue items and the **Requests** tab a count of pending requests. **Refresh** (in the page header) reloads the open tab and both counts; the counts also update when you come back to the browser window. The header shows when the data was last loaded (for example **Updated 3:42 PM**). Each result (Item returned, Request approved, …) shows as a short message under the tabs, which stays pinned below the top bar while you scroll. If Approve or Deny fails, the error shows inside the open request instead (on a phone, also in the bar at the bottom of the screen). The browser remembers the last tab and the Out and Requests filters.

Item names may be duplicated; only inventory codes must be unique. Inventory codes can contain multiple words. The entire code identifies the item: `peter griffin` and `peter pan` are distinct codes. Leading and trailing spaces are ignored; an exact duplicate full code on another active item is blocked. Archiving frees the code for reuse while retaining the archived item and its checkout history. Archived records receive a unique archive suffix on their stored code; older archived codes are released automatically when reused.

Appointed extra managers can use every Manage tab (Out, Requests, Inventory, and their own passkeys). Only producers (AP+) can appoint other managers; appointed managers are listed on the Equipment row on `/managers`.

The Out table (including its Overdue filter) shows **SD card (batch)** as Yes/No; older checkouts without a declaration show a dash. Multiple items in the same batch share the same answer. This records that a card was taken, not a separate coded inventory item or an independently tracked SD card return. The declaration stays in checkout history when equipment is returned.

## Overdue mail

Once an item has been out 72 hours, Portal emails the borrower (if we have an email) and every producer and appointed equipment manager. That repeats daily until the item is returned.

## Touch ID & passkeys

Sign in normally first, then open **Manage → Settings → Touch ID & passkeys**. Give the device an optional name and select **Register Touch ID / passkey**. Approve the device prompt. Registration is for the signed-in manager only; exit View as first.

Passkeys work with **Sign in with Touch ID / passkey** on the equipment manager dashboard sign-in page. They do not unlock checkout; checkout requires its own one-hour Google session. Google/email dashboard sign-in remain available.

Touch ID enrollment itself happens in device settings. Portal stores the passkey public credential, never fingerprints. The device may use Touch ID, Face ID, or its screen lock. Use a personal device or personal macOS account: fingerprints enrolled in a shared macOS account cannot identify separate equipment managers. A personal phone passkey can be used at a shared station when the browser offers that option.

Passkeys work on the production equipment, main Portal, and www hosts. Remove an old passkey in Settings to prevent future use; this does not sign out existing login sessions or lock already-unlocked checkout stations. Localhost credentials are separate from production; preview domains are not supported.
