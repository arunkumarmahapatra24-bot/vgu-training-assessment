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

## Phase 2 (added)
- **Certificates** for everyone who passes, with a QR code. Anyone can scan it to check it at `/v/<certificate number>`. Set the validity period per session (Schedule and certificates).
- **Follow-up tests**: on a post-test press *Schedule follow-up test*. It opens and closes by itself and shows how much people remembered.
- **Share invitation**: ready-made WhatsApp message with link and QR.
- **Departments view** for HODs: who needs retraining, certificates due, who missed a test, weakest topics, each person's history.
- **People and keys** (Settings, administrator only): give each trainer and HOD their own key. HODs only see their departments.
- **Read paper answer sheets from photos** (Paper entry): AI reads the marks, you check the outlined rows and save.
- Database changes are in `netlify/database/migrations/20261112090000_phase2.sql` and apply automatically on deploy. Existing results keep working; people who already passed get a certificate number.

## Update 3 (added)
- **Help** tab for everyone, with search; "How to take this test" panel on the phone page.
- **Upload Excel / CSV** for participant lists (New session and Session settings), plus a participant template.
- **Settings → Data and backup**: counts and database size, full backup (.json), restore into an empty app, training register (Excel). HODs: Departments → Download register.
- No database change in this update.

## Update 4 (added)
- **Departments and trainers** (Settings, MR only): department list, limit of trainers per department (default 5), assign trainers per department.
- Trainers with department(s) see and run only their department's tests, banks (plus "Shared" banks) and results. Trainers without a department are plant-wide.
- Sessions and question banks carry a department; the Sessions page can be filtered by department.
- Database change: `20261113090000_departments.sql` (applies automatically on deploy).

## Update 5 (added)
- **Paper sets A–D**: Print paper test → 1 to 4 sets; same questions, different question and option order per set. Ready-to-hand-out pack (sets alternate), master per set, or answer sheets only. Answer key covers all sets.
- Paper entry has a set selector; photo reading reads the SET letter from the sheet. Results show "paper · set B".
- Database change: `20261114090000_paper_sets.sql`.
