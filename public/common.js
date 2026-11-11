/* Shared helpers for trainer and participant pages */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LETTERS = "ABCDEFGH";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const STYPE = { pre: "Pre-training test", post: "Post-training test", standalone: "Assessment" };

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

function printHeader(title, sub) {
  const o = location.origin;
  return `<div class="ph"><img src="${o}/logo-mhg.png" alt="My Home Group"><div class="mid"><b>${esc(title)}</b><span>${esc(sub || "")}</span></div><img src="${o}/logo-maha.png" alt="Maha Cement"></div>`;
}

function openPrint(title, body) {
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups for this site to print."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`);
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

function questionPaperHTML(s, withKey) {
  const qs = s.questions.map((q, i) => `<div class="q"><b>${i + 1}. ${esc(q.text)}</b>${q.qtype === "multi" ? " <i>(tick all correct answers)</i>" : ""}
    <div class="opts">${q.options.map((o, j) => `<div${withKey && q.answer.includes(j) ? ' class="ok"' : ""}>${LETTERS[j]}. ${esc(o)}${withKey && q.answer.includes(j) ? " ✔" : ""}</div>`).join("")}</div>
    ${withKey && q.explanation ? `<div style="font-size:9.5pt;margin-left:18px">Why: ${esc(q.explanation)}</div>` : ""}</div>`).join("");
  return `${printHeader(withKey ? "Answer Key — Trainer Copy" : "Question Paper", s.title)}
  <p>${STYPE[s.stype]} · ${s.questions.length} questions${s.time_limit_min ? ` · ${s.time_limit_min} min` : ""} · Pass mark ${s.pass_mark}%${Number(s.negative_mark) ? ` · ${s.negative_mark} mark deducted per wrong answer` : ""}</p>${qs}`;
}

function answerSheetHTML(s, qr, link, copies = 1) {
  const rows = s.questions.map((q, i) => `<tr><td style="width:34px;text-align:right"><b>${i + 1}</b></td><td>${q.options.map((_, j) => `<span class="bub">${LETTERS[j]}</span>`).join("")}${q.qtype === "multi" ? " <i style=\"font-size:8.5pt\">more than one</i>" : ""}</td></tr>`);
  const half = Math.ceil(rows.length / 2);
  const col = (a) => `<table style="width:100%">${a.join("")}</table>`;
  const one = `<div class="page">${printHeader("Answer Sheet", s.title)}
  <table class="meta"><tr><td style="width:60%"><b>Emp ID</b> ____________________<br><br><b>Name</b> __________________________<br><br><b>Dept</b> ___________________ &nbsp; <b>Sign</b> ___________</td>
  <td style="text-align:center"><img src="${qr}" style="width:120px"><br><span style="font-size:8.5pt">Session ${esc(s.code)} — or answer online at<br>${esc(link)}</span></td></tr></table>
  <p style="font-size:9.5pt;margin:8px 0">Fill or tick the circle of your answer. Mark only one circle unless the question says "more than one".</p>
  <div style="display:flex;gap:16px"><div style="flex:1">${col(rows.slice(0, half))}</div><div style="flex:1">${col(rows.slice(half))}</div></div>
  <div class="sig"><div>Participant</div><div>Checked by</div></div></div>`;
  return Array.from({ length: copies }, () => one).join("");
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
