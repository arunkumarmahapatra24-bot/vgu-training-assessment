// Training Effectiveness & Assessment System — single API function
// Routes are served under /api/*
import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

let _db;
const sqlOf = () => (_db ??= getDatabase()).sql;
const env = (k) => globalThis.Netlify?.env?.get(k) ?? process.env[k];

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (message, status = 400) => json({ error: message }, status);

const GRACE_MS = 30_000; // network grace after the timer ends
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isTrainer(req) {
  const key = env("TRAINER_KEY");
  const given = req.headers.get("x-trainer-key");
  return Boolean(key && given && safeEqual(key, given));
}

function newCode() {
  let s = "";
  const bytes = crypto.randomBytes(6);
  for (const b of bytes) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const toInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const cleanEmp = (v) => String(v ?? "").trim().toUpperCase().slice(0, 40);
const cleanText = (v, n = 200) => String(v ?? "").trim().slice(0, n);
const J = (v) => JSON.stringify(v ?? null);

/** Turn any loosely-shaped question into the stored shape, or null if unusable. */
export function normalizeQuestion(q) {
  if (!q || typeof q !== "object") return null;
  const text = cleanText(q.text ?? q.question, 2000);
  let options = (Array.isArray(q.options) ? q.options : [])
    .map((o) => cleanText(typeof o === "object" && o ? o.text : o, 500))
    .filter(Boolean)
    .slice(0, 8);
  let type = String(q.qtype ?? q.type ?? "").toLowerCase();
  if (type === "tf" || type === "true_false" || type === "truefalse") {
    if (options.length !== 2) options = ["True", "False"];
    type = "tf";
  }
  let rawAns = q.answer ?? q.answers ?? q.correct;
  if (!Array.isArray(rawAns)) rawAns = String(rawAns ?? "").split(/[,;/ ]+/).filter(Boolean);
  const answer = [
    ...new Set(
      rawAns
        .map((a) => {
          if (typeof a === "string" && /^[A-Ha-h]$/.test(a.trim())) return a.trim().toUpperCase().charCodeAt(0) - 65;
          if (typeof a === "string" && /^(true|false)$/i.test(a.trim()) && type === "tf")
            return /^true$/i.test(a.trim()) ? 0 : 1;
          return Number(a);
        })
        .filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)
    ),
  ].sort((a, b) => a - b);
  if (!text || options.length < 2 || answer.length < 1) return null;
  if (type !== "tf") type = type === "multi" || answer.length > 1 ? "multi" : "single";
  const diff = String(q.difficulty ?? "").toLowerCase();
  return {
    qtype: type,
    text,
    options,
    answer,
    explanation: cleanText(q.explanation, 1500) || null,
    topic: cleanText(q.topic, 120) || null,
    difficulty: ["easy", "medium", "hard"].includes(diff) ? diff : null,
    source_ref: cleanText(q.source_ref ?? q.source, 200) || null,
  };
}

/** Score answers against a question snapshot. answers: {"<qIndex>": [optIndex...]} */
export function scoreAnswers(questions, answers, negative = 0) {
  let score = 0;
  const statuses = questions.map((q, i) => {
    const sel = [...new Set((answers?.[i] ?? []).map(Number))].sort((a, b) => a - b);
    const key = q.answer.slice().sort((a, b) => a - b);
    if (!sel.length) return "skipped";
    const ok = sel.length === key.length && sel.every((v, j) => v === key[j]);
    score += ok ? 1 : -Number(negative || 0);
    return ok ? "correct" : "wrong";
  });
  score = Math.max(0, Math.round(score * 100) / 100);
  const max = questions.length;
  const percent = max ? Math.round((score / max) * 1000) / 10 : 0;
  return { score, max, percent, statuses };
}

function sanitizeAnswers(raw, questions) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= questions.length || !Array.isArray(v)) continue;
    const n = questions[i].options.length;
    const picks = [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < n))];
    if (picks.length) out[i] = questions[i].qtype === "multi" ? picks : picks.slice(0, 1);
  }
  return out;
}

function deadlineOf(session, attempt) {
  if (!session.time_limit_min) return null;
  return new Date(new Date(attempt.started_at).getTime() + session.time_limit_min * 60_000);
}

function buildResult(session, attempt) {
  const qs = session.questions;
  const { statuses } = scoreAnswers(qs, attempt.answers, session.negative_mark);
  const topics = {};
  qs.forEach((q, i) => {
    const t = q.topic || "General";
    topics[t] ??= { topic: t, correct: 0, total: 0 };
    topics[t].total++;
    if (statuses[i] === "correct") topics[t].correct++;
  });
  return {
    title: session.title,
    trainer: session.trainer,
    trainingDate: session.training_date,
    stype: session.stype,
    empId: attempt.emp_id,
    name: attempt.name,
    dept: attempt.dept,
    mode: attempt.mode,
    submittedAt: attempt.submitted_at,
    score: Number(attempt.score),
    max: Number(attempt.max_score),
    percent: Number(attempt.percent),
    passed: attempt.passed,
    passMark: session.pass_mark,
    correct: statuses.filter((s) => s === "correct").length,
    wrong: statuses.filter((s) => s === "wrong").length,
    skipped: statuses.filter((s) => s === "skipped").length,
    topics: Object.values(topics),
    review: session.show_answers
      ? qs.map((q, i) => ({
          text: q.text,
          options: q.options,
          answer: q.answer,
          selected: attempt.answers?.[i] ?? [],
          status: statuses[i],
          explanation: q.explanation,
        }))
      : null,
  };
}

async function finalize(sql, session, attempt, answers) {
  const r = scoreAnswers(session.questions, answers, session.negative_mark);
  const passed = r.percent >= session.pass_mark;
  const rows = await sql`
    UPDATE attempts SET answers = ${J(answers)}::jsonb, submitted_at = now(),
      score = ${r.score}, max_score = ${r.max}, percent = ${r.percent}, passed = ${passed}
    WHERE id = ${attempt.id} AND submitted_at IS NULL
    RETURNING *`;
  if (rows.length) return rows[0];
  const again = await sql`SELECT * FROM attempts WHERE id = ${attempt.id}`;
  return again[0];
}

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* AI question generation                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-mini",
};

function aiConfig() {
  const provider = (env("AI_PROVIDER") || "gemini").toLowerCase();
  const key =
    provider === "gemini" ? env("GEMINI_API_KEY") : provider === "anthropic" ? env("ANTHROPIC_API_KEY") : env("OPENAI_API_KEY");
  return { provider, key, model: env("AI_MODEL") || DEFAULT_MODELS[provider] };
}

const AI_SCHEMA = `Return ONLY a JSON object of this shape, no prose, no code fences:
{"questions":[{"type":"single|multi|tf","question":"...","options":["...","..."],"answer":[0],"explanation":"...","topic":"...","difficulty":"easy|medium|hard","source":"..."}]}
- "answer" holds 0-based indexes of the correct options.
- "tf" questions use options ["True","False"].
- "source" is the page/slide/section where the fact appears, using the [Page n] / [Slide n] markers in the material when present.`;

function buildPrompt(p) {
  const lang = p.language || "English";
  const material = p.text ? `\n\nMATERIAL:\n"""\n${p.text}\n"""` : "";
  if (p.mode === "extract") {
    return {
      system: `You convert existing quiz papers into structured data for a training assessment app in an Indian cement plant. Extract questions exactly as written — never invent new ones, never reword the meaning. ${AI_SCHEMA}
- If the paper gives an answer key, use it.
- If no answer is marked, choose the correct answer yourself and begin the explanation with "Answer not in source — verify."
- Keep the original language of the paper.`,
      user: `Extract every question from the attached material (images and/or text).${material}`,
    };
  }
  const types = (p.types?.length ? p.types : ["single"]).join(", ");
  return {
    system: `You are an assessment designer for industrial training (safety, quality, process, environment) at an Indian cement plant. You write fair multiple-choice questions that test understanding of the given material. ${AI_SCHEMA}
Rules:
- Use ONLY facts stated in the material. Never rely on outside knowledge for the correct answer.
- Prefer practical, on-the-job questions (what to do, limits, sequence, responsibilities) over trivia.
- single/multi questions have exactly 4 options; distractors must be plausible and similar in length.
- Never use "All of the above" or "None of the above".
- Spread the correct answer position evenly across options.
- Explanations: 1–2 sentences stating the rule from the material.
- Write questions, options and explanations in ${lang}.`,
    user: `Write ${p.count} questions. Allowed types: ${types}. Difficulty: ${p.difficulty || "mixed"}.${
      p.topic ? ` Topic label to use: "${p.topic}".` : ""
    }${p.focus ? ` Focus on: ${p.focus}.` : ""}${material}`,
  };
}

function parseAiJson(text) {
  if (!text) throw new Error("AI returned an empty response.");
  let t = text.replace(/```json|```/g, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const obj = JSON.parse(t);
  return Array.isArray(obj) ? obj : obj.questions ?? [];
}

async function callAI({ system, user, images }) {
  const { provider, key, model } = aiConfig();
  if (!key) throw new Error(`AI key for "${provider}" is not set on the server.`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    let res, data, text;
    if (provider === "gemini") {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: "user",
              parts: [...images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: user }],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);
      text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
    } else if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          system,
          messages: [
            {
              role: "user",
              content: [
                ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } })),
                { type: "text", text: user },
              ],
            },
          ],
        }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Claude error ${res.status}`);
      text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    } else {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                { type: "text", text: user },
                ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } })),
              ],
            },
          ],
        }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
      text = data.choices?.[0]?.message?.content;
    }
    return parseAiJson(text);
  } catch (e) {
    if (e.name === "AbortError") throw new Error("AI took too long. Try fewer questions or a smaller part of the document.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* public (participant) routes                                         */
/* ------------------------------------------------------------------ */

async function publicRoutes(req, seg, sql) {
  // GET /api/join/:code
  if (seg[0] === "join" && seg.length === 2 && req.method === "GET") {
    const [s] = await sql`SELECT * FROM sessions WHERE code = ${seg[1].toUpperCase()}`;
    if (!s) return fail("No session with this code. Check the code on the trainer's screen.", 404);
    return json({
      code: s.code,
      title: s.title,
      trainer: s.trainer,
      venue: s.venue,
      trainingDate: s.training_date,
      stype: s.stype,
      status: s.status,
      timeLimitMin: s.time_limit_min,
      questionCount: s.questions.length,
      passMark: s.pass_mark,
      negativeMark: Number(s.negative_mark),
      hasRoster: s.roster.length > 0,
    });
  }

  // GET /api/join/:code/emp/:empId  — roster lookup to auto-fill name
  if (seg[0] === "join" && seg[2] === "emp" && seg.length === 4 && req.method === "GET") {
    const [s] = await sql`SELECT roster FROM sessions WHERE code = ${seg[1].toUpperCase()}`;
    if (!s) return fail("Session not found", 404);
    const emp = cleanEmp(decodeURIComponent(seg[3]));
    const hit = s.roster.find((r) => cleanEmp(r.empId) === emp);
    return json(hit ? { found: true, name: hit.name, dept: hit.dept } : { found: false });
  }

  // POST /api/join/:code/start
  if (seg[0] === "join" && seg[2] === "start" && req.method === "POST") {
    const body = await readBody(req);
    const [s] = await sql`SELECT * FROM sessions WHERE code = ${seg[1].toUpperCase()}`;
    if (!s) return fail("Session not found", 404);
    const empId = cleanEmp(body.empId);
    if (!empId) return fail("Enter your Employee ID.");

    const [existing] = await sql`SELECT * FROM attempts WHERE session_id = ${s.id} AND emp_id = ${empId}`;
    if (existing?.submitted_at) return json({ submitted: true, attemptId: existing.id, result: buildResult(s, existing) });
    if (s.status !== "open")
      return fail(s.status === "closed" ? "This test is closed." : "This test has not started yet. Wait for the trainer to open it.", 403);

    let attempt = existing;
    if (attempt) {
      if (!body.token || !safeEqual(body.token, attempt.token))
        return fail("This Employee ID has already started the test on another phone. Ask the trainer to reset it.", 409);
    } else {
      const rosterHit = s.roster.find((r) => cleanEmp(r.empId) === empId);
      const name = cleanText(body.name, 120) || rosterHit?.name;
      const dept = cleanText(body.dept, 120) || rosterHit?.dept || null;
      if (!name) return fail("Enter your name.");
      const order = s.shuffle ? shuffled(s.questions.map((_, i) => i)) : s.questions.map((_, i) => i);
      const layout = order.map((qi) => {
        const q = s.questions[qi];
        const idx = q.options.map((_, i) => i);
        return { q: qi, o: s.shuffle && q.qtype !== "tf" ? shuffled(idx) : idx };
      });
      const token = crypto.randomUUID();
      const rows = await sql`
        INSERT INTO attempts (session_id, emp_id, name, dept, token, layout)
        VALUES (${s.id}, ${empId}, ${name}, ${dept}, ${token}, ${J(layout)}::jsonb)
        ON CONFLICT (session_id, emp_id) DO NOTHING RETURNING *`;
      if (!rows.length) return fail("This Employee ID has just started on another phone. Ask the trainer to reset it.", 409);
      attempt = rows[0];
    }

    const deadline = deadlineOf(s, attempt);
    return json({
      attemptId: attempt.id,
      token: attempt.token,
      name: attempt.name,
      empId: attempt.emp_id,
      dept: attempt.dept,
      answers: attempt.answers,
      deadline: deadline?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      questions: attempt.layout.map(({ q, o }) => ({
        i: q,
        qtype: s.questions[q].qtype,
        text: s.questions[q].text,
        options: o.map((oi) => ({ id: oi, text: s.questions[q].options[oi] })),
      })),
    });
  }

  // POST /api/attempt/:id/save | /submit
  if (seg[0] === "attempt" && seg.length === 3 && req.method === "POST" && ["save", "submit"].includes(seg[2])) {
    const body = await readBody(req);
    const id = toInt(seg[1]);
    const [a] = await sql`SELECT * FROM attempts WHERE id = ${id}`;
    if (!a || !body.token || !safeEqual(body.token, a.token)) return fail("Attempt not found.", 404);
    const [s] = await sql`SELECT * FROM sessions WHERE id = ${a.session_id}`;
    if (a.submitted_at) return json({ submitted: true, result: buildResult(s, a) });

    const deadline = deadlineOf(s, a);
    const expired = deadline && Date.now() > deadline.getTime() + GRACE_MS;
    const tabs = Math.max(a.tab_switches, toInt(body.tabSwitches));
    const incoming = sanitizeAnswers(body.answers, s.questions);

    if (seg[2] === "save") {
      if (expired || s.status === "closed") return json({ ok: false, expired: true });
      await sql`UPDATE attempts SET answers = ${J(incoming)}::jsonb, tab_switches = ${tabs}
                WHERE id = ${id} AND submitted_at IS NULL`;
      return json({ ok: true, savedAt: new Date().toISOString() });
    }

    await sql`UPDATE attempts SET tab_switches = ${tabs} WHERE id = ${id}`;
    // After the timer (plus grace) or after closing, only autosaved answers count.
    const finalAnswers = expired || s.status === "closed" ? a.answers : incoming;
    const done = await finalize(sql, s, a, finalAnswers);
    return json({ submitted: true, late: Boolean(expired), result: buildResult(s, done) });
  }

  // GET /api/attempt/:id/result?token=
  if (seg[0] === "attempt" && seg[2] === "result" && req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token");
    const [a] = await sql`SELECT * FROM attempts WHERE id = ${toInt(seg[1])}`;
    if (!a || !token || !safeEqual(token, a.token) || !a.submitted_at) return fail("Result not found.", 404);
    const [s] = await sql`SELECT * FROM sessions WHERE id = ${a.session_id}`;
    return json({ result: buildResult(s, a) });
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* trainer routes                                                      */
/* ------------------------------------------------------------------ */

async function closeSession(sql, s) {
  await sql`UPDATE sessions SET status = 'closed', closed_at = now() WHERE id = ${s.id}`;
  const open = await sql`SELECT * FROM attempts WHERE session_id = ${s.id} AND submitted_at IS NULL`;
  for (const a of open) await finalize(sql, s, a, a.answers);
  return open.length;
}

async function trainerRoutes(req, seg, sql) {
  const m = req.method;
  const id = toInt(seg[2]);

  if (seg[1] === "login" && m === "POST") return json({ ok: true });

  if (seg[1] === "ai-status" && m === "GET") {
    const c = aiConfig();
    return json({ provider: c.provider, model: c.model, ready: Boolean(c.key) });
  }

  /* ---------- banks ---------- */
  if (seg[1] === "banks" && seg.length === 2) {
    if (m === "GET") {
      const rows = await sql`
        SELECT b.*, COUNT(q.id)::int AS total,
               COUNT(q.id) FILTER (WHERE q.status = 'approved')::int AS approved
        FROM banks b LEFT JOIN questions q ON q.bank_id = b.id
        GROUP BY b.id ORDER BY b.created_at DESC`;
      return json(rows);
    }
    if (m === "POST") {
      const b = await readBody(req);
      const name = cleanText(b.name, 120);
      if (!name) return fail("Give the question bank a name.");
      const [row] = await sql`INSERT INTO banks (name, topic) VALUES (${name}, ${cleanText(b.topic, 120) || null}) RETURNING *`;
      return json(row, 201);
    }
  }
  if (seg[1] === "banks" && seg.length === 3) {
    if (m === "PUT") {
      const b = await readBody(req);
      const [row] = await sql`UPDATE banks SET name = ${cleanText(b.name, 120)}, topic = ${cleanText(b.topic, 120) || null}
                              WHERE id = ${id} RETURNING *`;
      return row ? json(row) : fail("Bank not found", 404);
    }
    if (m === "DELETE") {
      await sql`DELETE FROM banks WHERE id = ${id}`;
      return json({ ok: true });
    }
  }
  if (seg[1] === "banks" && seg[3] === "questions") {
    if (m === "GET") {
      const rows = await sql`SELECT * FROM questions WHERE bank_id = ${id} ORDER BY id`;
      return json(rows);
    }
    if (m === "POST") {
      const b = await readBody(req);
      const origin = ["ai-generated", "extracted", "excel", "manual"].includes(b.origin) ? b.origin : "manual";
      const status = b.status === "approved" ? "approved" : "draft";
      const list = (Array.isArray(b.questions) ? b.questions : []).map(normalizeQuestion).filter(Boolean).slice(0, 500);
      if (!list.length) return fail("No valid questions found. Each needs text, at least 2 options and a correct answer.");
      const out = [];
      for (const q of list) {
        const [row] = await sql`
          INSERT INTO questions (bank_id, qtype, text, options, answer, explanation, topic, difficulty, source_ref, origin, status)
          VALUES (${id}, ${q.qtype}, ${q.text}, ${J(q.options)}::jsonb, ${J(q.answer)}::jsonb, ${q.explanation},
                  ${q.topic}, ${q.difficulty}, ${q.source_ref}, ${origin}, ${status})
          RETURNING *`;
        out.push(row);
      }
      return json({ saved: out.length, skipped: (b.questions?.length ?? 0) - list.length, questions: out }, 201);
    }
  }

  /* ---------- questions ---------- */
  if (seg[1] === "questions" && seg[2] === "bulk" && m === "POST") {
    const b = await readBody(req);
    const ids = (b.ids || []).map((x) => toInt(x)).filter(Boolean);
    if (!ids.length) return fail("Select questions first.");
    if (b.action === "delete") await sql`DELETE FROM questions WHERE id = ANY(${ids}::int[])`;
    else if (b.action === "approve") await sql`UPDATE questions SET status = 'approved' WHERE id = ANY(${ids}::int[])`;
    else if (b.action === "draft") await sql`UPDATE questions SET status = 'draft' WHERE id = ANY(${ids}::int[])`;
    else return fail("Unknown action");
    return json({ ok: true, count: ids.length });
  }
  if (seg[1] === "questions" && seg.length === 3) {
    if (m === "PUT") {
      const b = await readBody(req);
      const q = normalizeQuestion(b);
      if (!q) return fail("Question needs text, at least 2 options and a correct answer.");
      const status = b.status === "approved" ? "approved" : "draft";
      const [row] = await sql`
        UPDATE questions SET qtype = ${q.qtype}, text = ${q.text}, options = ${J(q.options)}::jsonb,
          answer = ${J(q.answer)}::jsonb, explanation = ${q.explanation}, topic = ${q.topic},
          difficulty = ${q.difficulty}, source_ref = ${q.source_ref}, status = ${status}
        WHERE id = ${id} RETURNING *`;
      return row ? json(row) : fail("Question not found", 404);
    }
    if (m === "DELETE") {
      await sql`DELETE FROM questions WHERE id = ${id}`;
      return json({ ok: true });
    }
  }

  /* ---------- AI ---------- */
  if (seg[1] === "ai" && m === "POST") {
    const b = await readBody(req);
    const images = (Array.isArray(b.images) ? b.images : [])
      .filter((i) => i && /^image\/(png|jpe?g|webp)$/.test(i.mime) && typeof i.data === "string")
      .slice(0, 8);
    const text = cleanText(b.text, 40_000);
    if (!text && !images.length) return fail("Nothing to read — the file had no text or images.");
    const mode = b.mode === "extract" ? "extract" : "generate";
    const count = Math.min(Math.max(toInt(b.count, 10), 1), 25);
    const prompt = buildPrompt({
      mode,
      text,
      count,
      types: (b.types || []).filter((t) => ["single", "multi", "tf"].includes(t)),
      difficulty: cleanText(b.difficulty, 20),
      language: cleanText(b.language, 40),
      topic: cleanText(b.topic, 120),
      focus: cleanText(b.focus, 300),
    });
    let raw;
    try {
      raw = await callAI({ ...prompt, images });
    } catch (e) {
      return fail(e.message || "AI request failed.", 502);
    }
    const sourceName = cleanText(b.sourceName, 120);
    const list = raw
      .map(normalizeQuestion)
      .filter(Boolean)
      .map((q) => ({
        ...q,
        topic: q.topic || cleanText(b.topic, 120) || null,
        source_ref: [sourceName, q.source_ref].filter(Boolean).join(", ") || null,
      }));
    return json({ questions: list, dropped: raw.length - list.length, mode });
  }

  /* ---------- sessions ---------- */
  if (seg[1] === "sessions" && seg.length === 2) {
    if (m === "GET") {
      const rows = await sql`
        SELECT s.id, s.code, s.title, s.trainer, s.venue, s.training_date, s.stype, s.status, s.pass_mark,
               s.time_limit_min, s.pre_session_id, s.created_at, jsonb_array_length(s.questions) AS question_count,
               jsonb_array_length(s.roster) AS roster_count,
               COUNT(a.id)::int AS joined,
               COUNT(a.id) FILTER (WHERE a.submitted_at IS NOT NULL)::int AS submitted,
               ROUND(AVG(a.percent) FILTER (WHERE a.submitted_at IS NOT NULL), 1) AS avg_percent
        FROM sessions s LEFT JOIN attempts a ON a.session_id = s.id
        GROUP BY s.id ORDER BY s.created_at DESC`;
      return json(rows);
    }
    if (m === "POST") {
      const b = await readBody(req);
      const title = cleanText(b.title, 200);
      if (!title) return fail("Give the session a title.");
      const qids = (b.questionIds || []).map((x) => toInt(x)).filter(Boolean);
      if (!qids.length) return fail("Pick at least one approved question.");
      const found = await sql`SELECT * FROM questions WHERE id = ANY(${qids}::int[]) AND status = 'approved'`;
      const byId = new Map(found.map((q) => [q.id, q]));
      const snapshot = qids
        .filter((q) => byId.has(q))
        .map((q) => {
          const r = byId.get(q);
          return {
            id: r.id, qtype: r.qtype, text: r.text, options: r.options, answer: r.answer,
            explanation: r.explanation, topic: r.topic, difficulty: r.difficulty,
          };
        });
      if (!snapshot.length) return fail("None of the picked questions are approved yet.");
      const roster = (Array.isArray(b.roster) ? b.roster : [])
        .map((r) => ({ empId: cleanEmp(r.empId), name: cleanText(r.name, 120), dept: cleanText(r.dept, 120) }))
        .filter((r) => r.empId)
        .slice(0, 2000);
      const stype = ["pre", "post", "standalone"].includes(b.stype) ? b.stype : "standalone";
      for (let tries = 0; tries < 5; tries++) {
        try {
          const [row] = await sql`
            INSERT INTO sessions (code, title, trainer, venue, training_date, stype, pre_session_id, time_limit_min,
              pass_mark, shuffle, show_answers, negative_mark, questions, roster)
            VALUES (${newCode()}, ${title}, ${cleanText(b.trainer, 120) || null}, ${cleanText(b.venue, 120) || null},
              ${b.trainingDate || null}, ${stype}, ${toInt(b.preSessionId) || null},
              ${Math.min(Math.max(toInt(b.timeLimitMin), 0), 600)}, ${Math.min(Math.max(toInt(b.passMark, 60), 0), 100)},
              ${b.shuffle !== false}, ${b.showAnswers !== false}, ${Math.min(Math.max(Number(b.negativeMark) || 0, 0), 1)},
              ${J(snapshot)}::jsonb, ${J(roster)}::jsonb)
            RETURNING *`;
          return json(row, 201);
        } catch (e) {
          if (!String(e.message).includes("sessions_code_key")) throw e;
        }
      }
      return fail("Could not create a unique code. Try again.", 500);
    }
  }

  if (seg[1] === "sessions" && seg.length >= 3) {
    const [s] = await sql`SELECT * FROM sessions WHERE id = ${id}`;
    if (!s) return fail("Session not found", 404);

    if (seg.length === 3 && m === "GET") {
      const attempts = await sql`SELECT id, emp_id, name, dept, mode, answers, tab_switches, started_at, submitted_at,
                                        score, max_score, percent, passed
                                 FROM attempts WHERE session_id = ${id} ORDER BY started_at`;
      let pre = [];
      let preTitle = null;
      if (s.pre_session_id) {
        pre = await sql`SELECT emp_id, percent FROM attempts
                        WHERE session_id = ${s.pre_session_id} AND submitted_at IS NOT NULL`;
        const [ps] = await sql`SELECT title FROM sessions WHERE id = ${s.pre_session_id}`;
        preTitle = ps?.title ?? null;
      }
      return json({ session: s, attempts, pre, preTitle, serverNow: new Date().toISOString() });
    }

    if (seg.length === 3 && m === "PUT") {
      const b = await readBody(req);
      const roster = Array.isArray(b.roster)
        ? b.roster
            .map((r) => ({ empId: cleanEmp(r.empId), name: cleanText(r.name, 120), dept: cleanText(r.dept, 120) }))
            .filter((r) => r.empId)
        : s.roster;
      const [row] = await sql`
        UPDATE sessions SET
          title = ${cleanText(b.title ?? s.title, 200)}, trainer = ${cleanText(b.trainer ?? s.trainer, 120) || null},
          venue = ${cleanText(b.venue ?? s.venue, 120) || null}, training_date = ${b.trainingDate ?? s.training_date},
          time_limit_min = ${Math.min(Math.max(toInt(b.timeLimitMin ?? s.time_limit_min), 0), 600)},
          pass_mark = ${Math.min(Math.max(toInt(b.passMark ?? s.pass_mark), 0), 100)},
          show_answers = ${b.showAnswers ?? s.show_answers}, roster = ${J(roster)}::jsonb
        WHERE id = ${id} RETURNING *`;
      return json(row);
    }

    if (seg.length === 3 && m === "DELETE") {
      await sql`DELETE FROM sessions WHERE id = ${id}`;
      return json({ ok: true });
    }

    if (seg[3] === "status" && m === "POST") {
      const b = await readBody(req);
      if (b.status === "open") {
        const [row] = await sql`UPDATE sessions SET status = 'open', opened_at = COALESCE(opened_at, now()), closed_at = NULL
                                WHERE id = ${id} RETURNING *`;
        return json(row);
      }
      if (b.status === "closed") {
        const autoSubmitted = await closeSession(sql, s);
        const [row] = await sql`SELECT * FROM sessions WHERE id = ${id}`;
        return json({ ...row, autoSubmitted });
      }
      return fail("Unknown status");
    }

    // POST /api/admin/sessions/:id/paper — enter a paper answer sheet
    if (seg[3] === "paper" && m === "POST") {
      const b = await readBody(req);
      const empId = cleanEmp(b.empId);
      if (!empId) return fail("Enter the Employee ID from the answer sheet.");
      const rosterHit = s.roster.find((r) => cleanEmp(r.empId) === empId);
      const name = cleanText(b.name, 120) || rosterHit?.name;
      if (!name) return fail("Enter the name from the answer sheet.");
      const dept = cleanText(b.dept, 120) || rosterHit?.dept || null;
      const answers = sanitizeAnswers(b.answers, s.questions);
      const [existing] = await sql`SELECT * FROM attempts WHERE session_id = ${id} AND emp_id = ${empId}`;
      if (existing && !b.overwrite)
        return fail(`${empId} already has a ${existing.mode} entry in this session. Tick "Replace existing" to overwrite.`, 409);
      if (existing) await sql`DELETE FROM attempts WHERE id = ${existing.id}`;
      const layout = s.questions.map((q, i) => ({ q: i, o: q.options.map((_, j) => j) }));
      const [a] = await sql`
        INSERT INTO attempts (session_id, emp_id, name, dept, token, layout, mode)
        VALUES (${id}, ${empId}, ${name}, ${dept}, ${crypto.randomUUID()}, ${J(layout)}::jsonb, 'paper') RETURNING *`;
      const done = await finalize(sql, s, a, answers);
      return json({ ok: true, result: buildResult({ ...s, show_answers: true }, done) }, 201);
    }

    // GET /api/admin/sessions/:id/attempts/:aid — full result card
    if (seg[3] === "attempts" && seg.length === 5 && m === "GET") {
      const [a] = await sql`SELECT * FROM attempts WHERE id = ${toInt(seg[4])} AND session_id = ${id}`;
      if (!a || !a.submitted_at) return fail("Result not available yet.", 404);
      return json({ result: buildResult({ ...s, show_answers: true }, a) });
    }
  }

  if (seg[1] === "attempts" && seg.length === 3 && m === "DELETE") {
    await sql`DELETE FROM attempts WHERE id = ${id}`;
    return json({ ok: true });
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* entry                                                               */
/* ------------------------------------------------------------------ */

export default async (req) => {
  const seg = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  try {
    const sql = sqlOf();
    if (seg[0] === "admin") {
      if (!env("TRAINER_KEY")) return fail("TRAINER_KEY is not set on the server.", 500);
      if (!isTrainer(req)) return fail("Wrong trainer key.", 401);
      return (await trainerRoutes(req, seg, sql)) ?? fail("Not found", 404);
    }
    return (await publicRoutes(req, seg, sql)) ?? fail("Not found", 404);
  } catch (e) {
    console.error(e);
    return fail("Server error: " + (e.message || "unknown"), 500);
  }
};

export const config = { path: "/api/*" };
