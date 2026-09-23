# Equipment

Host: `equipment.infocuspaly.com` (also `/equipment` on the main Portal origin).

Checkout page and requests are public; using checkout requires a separate manager Google sign-in. Manage uses Portal sign-in (Google, email code, or a registered manager passkey). There are no reservations.

## Checkout (kiosk)

Checkout uses an equipment-only Google session, separate from the main Portal login.

1. Select **Sign in with Google to unlock checkout** and use an equipment manager or producer’s registered Portal Google account. This unlocks checkout only; it does not create, replace, or sign out the main Portal session.
2. Enter **Student Name** and **Student Email** (both required), then scan or type each item code and press **Add** (or Enter). Typing part of a code or item name shows matching inventory codes beneath the field; select a match to fill its exact code, then press **Add**. The item name appears in muted text beneath the selected code and beneath each code in the added-items list. Matches ignore capitalization, exclude items already added, and include checked-out items for returns. Archived items are hidden. Suggestions require an unlocked station; checkout still validates availability when submitted. Remove any unwanted codes before submitting. You can submit up to 50 items together; a code still in the input is included too.
3. If taking an SD card, check **I took an SD card**. This starts unchecked and resets after submission or a student name or email change. No code is needed for the SD card. The yes/no declaration applies to the entire checkout batch, not one card per item.
4. Submit once for all listed items. The same student email + code while the item is out returns it. Duplicate, unknown, unavailable, or conflicting items reject the whole batch without changing any items. Leave the SD card box unchecked for returns; return-only submissions with it checked are rejected.
5. **Lock** when you leave the station. Checkout also locks automatically one hour after Google sign-in, even if you keep using it. Sign in with Google again to continue. Server-side expiry protects checkout and item lookups even if the page stays open.

Checkout matches students by email, ignoring capitalization. Existing PAUSD student IDs are retained internally to preserve holds and checkout history; students no longer type an ID at checkout. A valid email is required and saved with the borrower for overdue notices. Conflicting existing records require an equipment manager to review the student details.

Passcodes and passkey unlock are no longer accepted for checkout. Existing main Portal sessions do not automatically unlock it. Manager and Portal access are rechecked for checkout requests. Locking checkout or its hourly expiry does not sign you out of the main Portal.

## Request

Anyone with the URL. No Portal login.

Give your name, student ID, email, and pick one or more available items. Managers get an email. Approving a request **holds** those items for that student ID — checkout using the matching student email + code completes the hold. Nobody else can take a held item.

## Manage

Portal sign-in (same account as the rest of Portal; Google, email code, or a registered manager passkey). Use **Dashboard sign-in** on the equipment page when signed out. Associate producers and up, plus extra managers producers appoint.

| Tab | What it does |
|---|---|
| Out | Who has what, since when, held vs out, and whether an SD card was taken with the checkout batch. Force-return an out item. Release a hold that has not been checked out. |
| Inventory | Add items (name + code). Edit name/code. Archive only if the item is in (not out, not held). |
| Requests | Approve or deny the whole request. Approve holds the items. |
| Overdue | Items out 72 hours or more. Force-return from here too. |
| Settings | Register or remove your Touch ID/passkeys for dashboard sign-in. Appoint or remove extra managers (producers only). |

Item names may be duplicated; only inventory codes must be unique. Inventory codes can contain multiple words. The entire code identifies the item: `peter griffin` and `peter pan` are distinct codes. Leading and trailing spaces are ignored; an exact duplicate full code on another active item is blocked. Archiving frees the code for reuse while retaining the archived item and its checkout history. Archived records receive a unique archive suffix on their stored code; older archived codes are released automatically when reused.

Appointed extra managers can run inventory and requests. Only producers (AP+) can appoint other managers.

The Out and Overdue tables show **SD card (batch)** as Yes/No; older checkouts without a declaration show a dash. Multiple items in the same batch share the same answer. This records that a card was taken, not a separate coded inventory item or an independently tracked SD card return. The declaration stays in checkout history when equipment is returned.

## Overdue mail

Once an item has been out 72 hours, Portal emails the borrower (if we have an email) and every equipment manager. That repeats daily until the item is returned.

## Touch ID & passkeys

Sign in normally first, then open **Manage → Settings → Touch ID & passkeys**. Give the device an optional name and select **Register Touch ID / passkey**. Approve the device prompt. Registration is for the signed-in manager only; exit View as first.

Passkeys work with **Sign in with Touch ID / passkey** on the equipment manager dashboard sign-in page. They do not unlock checkout; checkout requires its own one-hour Google session. Google/email dashboard sign-in remain available.

Touch ID enrollment itself happens in device settings. Portal stores the passkey public credential, never fingerprints. The device may use Touch ID, Face ID, or its screen lock. Use a personal device or personal macOS account: fingerprints enrolled in a shared macOS account cannot identify separate equipment managers. A personal phone passkey can be used at a shared station when the browser offers that option.

Passkeys work on the production equipment, main Portal, and www hosts. Remove an old passkey in Settings to prevent future use; this does not sign out existing login sessions or lock already-unlocked checkout stations. Localhost credentials are separate from production; preview domains are not supported.
