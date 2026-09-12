# Elo CRM — candidate, not production

Visual direction: Elo, light neutral surfaces, restrained emerald accents, slim linked mark, desktop sidebar and mobile navigation. The name is a proposal; no trademark availability claim is made.

`elo-preview.html` is an interactive demonstration using fictitious records only. It never initializes Firebase, never sends email, and suppresses WhatsApp recipient links for the demo phone numbers. Its data changes are ephemeral. `elo.html` is the authenticated candidate and must not replace the current production route until the checklist below passes.

## Implemented

- Portuguese/Spanish UI, browser-language default and explicit preference; Firebase password-reset requests use the selected locale.
- Client forms, second contacts, notes and travel destinations; existing Firestore field names retained.
- Family group name and optional invitation URL. Copy message, open invitation link, then manually paste/send in the group. This is not automated group messaging. Confirming a follow-up is separate from opening WhatsApp.
- Automatic per-user durable IndexedDB queue, reconnection retry, real-time Firestore listener. Atomic transaction receipts prevent an interrupted acknowledgement from replaying a committed operation. Receipts require additional rules and must not be expired without a reconciliation strategy.
- Remote empty snapshots replace old local lists. Legacy unscoped localStorage data is never automatically imported into another account.
- Changes to distinct clients or fields merge. Concurrent edits to the same field use the last committed operation. A stale patch never resurrects a deleted record. This is not a collaborative field-conflict UI.

## Must complete before rollout

1. Audit deployed Firestore rules. Users may access only `users/{their uid}` and their `syncReceipts` subcollection. The current rules were not inspected or changed during this design pass. Denied writes stay queued and visibly show failure.
2. Test two real test accounts and two devices against an emulator/staging project: account switching, queued writes across restart, real offline/reconnect, permission-denied, transaction retry, persistent-cache failure, and concurrent writes. The included tests cover the pure merge logic only.
3. Configure server-side scheduled Firestore backups in a private destination, retention and access controls, and perform a restore into a separate database. The existing GitHub backup workflow belongs to Copa Barra Sul, not CRM. Never commit CRM personal data or backups to this public repository. Backups are NOT active in this candidate. Firebase/Cloud billing and administrator setup must be checked before activation.
4. Verify the password-reset email arrives and the link works in both languages. Selected language does not resolve email delivery by itself. No production delivery test was performed in this pass.
5. Stage rollout and retire the old full-array-writing client: old open browser tabs can overwrite new changes. Invalidate old service worker caches only with a migration plan. Preserve old per-device unscoped data for owner-verified recovery rather than silently deleting or uploading it.
6. Move clients out of a single Firestore document before scaling. This candidate intentionally preserves the current schema for compatibility, including its document-size limitations. Add pagination and server-side validation for commercial rollout.
7. Complete PWA installation/offline asset caching and notifications for the candidate. Those old-app features are not yet ported; current production files remain unchanged.

## Validation

`node --test elo/sync.test.mjs` tests merge/idempotent application logic. `node --check elo/app.mjs` checks syntax. Local preview: `node elo/preview-server.cjs`. Visual/browser QA and live backend validation remain pending. No production data is used for the preview.
