# MSK Print Cloud Repository Audit

Audit date: 2026-07-25

## Scope and starting state

This audit covered the React client, Express/MongoDB server, and Electron Windows Print Agent. No architectural rewrite was performed.

Initial Git state:

- Branch: `main`, three commits ahead of `origin/main`.
- Pre-existing user change: `client/src/Pages/Admin.jsx` (preserved and not included in audit fixes).
- Local `client/.env` and `server/.env` files exist but are ignored. Their contents were not read or recorded.
- `.env.example` files are tracked and contain variable names only.

## Repository structure and manifests

- `client/`: React 18 application using React Router, Axios, Bootstrap, Chart.js, Socket.IO client, and Create React App tooling. Scripts: `start`, `build`, `test`, `eject`.
- `server/`: Node.js CommonJS application using Express 5, Mongoose, Socket.IO, Razorpay, Cloudinary, PDFKit, JWT, and security/rate-limit middleware. Scripts: `start`, `test`, and three database migrations.
- `print-agent/`: Electron CommonJS Windows desktop application using `pdf-to-printer`, PowerShell printer/spool helpers, encrypted local settings, and Electron Builder. Scripts: `start`, `test`, `check`, `build`, `dist`.
- Root `package.json`: empty object. There are no root orchestration scripts.

## Verified working areas

The automated tests and source trace verify the following behavior:

- Authentication and role/shop authorization for customer, staff, shop owner, admin, and Print Agent routes.
- Multi-shop isolation for orders, payment settings, invoices, Print Agent sessions, and queues.
- Authenticated PDF upload, PDF page counting, Cloudinary-backed file metadata, print pricing, and order lifecycle rules.
- QR/public guest ordering with hashed access tokens and expiration data.
- Razorpay order creation uses the selected shop's credentials. A checkout callback becomes `Paid` only after server-side HMAC signature verification. Captured-payment webhooks also require server-side webhook signature verification and matching order/amount data.
- Manual UPI submissions remain `Pending` until an authorized admin or matching shop owner reviews them. UPI references are protected against reuse.
- Cash selection remains `Pending` until authorized shop staff explicitly confirms receipt.
- Invoice JSON/PDF access is limited to paid orders and authorized users; sensitive payment and file fields are redacted.
- The server Print Agent queue is paid-only and shop-scoped. Claims and lifecycle callbacks are atomic/idempotent.
- The desktop queue independently rejects anything other than a `Paid`/`Pending` order, downloads files with scoped credentials and claim tokens, and avoids duplicate printing during retries.
- Printer detection, readiness checks, mapping/default selection, Windows spool discovery/completion, cancellation, error recovery, and encrypted agent session/settings behavior.
- React payment availability and invoice rendering tests, plus a successful production build.

## Clear errors found and fixed

### Windows printing was stubbed

`print-agent/src/lib/printerService.js` returned a hard-coded successful result for `Test Printer` after two seconds and contained a duplicate `cancelCurrent()` method. This bypassed the real printer and caused two tests to fail.

The implementation now uses the existing printer resolution, readiness, print-option, spool discovery, completion, cancellation, and error helpers. It reports an ambiguous outcome when Windows accepts a submission but no spool job can be confirmed. All 14 Print Agent tests now pass.

### Sparse guest-token index rejected normal orders

`server/models/printJob.js` gave `publicOrderTokenHash` a default value of `""` while also defining a unique sparse index. MongoDB indexes an empty string as a value, so the second ordinary order failed with `E11000`.

The default was removed. Non-guest orders now omit the guest-only field, retaining schema/API compatibility and allowing the sparse unique index to work as intended.

### Print Agent login lost shop scoping

`server/controllers/printAgentAuthController.js` ignored a requested admin shop, ignored a shop owner's conflicting shop selection, and allowed staff accounts despite the tested Print Agent contract.

The controller now resolves an admin's requested active shop by ID or shop code, restricts owners to their assigned shop, and limits Print Agent login to admins and shop owners. The existing no-selection fallback remains: one active shop is selected automatically, while multiple shops return `SHOP_SELECTION_REQUIRED`.

## Checks run

- `client`: 3 test suites / 4 tests passed.
- `client`: optimized production build compiled successfully.
- `server`: 41/41 tests passed after fixes.
- `print-agent`: syntax check passed.
- `print-agent`: 14/14 tests passed after fixes.
- `git diff --check`: passed.

The React build emits a Node deprecation warning for `fs.F_OK` from the Create React App toolchain. It does not fail the build.

## Remaining risks and gaps

- Automated coverage is strong around critical server and Print Agent paths but small in the client (four tests). Admin, owner, staff, QR ordering, upload, and success-page UI flows need broader integration coverage.
- Real Razorpay test-mode checkout/webhook delivery, Cloudinary delivery, SMTP, Socket.IO reconnect behavior, MongoDB migrations, and physical Windows printer/spooler behavior require environment-level smoke tests. Unit/integration tests cannot fully validate these external systems.
- The server has no dedicated lint or syntax-check script; the Print Agent has only a three-file syntax script. Adding repository-wide checks would improve regression detection.
- The empty root manifest provides no single command for installing, testing, or building all three applications.
- The server test suite logs expected `Socket.IO is not initialized` warnings when controllers are tested without a live socket server. Tests pass, but test logging could be quieter.
- No dependency/security audit or version-upgrade work was performed. Such changes are broader and should be planned separately.

## Proposed plan before major architectural changes

No major architectural change has begun. Obtain approval before starting this plan:

1. Establish a regression baseline: add root-level non-destructive `check` scripts and document supported Node/Windows/MongoDB versions.
2. Expand tests around payment state transitions and the main client role flows, keeping current APIs and database fields unchanged.
3. Add environment smoke-test checklists for Razorpay, Cloudinary, Socket.IO, invoice delivery, and a physical Windows printer.
4. Review operational observability: structured redacted logs, health checks, queue metrics, and recovery runbooks.
5. Only after the above baseline, propose any dependency upgrades or internal refactors as small, separately approved changes with migration/rollback notes.

The payment invariants remain mandatory for every future change: manual UPI is never automatically paid; Razorpay is paid only after server-side signature verification; cash remains pending until staff confirms receipt; and only paid orders may enter the Print Agent queue.
