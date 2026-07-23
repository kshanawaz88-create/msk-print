# MSK Print Agent

MSK Print Agent is the Windows desktop companion for MSK Print Cloud. It polls a
single shop's paid queue, downloads each source file through the authenticated
backend, and submits it to an installed Windows printer.

## Requirements

- Windows 10 or newer
- Node.js 20 or newer for development
- MSK Print Cloud backend running locally or over HTTPS
- At least one installed Windows printer

Only MSK Print Cloud administrators and shop owners can sign in. The login form
accepts a shop MongoDB ID or `shopCode`, email, and password. The password is
sent only for login and is never written to disk. The agent JWT, print claims,
and deferred status updates are encrypted with Electron `safeStorage` (Windows
DPAPI).

## Run locally

```powershell
cd print-agent
npm install
npm test
npm start
```

The default backend URL is `http://localhost:5000`. To use another backend,
configure it before first launch:

```powershell
$env:MSK_PRINT_API_URL="https://print.example.com"
npm start
```

Non-local API URLs must use HTTPS. The URL is saved in the agent's public local
settings; credentials are stored separately and encrypted.

## Printing behavior

The agent:

1. polls `/api/print/queue` every five seconds without overlapping polls;
2. considers only shop-scoped, Paid orders in Pending or Printing state;
3. atomically claims one Pending order;
4. downloads the original PDF, JPG, or PNG from the protected file endpoint;
5. changes the order to Printing immediately before Windows submission;
6. watches the Windows spool job;
7. reports Completed, Error, or a confirmed cancellation.

If Windows accepted a submission but the spooler cannot prove its outcome, the
agent records an error/needs-review result and never automatically reprints it.
Reprint is an explicit operator action. This avoids duplicate physical output
after a crash or network interruption.

`pdf-to-printer` uses its bundled SumatraPDF executable for Windows printing.
Review that binary's distribution and code-signing requirements before creating
a production installer.

## Local files

Electron stores runtime data outside the repository under its per-user
application-data directories:

- `settings.json`: selected printer, routing settings, pause state, and a
  non-secret recovery journal;
- `secure-session.json`: DPAPI-encrypted JWT, claim tokens, and status outbox;
- `print-agent.jsonl`: bounded local operational log with sensitive-value
  redaction.

Downloaded files are kept only in a temporary directory for the active print
attempt and removed afterward.

## Windows background mode

On launch, the application registers itself to start with Windows using
Electron's login-item API. `--hidden` starts it in the system tray. Closing the
dashboard hides the window; it does not stop queue processing. The tray menu can
open the dashboard, pause/resume the queue, refresh printers, log out, or quit.
Logout and quit are blocked while a print is active.

## Backend configuration

Add these optional values to `server/.env`:

```dotenv
PRINT_AGENT_TOKEN_TTL=7d
PRINT_AGENT_DOWNLOAD_TIMEOUT_MS=30000
```

The backend must also have its existing JWT, MongoDB, and Cloudinary variables.
Cloudinary API credentials never belong in the agent.

## Physical verification

Automated tests use fake printers and do not send paper to a device. Before
production use, test on every printer/driver combination:

- default and non-default printer detection;
- A4 and A3 routing;
- black-and-white and color output;
- portrait, landscape, simplex, and both duplex bindings;
- multiple copies and multi-page files;
- offline, paper-out, jam, and cancelled spool jobs;
- backend interruption before download, after Printing, and after physical
  completion;
- app restart during each print phase;
- tray operation and Windows sign-in startup.
