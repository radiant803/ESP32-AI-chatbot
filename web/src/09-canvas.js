// Canvas side panel: previews, report viewer, and the presentation studio.
const Canvas = {
  spec: null, sel: 0, busyImg: false,
  isOpen: () => $("app").dataset.canvas === "open",
  show(spec, quiet) {
    this.spec = spec; this.sel = spec.type === "deck" ? Math.min(this.sel, 0) : 0;
    $("app").dataset.canvas = "open"; if (UI.mobile() && !quiet) UI.setRail(false);
    this.render(); UI.renderTopbar();
  },
  reopen() { if (this.spec) { $("app").dataset.canvas = "open"; this.render(); UI.renderTopbar(); } else toast("Nothing to show yet.", "", "Create a deck, report or file, or preview a code block."); },
  close() { $("app").dataset.canvas = "closed"; UI.renderTopbar(); },
  refresh() { if (this.isOpen() && this.spec && ["deck", "report", "artifact"].includes(this.spec.type)) { const c = Store.chats[this.spec.chatId]; if (!c || !c.nodes[this.spec.nodeId]) this.close(); } },
  node() { const c = Store.chats[this.spec.chatId]; return c && c.nodes[this.spec.nodeId]; },
  head(title, actions = "") { return `<div class="cv-head"><b class="grow truncate">${esc(title)}</b>${actions}<button class="icon-btn" data-act="cv-close" aria-label="Close canvas">${ico("x")}</button></div>`; },
  render() {
    const s = this.spec, el = $("canvas"); if (!s) return;
    if (s.type === "html") el.innerHTML = this.head(s.title || "Preview", `<button class="icon-btn" data-act="cv-copy" aria-label="Copy" title="Copy source">${ico("copy")}</button>`) + `<div class="cv-body"><iframe class="cv-frame" sandbox="allow-scripts" title="Preview"></iframe></div>`, el.querySelector("iframe").srcdoc = s.html;
    else if (s.type === "text") el.innerHTML = this.head(s.title, `<button class="icon-btn" data-act="cv-copy" aria-label="Copy">${ico("copy")}</button>`) + `<div class="cv-body">${/\.md$/i.test(s.name || "") ? `<div class="cv-doc md">${renderMarkdown(s.text)}</div>` : `<div class="cv-pad"><div class="code"><pre><code>${esc(s.text)}</code></pre></div></div>`}</div>`;
    else if (s.type === "image") el.innerHTML = this.head("Image", `<button class="icon-btn" data-act="cv-dl-image" aria-label="Download image">${ico("download")}</button>`) + `<div class="cv-body"><div class="cv-pad" style="display:grid;place-items:center;min-height:100%"><img class="cv-img" alt="Generated image" src="${esc(s.src)}"></div></div>`;
    else if (s.type === "artifact") this.artifact();
    else if (s.type === "report") this.report();
    else if (s.type === "deck") this.deckStudio();
  },
  artifact() {
    const n = this.node(), a = n && n.artifacts[this.spec.index]; if (!a) return this.close();
    const dl = a.stored ? `<a class="icon-btn" href="/api/artifacts/download?name=${encodeURIComponent(a.name)}" download aria-label="Download" title="Download">${ico("download")}</a>` : "";
    let body = "";
    if (a.deck) { this.spec = { type: "deck", chatId: this.spec.chatId, nodeId: this.spec.nodeId }; return this.deckStudio(); }
    if (a.type === "html") body = `<iframe class="cv-frame" sandbox="allow-scripts" title="Preview"></iframe>`;
    else if (a.type === "docx") body = `<div class="cv-doc md"><h1>${esc(a.title)}</h1>${renderMarkdown(a.preview)}</div>`;
    else if (a.type === "xlsx") { const sheets = safe(() => JSON.parse(a.preview).sheets, []); body = `<div class="cv-pad">${sheets.map((sh) => `<h3 style="margin:8px 0">${esc(sh.name)}</h3><div class="md"><table><thead><tr>${(sh.columns || []).map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${(sh.rows || []).slice(0, 100).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("") || '<div class="empty">No preview available.</div>'}</div>`; }
    else body = `<div class="cv-pad"><div class="code"><pre><code>${esc(a.preview)}</code></pre></div></div>`;
    $("canvas").innerHTML = this.head(a.name, dl + `<button class="icon-btn" data-act="cv-copy" aria-label="Copy">${ico("copy")}</button>`) + `<div class="cv-body">${body}</div>`;
    if (a.type === "html") $("canvas").querySelector("iframe").srcdoc = a.preview;
    this.spec.copy = a.preview;
  },
  report() {
    const n = this.node(); if (!n || !n.report) return this.close(); const r = n.report;
    const srcs = (n.sources || []).map((s, i) => `<div class="source"><span class="n">${i + 1}</span><div class="grow"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><p class="truncate">${esc(safe(() => new URL(s.url).hostname, s.url))}</p></div></div>`).join("");
    $("canvas").innerHTML = this.head(r.title, `<button class="btn sm" data-act="rp-deeper">${ico("flask", "sm")}Go deeper</button><button class="icon-btn" data-act="rp-export" aria-label="Export" title="Export">${ico("download")}</button>`) + `<div class="cv-body"><div class="cv-doc md"><h1>${esc(r.title)}</h1>${renderMarkdown(n.text, n.sources)}</div><div class="cv-pad col"><b>Sources</b>${srcs}</div></div>`;
  },

  // ---- Presentation studio ----
  deckStudio() {
    const n = this.node(); if (!n || !n.deck) return this.close(); const d = n.deck;
    this.sel = clamp(this.sel, 0, d.slides.length - 1);
    const th = THEMES[d.theme] || THEMES.paper;
    $("canvas").innerHTML = this.head(d.title, `<select class="input" style="width:auto;padding:5px 8px" data-dk-theme aria-label="Theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${d.theme === k ? "selected" : ""}>${t.name}</option>`).join("")}</select><button class="btn primary sm" data-act="dk-export">${ico("download", "sm")}Export</button>`) +
      `<div class="cv-body" style="overflow:hidden"><div class="deck"><div class="deck-strip" id="dk-strip"></div><div class="stage-wrap" id="dk-main"></div></div></div>`;
    this.drawStrip(); this.drawMain();
  },
  drawStrip() {
    const d = this.node().deck, th = THEMES[d.theme] || THEMES.paper;
    $("dk-strip").innerHTML = d.slides.map((s, i) => `<div class="thumb ${i === this.sel ? "on" : ""}" data-act="dk-sel" data-i="${i}" role="button" tabindex="0" aria-label="Slide ${i + 1}"><span class="n">${i + 1}</span>${slideHTML(s, th, i, d.slides.length)}</div>`).join("") + `<button class="btn sm" data-act="dk-add" style="flex:none">${ico("plus", "sm")}</button>`;
  },
  drawMain() {
    const d = this.node().deck, th = THEMES[d.theme] || THEMES.paper, s = d.slides[this.sel], L = s.layout;
    const f = (label, inner) => `<div class="field"><label>${label}</label>${inner}</div>`;
    const lines = (a) => esc((a || []).join("\n"));
    let fields = f("Layout", `<select class="input" data-dk="layout">${LAYOUTS.map((l) => `<option ${l === L ? "selected" : ""}>${l}</option>`).join("")}</select>`) + f("Title", `<input class="input" data-dk="title" value="${esc(s.title)}">`);
    if (["title", "section", "closing"].includes(L)) fields += f("Subtitle", `<input class="input" data-dk="subtitle" value="${esc(s.subtitle)}">`);
    if (["bullets", "image-text", "chart"].includes(L)) fields += f("Bullets (one per line)", `<textarea class="input" rows="4" data-dk="bullets">${lines(s.bullets)}</textarea>`);
    if (L === "two-column") fields += f("Left column", `<textarea class="input" rows="3" data-dk="left">${lines(s.left)}</textarea>`) + f("Right column", `<textarea class="input" rows="3" data-dk="right">${lines(s.right)}</textarea>`);
    if (L === "quote") fields += f("Quote", `<textarea class="input" rows="3" data-dk="quote">${esc(s.quote)}</textarea>`) + f("Attribution", `<input class="input" data-dk="attribution" value="${esc(s.attribution)}">`);
    if (L === "chart") { const c = s.chart || { type: "bar", labels: [], values: [] }; fields += f("Chart type", `<select class="input" data-dk="chart.type">${["bar", "line", "pie"].map((t) => `<option ${c.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>`) + f("Labels (comma separated)", `<input class="input" data-dk="chart.labels" value="${esc(c.labels.join(", "))}">`) + f("Values (comma separated)", `<input class="input" data-dk="chart.values" value="${esc(c.values.join(", "))}">`); }
    if (L === "image-text") fields += f("Image", `<input class="input" data-dk="imagePrompt" placeholder="Describe the image" value="${esc(s.imagePrompt)}"><div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="dk-img-gen" ${this.busyImg ? "disabled" : ""}>${ico("sparkle", "sm")}${this.busyImg ? "Generating…" : "Generate"}</button><button class="btn sm" data-act="dk-img-up">${ico("image", "sm")}Upload</button>${s.image ? `<button class="btn sm danger" data-act="dk-img-rm">Remove</button>` : ""}</div><input type="file" id="dk-file" accept="image/*" hidden>`);
    fields += f("Speaker notes", `<textarea class="input" rows="3" data-dk="notes">${esc(s.notes)}</textarea>`);
    $("dk-main").innerHTML = `<div id="dk-stage">${slideHTML(s, th, this.sel, d.slides.length)}</div>
      <div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="dk-regen">${ico("refresh", "sm")}Rewrite with AI</button><span class="grow"></span><button class="tool-btn" data-act="dk-move" data-d="-1" aria-label="Move up" ${this.sel === 0 ? "disabled" : ""}>${ico("up", "sm")}</button><button class="tool-btn" data-act="dk-move" data-d="1" aria-label="Move down" ${this.sel === d.slides.length - 1 ? "disabled" : ""}>${ico("down", "sm")}</button><button class="tool-btn" data-act="dk-dup" aria-label="Duplicate" title="Duplicate">${ico("copy", "sm")}</button><button class="tool-btn" data-act="dk-del" aria-label="Delete slide" title="Delete" ${d.slides.length < 2 ? "disabled" : ""}>${ico("trash", "sm")}</button></div>
      <div class="edit-panel">${fields}</div>`;
  },
  touchDeck() { const c = Store.chats[this.spec.chatId]; Store.saveChat(c); const n = this.node(); UI.updateNode(c, n); },
  syncStage() { const d = this.node().deck, th = THEMES[d.theme] || THEMES.paper; $("dk-stage").innerHTML = slideHTML(d.slides[this.sel], th, this.sel, d.slides.length); const t = document.querySelector(`.thumb[data-i="${this.sel}"]`); if (t) t.innerHTML = `<span class="n">${this.sel + 1}</span>` + slideHTML(d.slides[this.sel], th, this.sel, d.slides.length); },
};
ACTS["cv-close"] = () => Canvas.close();
ACTS["cv-dl-image"] = () => { const src = Canvas.spec.src; fetch(src).then((r) => r.blob()).then((b) => download(b, "chatesp-image." + (b.type.includes("png") ? "png" : "jpg"))); };
ACTS["cv-copy"] = () => { const s = Canvas.spec; copyText(s.copy || s.html || s.text || ""); toast("Copied", "ok", "", 1200); };
ACTS["dk-sel"] = (el) => { Canvas.sel = +el.dataset.i; document.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("on", +t.dataset.i === Canvas.sel)); Canvas.drawMain(); };
ACTS["dk-add"] = () => { const d = Canvas.node().deck; d.slides.splice(Canvas.sel + 1, 0, { layout: "bullets", title: "New slide", subtitle: "", bullets: ["Point one", "Point two"], left: [], right: [], quote: "", attribution: "", chart: null, imagePrompt: "", image: "", notes: "" }); Canvas.sel++; Canvas.touchDeck(); Canvas.drawStrip(); Canvas.drawMain(); };
ACTS["dk-dup"] = () => { const d = Canvas.node().deck; d.slides.splice(Canvas.sel + 1, 0, JSON.parse(JSON.stringify(d.slides[Canvas.sel]))); Canvas.sel++; Canvas.touchDeck(); Canvas.drawStrip(); Canvas.drawMain(); };
ACTS["dk-del"] = () => { const d = Canvas.node().deck; d.slides.splice(Canvas.sel, 1); Canvas.sel = Math.min(Canvas.sel, d.slides.length - 1); Canvas.touchDeck(); Canvas.drawStrip(); Canvas.drawMain(); };
ACTS["dk-move"] = (el) => { const d = Canvas.node().deck, j = Canvas.sel + +el.dataset.d; if (j < 0 || j >= d.slides.length) return; [d.slides[Canvas.sel], d.slides[j]] = [d.slides[j], d.slides[Canvas.sel]]; Canvas.sel = j; Canvas.touchDeck(); Canvas.drawStrip(); Canvas.drawMain(); };
ACTS["dk-regen"] = async (el) => {
  const chat = Store.chats[Canvas.spec.chatId], node = Canvas.node(); const instr = await promptDialog("Rewrite this slide", "", "What should change? (optional)");
  if (instr === null) return; el.disabled = true; el.textContent = "Rewriting…";
  try { await Deck.regenSlide(chat, node, Canvas.sel, instr); Canvas.touchDeck(); Canvas.drawStrip(); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); }
  Canvas.drawMain();
};
ACTS["dk-img-gen"] = async () => {
  const chat = Store.chats[Canvas.spec.chatId], s = Canvas.node().deck.slides[Canvas.sel]; if (!s.imagePrompt) return toast("Describe the image first.");
  Canvas.busyImg = true; Canvas.drawMain();
  try { const url = await generateImage(chat.provider, s.imagePrompt + ". Clean presentation illustration, no text."); s.image = await downscaleDataUrl(url, 600, 60000); Canvas.touchDeck(); Canvas.syncStage(); }
  catch (e) { toast(errView(e).message, "bad", errView(e).hint); }
  Canvas.busyImg = false; Canvas.drawMain();
};
ACTS["dk-img-up"] = () => { const f = $("dk-file"); f.onchange = async () => { try { const s = Canvas.node().deck.slides[Canvas.sel]; s.image = await shrinkImage(f.files[0], 90000); Canvas.touchDeck(); Canvas.syncStage(); Canvas.drawMain(); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); } }; f.click(); };
ACTS["dk-img-rm"] = () => { Canvas.node().deck.slides[Canvas.sel].image = ""; Canvas.touchDeck(); Canvas.syncStage(); Canvas.drawMain(); };
async function downscaleDataUrl(url, max, maxChars) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  let scale = Math.min(1, max / Math.max(img.width, img.height)), q = 0.8, out = url;
  for (let k = 0; k < 6; k++) { const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL("image/jpeg", q); if (out.length <= maxChars) break; scale *= 0.8; q -= 0.08; }
  return out;
}
ACTS["dk-export"] = (el) => {
  const d = Canvas.node().deck, name = safeFilename(d.title, "pptx").replace(/\.\w+$/, "");
  openMenu(el, [
    { label: "PowerPoint (.pptx)", icon: "deck", fn: async () => { toast("Building…", "", "", 1200); const r = await buildAndStore({ type: "pptx", filename: name + ".pptx", title: d.title, deck: d }); toast(r.stored ? "Downloaded and stored on device" : "Downloaded", "ok", r.storeError); } },
    { label: "Web page (.html)", icon: "globe", fn: async () => download(new Blob([await deckStandaloneHtml(d)], { type: "text/html" }), name + ".html") },
    { label: "PDF (print)", icon: "file", fn: () => printDeck(d) },
    { sep: 1 }, { label: "Present full screen", icon: "play", fn: () => presentDeck(d) },
  ], { align: "right" });
};
function presentDeck(d) {
  const th = THEMES[d.theme] || THEMES.paper; let i = 0;
  const back = document.createElement("div"); back.style.cssText = "position:fixed;inset:0;z-index:300;background:#000;display:grid;place-items:center";
  back.innerHTML = `<div id="pd" style="width:min(100vw,177.78vh);aspect-ratio:16/9"></div>`; document.body.append(back);
  const draw = () => { const h = back.firstElementChild; h.innerHTML = slideHTML(d.slides[i], th, i, d.slides.length); h.firstElementChild.style.cssText += ";width:100%;height:100%;border-radius:0;box-shadow:none"; };
  const key = (e) => { if (e.key === "ArrowRight" || e.key === " ") i = Math.min(i + 1, d.slides.length - 1); else if (e.key === "ArrowLeft") i = Math.max(i - 1, 0); else if (e.key === "Escape") { back.remove(); document.removeEventListener("keydown", key, true); return; } else return; e.stopPropagation(); draw(); };
  document.addEventListener("keydown", key, true); back.addEventListener("click", (e) => { i = Math.min(i + 1, d.slides.length - 1); draw(); if (e.detail > 1) { back.remove(); document.removeEventListener("keydown", key, true); } });
  draw(); back.requestFullscreen && back.requestFullscreen().catch(() => {});
}
document.addEventListener("input", (e) => {
  const t = e.target, k = t.dataset && t.dataset.dk; if (!k || !Canvas.spec || Canvas.spec.type !== "deck") return;
  const s = Canvas.node().deck.slides[Canvas.sel], lines = (v) => v.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  if (k === "bullets" || k === "left" || k === "right") s[k] = lines(t.value);
  else if (k.startsWith("chart.")) { s.chart = s.chart || { type: "bar", title: "", labels: [], values: [] }; const f = k.slice(6); s.chart[f] = f === "type" ? t.value : f === "values" ? t.value.split(",").map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x)) : t.value.split(",").map((x) => x.trim()).filter(Boolean); }
  else s[k] = t.value;
  Canvas.syncStage(); clearTimeout(Canvas._t); Canvas._t = setTimeout(() => Canvas.touchDeck(), 400);
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.dkTheme !== undefined && Canvas.spec?.type === "deck") { Canvas.node().deck.theme = t.value; Canvas.touchDeck(); Canvas.drawStrip(); Canvas.syncStage(); }
  else if (t.dataset && t.dataset.dk === "layout" && Canvas.spec?.type === "deck") { const s = Canvas.node().deck.slides[Canvas.sel]; s.layout = t.value; if (t.value === "chart" && !s.chart) s.chart = { type: "bar", title: "", labels: ["A", "B", "C"], values: [3, 5, 4] }; Canvas.touchDeck(); Canvas.drawStrip(); Canvas.drawMain(); }
});
ACTS["rp-deeper"] = () => { const c = curChat(); c.researchDepth = "deep"; const n = Canvas.node(); toast("Going deeper…", "", "More sources and a gap-check round."); regenerate(n.id); };
ACTS["rp-export"] = (el) => {
  const n = Canvas.node(), r = n.report, base = safeFilename(r.title, "md").replace(/\.\w+$/, "");
  const withRefs = n.text + "\n\n## Sources\n" + n.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n");
  openMenu(el, [
    { label: "Markdown (.md)", icon: "file", fn: () => download(new Blob([withRefs], { type: "text/markdown" }), base + ".md") },
    { label: "Word (.docx)", icon: "file", fn: async () => { const r2 = await buildAndStore({ type: "docx", filename: base + ".docx", title: r.title, markdown: n.text + "\n\n## Sources\n\n" + n.sources.map((x, i) => `${i + 1}. [${x.title}](${x.url})`).join("\n") }); toast(r2.stored ? "Downloaded and stored on device" : "Downloaded", "ok", r2.storeError); } },
    { label: "PDF (print)", icon: "download", fn: async () => { const css = await fetch("app.css").then((x) => x.text()).catch(() => ""); const f = document.createElement("iframe"); f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0"; document.body.append(f); f.srcdoc = `<!doctype html><style>${css}body{overflow:visible;background:#fff;color:#111;padding:32px;max-width:780px;margin:auto}</style><div class="md"><h1>${esc(r.title)}</h1>${renderMarkdown(n.text, n.sources)}<h2>Sources</h2><ol>${n.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a></li>`).join("")}</ol></div>`; await new Promise((x) => (f.onload = x)); f.contentWindow.print(); setTimeout(() => f.remove(), 4000); } },
  ], { align: "right" });
};
