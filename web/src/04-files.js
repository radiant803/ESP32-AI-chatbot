// Artifact composition (txt/code/docx/xlsx/pptx), slide deck rendering/exporting, and device storage.
const LIBS = {
  docx: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  pptx: "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
};
const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const TEXT_EXT = /\.(txt|md|csv|json|html|js|ts|py|cpp|h)$/i;
const MAX_ARTIFACT = 700 * 1024;

function artifactKind(name) { const m = String(name).toLowerCase().match(/\.(\w+)$/); return m ? m[1] : "file"; }
function safeFilename(name, fallbackExt = "txt") {
  let n = String(name || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").replace(/\.{2,}/g, ".").slice(0, 90);
  if (!n) n = "chatesp-file";
  if (!/\.\w{1,5}$/.test(n)) n += "." + fallbackExt;
  return n;
}
function fileIcon(name, cls = "") { const k = artifactKind(name); return `<span class="file-ico ${k} ${cls}">${esc(k.toUpperCase().slice(0, 4))}</span>`; }

// spec: {type:'text'|'code'|'docx'|'xlsx'|'pptx'|'html', filename, title, content, sections, sheets, deck}
function validateSpec(spec) {
  if (!spec || typeof spec !== "object") throw new ApiError("artifact_invalid", "The model did not describe a file.", "Try rephrasing the request.");
  const type = String(spec.type || "").toLowerCase();
  if (!["text", "code", "docx", "xlsx", "pptx", "html"].includes(type)) throw new ApiError("artifact_invalid", "Unsupported file type: " + type, "Ask for a document, presentation, spreadsheet, text or code file.");
  const ext = { docx: "docx", pptx: "pptx", xlsx: "xlsx", html: "html", text: "txt", code: "txt" }[type];
  let filename = safeFilename(spec.filename || spec.title, ext);
  if (MIME[type] && !filename.toLowerCase().endsWith("." + type)) filename = filename.replace(/\.\w+$/, "") + "." + type;
  if (!MIME[type] && !TEXT_EXT.test(filename)) filename = filename.replace(/\.\w+$/, "") + "." + ext;
  return { ...spec, type, filename };
}
async function composeArtifact(spec) {
  spec = validateSpec(spec);
  if (spec.type === "text" || spec.type === "code" || spec.type === "html") {
    const content = typeof spec.content === "string" && spec.content ? spec.content : (spec.sections || []).map((s) => `${s.heading || ""}\n${s.text || ""}`.trim()).join("\n\n") || spec.title || "";
    return { blob: new Blob([content], { type: spec.type === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8" }), spec };
  }
  if (spec.type === "docx") {
    await loadScript(LIBS.docx); const D = window.docx;
    if (!D) throw new ApiError("library_unavailable", "DOCX generation is unavailable.", "Reload and retry.");
    const kids = [new D.Paragraph({ text: String(spec.title || "Document"), heading: D.HeadingLevel.TITLE })];
    for (const s of (spec.sections || []).slice(0, 40)) {
      if (s.heading) kids.push(new D.Paragraph({ text: String(s.heading), heading: D.HeadingLevel.HEADING_1 }));
      String(s.text || "").split(/\n{2,}/).filter(Boolean).forEach((p) => kids.push(new D.Paragraph({ text: p.trim(), spacing: { after: 160 } })));
      (s.bullets || []).forEach((b) => kids.push(new D.Paragraph({ text: String(b), bullet: { level: 0 } })));
    }
    return { blob: await D.Packer.toBlob(new D.Document({ creator: "ChatESP", title: String(spec.title || ""), sections: [{ children: kids }] })), spec };
  }
  if (spec.type === "xlsx") {
    await loadScript(LIBS.xlsx); const X = window.XLSX;
    if (!X) throw new ApiError("library_unavailable", "XLSX generation is unavailable.", "Reload and retry.");
    const wb = X.utils.book_new();
    (spec.sheets || []).slice(0, 6).forEach((sh, i) => {
      const rows = [Array.isArray(sh.columns) ? sh.columns.slice(0, 26) : []].concat((sh.rows || []).slice(0, 500).map((r) => (Array.isArray(r) ? r.slice(0, 26) : [])));
      const ws = X.utils.aoa_to_sheet(rows);
      X.utils.book_append_sheet(wb, ws, String(sh.name || "Sheet" + (i + 1)).replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "Sheet" + (i + 1));
    });
    if (!wb.SheetNames.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[String(spec.title || "ChatESP")]]), "Sheet1");
    return { blob: new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: MIME.xlsx }), spec };
  }
  const deck = spec.deck || { title: spec.title, slides: spec.slides || [], theme: "paper" };
  return { blob: await exportPptx(deck), spec };
}

// ---- Device storage --------------------------------------------------------------------------
const Files = {
  async list() { return Dev.json("/api/artifacts"); },
  async remove(name) { return Dev.json("/api/artifacts?name=" + encodeURIComponent(name), "DELETE"); },
  async save(blob, filename) {
    if (blob.size > MAX_ARTIFACT) throw new ApiError("artifact_too_large", `The file is ${fmtBytes(blob.size)}; ChatESP stores up to ${fmtBytes(MAX_ARTIFACT)}.`, "It was still downloaded to this browser. Ask for a shorter file to store it on the device.");
    const fd = new FormData(); fd.append("name", filename); fd.append("file", blob, filename);
    let res; try { res = await fetch("/api/artifacts", { method: "POST", body: fd }); } catch (_) { throw new ApiError("gateway_unreachable", "The file could not reach ChatESP.", "It was downloaded to this browser only."); }
    const d = await res.json().catch(() => null);
    if (!res.ok || !d || !d.ok) { const er = (d && d.error) || {}; throw new ApiError(er.code, er.message || "ChatESP could not store the file.", er.hint || "Check free device storage.", res.status); }
    return d;
  },
};
// Compose, download, store. Returns the artifact record kept on the message.
async function buildAndStore(spec, { download: dl = true } = {}) {
  const { blob, spec: s } = await composeArtifact(spec);
  if (dl) download(blob, s.filename);
  let stored = false, storeError = "";
  try { await Files.save(blob, s.filename); stored = true; } catch (e) { storeError = e.message; }
  return { name: s.filename, type: s.type, size: blob.size, stored, storeError, title: s.title || s.filename, preview: previewFor(s), deck: s.type === "pptx" ? (s.deck || null) : null, ts: Date.now() };
}
function previewFor(s) {
  if (s.type === "text" || s.type === "code" || s.type === "html") return String(s.content || "").slice(0, 60000);
  if (s.type === "docx") return (s.sections || []).map((x) => `${x.heading ? "## " + x.heading + "\n" : ""}${x.text || ""}${(x.bullets || []).map((b) => "\n- " + b).join("")}`).join("\n\n");
  if (s.type === "xlsx") return JSON.stringify({ sheets: s.sheets || [] });
  return "";
}

// ---- Decks -----------------------------------------------------------------------------------
const THEMES = {
  paper: { name: "Paper", bg: "#ffffff", ink: "#2b2a27", head: "#14130f", mute: "#7a766c", accent: "#5b5bf0", pal: ["#5b5bf0", "#0ea5a4", "#f59e0b", "#e11d48", "#64748b"], font: "ui-sans-serif,-apple-system,'Segoe UI',sans-serif", pf: "Calibri" },
  midnight: { name: "Midnight", bg: "#0f172a", ink: "#cbd5e1", head: "#f8fafc", mute: "#94a3b8", accent: "#38bdf8", pal: ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6"], font: "ui-sans-serif,-apple-system,'Segoe UI',sans-serif", pf: "Calibri" },
  sunrise: { name: "Sunrise", bg: "#fff7ed", ink: "#44302a", head: "#7c2d12", mute: "#a8826f", accent: "#ea580c", pal: ["#ea580c", "#db2777", "#ca8a04", "#0d9488", "#7c3aed"], font: "ui-serif,Georgia,'Iowan Old Style',serif", pf: "Georgia" },
  forest: { name: "Forest", bg: "#f1f7f2", ink: "#23372b", head: "#14532d", mute: "#6b8574", accent: "#16a34a", pal: ["#16a34a", "#0891b2", "#ca8a04", "#9333ea", "#dc2626"], font: "ui-sans-serif,-apple-system,'Segoe UI',sans-serif", pf: "Calibri" },
  mono: { name: "Mono", bg: "#f4f4f5", ink: "#27272a", head: "#09090b", mute: "#71717a", accent: "#18181b", pal: ["#18181b", "#52525b", "#a1a1aa", "#d4d4d8", "#71717a"], font: "ui-monospace,'SF Mono',Menlo,monospace", pf: "Courier New" },
  aurora: { name: "Aurora", bg: "linear-gradient(135deg,#1e1b4b 0%,#312e81 45%,#0f766e 100%)", solid: "1e1b4b", ink: "#e0e7ff", head: "#ffffff", mute: "#a5b4fc", accent: "#5eead4", pal: ["#5eead4", "#c4b5fd", "#fde68a", "#fda4af", "#93c5fd"], font: "ui-sans-serif,-apple-system,'Segoe UI',sans-serif", pf: "Calibri" },
};
const LAYOUTS = ["title", "section", "bullets", "two-column", "image-text", "chart", "quote", "closing"];

function chartSvg(ch, th) {
  const labels = (ch.labels || []).map(String).slice(0, 12), vals = (ch.values || []).map(Number).slice(0, 12).map((v) => (isFinite(v) ? v : 0));
  if (!vals.length) return "";
  const pal = th.pal, W = 400, H = 220, mx = Math.max(...vals, 1), mn = Math.min(0, ...vals), span = mx - mn || 1;
  const txt = `font-size="10" fill="${th.mute}" font-family="sans-serif"`;
  if (ch.type === "pie") {
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1; let a0 = -Math.PI / 2; const cx = 110, cy = 110, r = 90; let s = "";
    vals.forEach((v, i) => { const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2; const big = a1 - a0 > Math.PI ? 1 : 0; s += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${big} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}Z" fill="${pal[i % pal.length]}"/>`; a0 = a1; });
    s += labels.map((l, i) => `<rect x="240" y="${30 + i * 16}" width="9" height="9" rx="2" fill="${pal[i % pal.length]}"/><text x="256" y="${38 + i * 16}" ${txt}>${esc(l.slice(0, 18))} (${vals[i]})</text>`).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  }
  const L = 34, B = H - 26, T = 14, R = W - 10, pw = R - L, ph = B - T; let s = "";
  for (let g = 0; g <= 4; g++) { const y = B - (ph * g) / 4; s += `<line x1="${L}" x2="${R}" y1="${y}" y2="${y}" stroke="${th.mute}" stroke-opacity=".25"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" ${txt}>${+(mn + (span * g) / 4).toFixed(1)}</text>`; }
  const step = pw / vals.length, yv = (v) => B - ((v - mn) / span) * ph;
  if (ch.type === "line") {
    const pts = vals.map((v, i) => `${L + step * (i + 0.5)},${yv(v)}`);
    s += `<polyline fill="none" stroke="${pal[0]}" stroke-width="2.5" points="${pts.join(" ")}"/>` + vals.map((v, i) => `<circle cx="${L + step * (i + 0.5)}" cy="${yv(v)}" r="3.5" fill="${pal[0]}"/>`).join("");
  } else s += vals.map((v, i) => `<rect x="${L + step * i + step * 0.15}" y="${Math.min(yv(v), yv(0))}" width="${step * 0.7}" height="${Math.abs(yv(v) - yv(0))}" rx="3" fill="${pal[i % pal.length]}"/>`).join("");
  s += labels.map((l, i) => `<text x="${L + step * (i + 0.5)}" y="${H - 10}" text-anchor="middle" ${txt}>${esc(l.slice(0, 10))}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
}
function slideHTML(sl, th, i, n) {
  const ul = (a) => `<ul>${(a || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
  const L = sl.layout || "bullets"; let inner = "";
  if (L === "title" || L === "section" || L === "closing") inner = `<h2>${esc(sl.title)}</h2>${sl.subtitle ? `<div class="st">${esc(sl.subtitle)}</div>` : ""}`;
  else if (L === "quote") inner = `<blockquote>${esc(sl.quote || sl.title)}${sl.attribution ? `<div class="st">${esc(sl.attribution)}</div>` : ""}</blockquote>`;
  else if (L === "two-column") inner = `<h2>${esc(sl.title)}</h2><div class="cols">${ul(sl.left)}${ul(sl.right)}</div>`;
  else if (L === "image-text") inner = `<h2>${esc(sl.title)}</h2><div class="cols">${ul(sl.bullets)}<div style="display:grid;place-items:center">${sl.image ? `<img class="pic" alt="" src="${esc(sl.image)}">` : `<div class="st" style="text-align:center;opacity:.7">${esc(sl.imagePrompt || "Image")}</div>`}</div></div>`;
  else if (L === "chart") inner = `<h2>${esc(sl.title)}</h2><div class="chartbox">${sl.chart ? chartSvg(sl.chart, th) : ""}</div>${(sl.bullets || []).length ? ul(sl.bullets.slice(0, 3)) : ""}`;
  else inner = `<h2>${esc(sl.title)}</h2>${ul(sl.bullets)}`;
  const vars = `--sl-bg:${th.bg};--sl-ink:${th.ink};--sl-head:${th.head};--sl-mute:${th.mute};--sl-accent:${th.accent};--sl-font:${th.font}`;
  return `<div class="stage" style="${vars}"><div class="slide l-${L}"><div class="bar"></div>${inner}<div class="pageno">${i + 1} / ${n}</div></div></div>`;
}
function deckPages(deck) { const th = THEMES[deck.theme] || THEMES.paper; return deck.slides.map((s, i) => slideHTML(s, th, i, deck.slides.length)); }

async function exportPptx(deck) {
  await loadScript(LIBS.pptx);
  if (!window.PptxGenJS) throw new ApiError("library_unavailable", "PPTX generation is unavailable.", "Reload and retry.");
  const th = THEMES[deck.theme] || THEMES.paper, P = new window.PptxGenJS(), solid = (th.solid || th.bg).replace("#", "");
  P.layout = "LAYOUT_WIDE"; P.author = "ChatESP"; P.title = deck.title || "Presentation";
  const c = (h) => h.replace("#", "");
  deck.slides.forEach((s, idx) => {
    const sl = P.addSlide(); sl.background = { color: solid };
    sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: c(th.accent) }, line: { color: c(th.accent) } });
    const L = s.layout || "bullets", head = { x: 0.8, y: 0.55, w: 11.8, h: 0.9, fontFace: th.pf, fontSize: 30, bold: true, color: c(th.head), margin: 0 };
    const bl = (arr) => (arr || []).map((b) => ({ text: String(b), options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 10 } }));
    if (L === "title" || L === "section" || L === "closing") {
      sl.addText(String(s.title || ""), { ...head, y: 2.5, h: 1.5, fontSize: 44 });
      if (s.subtitle) sl.addText(String(s.subtitle), { x: 0.8, y: 4.1, w: 11.8, h: 0.8, fontFace: th.pf, fontSize: 20, color: c(th.mute), margin: 0 });
    } else if (L === "quote") {
      sl.addText(String(s.quote || s.title || ""), { x: 1.2, y: 2, w: 10.8, h: 2.6, fontFace: th.pf, fontSize: 30, italic: true, color: c(th.head), margin: 0 });
      if (s.attribution) sl.addText("- " + s.attribution, { x: 1.2, y: 4.8, w: 10.8, h: 0.6, fontFace: th.pf, fontSize: 16, color: c(th.mute), margin: 0 });
    } else {
      sl.addText(String(s.title || ""), head);
      const body = { fontFace: th.pf, fontSize: 20, color: c(th.ink), valign: "top", margin: 0 };
      if (L === "two-column") { sl.addText(bl(s.left), { ...body, x: 0.8, y: 1.7, w: 5.7, h: 5 }); sl.addText(bl(s.right), { ...body, x: 6.9, y: 1.7, w: 5.7, h: 5 }); }
      else if (L === "image-text") { sl.addText(bl(s.bullets), { ...body, x: 0.8, y: 1.7, w: 5.8, h: 5 }); if (s.image) sl.addImage({ data: s.image, x: 7, y: 1.8, w: 5.6, h: 4.6, sizing: { type: "contain", w: 5.6, h: 4.6 } }); }
      else if (L === "chart" && s.chart && s.chart.values && s.chart.values.length) {
        const type = { line: P.charts.LINE, pie: P.charts.PIE }[s.chart.type] || P.charts.BAR;
        sl.addChart(type, [{ name: s.chart.title || "Series", labels: s.chart.labels.map(String), values: s.chart.values.map(Number) }], { x: 0.8, y: 1.6, w: 11.8, h: 4.6, chartColors: th.pal.map(c), catAxisLabelColor: c(th.mute), valAxisLabelColor: c(th.mute), showLegend: s.chart.type === "pie", legendColor: c(th.ink) });
        if ((s.bullets || []).length) sl.addText(bl(s.bullets.slice(0, 3)), { ...body, fontSize: 16, x: 0.8, y: 6.3, w: 11.8, h: 1 });
      } else sl.addText(bl(s.bullets), { ...body, x: 0.8, y: 1.7, w: 11.8, h: 5 });
    }
    sl.addText(String(idx + 1), { x: 12.2, y: 6.9, w: 0.8, h: 0.4, fontSize: 11, color: c(th.mute), align: "right" });
    if (s.notes) sl.addNotes(String(s.notes));
  });
  const out = await P.write({ outputType: "blob" });
  return out instanceof Blob ? out : new Blob([out], { type: MIME.pptx });
}
async function deckStandaloneHtml(deck, forPrint = false) {
  const css = await fetch("app.css").then((r) => r.text()).catch(() => "");
  const pages = deckPages(deck).map((p) => `<section class="pg">${p}</section>`).join("");
  const extra = forPrint ? "@page{size:13.333in 7.5in;margin:0}.pg{width:13.333in;height:7.5in;page-break-after:always;overflow:hidden}.pg .stage{width:100%;height:100%;box-shadow:none;border-radius:0}body{overflow:visible!important;background:#fff}" : "body{overflow:auto!important;background:#111;display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px}.pg{width:min(1100px,94vw)}";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(deck.title || "Presentation")}</title><style>${css}${extra}</style></head><body>${pages}</body></html>`;
}
async function printDeck(deck) {
  const html = await deckStandaloneHtml(deck, true);
  const f = document.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"; document.body.append(f);
  f.srcdoc = html; await new Promise((r) => (f.onload = r)); await sleep(300);
  f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 4000);
}
