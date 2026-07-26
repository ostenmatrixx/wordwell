<div align="center">
  <img src="public/icon.svg" width="96" height="96" alt="Wordwell app icon">
  <h1>Wordwell</h1>
  <p><strong>An offline-first multiplayer companion for Scrabble, Boggle, Scribbage, and Word Factory.</strong></p>
  <p>
    <a href="https://github.com/ostenmatrixx/wordwell"><img src="https://img.shields.io/github/package-json/v/ostenmatrixx/wordwell?style=flat-square&color=f97360" alt="Version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/ostenmatrixx/wordwell?style=flat-square&color=6d5bd0" alt="MIT License"></a>
    <a href="https://github.com/ostenmatrixx/wordwell/commits/main"><img src="https://img.shields.io/github/last-commit/ostenmatrixx/wordwell/main?style=flat-square&color=4f9d87" alt="Last commit"></a>
    <a href="https://github.com/ostenmatrixx/wordwell/issues"><img src="https://img.shields.io/github/issues/ostenmatrixx/wordwell?style=flat-square&color=f6bd60" alt="Open issues"></a>
  </p>
  <p>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-20232a?style=flat-square&logo=react&logoColor=61dafb" alt="React 19"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8"></a>
    <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite 7"></a>
    <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-Realtime-3fcf8e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase Realtime"></a>
    <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-Database-4169e1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
    <a href="https://tesseract.projectnaptha.com/"><img src="https://img.shields.io/badge/Tesseract.js-OCR-5c6ac4?style=flat-square" alt="Tesseract.js OCR"></a>
    <a href="https://developer.mozilla.org/docs/Web/API/IndexedDB_API"><img src="https://img.shields.io/badge/IndexedDB-Offline_storage-f6bd60?style=flat-square" alt="IndexedDB offline storage"></a>
    <a href="https://developer.chrome.com/docs/workbox/"><img src="https://img.shields.io/badge/Workbox-Service_worker-4285f4?style=flat-square&logo=googlechrome&logoColor=white" alt="Workbox service worker"></a>
    <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Vitest-Testing-6e9f18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest"></a>
    <a href="https://web.dev/progressive-web-apps/"><img src="https://img.shields.io/badge/PWA-offline--ready-f97360?style=flat-square&logo=pwa&logoColor=white" alt="Offline-ready PWA"></a>
  </p>
  <p>
    <a href="#what-it-does">What it does</a> ·
    <a href="#production-engineering">Production engineering</a> ·
    <a href="#tech-stack">Tech stack</a> ·
    <a href="#architecture">Architecture</a> ·
    <a href="#local-development">Local Development</a>
  </p>
</div>

## What it does

Wordwell replaces the shared paper score sheet without replacing the physical word game—and it can become the Word Factory board itself. Create a room, let every player join from their own phone, and collect answers in parallel instead of passing one device around the table.

Wordwell is a progressive web app built with React, TypeScript, Vite, and Supabase. Its camera and OCR workflow runs on the player's device, while PostgreSQL and Realtime keep multiplayer rooms synchronized.

The project is an open-source MVP. The core scoring, room, camera, OCR, and offline flows are implemented, but you should review the production-security checklist before hosting a public instance.

## Features

- Installable PWA with an offline dictionary, OCR assets, and recoverable local drafts
- Live rooms for 2–6 named players on separate phones
- Six-character room codes with anonymous Supabase authentication
- Camera capture, cropping, on-device handwriting OCR, and manual answer review
- Host-confirmed 4×4 or 5×5 Boggle/Scribbage boards
- Online Word Factory with balanced generated 4×4 or 5×5 dice boards
- Synchronized countdown, server-authoritative timer, global pause, and automatic reveal
- Private quick entry with revisioned autosave and offline draft recovery
- Private parallel submissions that reveal together when the host closes the round
- Automatic dictionary, board-path, minimum-length, and duplicate checking
- Live roster, readiness, timer, reveal, score ledger, and scoreboard updates
- Turn-based Scrabble with shuffled play order, shared definitions, passes, and manual board-score entry
- Podium-style final leaderboard with totals, scoring-word counts, and best plays

## Production engineering

Wordwell is an open-source MVP built with production-oriented boundaries and failure recovery:

- **Server-authoritative multiplayer:** PostgreSQL RPCs control room mutations, round transitions, deadlines, submission revisions, and score publication.
- **Offline resilience:** Workbox precaches the application, dictionary, fonts, and OCR runtime, while IndexedDB preserves in-progress drafts across refreshes and temporary connection loss.
- **Safe recovery:** Late and stale submissions are rejected, interrupted host processing can resume after reconnecting, and local drafts remain recoverable until synchronization succeeds.
- **Privacy by design:** Camera images and Tesseract.js processing remain on the player's device; photos are never uploaded to Supabase.
- **Database security:** Anonymous players receive temporary Supabase identities, and row-level security protects data accessed through the browser's public publishable key.
- **Repeatable validation:** Deterministic unit tests cover scoring, generated boards, path validation, duplicate handling, OCR normalization, and offline storage.
- **Portable deployment:** The frontend builds to static assets and receives environment-specific Supabase configuration at build time, with no server secrets bundled into the client.

## Tech stack

| Area | Technology | Role in Wordwell |
| --- | --- | --- |
| Web app | React 19, TypeScript, Vite 7 | Component UI, type safety, and builds |
| PWA | `vite-plugin-pwa`, Workbox | Installation, service worker, and offline assets |
| Backend | Supabase, PostgreSQL | Rooms, rounds, submissions, score history, and row-level security |
| Multiplayer | Supabase Realtime, PostgreSQL RPCs | Live rosters, synchronized rounds, authoritative deadlines, submissions, and score updates |
| Authentication | Supabase anonymous auth | A temporary identity for each player device |
| OCR | Tesseract.js | On-device recognition of photographed answer sheets |
| Camera and crop | Media capture, `react-easy-crop` | Photographing and reviewing boards or answer sheets |
| Offline storage | IndexedDB, `idb-keyval` | Recoverable answer drafts and temporary local data |
| Dictionary | `sowpods` | Bundled offline word validation |
| Testing | Vitest, Playwright CLI | Unit coverage plus independent multi-phone browser flows |
| Styling | Handwritten CSS, Lucide icons, Fontsource | Responsive vibrant-pastel interface |

## Architecture

Wordwell has no custom application server. The Vite PWA runs on each player's device, and Supabase provides authentication, transactional PostgreSQL RPCs, persistence, and Realtime updates.

```mermaid
flowchart LR
  subgraph Device["Player device"]
    UI["React PWA"]
    OCR["Camera + Tesseract.js"]
    Dictionary["SOWPODS dictionary"]
    Drafts[("IndexedDB drafts")]
    Cache["Workbox cache"]
  end

  subgraph Supabase["Supabase backend"]
    Auth["Anonymous Auth"]
    RPC["PostgreSQL RPCs"]
    DB[("PostgreSQL")]
    Realtime["Realtime"]
  end

  Cache --> UI
  OCR --> UI
  Dictionary --> UI
  UI <--> Drafts
  UI --> Auth
  UI --> RPC
  RPC --> DB
  DB --> Realtime
  Realtime --> UI
```

The client owns presentation, camera capture, OCR, draft persistence, and offline dictionary checks. PostgreSQL owns shared room state, authoritative deadlines, revisions, results, and score history. Realtime publishes database changes back to every connected player. The camera and OCR path ends inside the device boundary.

### Project structure

```text
src/
  components/          Generated play, camera capture, board editing, and answer review
  lib/                 Board generation, scoring, grid validation, OCR, storage, and room APIs
  App.tsx              Multiplayer flows and application UI
public/                PWA icons
supabase/migrations/   PostgreSQL schema, RLS policies, and room RPCs
vite.config.ts         Vite build and PWA precache configuration
```

The service worker precaches the application, SOWPODS bundle, fonts, Tesseract worker, WASM cores, and English OCR model. Supabase API responses and player photos are not added to the runtime cache.

## Game scoring

| Mode | Validation and scoring |
| --- | --- |
| Scrabble | A shuffled order controls the shared checker. Valid words use bundled SOWPODS validation, display an online-and-cached meaning, and accept a manual board score so physical multipliers and bonuses are preserved. Invalid words and passes advance the turn immediately. |
| Boggle | Words must contain at least 3 letters. 3–4 letters = 1 point, 5 = 2, 6 = 3, 7 = 5, and 8+ = 11. Exact matches between players score zero. |
| Scribbage / Word Factory | Words must contain at least 4 letters. 4 letters = 1 point, 5 = 2, 6 = 3, 7 = 5, and 8+ = 11. Exact matches between players score zero. |

Dictionary editions and house rules can differ. Wordwell currently bundles the international SOWPODS word list and lets the host override disputed dictionary or board-path decisions.

## Multiplayer round flow

1. The host chooses the game mode, player count, board size, and timer. Word Factory rooms also choose a generated or physical board.
2. Players join with the room code and choose their display name.
3. In a generated Word Factory round, Wordwell rolls a balanced dice-style grid and opens it on every phone after a synchronized three-second countdown.
4. Players type into private, automatically saved lists. The board and entry field lock globally while paused and immediately at the server-calculated deadline.
5. At zero, the host client automatically freezes submissions, validates the lists with SOWPODS and adjacent-tile paths, and publishes the reveal. A reconnecting host resumes interrupted processing.
6. In a physical Boggle or Word Factory round, the host instead photographs or manually enters the grid; players scan, crop, review, and submit their handwritten answers after play.
7. Wordwell crosses out same-player and cross-player duplicates, scores valid answers, and carries finalized totals into the next host-controlled round.
8. Finishing any game opens a final podium and leaderboard with each player’s total, scoring-word count, and highest-value play.

Photos are processed locally and are not uploaded to Supabase. The temporary image is removed after local OCR finishes; reviewed drafts can remain on the phone so a lost connection does not erase a player's work.

Scrabble word validation remains bundled with the app, but shared turns require a live connection so the server can prevent out-of-turn or repeated checks. Meanings are fetched from the Free Dictionary API and cached after a successful lookup; a missing meaning never changes a SOWPODS result. The host can skip a stalled Scrabble turn, and an unscored pending word is discarded if the host finishes the game.

## Local Development

Requirements: a current Node.js LTS release and npm. A Supabase project is only required for multiplayer rooms.

```bash
git clone https://github.com/ostenmatrixx/wordwell.git
cd wordwell
npm ci
npm run dev
```

Open the local URL printed by Vite. Dictionary checking, camera review, OCR, and draft storage work without a backend. To create or join multiplayer rooms, copy the environment template and complete the Supabase setup below:

```bash
cp .env.example .env.local
```

### Supabase setup

1. Create a Supabase project.
2. Enable **Anonymous Sign-Ins** under Authentication → Providers → Anonymous.
3. Apply the SQL files in [`supabase/migrations`](supabase/migrations) in filename order.
4. Copy the project URL and publishable/anon key from the Supabase dashboard into `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Only the public Supabase URL and publishable key belong in `VITE_*` variables. Never expose the PostgreSQL password, service-role key, or another server secret to the browser.

Before a public production launch, configure CAPTCHA/Turnstile for anonymous sign-in, rate limits and data-retention cleanup, private Realtime channels, and deployment security headers.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Type-check and create the production PWA |
| `npm run preview` | Preview the production build locally |

## Production deployment

Wordwell is a static Vite application and can be hosted on Vercel, Netlify, Cloudflare Pages, or another static host. Configure these build-time variables in the hosting provider for both preview and production environments:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Use `npm run build` as the build command and `dist` as the output directory. Never commit `.env.local`; it is intentionally ignored by Git.

## Validation

The project includes tests for:

- Boggle and Scribbage scoring rules
- Balanced deterministic 4×4 and 5×5 generated boards, including `QU`
- Duplicate cancellation and round evaluation
- Grid-path validation
- Board-image splitting
- OCR answer normalization
- Offline draft and photo storage

Run `npm test` and `npm run build` before publishing changes.

## Contributing

Contributions, bug reports, and feature ideas are welcome.

1. Fork the repository and create a focused branch from `main`.
2. Install dependencies with `npm ci`.
3. Make the change and add or update tests when behavior changes.
4. Run `npm test` and `npm run build`.
5. Open a pull request describing the problem, solution, and validation.

Please keep game rules configurable where editions or house rules can differ. Do not include Supabase passwords, service-role keys, player photos, or other private data in issues, commits, or test fixtures.

## Security

The browser requires a Supabase publishable/anon key; that key is public by design and must be protected by row-level security policies. Database passwords and service-role keys are secrets and must never be exposed through `VITE_*` variables.

If you discover a vulnerability, avoid posting exploitable details in a public issue. Contact the repository owner privately through their GitHub profile first.

## License

Wordwell is open-source software available under the [MIT License](LICENSE). © 2026 Osten.
