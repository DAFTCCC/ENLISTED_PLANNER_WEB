# Enlisted Planner · Web

**One Airman. One Planner. An Entire Career.**

A responsive, local-first web planner for Air Force and Space Force enlisted members. Created by John Garcia. No account, backend, API key, or database is required.

## Run locally

Use Node.js 24 (see `.nvmrc`) and npm. Node 22.12+ is also supported.

```sh
npm ci
npm run dev
```

The development server prints its address. Build the production app with `npm run build`; serve the result with `npm run preview`. Production service workers require HTTPS, or a browser's trusted local development origin. The service worker is deliberately disabled in the development server.

## Daily time blocking

Open **Day plan** and select a date. Add a title, start/end times, category, and optional notes. Blocks can be edited, completed, deleted with confirmation, or dragged to a new 15-minute position. Selecting a block opens an accessible editor, which also works on touch devices and with a keyboard.

Overlapping blocks are rejected. Adjacent blocks are permitted. A new block may repeat daily for seven days; all seven days are checked before any are saved. These are independent copies, so editing or deleting one does not change the other days. Split overnight plans into two days. The final hourly slot supports an end time of `24:00`.

Add daily priorities, complete them, and turn a priority into a time block. Capture an accomplishment without leaving your day. The category breakdown shows how you divided your planned time. Print day produces a schedule suitable for paper or PDF.

## Connected tools

- **Calendar:** month view, recurring weekly/monthly events, time blocks, tasks, goal targets, and links back to a day's schedule. Monthly events on a missing day (such as the 31st in February) skip that month. Recurring event editing and deletion affect the entire series and are labeled accordingly.
- **Career progress:** service dates, time in grade/service, editable milestones and progress, and a limited, versioned active-duty Air Force A1C/SrA and BTZ planning estimate.
- **Career records:** quick accomplishment capture, followed by detailed background, actions, measurable outcomes, lessons, and searchable tags. The original note and date remain visible while expanding the record.
- **Personal readiness:** dated habit check-ins and editable fitness, well-being, education, family, and social goals.
- **Leadership:** team development records, feedback history, follow-up dates, and calendar follow-ups.
- **Tools:** a monthly budget/savings calculator, running pace and goal pace, and manually entered fitness component points.
- **Settings:** profile customization, validated JSON backup import/export, confirmed reset, and the supplied 2026 PDF reference.

All modules remain available regardless of rank or selected role.

## Data and offline behavior

Planner data is stored in browser local storage under `enlisted-planner:v1`. The app does not send planner entries to a server and has no analytics or cloud synchronization. Local storage is not encrypted or a backup; anyone with access to your browser profile may access its data. Export regularly, especially before clearing browser data or changing devices.

Import validates the complete backup (up to 10 MB of UTF-8 JSON) before requesting replacement confirmation. Unsupported versions and malformed fields are rejected without replacing current data. Storage failures and unreadable saved data are reported. Unreadable data is preserved until the user explicitly imports a valid backup or resets. Idle tabs synchronize changes; stale edits are blocked from overwriting a changed saved plan and remain available for export.

The production app precaches its shell and built assets. After one connected production visit, it can reopen and use local planner features offline. Installation depends on the browser/platform; a browser-provided Install option is shown when available. The reference PDF and external official resources are not precached and may require a connection. Close all open app tabs and reopen while online to activate a newly deployed service-worker version. Browser storage policies can evict cached resources.

## Planning assumptions and limits

This is an unofficial planning application. Verify official dates, personnel eligibility, and fitness requirements with your service and unit. The supplied PDF is offered as the user's reference, rather than copied into an official deadline database.

The promotion calculator covers **Air Force, Active Duty, A1C** only: the earlier of (36 months TIS and 20 months TIG) or 28 months TIG, with a BTZ planning date six months earlier. It does not determine selection, restrictions, or official effective dates. Its assumptions and version are visible; update and verify the rules before depending on them. Other ranks and components use user-entered milestones rather than unsupported calculations.

The fitness calculator computes running pace and sums manually entered points on a **60/20/20** scale. It does not convert repetitions, assign pass/fail, assess component minimums or exemptions, or implement every current service assessment format. Use applicable official scoring charts. Reminders currently consist of in-app dates and follow-up queues; there are no background/push notifications. Android APK builds and cloud synchronization are outside this web implementation.

Store only information you are authorized to keep. Do not enter classified or controlled information. Developer attribution is John Garcia; no personal contact details are published.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On the prepared cloud machine, use the existing system Chromium instead of downloading another browser:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Unit/integration tests cover storage and import safeguards, dates and recurrence, promotion/budget/fitness calculations, time-block conflicts, seven-day creation, career records, feedback, readiness, and settings. Chromium tests exercise the production application, mobile navigation, durable time blocking, backup import/export, and offline reload. Browser tests start a production preview server automatically; build first.

## GitHub Pages

The app uses relative asset paths and hash navigation, so it can be hosted at a GitHub Pages repository path. `.github/workflows/ci.yml` validates pull requests and pushes. `.github/workflows/pages.yml` is a **manual** web deployment workflow: after the code is on GitHub, enable GitHub Actions as the Pages source in repository settings and run the workflow. It builds and deploys `dist`; no credentials belong in the source. Creating these workflows does not itself push or publish the app.

## Code layout

`src/lib/types.ts` defines the data contract. `planner.tsx` owns persistence and validated backups; `dates.ts`, `calculations.ts`, and `time-blocks.ts` contain pure rules. `src/pages` contains the connected modules; `App.tsx` owns navigation and onboarding. `public/reference` contains the supplied planner PDF. `tests` holds Chromium workflow tests.

Cloud tasks already have isolated checkouts. Work in the existing repository; do not create a Git worktree unless explicitly requested.
