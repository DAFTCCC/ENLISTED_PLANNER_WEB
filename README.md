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

- **Review & plan:** Monday–Sunday review with planned time, completed block durations, dated tasker completions, accomplishments, overdue work, teammate follow-ups, and evidence gaps. Save reflections and choose taskers to carry forward. The scheduling assistant proposes working-hour blocks around existing commitments, breaks, appointment buffers, prerequisites, and suspenses. Review and accept proposals before saving; it never changes task deadlines. Missing effort estimates use an explicitly displayed 30-minute planning allowance. Completed block durations are planned durations, not measured hours worked.
- **Projects & taskers:** project objectives, POCs, resources, risks, success measures, baseline/target/actual results, SWOT, milestone taskers, priorities, owners, requestors, timed suspenses, dependencies, effort estimates, and progress derived from linked work. Meeting agendas and decisions connect to action taskers. Battle rhythms generate dated time blocks with daily, weekly, monthly, quarterly, or yearly patterns; preview reports duplicate or conflicting dates before saving available blocks. Generated blocks remain editable individually.
- **Tasker intake:** paste email or meeting notes, extract editable drafts, resolve uncertain dates/owners/projects, and confirm each draft before creating taskers. Relative dates are left for review. The original text stays on the device; extraction uses local rules.
- **Shared taskers:** create a portable offer file, let a recipient import it and export a progress/blocker/submission update, then review the returned update. Submission and supervisor-confirmed completion are separate steps. File exchange does not authenticate identities or provide live team synchronization. Those connections require the existing backend's API and sign-in details.
- **Mission & priorities:** an editable objective hierarchy from personal and section priorities to squadron, wing, service, and national objectives. Projects, taskers, and accomplishments show direct and inherited alignment, completion counts, results, evidence, and missing-information prompts. Organizational priorities are entered by the user, with sources kept in notes.
- **Calendar:** month view, weekly/monthly/quarterly/yearly events, time blocks, taskers, goal targets, project deadlines, objectives, career plans, meetings, and leadership follow-ups. Source dates are read live and linked event duplicates are suppressed. Missing calendar dates (such as the 31st in February or February 29 in a non-leap year) are skipped. Recurring event editing and deletion affect the entire series. Linked reminder dates follow their source record; calendar controls open the source for editing.
- **Career progress:** service dates, time in grade/service, editable milestones, sourced minimum time-in-grade and time-in-service dates for the next grade (Air Force active duty, AB through SMSgt), the A1C/SrA and BTZ estimate, and broader rank-aware preparation plans for junior enlisted, BTZ, WAPS, SNCO boards, Guardians, and Guard/Reserve paths. Plans retain cycle, AFSC, source, user-recorded checked date, custom steps, and tasker-linked checklist completion. Evaluation preparation checkpoints and explicitly unverified PDF SCOD reference dates can populate planning milestones.
- **Career readiness map:** track PME, training, certifications, records, and experience with service/component/rank/AFSC scope, actual completion evidence, expiry, and user-recorded source checks. Missing evidence, expired credentials, and stale source checks prompt review; they do not determine official eligibility.
- **Career records:** preserved quick captures expand into Action, Impact, Result, evidence, lessons, searchable tags, Major Graded Area and Airman Leadership Quality classifications, and actual project/tasker/objective/people links. A filtered accomplishment portfolio downloads the user's actual records as text grouped by MGA.
- **Personal readiness:** dated habit check-ins and editable fitness, well-being, education, family, and social goals.
- **Leadership:** team and supervisory relationships, contacts, feedback history, assigned work, structured training/mentoring/responsibility actions, and linked follow-ups. Progressive discipline preparation records expectations, general gaps, support actions, consultation status, and follow-up dates. It supports preparation and review; it does not select disciplinary action or determine personnel eligibility.
- **Helping Hands:** a local contact directory for wingmen, supervisory contacts, and support agencies, plus explainable need-to-resource matching for family, personal, financial, and legal needs. Matched agencies display your saved local contact details when available.
- **Tools:** a monthly budget/savings calculator, running pace and goal pace, saved fitness component points on the 50/20/15/15 scale, and a practice-assessment scorer that converts run/HAMR times, push-ups, sit-ups, reverse crunches, plank time, and waist-to-height ratio into points with the official PFRA scoring charts (effective 1 March 2026), including component minimums, AFSPECWAR/EOD standards, and the 2.0 km walk.
- **Settings:** optional passcode lock, profile customization, validated JSON backup import/export, automatic recovery copies, confirmed reset, and the supplied 2026 PDF reference. Recovery keeps up to 12 snapshots within 32 MB in this browser's IndexedDB. Restoring replaces the current plan after confirmation and retains the previous plan. Copies can be downloaded or explicitly deleted.

All modules remain available regardless of rank or selected role.

## Data and offline behavior

Planner data is stored in browser local storage under `enlisted-planner:v1`; automatic recovery copies are stored in IndexedDB. The app does not currently send planner entries to a server and has no analytics or active cloud synchronization. Browser storage is not encrypted unless you turn on the **passcode lock** in Settings. With the lock on, the saved plan and recovery copies are encrypted with AES-GCM under a random data key wrapped by a PBKDF2-SHA-256 (600,000 iterations) passcode key, stored under `enlisted-planner:vault`; the app locks on every open and after 10 minutes in the background. A forgotten passcode cannot be recovered, and exported JSON backups are not encrypted. Local recovery copies can be lost when browser data is cleared or evicted, so export backups before changing devices. A validated three-way merge and compare-and-swap sync core is prepared for the existing backend; see [backend integration requirements](docs/backend-integration.md).

The current backup schema is **version 3**. Version 1 and 2 data and backups migrate without losing original fields; the storage key stays `enlisted-planner:v1` so the published app finds existing plans. Loading alone preserves the saved bytes; a subsequent edit saves the migrated version. Historical completed taskers without a completion date remain undated and are excluded from dated weekly completion counts. Imports validate the complete backup (up to 10 MB of UTF-8 JSON), including linked record references and circular dependencies, before requesting replacement confirmation. Unsupported versions and malformed fields are rejected without replacing current data. Deleting a linked source detaches references while preserving associated work and accomplishment text. Storage failures and unreadable saved data are reported. Unreadable data is preserved until the user explicitly imports a valid backup or resets. Idle tabs synchronize changes; stale edits are blocked from overwriting a changed saved plan and remain available for export. Resetting the current plan preserves automatic recovery history until it is explicitly deleted. Keep older app tabs closed when switching to the new version.

**Calendar connections & reminders** in Calendar exports a bounded `.ics` snapshot for import into calendar applications. It includes selected blocks, tasker deadlines, events, targets, and follow-ups, with optional alerts. Notes are excluded by default. Times use local clock values, including correct next-day midnight endings; all-day alerts use a documented 09:00 convention. Exports are snapshots, not ongoing calendar synchronization; repeated imports may duplicate entries. Browser reminders are opt-in, request permission only from the button, and run while the app is open and visible. There is no closed-app push delivery or Google/Outlook OAuth connection yet.

The production app precaches its shell and built assets. After one connected production visit, it can reopen and use local planner features offline. Installation depends on the browser/platform; a browser-provided Install option is shown when available. The reference PDF and external official resources are not precached and may require a connection. Close all open app tabs and reopen while online to activate a newly deployed service-worker version. Browser storage policies can evict cached resources.

## Planning assumptions and limits

This is an unofficial planning application. Verify official dates, personnel eligibility, and fitness requirements with your service and unit. The PDF informed the back-half workflows on pages 68–84, including AIR/MGA/ALQ records, projects, meetings, SWOT, battle rhythm, teammates, Helping Hands, discipline preparation, strategic alignment, and promotions. It contains inherited older material, so its policy tables are not treated as verified current guidance.

Numerical promotion dates cover **Air Force, Active Duty** only. A1C uses the earlier of (36 months TIS and 20 months TIG) or 28 months TIG, with a BTZ planning date six months earlier. Other grades show the dates minimum TIG and TIS are reached, from `src/lib/promotion-rules.ts`, a versioned rule set citing DAFI 36-2502 Table 2.1 and Table 1.4 (as replaced by DAFGM 2023-01); AB and Amn rules are marked as taken from a summary. Space Force, Guard, and Reserve rules are not built in. It does not determine selection, restrictions, or official effective dates. Its assumptions and version are visible; update and verify the rules before depending on them. The new broader career tools organize preparation for other grades and components without inventing eligibility or selection predictions. Source checked dates record the user's review. SCOD reference estimates are explicitly labeled as unverified, and chosen evaluation preparation offsets are not policy-mandated feedback intervals. Live official policy retrieval was unavailable during this build; source links remain available for user verification.

The fitness tools use the Physical Fitness Assessment scale of cardio 50, waist-to-height 20, strength 15, and core 15. Chart data in `src/lib/pfra-charts.ts` was generated from *Final USAF Physical Fitness Readiness Assessment Scoring (Effective 1 Mar 26)*; every value was extracted twice and checked against the rendered pages, and published irregularities are kept as printed. The waist-to-height ratio is truncated to two decimals, matching the chart's lookup table. The lowest chart value (marked \*) is treated as the component minimum. The charts do not state the passing composite score, exemptions, or how a walk is scored in the composite, so the app does not decide overall pass/fail; confirm these in AFMAN 36-2905. Android APK builds are outside this web implementation; live backend synchronization remains pending connection details.

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

Unit/integration tests cover migration and strict import safeguards, references and graph cycles, completion synchronization, date recurrence, scheduling proposals, weekly review, project/tasker rules, strategy rollups, accomplishment portfolios, qualification evidence/expiry, delegation packets, tasker extraction, calendar export, reminders, recovery retention, sync conflicts, feedback, support matching, readiness, and settings. Chromium tests exercise complete production workflows, mobile navigation, durable linked planning, backup import/export, review and scheduling, actual calendar downloads, IndexedDB recovery, and offline reload. Browser tests start a production preview server automatically; build first.

## GitHub Pages

The app uses relative asset paths and hash navigation, so it can be hosted at a GitHub Pages repository path. `.github/workflows/ci.yml` validates pull requests and pushes. `.github/workflows/pages.yml` is a **manual** web deployment workflow: after the code is on GitHub, enable GitHub Actions as the Pages source in repository settings and run the workflow. It builds and deploys `dist`; no credentials belong in the source. Creating these workflows does not itself push or publish the app.

## Code layout

`src/lib/types.ts` defines the data contract. `planner.tsx` owns persistence, migration, and validated backups; `relationships.ts` reconciles linked work and handles deletion. `workflow.ts`, `alignment.ts`, `intelligence.ts`, `calendar-agenda.ts`, `career-planning.ts`, and `support-resources.ts` contain explainable planning rules. `dates.ts`, `calculations.ts`, and `time-blocks.ts` contain calendar and numerical rules. `src/pages` contains the connected modules; `App.tsx` owns navigation and onboarding. `public/reference` contains the supplied planner PDF. `tests` holds Chromium workflow tests.

Cloud tasks already have isolated checkouts. Work in the existing repository; do not create a Git worktree unless explicitly requested.
