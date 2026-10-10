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

Add daily priorities, complete them, and turn a priority into a linked time block. Taskers retain their owners, project, deadline, and prerequisites when scheduled. Completing the tasker completes its linked blocks; finishing all linked blocks completes the tasker when its prerequisites are satisfied. Reopening linked work reopens the tasker. Capture an accomplishment without leaving your day, or use **Record result** on a completed priority to preserve the tasker, project, people, and objective links. The category breakdown shows how you divided your planned time. Print day produces a schedule suitable for paper or PDF.

The **What needs your attention** panel explains prompts from your saved facts: overdue suspenses, unfinished prerequisites, estimated effort compared with scheduled time before a deadline, missing strategic links, follow-up dates, and incomplete career records. These are deterministic planning rules that run on your device; they do not send records to an AI service.

## Connected tools

- **Projects & taskers:** project objectives, POCs, resources, risks, success measures, baseline/target/actual results, SWOT, milestone taskers, priorities, owners, requestors, timed suspenses, dependencies, effort estimates, and progress derived from linked work. Meeting agendas and decisions connect to action taskers. Battle rhythms generate dated time blocks with daily, weekly, monthly, quarterly, or yearly patterns; preview reports duplicate or conflicting dates before saving available blocks. Generated blocks remain editable individually.
- **Mission & priorities:** an editable objective hierarchy from personal and section priorities to squadron, wing, service, and national objectives. Projects, taskers, and accomplishments show direct and inherited alignment, completion counts, results, evidence, and missing-information prompts. Organizational priorities are entered by the user, with sources kept in notes.
- **Calendar:** month view, weekly/monthly/quarterly/yearly events, time blocks, taskers, goal targets, project deadlines, objectives, career plans, meetings, and leadership follow-ups. Source dates are read live and linked event duplicates are suppressed. Missing calendar dates (such as the 31st in February or February 29 in a non-leap year) are skipped. Recurring event editing and deletion affect the entire series. Linked reminder dates follow their source record; calendar controls open the source for editing.
- **Career progress:** service dates, time in grade/service, editable milestones, the existing limited A1C/SrA estimate, and broader rank-aware preparation plans for junior enlisted, BTZ, WAPS, SNCO boards, Guardians, and Guard/Reserve paths. Plans retain cycle, AFSC, source, user-recorded checked date, custom steps, and tasker-linked checklist completion. Evaluation preparation checkpoints and explicitly unverified PDF SCOD reference dates can populate planning milestones.
- **Career records:** preserved quick captures expand into Action, Impact, Result, evidence, lessons, searchable tags, Major Graded Area and Airman Leadership Quality classifications, and actual project/tasker/objective/people links. A filtered accomplishment portfolio downloads the user's actual records as text grouped by MGA.
- **Personal readiness:** dated habit check-ins and editable fitness, well-being, education, family, and social goals.
- **Leadership:** team and supervisory relationships, contacts, feedback history, assigned work, structured training/mentoring/responsibility actions, and linked follow-ups. Progressive discipline preparation records expectations, general gaps, support actions, consultation status, and follow-up dates. It supports preparation and review; it does not select disciplinary action or determine personnel eligibility.
- **Helping Hands:** a local contact directory for wingmen, supervisory contacts, and support agencies, plus explainable need-to-resource matching for family, personal, financial, and legal needs. Matched agencies display your saved local contact details when available.
- **Tools:** a monthly budget/savings calculator, running pace and goal pace, and manually entered fitness component points.
- **Settings:** profile customization, validated JSON backup import/export, confirmed reset, and the supplied 2026 PDF reference.

All modules remain available regardless of rank or selected role.

## Data and offline behavior

Planner data is stored in browser local storage under `enlisted-planner:v1`. The app does not send planner entries to a server and has no analytics or cloud synchronization. Local storage is not encrypted or a backup; anyone with access to your browser profile may access its data. Export regularly, especially before clearing browser data or changing devices.

The current backup schema is **version 2**. Version 1 data and backups migrate without losing original fields; the storage key stays `enlisted-planner:v1` so the published app finds existing plans. Loading alone preserves the saved bytes; a subsequent edit saves the migrated version. Imports validate the complete backup (up to 10 MB of UTF-8 JSON), including linked record references and circular dependencies, before requesting replacement confirmation. Unsupported versions and malformed fields are rejected without replacing current data. Deleting a linked source detaches references while preserving associated work and accomplishment text. Storage failures and unreadable saved data are reported. Unreadable data is preserved until the user explicitly imports a valid backup or resets. Idle tabs synchronize changes; stale edits are blocked from overwriting a changed saved plan and remain available for export. Keep older app tabs closed when switching to the new version.

The production app precaches its shell and built assets. After one connected production visit, it can reopen and use local planner features offline. Installation depends on the browser/platform; a browser-provided Install option is shown when available. The reference PDF and external official resources are not precached and may require a connection. Close all open app tabs and reopen while online to activate a newly deployed service-worker version. Browser storage policies can evict cached resources.

## Planning assumptions and limits

This is an unofficial planning application. Verify official dates, personnel eligibility, and fitness requirements with your service and unit. The PDF informed the back-half workflows on pages 68–84, including AIR/MGA/ALQ records, projects, meetings, SWOT, battle rhythm, teammates, Helping Hands, discipline preparation, strategic alignment, and promotions. It contains inherited older material, so its policy tables are not treated as verified current guidance.

The numerical promotion calculator still covers **Air Force, Active Duty, A1C** only: the earlier of (36 months TIS and 20 months TIG) or 28 months TIG, with a BTZ planning date six months earlier. It does not determine selection, restrictions, or official effective dates. Its assumptions and version are visible; update and verify the rules before depending on them. The new broader career tools organize preparation for other grades and components without inventing eligibility or selection predictions. Source checked dates record the user's review. SCOD reference estimates are explicitly labeled as unverified, and chosen evaluation preparation offsets are not policy-mandated feedback intervals. Live official policy retrieval was unavailable during this build; source links remain available for user verification.

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

Unit/integration tests cover migration and strict import safeguards, references and graph cycles, completion synchronization, date recurrence, scheduling conflicts, project/tasker rules, strategy rollups, accomplishment portfolios, career preparation, feedback, support matching, readiness, and settings. Chromium tests exercise complete production workflows, mobile navigation, durable linked planning, backup import/export, and offline reload. Browser tests start a production preview server automatically; build first.

## GitHub Pages

The app uses relative asset paths and hash navigation, so it can be hosted at a GitHub Pages repository path. `.github/workflows/ci.yml` validates pull requests and pushes. `.github/workflows/pages.yml` is a **manual** web deployment workflow: after the code is on GitHub, enable GitHub Actions as the Pages source in repository settings and run the workflow. It builds and deploys `dist`; no credentials belong in the source. Creating these workflows does not itself push or publish the app.

## Code layout

`src/lib/types.ts` defines the data contract. `planner.tsx` owns persistence, migration, and validated backups; `relationships.ts` reconciles linked work and handles deletion. `workflow.ts`, `alignment.ts`, `intelligence.ts`, `calendar-agenda.ts`, `career-planning.ts`, and `support-resources.ts` contain explainable planning rules. `dates.ts`, `calculations.ts`, and `time-blocks.ts` contain calendar and numerical rules. `src/pages` contains the connected modules; `App.tsx` owns navigation and onboarding. `public/reference` contains the supplied planner PDF. `tests` holds Chromium workflow tests.

Cloud tasks already have isolated checkouts. Work in the existing repository; do not create a Git worktree unless explicitly requested.
