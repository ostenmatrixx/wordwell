# Wordwell

An installable, offline-capable scorekeeper for Scrabble, Boggle, and Scribbage / Word Factory. Create a room, let every player join from their own phone, and keep the game moving without passing around one device.

Wordwell is a progressive web app built with React, TypeScript, Vite, and Supabase. Its camera and OCR workflow runs on the player's device, while PostgreSQL and Realtime keep multiplayer rooms synchronized.

## Features

- Installable PWA with an offline dictionary, OCR assets, and recoverable local drafts
- Live rooms for 2–6 named players on separate phones
- Six-character room codes with anonymous Supabase authentication
- Camera capture, cropping, on-device handwriting OCR, and manual answer review
- Host-confirmed 4×4 or 5×5 Boggle/Scribbage boards
- Private parallel submissions that reveal together when the host closes the round
- Automatic dictionary, board-path, minimum-length, and duplicate checking
- Live roster, readiness, timer, reveal, score ledger, and scoreboard updates
- Scrabble dictionary checking with manual board-score entry

## Game scoring

| Mode | Validation and scoring |
| --- | --- |
| Scrabble | Checks the word against the bundled SOWPODS dictionary. Players enter the board score manually so multipliers and bonuses remain part of the physical game. |
| Boggle | Words must contain at least 3 letters. 3–4 letters = 1 point, 5 = 2, 6 = 3, 7 = 5, and 8+ = 11. Exact matches between players score zero. |
| Scribbage / Word Factory | Words must contain at least 4 letters. 4 letters = 1 point, 5 = 2, 6 = 3, 7 = 5, and 8+ = 11. Exact matches between players score zero. |

Dictionary editions and house rules can differ. Wordwell currently bundles the international SOWPODS word list and lets the host override disputed dictionary or board-path decisions.

## Multiplayer round flow

1. The host chooses the game mode, player count, board size, and timer.
2. Players join with the room code and choose their display name.
3. For Boggle/Scribbage, the host photographs or manually enters the letter grid and confirms every tile.
4. Everyone plays on paper while the shared round timer runs.
5. Each player photographs their answers, crops the page, reviews the OCR result, and submits from their phone.
6. Answer lists remain private until the host closes the round.
7. Wordwell validates every word, crosses out matches, and calculates the round scores.

Photos are processed locally and are not uploaded to Supabase. The temporary image is removed after local OCR finishes; reviewed drafts can remain on the phone so a lost connection does not erase a player's work.

## Local development

Requirements: a current Node.js LTS release, npm, and a Supabase project for multiplayer features.

```bash
git clone https://github.com/ostenmatrixx/wordwell.git
cd wordwell
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. Dictionary checking, camera review, OCR, and draft storage run locally. Creating or joining a room additionally requires the Supabase configuration below.

## Supabase setup

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

## Commands

```bash
npm run dev      # Start the Vite development server
npm test         # Run the unit test suite once
npm run build    # Type-check and create the production PWA
npm run preview  # Preview the production build locally
```

## Project structure

```text
src/
  components/          Camera capture, board editing, and answer review
  lib/                 Scoring, grid validation, OCR, storage, and room APIs
  App.tsx              Multiplayer flows and application UI
public/                PWA icons
supabase/migrations/   PostgreSQL schema, RLS policies, and room RPCs
vite.config.ts         Vite build and PWA precache configuration
```

The service worker precaches the application, SOWPODS bundle, fonts, Tesseract worker, WASM cores, and English OCR model. Supabase API responses and player photos are not added to the runtime cache.

## Validation

The project includes tests for:

- Boggle and Scribbage scoring rules
- Duplicate cancellation and round evaluation
- Grid-path validation
- Board-image splitting
- OCR answer normalization
- Offline draft and photo storage

Run `npm test` and `npm run build` before publishing changes.

## License

[MIT](LICENSE) © 2026 Osten
