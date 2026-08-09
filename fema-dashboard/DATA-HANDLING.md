# Data handling — PA Grants Command Center

**Purpose:** describe, accurately, where data goes in this application so a risk
reviewer can decide whether and how it may be used with client and controlled
data.

**Status of the software described:** working prototype running on synthetic
data. Real-data ingestion is specified but **not yet built**. This document
separates what is verifiably true today from what is design intent, because
conflating the two is how a security review gets a wrong answer.

**Who wrote this:** the application and this document were produced with AI
assistance (Claude). Every claim marked *verifiable* below can be checked
independently by your own staff using the method given in §6 — please do check
them rather than taking this document's word for it.

---

## 1. Summary for reviewers

1. **The application itself has no server, no database, and makes no network
   requests at runtime.** Verified against the built bundle. There is no
   telemetry, no analytics, and no third-party service.
2. **The primary exposure is not the application — it is the development
   process.** Building software with an AI coding assistant transmits the files
   and prompts in that session to the assistant's provider. This is the control
   that matters most, and it is a process control, not a code control.
3. **Three specific actions would publish data to the open internet**, and all
   three are easy to perform by accident. They are enumerated in §4 with
   controls.
4. **The source repository is currently public** (`github.com/jbw4rc/jbw-app-creation`,
   visibility `public`, GitHub Pages enabled). Anything committed to it, or built
   and deployed from it, is world-readable.

The short version: the runtime architecture is genuinely low-risk, and the
surrounding workflow is where a leak would come from.

---

## 2. Three data paths, kept separate

Most confusion in reviews of this kind comes from treating these as one system.
They are three, with different exposures and different controls.

| Path | What moves | Where it goes | Exposure |
|---|---|---|---|
| **A. Build time** — writing the software | Source files, prompts, any file the assistant reads | The AI provider's API | **High if real data is present in the session.** Controlled by process, not code. |
| **B. Runtime** — a user operating the app | The extract the user loads | Nowhere. Parsed in the browser's memory | **Low.** No network calls exist. |
| **C. Distribution** — sharing the result | Whatever is inside the built page | Potentially the open internet | **High and easy to trigger accidentally.** See §4. |

---

## 3. Path B — what the application does (verifiable)

These statements are true of the code as committed and can be independently
confirmed:

- **No network calls.** The source contains no `fetch`, `XMLHttpRequest`,
  `WebSocket`, `navigator.sendBeacon`, or dynamic `import()`. Loading the built
  page produces zero external requests.
- **No backend.** There is no server component. The build output is static files:
  one HTML file, one CSS file, one JS file.
- **No telemetry or analytics.** No third-party SDK of any kind.
- **Two runtime dependencies:** `react` and `react-dom`. Nothing else ships to the
  browser. Build-time tooling (`vite`, `typescript`, type definitions) does not
  ship.
- **No fonts, images, or assets fetched remotely.** Typography is system fonts;
  all charts are inline SVG drawn by the application.

**When real ingestion is built as specified**, an extract loaded by the user is
read via the browser's local File API, parsed in memory, and rendered. It is not
uploaded, because there is nowhere to upload it to.

### What the application does store locally

Two things persist on the user's device, both by design and both worth naming:

| What | Where | Contains |
|---|---|---|
| Notes and dismissals | `localStorage`, key `pa-command-center:annotations:v1` | Free-text notes the user types, and exception record IDs |
| CSV exports | The user's Downloads folder, on explicit click | Full queue contents including applicant names and dollar figures |

Both are unencrypted, in the clear, and subject to whatever endpoint controls
your organization already applies to files on that machine. Planned snapshot
history (Blueprint Phase 4) adds a third: aggregate counts and totals in
IndexedDB — specified as aggregates only, never the parsed dataset.

**These are endpoint-resident data at rest.** They are not an egress path, but
they are within scope of most data-handling policies and should be declared.

---

## 4. Path C — the three ways this leaks, and the controls

Each of these is a plausible accident, not a hypothetical.

### 4.1 Committing real data to a public repository

The source repository is **public**. A real extract saved into the project folder
and committed is immediately world-readable, and remains recoverable from git
history even after deletion.

> **Control.** Before any real-data work: add `*.xlsx`, `*.xls`, `*.csv`,
> `data-real/`, and `dist/` to `.gitignore`. Better, make the repository private
> or move real-data work to an entirely separate internal repository. Verify with
> `git status` before every commit.

### 4.2 Compiling real data into the build

The current prototype's dataset is a source file that **compiles into the
JavaScript bundle**. Any data placed there is embedded in `dist/`, and travels
anywhere that build output travels.

> **Control.** Real data enters only at runtime through the file picker, never as
> a source file. The ingestion design in Blueprint Phase 2 enforces this
> structurally: the parser reads from the File API, and no build step touches
> real data.

### 4.3 Publishing a hosted page

Two variants, both live today:

- **Artifact publishing** inlines the entire application *including its data*
  into a page hosted on `claude.ai`. The mockup shared earlier was published this
  way. It contains synthetic data only.
- **GitHub Pages** is enabled on this repository. A Pages deployment publishes
  `dist/` to the open internet.

> **Control.** Never publish an artifact or a Pages deployment built from real
> data. Real-data use is local-only: `npm run dev` or a locally opened build.
> Treat "share this dashboard with someone" as a request to share the *code*, and
> let them load their own extract.

---

## 5. Path A — the development process

**This is the part a risk review should focus on.**

When software is built using an AI coding assistant, the assistant receives the
contents of files it reads and the text of prompts, and transmits them to its
provider for processing. If a real client extract is open in that session — or
if the assistant is asked to read one — that data is transmitted.

This is true of the assistant as a category, not a defect of this project. It
applies equally to Claude Code, Copilot, Cursor, and any similar tool.

> **Control.** Develop the parser against a **de-identified sample** with the same
> column headers, data types, and row shape as the real extract, but with
> substituted names and amounts. The mapping work in Blueprint Phase 1 needs
> *headers*, not rows. Load real data only into the finished application, in a
> normal browser, with no assistant session running against it.

The prototype was built entirely on generated fictional data. No client or
controlled data was present at any point in its construction. Applicant names,
project numbers, dollar figures, and dates are invented, and the generator is in
the repository for inspection (`src/data/generate.ts`).

### What I cannot attest to

Stated plainly, because a review should not rest on assumptions:

- **The terms governing your AI assistant account** — retention periods, whether
  inputs may be used for model training, data residency, and subprocessors. These
  vary by plan and by contract. Obtain them from your vendor agreement; do not
  infer them from this document.
- **Whether your organization's agreement permits this category of data** in an
  assistant session at all. Many professional-services firms restrict this
  specifically for client and government data.
- **Whether the data in your engagement is CUI**, and if so, which controls attach
  (NIST SP 800-171 and the terms of your client agreement will govern, not this
  document).
- **Your endpoint posture** — disk encryption, DLP, browser policy, whether
  `localStorage` and Downloads are backed up to a cloud service. The at-rest items
  in §3 inherit whatever those controls are.
- **Your client's own requirements**, which may be stricter than your firm's.

---

## 6. How to verify the claims in §3 independently

Do not take this document's word for it. Each check takes minutes.

**No network calls, empirically.** Build the app, open it in a browser, open
DevTools → Network, filter to All, and reload. After the initial page load there
should be zero requests. Then load a data file and confirm the panel stays empty.

**No network calls, in the source.** From `fema-dashboard/`:

```bash
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|import\(" src/
```

Expect no matches. Re-run after any change; consider it a pre-commit check.

**What ships to the browser.** Inspect `dependencies` in `package.json` —
currently `react` and `react-dom` only. Anything added later should be reviewed;
the planned `xlsx` parser will be the first addition.

**What is stored locally.** DevTools → Application → Local Storage and IndexedDB.

**Repository visibility.** Check the repository settings page directly.

**Offline proof.** The most convincing single test: disconnect the machine from
the network, open the built page, load a file, and use the dashboard. It works
completely. There is nothing for it to talk to.

---

## 7. Residual risk register

| # | Risk | Likelihood | Impact | Control | Owner |
|---|---|---|---|---|---|
| 1 | Real extract committed to a public repo | Medium | High | `.gitignore` + private repo + pre-commit check (§4.1) | Developer |
| 2 | Real data compiled into a build | Low | High | Runtime-only ingestion by design (§4.2) | Developer |
| 3 | Hosted page published with real data | Medium | High | Prohibit artifact/Pages publishing of real-data builds (§4.3) | Developer |
| 4 | Real data read by an AI assistant session | **High without a control** | High | De-identified sample for development (§5) | Developer |
| 5 | CSV exports accumulating in Downloads | High | Medium | Existing endpoint DLP and retention policy | Security |
| 6 | Notes in `localStorage` on a shared or synced machine | Medium | Low–Medium | Endpoint encryption; treat notes as client-confidential | Security |
| 7 | Dependency supply chain (`npm install`) | Low | Medium | Lockfile committed; internal registry or mirror if required | Security |
| 8 | Dashboard is wrong rather than leaky — decisions made on miscomputed numbers | Medium | Medium | Reconciliation against existing PowerQuery tables before trust (Blueprint §9) | Process owner |

Risk 8 is not a security risk, but it is the one most likely to actually cause
harm, and it belongs in front of the same reviewers.

---

## 8. Recommended conditions of use

A reviewer could reasonably approve on these terms:

1. Real-data work happens in a **private** repository, or outside source control
   entirely.
2. Data files are **git-ignored** and never committed.
3. Development uses **de-identified samples**; real extracts are loaded only into
   the finished application, outside any AI assistant session.
4. **No hosted publication** — no artifact, no GitHub Pages, no shared link — of
   any build containing real data.
5. The application is **run locally** by each user, who loads their own extract.
6. CSV exports and browser-stored notes are treated as **client-confidential** and
   inherit existing endpoint controls.
7. Numbers are **reconciled against the existing workbook** before any decision
   relies on them.

Under these conditions, real data touches only: the user's browser memory, their
local disk (exports and notes), and the source extract itself. It does not reach
a server, a vendor, or the internet.
