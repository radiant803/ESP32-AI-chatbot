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
  refresh() { if (this.isOpen() && this.spec && ["deck", "report", "artifact", "design"].includes(this.spec.type)) { const c = Store.chats[this.spec.chatId]; if (!c || !c.nodes[this.spec.nodeId]) this.close(); } },
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
    else if (s.type === "design") this.design();
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
    if (a.type === "html") $("canvas").querySelector("iframe").srcdoc = previewDoc(a.preview);
    this.spec.copy = a.preview;
  },
  report() {
    const n = this.node(); if (!n || !n.report) return this.close(); const r = n.report;
    const srcs = (n.sources || []).map((s, i) => `<div class="source"><span class="n">${i + 1}</span><div class="grow"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><p class="truncate">${esc(safe(() => new URL(s.url).hostname, s.url))}</p></div></div>`).join("");
    $("canvas").innerHTML = this.head(r.title, `<button class="btn sm" data-act="rp-deeper">${ico("flask", "sm")}Go deeper</button><button class="icon-btn" data-act="rp-export" aria-label="Export" title="Export">${ico("download")}</button>`) + `<div class="cv-body"><div class="cv-doc md"><h1>${esc(r.title)}</h1>${renderMarkdown(n.text, n.sources)}</div><div class="cv-pad col"><b>Sources</b>${srcs}</div></div>`;
  },


  // ---- Design viewer: live preview, devices, code, versions, export, refine ----
  dev: "desktop", tab: "preview",
  design() {
    const n = this.node(); if (!n || !n.design) return this.close(); const d = n.design, chat = Store.chats[this.spec.chatId], hist = designHistory(chat), html = d.kind !== "svg";
    $("canvas").innerHTML = this.head(d.title, `${hist.length > 1 ? `<select class="input" style="width:auto;padding:5px 8px" data-dz-version aria-label="Version">${hist.map((h) => `<option value="${h.nodeId}" ${h.nodeId === n.id ? "selected" : ""}>v${h.v}</option>`).join("")}</select>` : ""}<button class="btn primary sm" data-act="dz-export">${ico("download", "sm")}Export</button>`) +
      `<div class="dz-bar"><div class="seg"><button data-act="dz-tab" data-v="preview" class="${this.tab === "preview" ? "on" : ""}">Preview</button><button data-act="dz-tab" data-v="code" class="${this.tab === "code" ? "on" : ""}">Code</button></div>
        ${html ? `<div class="seg" role="group" aria-label="Device">${[["phone", "Phone"], ["tablet", "Tablet"], ["desktop", "Desktop"]].map(([k, l]) => `<button data-act="dz-dev" data-v="${k}" class="${this.dev === k ? "on" : ""}">${l}</button>`).join("")}</div>` : ""}
        <span class="grow"></span><span class="chip ${d.live ? "" : d.issues && d.issues.length ? "warn" : "ok"}" id="dz-status">${d.live ? "Building…" : d.issues && d.issues.length ? d.issues.length + " to check" : "Checks passed"}</span></div>
      <div class="cv-body dz-body" id="dz-body"></div>
      <div class="dz-refine"><div class="dz-chips">${["Make it bolder", "More minimal", "Improve mobile layout", "Add subtle animations", "Add a dark mode"].map((t) => `<button data-act="dz-chip" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div><div class="row"><textarea class="input" id="dz-in" rows="1" placeholder="Ask for a change…" aria-label="Ask for a change"></textarea><button class="send" data-act="dz-send" aria-label="Send change" ${isBusy(chat.id) ? "disabled" : ""}>${ico("send")}</button></div></div>`;
    $("dz-in").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ACTS["dz-send"](); } });
    this.drawDesign();
  },
  drawDesign(final) {
    const n = this.node(), body = $("dz-body"); if (!n || !n.design || !body) return; const d = n.design;
    if (this.tab === "code") { body.innerHTML = `<div class="dz-codewrap"><button class="btn sm dz-copy" data-act="dz-copy">${ico("copy", "sm")}Copy</button><pre class="dz-code"><code>${highlight(d.code, d.kind === "svg" ? "html" : "html")}</code></pre></div>`; return; }
    if (d.kind === "svg") { body.innerHTML = `<div class="dz-svg">${sanitizeSvg(d.code || "")}</div>`; return; }
    body.innerHTML = `<div class="dz-stage" id="dz-stage"><div class="dz-scale" id="dz-scale"><div class="dz-frame" id="dz-frame"><iframe title="Design preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div></div></div>`;
    $("dz-frame").querySelector("iframe").srcdoc = d.code ? previewDoc(d.code) : "<p style='font:14px system-ui;padding:24px;color:#888'>Waiting for the first lines of code…</p>";
    this.fitFrame(); if (!this._ro) { this._ro = new ResizeObserver(() => this.fitFrame()); } this._ro.disconnect(); this._ro.observe($("dz-stage"));
  },
  fitFrame() {
    const stage = $("dz-stage"), frame = $("dz-frame"), box = $("dz-scale"); if (!stage || !frame || !box) return;
    const w = { phone: 390, tablet: 768, desktop: 1280 }[this.dev] || 1280, scale = Math.min(1, (stage.clientWidth - 24) / w), h = Math.max(320, (stage.clientHeight - 24) / scale);
    box.style.width = w * scale + "px"; box.style.height = h * scale + "px";
    frame.style.width = w + "px"; frame.style.height = h + "px"; frame.style.transform = `scale(${scale})`;
  },
  // Called while code is streaming in (throttled by the caller) and once when finished.
  liveDesign(nodeId, final) {
    const s = this.spec; if (!s || s.type !== "design" || s.nodeId !== nodeId || !this.isOpen()) return;
    const n = this.node(); if (!n || !n.design) return;
    if (final) return this.design();
    if (this.tab !== "preview") return;
    const d = n.design;
    if (d.kind === "svg") { const b = $("dz-body"); if (b) b.innerHTML = `<div class="dz-svg">${sanitizeSvg(d.code || "")}</div>`; return; }
    const f = $("dz-frame") && $("dz-frame").querySelector("iframe"); if (f && d.code) f.srcdoc = previewDoc(d.code);
  },

  // ---- Slide deck studio ----
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

ACTS["dz-tab"] = (el) => { Canvas.tab = el.dataset.v; Canvas.design(); };
ACTS["dz-dev"] = (el) => { Canvas.dev = el.dataset.v; Canvas.design(); };
ACTS["dz-copy"] = () => { copyText(Canvas.node().design.code); toast("Code copied", "ok", "", 1300); };
ACTS["dz-chip"] = (el) => { const i = $("dz-in"); i.value = el.dataset.t; i.focus(); };
ACTS["dz-send"] = () => {
  const i = $("dz-in"), t = i && i.value.trim(), chat = Store.chats[Canvas.spec.chatId]; if (!t || !chat) return;
  if (isBusy(chat.id)) return toast("Hold on, the current build is still running.");
  if (App.chatId !== chat.id) openChat(chat.id);
  chat.mode = "design"; i.value = ""; startSend(t);
};
document.addEventListener("change", (e) => { const t = e.target; if (t.dataset && t.dataset.dzVersion !== undefined && Canvas.spec && Canvas.spec.type === "design") Canvas.show({ type: "design", chatId: Canvas.spec.chatId, nodeId: t.value }, true); });
ACTS["dz-export"] = (el) => {
  const n = Canvas.node(), d = n.design, ext = d.kind === "svg" ? "svg" : "html", name = d.file || designFilename(d), items = [
    { label: `Download .${ext}`, icon: "download", fn: () => download(new Blob([d.code], { type: ext === "svg" ? "image/svg+xml" : "text/html" }), name) },
    { label: "Copy code", icon: "copy", fn: () => { copyText(d.code); toast("Code copied", "ok", "", 1300); } },
  ];
  if (d.kind === "svg") items.push({ label: "Download .png", icon: "image", fn: () => svgToPng(d.code, name.replace(/\.svg$/, ".png")) });
  else items.push({ label: "Print / save as PDF", icon: "file", fn: () => printDesign(d.code) });
  items.push({ sep: 1 }, { label: d.stored ? "Stored on the device" : "Save to the device", icon: "cpu", disabled: !!d.stored, fn: async () => { const rec = await buildAndStore({ type: d.kind === "svg" ? "svg" : "html", filename: name, title: d.title, content: d.code }, { download: false }); d.stored = rec.stored; Store.saveChat(Store.chats[Canvas.spec.chatId]); toast(rec.stored ? "Saved to the device" : "Could not save", rec.stored ? "ok" : "bad", rec.storeError); } });
  openMenu(el, items, { align: "right" });
};
// Printing happens in a separate sandboxed frame that is allowed to open the print dialog; it never shares this app's origin.
function printDesign(code) {
  const f = document.createElement("iframe"); f.setAttribute("sandbox", "allow-scripts allow-modals"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.srcdoc = code.replace(/<\/body>\s*<\/html>\s*$/i, "<script>addEventListener('load',()=>setTimeout(()=>print(),400))<\/script></body></html>"); document.body.append(f); setTimeout(() => f.remove(), 60000);
}
function svgToPng(svg, filename) {
  const m = svg.match(/viewBox=["'][\d.\s-]*?([\d.]+)\s+([\d.]+)["']/), w = m ? +m[1] : 1080, h = m ? +m[2] : 1080, img = new Image();
  img.onload = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); c.toBlob((b) => download(b, filename)); };
  img.onerror = () => toast("The SVG could not be rendered to PNG.", "bad");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/<svg\b/, (t) => (/\swidth=/.test(svg) ? t : t + ` width="${w}" height="${h}"`)));
}
