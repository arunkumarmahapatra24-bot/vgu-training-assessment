# Training Assessment (TEAS) — Phase 1

QR-based training tests: build questions from documents, people answer on their phones, the app scores everything and compares pre- and post-training results.

## What's inside
- `public/index.html` — trainer app (question banks, AI import, sessions, QR board, results, analysis, effectiveness)
- `public/take.html` — participant phone page (opened from the QR code, `/t/CODE`)
- `public/common.js`, `public/styles.css`, logos
- `netlify/functions/api.mjs` — the API (scoring, sessions, AI calls)
- `netlify/database/migrations/` — database tables (applied automatically on deploy)

## Deploy (one time)
Needs Node 20+ and Netlify CLI 26+ (`npm install -g netlify-cli`).

```bash
cd vgu-training-assessment
npm install
netlify login
netlify deploy              # choose "Create & configure a new project"; this first preview deploy also creates the database
netlify env:set TRAINER_KEY "choose-a-strong-password"
netlify env:set AI_PROVIDER gemini
netlify env:set GEMINI_API_KEY "your-gemini-key"
netlify deploy --prod
```

Open the site URL, sign in with your TRAINER_KEY.

Optional variables: `AI_MODEL` (to override the default model), or use `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or `AI_PROVIDER=openai` with `OPENAI_API_KEY`. Redeploy after changing any variable.

If the first deploy fails with "Access Denied" on creating the database, run `netlify deploy` (preview) first, then `--prod`. If it fails with "database feature not available", the team needs Netlify's credit-based plan.

## Running a test
1. Question banks → New bank → Add from documents. Review drafts, then Approve.
2. Sessions → New session (Pre-training test). Pick questions, paste the participant list (Emp ID, Name, Department).
3. Open test → Show QR to class. People scan and answer.
4. No phone? Print answer sheets; enter them under Paper entry.
5. Close test → Results, Question analysis, Export Excel, Print result cards.
6. After training: on the pre-test press Create post-test. The Training effectiveness tab compares both.

## Limits to know
- AI reads up to ~40,000 characters per request and up to 24 scanned pages per PDF; long documents are split automatically.
- Each upload request must be under ~6 MB (photos are compressed in the browser first).
- Questions in a session are frozen when it's created, so results stay comparable.
