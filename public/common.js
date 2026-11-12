/* Shared helpers for trainer and participant pages */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LETTERS = "ABCDEFGH";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const STYPE = { pre: "Pre-training test", post: "Post-training test", standalone: "Assessment", retention: "Follow-up test" };
const verifyUrl = (code) => `${location.origin}/v/${code}`;

function toast(msg, ms = 2600) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

const _scripts = {};
function loadScript(src) {
  return (_scripts[src] ??= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { delete _scripts[src]; rej(new Error("Could not load " + src.split("/").pop() + ". Check the internet connection.")); };
    document.head.appendChild(s);
  }));
}
const LIB = {
  qr: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
};

async function qrDataUrl(text, size = 320) {
  await loadScript(LIB.qr);
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(box);
  new QRCode(box, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
  const canvas = box.querySelector("canvas");
  const url = canvas ? canvas.toDataURL("image/png") : box.querySelector("img")?.src;
  box.remove();
  return url;
}

/* ---------------- printing ---------------- */
const PRINT_CSS = `
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font:11pt/1.4 Arial,Helvetica,sans-serif;color:#111;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ph{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #D71920;padding-bottom:6px;margin-bottom:10px}
.ph img{height:46px}
.ph .mid{text-align:center;flex:1}
.ph .mid b{display:block;font-size:14pt}
.ph .mid span{font-size:9.5pt;color:#444}
h2{font-size:13pt;margin:12px 0 6px}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top;font-size:10pt}
th{background:#eee}
.meta td{border:1px solid #bbb}
.big{font-size:26pt;font-weight:bold}
.pass{color:#1C7A4B}.fail{color:#B42318}
.q{break-inside:avoid;margin:0 0 9px}
.q .opts{margin:3px 0 0 18px}
.ok{background:#E3F3EA}.bad{background:#FBE7E5}
.sig{display:flex;gap:24px;margin-top:34px}
.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:9.5pt;text-align:center}
.page{break-after:page}
.page:last-child{break-after:auto}
.bub{display:inline-block;width:20px;height:20px;border:1.5px solid #333;border-radius:50%;text-align:center;line-height:17px;font-size:9pt;margin-right:7px}
.foot{margin-top:10px;font-size:8.5pt;color:#555}
`;

/* Logos are embedded as data URLs so printed pages never wait on the network. */
(function preloadLogos() {
  const load = (name, key) => {
    if (window[key]) return;
    fetch("/" + name).then((r) => (r.ok ? r.blob() : null)).then((b) => {
      if (!b) return;
      const fr = new FileReader(); fr.onload = () => (window[key] = fr.result); fr.readAsDataURL(b);
    }).catch(() => {});
  };
  if (location.protocol.startsWith("http")) { load("logo-mhg.png", "LOGO_MHG"); load("logo-maha.png", "LOGO_MAHA"); }
})();

function printHeader(title, sub) {
  const o = location.origin;
  return `<div class="ph"><img src="${window.LOGO_MHG || o + "/logo-mhg.png"}" alt="My Home Group"><div class="mid"><b>${esc(title)}</b><span>${esc(sub || "")}</span></div><img src="${window.LOGO_MAHA || o + "/logo-maha.png"}" alt="Maha Cement"></div>`;
}

function openPrint(title, body, orientation) {
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups for this site to print."); return; }
  const extra = orientation === "landscape" ? "@page{size:A4 landscape;margin:10mm}" : "";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}${extra}${CERT_CSS}</style></head><body>${body}</body></html>`);
  w.document.close();
  const go = () => setTimeout(() => { w.focus(); w.print(); }, 250);
  const imgs = [...w.document.images];
  let left = imgs.length; if (!left) go();
  imgs.forEach((im) => { if (im.complete) { if (--left === 0) go(); } else im.onload = im.onerror = () => { if (--left === 0) go(); }; });
}

function resultCardHTML(r) {
  const verdict = r.passed ? `<span class="pass">PASS</span>` : `<span class="fail">NOT PASSED</span>`;
  const topics = (r.topics || []).map((t) => `<tr><td>${esc(t.topic)}</td><td>${t.correct} / ${t.total}</td><td>${t.total ? Math.round((t.correct / t.total) * 100) : 0}%</td></tr>`).join("");
  const review = (r.review || []).map((q, i) => {
    const opts = q.options.map((o, j) => {
      const isKey = q.answer.includes(j), picked = (q.selected || []).includes(j);
      const cls = isKey ? "ok" : picked ? "bad" : "";
      return `<div class="${cls}">${LETTERS[j]}. ${esc(o)}${isKey ? " ✔" : ""}${picked ? " ← your answer" : ""}</div>`;
    }).join("");
    const st = q.status === "correct" ? "Correct" : q.status === "wrong" ? "Wrong" : "Not answered";
    return `<div class="q"><b>Q${i + 1}. ${esc(q.text)}</b> <i>(${st})</i><div class="opts">${opts}</div>${q.explanation ? `<div style="font-size:9.5pt;color:#333;margin:2px 0 0 18px">Why: ${esc(q.explanation)}</div>` : ""}</div>`;
  }).join("");
  return `<div class="page">${printHeader("Training Assessment Result", STYPE[r.stype] || "")}
  <table class="meta"><tr><td><b>Training</b></td><td colspan="3">${esc(r.title)}</td></tr>
  <tr><td><b>Name</b></td><td>${esc(r.name)}</td><td><b>Emp ID</b></td><td>${esc(r.empId)}</td></tr>
  <tr><td><b>Department</b></td><td>${esc(r.dept || "")}</td><td><b>Date</b></td><td>${fmtDate(r.trainingDate || r.submittedAt)}</td></tr>
  <tr><td><b>Trainer</b></td><td>${esc(r.trainer || "")}</td><td><b>Mode</b></td><td>${r.mode === "paper" ? "Paper answer sheet" : "Online (mobile)"}</td></tr></table>
  <table style="margin-top:10px"><tr>
    <td style="width:33%;text-align:center"><div class="big">${r.percent}%</div>Score ${r.score} / ${r.max}</td>
    <td style="width:33%;text-align:center"><div class="big">${verdict}</div>Pass mark ${r.passMark}%</td>
    <td style="text-align:center">Correct ${r.correct} &nbsp; Wrong ${r.wrong} &nbsp; Not answered ${r.skipped}</td></tr></table>
  <h2>Topic-wise result</h2><table><tr><th>Topic</th><th>Correct</th><th>%</th></tr>${topics}</table>
  ${review ? `<h2>Answer review</h2>${review}` : ""}
  <div class="sig"><div>Participant</div><div>Trainer</div><div>HOD</div></div>
  <div class="foot">Submitted ${fmtDateTime(r.submittedAt)}</div></div>`;
}

/* Printed paper sets: same questions, different order per set. Must match paperLayout() in the server. */
function paperLayout(session, set) {
  const qs = session.questions;
  const S = String(set || "A").toUpperCase();
  if (S === "A") return qs.map((q, i) => ({ q: i, o: q.options.map((_, j) => j) }));
  let h = 2166136261;
  for (const c of `${session.code}|${S}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sh = (arr) => { arr = arr.slice(); for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const order = sh(qs.map((_, i) => i));
  return order.map((qi) => ({ q: qi, o: qs[qi].qtype === "tf" ? qs[qi].options.map((_, j) => j) : sh(qs[qi].options.map((_, j) => j)) }));
}
const SET_BADGE = (set, n) => (n > 1 ? `<div style="float:right;border:3px solid #111;padding:2px 12px;font:bold 20pt Arial;margin:-4px 0 6px 10px">SET ${set}</div>` : "");

function questionPaperHTML(s, withKey, set = "A", nSets = 1) {
  const L = paperLayout(s, set);
  const qs = L.map((row, i) => {
    const q = s.questions[row.q];
    return `<div class="q"><b>${i + 1}. ${esc(q.text)}</b>${q.qtype === "multi" ? " <i>(tick all correct answers)</i>" : ""}
    <div class="opts">${row.o.map((oi, j) => { const key = withKey && q.answer.includes(oi);
      return `<div${key ? ' class="ok"' : ""}>${LETTERS[j]}. ${esc(q.options[oi])}${key ? " ✔" : ""}</div>`; }).join("")}</div>
    ${withKey && q.explanation ? `<div style="font-size:9.5pt;margin-left:18px">Why: ${esc(q.explanation)}</div>` : ""}</div>`;
  }).join("");
  return `<div class="page">${printHeader(withKey ? "Answer Key — Trainer Copy" : "Question Paper", s.title)}${SET_BADGE(set, nSets)}
  <p>${STYPE[s.stype]} · ${s.questions.length} questions${s.time_limit_min ? ` · ${s.time_limit_min} min` : ""} · Pass mark ${s.pass_mark}%${Number(s.negative_mark) ? ` · ${s.negative_mark} mark deducted per wrong answer` : ""}${nSets > 1 ? ` · <b>Mark SET ${set} on your answer sheet</b>` : ""}</p>${qs}</div>`;
}

function answerKeyCompactHTML(s, sets) {
  const rows = s.questions.map((_, i) => `<tr><td><b>${i + 1}</b></td>${sets.map((set) => { const row = paperLayout(s, set)[i]; const q = s.questions[row.q];
    return `<td>${row.o.map((oi, j) => (q.answer.includes(oi) ? LETTERS[j] : "")).join("")}</td>`; }).join("")}</tr>`).join("");
  return `<div class="page">${printHeader("Answer Key — all sets", s.title)}<table style="width:auto;min-width:50%"><tr><th>Q</th>${sets.map((x) => `<th>Set ${x}</th>`).join("")}</tr>${rows}</table>
  <p class="foot">Keep this page with the trainer. Detailed keys with explanations follow.</p></div>`;
}

function answerSheetHTML(s, qr, link, copies = 1, sets = ["A"]) {
  const one = (set) => {
    const L = paperLayout(s, set);
    const rows = L.map((row, i) => { const q = s.questions[row.q];
      return `<tr><td style="width:34px;text-align:right"><b>${i + 1}</b></td><td>${row.o.map((_, j) => `<span class="bub">${LETTERS[j]}</span>`).join("")}${q.qtype === "multi" ? ' <i style="font-size:8.5pt">more than one</i>' : ""}</td></tr>`; });
    const half = Math.ceil(rows.length / 2);
    const col = (a) => `<table style="width:100%">${a.join("")}</table>`;
    return `<div class="page">${printHeader("Answer Sheet", s.title)}${SET_BADGE(set, sets.length)}
    <table class="meta"><tr><td style="width:60%"><b>Emp ID</b> ____________________<br><br><b>Name</b> __________________________<br><br><b>Dept</b> ___________________ &nbsp; <b>Sign</b> ___________</td>
    <td style="text-align:center"><img src="${qr}" style="width:120px"><br><span style="font-size:8.5pt">Session ${esc(s.code)}${sets.length > 1 ? "" : " — or answer online at<br>" + esc(link)}</span></td></tr></table>
    <p style="font-size:9.5pt;margin:8px 0">${sets.length > 1 ? `<b>Use only with question paper SET ${set}.</b> ` : ""}Fill or tick the circle of your answer. Mark only one circle unless the question says "more than one".</p>
    <div style="display:flex;gap:16px"><div style="flex:1">${col(rows.slice(0, half))}</div><div style="flex:1">${col(rows.slice(half))}</div></div>
    <div class="sig"><div>Participant</div><div>Checked by</div></div></div>`;
  };
  return Array.from({ length: copies }, (_, k) => one(sets[k % sets.length])).join("");
}

function qrPosterHTML(s, qr, link) {
  return `${printHeader(STYPE[s.stype], s.title)}
  <div style="text-align:center;margin-top:30px">
  <div style="font-size:20pt;font-weight:bold">Scan to start the test</div>
  <img src="${qr}" style="width:320px;margin:20px auto;display:block">
  <div style="font-size:12pt">or open <b>${esc(link)}</b></div>
  <div style="font-size:12pt;margin-top:14px">Session code</div>
  <div style="font-size:54pt;font-weight:bold;letter-spacing:6px">${esc(s.code)}</div>
  <p style="margin-top:20px">${s.questions.length} questions${s.time_limit_min ? ` · ${s.time_limit_min} minutes` : ""} · Keep your Employee ID ready</p></div>`;
}

/* ---------------- certificate ---------------- */
const CERT_CSS = `
.cert{position:relative;height:186mm;border:3px solid #18202C;padding:9mm 14mm;display:flex;flex-direction:column;break-after:page;overflow:hidden}
.cert:last-child{break-after:auto}
.cert::before{content:"";position:absolute;inset:3mm;border:1px solid #D71920;pointer-events:none}
.cert .top{display:flex;justify-content:space-between;align-items:center}
.cert .top img{height:20mm}
.cert h1{font:700 30pt/1.1 Georgia,"Times New Roman",serif;text-align:center;margin:6mm 0 1mm;letter-spacing:.5px}
.cert .sub{text-align:center;font-size:11pt;color:#444;letter-spacing:3px;text-transform:uppercase}
.cert .who{text-align:center;margin:7mm 0 2mm;font-size:12pt}
.cert .name{font:700 26pt/1.2 Georgia,"Times New Roman",serif;text-align:center;border-bottom:1px solid #999;margin:0 25mm;padding-bottom:2mm}
.cert .meta{text-align:center;font-size:11pt;margin-top:2mm;color:#333}
.cert .what{text-align:center;font-size:12pt;margin:6mm 18mm 0;line-height:1.5}
.cert .what b{font-size:15pt}
.cert .foot{margin-top:auto;display:flex;align-items:flex-end;gap:10mm}
.cert .sig{flex:1;border-top:1px solid #333;text-align:center;font-size:9.5pt;padding-top:1.5mm}
.cert .qr{text-align:center;font-size:8pt;color:#333;width:34mm}
.cert .qr img{width:28mm;height:28mm;display:block;margin:0 auto 1mm}
.cert .band{position:absolute;left:0;right:0;bottom:0;height:3mm;background:repeating-linear-gradient(-45deg,#18202C 0 3mm,#FFD400 3mm 6mm)}
`;
function certificateHTML(r, qr) {
  const o = location.origin;
  const mhg = window.LOGO_MHG || `${o}/logo-mhg.png`, maha = window.LOGO_MAHA || `${o}/logo-maha.png`;
  const when = fmtDate(r.trainingDate || r.submittedAt);
  return `<div class="cert"><div class="top"><img src="${mhg}" alt="My Home Group"><img src="${maha}" alt="Maha Cement"></div>
    <h1>Certificate of Training</h1><div class="sub">${r.stype === "retention" ? "Knowledge refresher" : "Successfully completed"}</div>
    <div class="who">This is to certify that</div>
    <div class="name">${esc(r.name)}</div>
    <div class="meta">Employee ID ${esc(r.empId)}${r.dept ? " · " + esc(r.dept) : ""}</div>
    <div class="what">has completed the training and passed the assessment in<br><b>${esc(r.title)}</b><br>
      held on ${when}${r.venue ? " at " + esc(r.venue) : ""}, scoring <b>${r.percent}%</b> (pass mark ${r.passMark}%).
      ${r.validUntil ? `<br>Valid until <b>${fmtDate(r.validUntil)}</b>.` : ""}</div>
    <div class="foot"><div class="sig">${esc(r.trainer || "")}<br>Trainer</div><div class="sig"><br>Head of Department</div><div class="sig"><br>Authorised Signatory</div>
      <div class="qr"><img src="${qr}" alt="">Certificate ${esc(r.certCode)}<br>Scan to verify</div></div>
    <div class="band"></div></div>`;
}
