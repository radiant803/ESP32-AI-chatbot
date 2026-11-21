// Design mode: websites, prototypes, UI modules, dashboards, email, graphics and more, plus slide decks (see Deck in 06-modes.js).
// Two phases: a concept brief (palette, type, structure, real copy), then the build, streamed into a live preview.
const HTML_RULES = `Output ONE complete, self-contained HTML file (<!doctype html> to </html>) with all CSS in one <style> tag and all JavaScript in one <script> tag. Use no external resources at all: no CDN links, web fonts, remote images, iframes or analytics. Use a modern system font stack, inline SVG, and CSS gradients or patterns for imagery.
Quality bar: take a distinctive art direction from the brief (avoid generic purple-gradient SaaS clichés); build a design-token system in CSS custom properties (colour, a type scale with clamp(), a 4/8px spacing scale, radii, shadows); mobile-first responsive layout with CSS grid and flexbox; include <meta name="viewport">; use semantic landmarks; keep text contrast at least 4.5:1; give every interactive element a visible :focus-visible style and keyboard support; add aria-labels to icon-only buttons; respect prefers-reduced-motion. Support light and dark with prefers-color-scheme unless the brief demands one look. Write real, specific copy, never lorem ipsum. Keep JavaScript small, dependency-free and free of errors.
Wrap any localStorage/sessionStorage access in try/catch (it can throw). Never hide content by default: no section may start at opacity 0, visibility hidden or off-screen waiting for JavaScript. Scroll-reveal effects must be progressive (the content is fully visible without JS; add a class from script only to animate it, and respect reduced motion).
Reply with ONLY the file inside one \`\`\`html fenced block and no commentary.`;
const SVG_RULES = `Output ONE standalone <svg> document: xmlns, a viewBox, no scripts, no external references or fonts (use font-family stacks such as system-ui, Georgia or ui-monospace). Build depth with <defs> gradients, patterns and filters used sparingly; keep a clear visual hierarchy, generous margins and a limited, consistent palette. Include <title> and <desc>. Reply with ONLY the SVG inside one \`\`\`svg fenced block and no commentary.`;

// Compact variants for devices that can only take a few KB per request (ESP8266).
const HTML_RULES_SMALL = "One self-contained HTML file with inline CSS and JS and no external resources. Distinctive art direction, CSS custom properties, fluid type with clamp(), responsive grid, semantic HTML, 4.5:1 contrast, :focus-visible, reduced-motion, light and dark, real copy, small error-free JS. All content visible without JS (no opacity:0 reveal effects); wrap localStorage in try/catch. Reply ONLY with the file in one ```html block.";
const SVG_RULES_SMALL = "One standalone <svg> with xmlns and viewBox, no scripts or external references, gradients in <defs>, clear hierarchy, limited palette, <title> and <desc>. Reply ONLY with the SVG in one ```svg block.";
const DESIGN_TYPES = [
  { id: "auto", label: "Auto", icon: "sparkle", hint: "Pick the best format for my request" },
  { id: "deck", label: "Slide deck", icon: "deck", kind: "deck", hint: "Editable slides, export to PowerPoint and PDF" },
  { id: "website", label: "Website", icon: "globe", kind: "html", hint: "Responsive multi-section site", spec: "A multi-section responsive website: a sticky header with a working mobile menu, a hero with a strong headline and one primary action, three to five content sections that fit the brief (for example features, proof, pricing or work, FAQ, contact) and a footer. Add smooth anchor scrolling, subtle reveal-on-scroll with IntersectionObserver, and clear hover and focus states." },
  { id: "landing", label: "Landing page", icon: "arrowr", kind: "html", hint: "One focused page built to convert", spec: "A conversion-focused landing page: a hero with a clear value proposition and call to action, a social-proof strip, benefits, how it works, a pricing or offer block, objection-handling FAQ, a final call to action and a compact footer. Include a working form or email capture with client-side validation and a friendly success state." },
  { id: "prototype", label: "App prototype", icon: "panel", kind: "html", hint: "Clickable multi-screen app", spec: "A clickable multi-screen app prototype shown inside a centred phone frame on wide screens and full-bleed on phones. Provide four to six connected screens with a small JavaScript router and a tab bar or navigation, realistic sample data, empty, loading and success states where they make sense, and smooth screen transitions." },
  { id: "component", label: "UI component", icon: "grid", kind: "html", hint: "A reusable module with every state", spec: "A reusable UI component or module set presented on a neutral showcase page: show every state (default, hover, focus, active, disabled, loading, error), size and variant side by side, expose the CSS custom properties it uses, and keep class names clean so it can be copied into a project. It must be fully keyboard accessible." },
  { id: "dashboard", label: "Dashboard", icon: "cpu", kind: "html", hint: "Charts, KPIs and tables", spec: "An analytics dashboard with realistic sample data held in JavaScript arrays: KPI cards with deltas, inline SVG charts drawn by small functions (line, bar, donut, sparklines), a sortable and filterable data table, and segment or date-range toggles that update the charts. Use a responsive grid and give each chart a text summary for screen readers." },
  { id: "email", label: "Email", icon: "send", kind: "html", hint: "Table-based responsive email", spec: "A responsive HTML email at most 600px wide: table-based layout, inline styles on every element, a bulletproof button, a hidden preheader, no JavaScript, and a color-scheme meta tag so dark mode stays legible. Do not rely on images for meaning. This type may skip the CSS custom properties and the viewport rule above where email clients need otherwise." },
  { id: "poster", label: "Poster / social", icon: "image", kind: "svg", size: { w: 1080, h: 1350 }, hint: "Posters, social posts, banners", spec: "A poster or social graphic with a bold typographic hierarchy, a strong focal illustration built from geometric shapes and gradients, and one clear message with a call to action." },
  { id: "logo", label: "Logo & icons", icon: "pin", kind: "svg", size: { w: 1200, h: 900 }, hint: "Mark, wordmark and variants", spec: "A logo presentation sheet: the primary lockup, the icon-only mark at three sizes, light and dark versions, and a small palette and clear-space strip. The mark must be simple, distinctive and legible at 16px." },
  { id: "infographic", label: "Infographic", icon: "list", kind: "svg", size: { w: 1080, h: 2400 }, hint: "Data stories in one tall graphic", spec: "A tall infographic: a title block, four to six data stories each with a simple chart (bars, donuts, icon arrays), one consistent colour system, and a sources footer. Use only numbers given in the request or clearly label them as illustrative." },
  { id: "wireframe", label: "Wireframe", icon: "branch", kind: "html", hint: "Low-fidelity layout with annotations", spec: "A low-fidelity wireframe: grayscale only with a single highlight colour, boxes and labelled placeholder blocks, numbered annotation callouts with a legend, and desktop and mobile frames side by side. Make the structure and flow obvious without visual polish." },
  { id: "animation", label: "Animation", icon: "play", kind: "html", hint: "Motion scenes and loaders", spec: "An animated scene or motion piece using CSS keyframes and inline SVG with only a little JavaScript. Include play, pause and replay controls, animate transforms and opacity only so it stays smooth, and under prefers-reduced-motion show a static final frame." },
  { id: "onepager", label: "One-pager / résumé", icon: "file", kind: "html", hint: "Print-ready A4 documents", spec: "A print-ready A4 document (210mm by 297mm) such as a one-pager, résumé or flyer, with @page and @media print rules, a tight typographic hierarchy, semantic headings that parse well, and a Print / Save as PDF button that is hidden when printing." },
  { id: "system", label: "Design system", icon: "settings", kind: "html", hint: "Tokens, type and components", spec: "A design system style guide page: colour tokens with their contrast ratios, a type scale, spacing, radius and shadow tokens, at least eight core components with their states, short do and don't notes, and a copyable :root{} token block plus a JSON token export button." },
  { id: "tool", label: "Interactive tool / game", icon: "bolt", kind: "html", hint: "Calculators, quizzes, planners, games", spec: "A complete interactive mini-app, tool or game with working logic: input validation, keyboard support, state saved in localStorage inside try/catch, a responsive layout and delightful micro-interactions." },
];
const designType = (id) => DESIGN_TYPES.find((t) => t.id === id);

const BRIEF_SCHEMA = `{"title":"short name","summary":"what this is and who it serves","tone":"3 to 5 adjectives","artDirection":"two sentences describing the visual concept","palette":{"bg":"#hex","surface":"#hex","text":"#hex","muted":"#hex","accent":"#hex","accent2":"#hex"},"typography":{"heading":"font stack and character","body":"font stack and size","scale":"for example 1.25"},"structure":[{"name":"section, screen or component","purpose":"why it exists","copy":"the actual headline and supporting text"}],"interactions":["specific behaviours"],"accessibility":["specific considerations"]}`;

function detectDesignType(text) {
  const t = String(text || "").toLowerCase(), has = (re) => re.test(t);
  if (has(/\b(slides?|deck|presentation|pitch deck|keynote|powerpoint)\b/)) return "deck";
  if (has(/\b(e-?mail|newsletter)\b/)) return "email";
  if (has(/\b(logo|wordmark|brand ?mark|icon set|favicon)\b/)) return "logo";
  if (has(/\b(poster|flyer|social (media )?(post|graphic)|instagram|banner|thumbnail|cover art)\b/)) return has(/\b(print|a4|resume|résumé)\b/) ? "onepager" : "poster";
  if (has(/\binfographic\b/)) return "infographic";
  if (has(/\b(wireframe|lo-?fi|low[- ]fidelity)\b/)) return "wireframe";
  if (has(/\b(design system|style ?guide|design tokens|ui kit)\b/)) return "system";
  if (has(/\b(dashboard|analytics|admin panel|kpi)\b/)) return "dashboard";
  if (has(/\b(prototype|mock-?up|app (screen|design|ui)|mobile app|clickable)\b/)) return "prototype";
  if (has(/\b(landing page)\b/)) return "landing";
  if (has(/\b(website|web ?site|web ?page|homepage|home page|portfolio|\bsite\b)\b/)) return "website";
  if (has(/\b(component|widget|navbar|navigation bar|modal|pricing (table|card)|card|form|button|table|calendar|sidebar|footer|hero section)\b/)) return "component";
  if (has(/\b(animation|animate|animated|motion|loading (spinner|screen)|intro)\b/)) return "animation";
  if (has(/\b(r[eé]sum[eé]|cv|one-?pager|brochure|invoice|certificate)\b/)) return "onepager";
  if (has(/\b(game|calculator|quiz|timer|tool|planner|tracker|converter|generator|app)\b/)) return "tool";
  return "website";
}

// The model replies with a fenced block (sometimes unterminated while streaming); return only the file.
function extractCode(raw, kind) {
  let t = String(raw || "");
  const fence = t.match(/```(?:html|svg|xml|htm)?[^\n]*\n([\s\S]*?)(?:```|$)/i); if (fence) t = fence[1];
  const start = kind === "svg" ? t.search(/<svg[\s>]/i) : t.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) t = t.slice(start);
  if (kind === "svg") { const end = t.toLowerCase().lastIndexOf("</svg>"); if (end > 0) t = t.slice(0, end + 6); }
  return t.trim();
}
const isComplete = (code, kind) => (kind === "svg" ? /<\/svg>\s*$/i.test(code) : /<\/html>\s*$/i.test(code));
// Appends a continuation to a file that was cut off, dropping any text the model repeated at the seam.
function mergeContinuation(code, cont) {
  let c = String(cont || "").replace(/^\s*```[a-z]*\n?/i, "").replace(/\s*```\s*$/, "");
  for (let n = Math.min(240, code.length, c.length); n >= 24; n--) if (code.endsWith(c.slice(0, n))) { c = c.slice(n); break; }
  return code + c;
}
function sanitizeSvg(svg) { return svg.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, ""); }
function lintDesign(code, kind) {
  const issues = [];
  if (kind === "svg") {
    if (!/<svg[\s>]/i.test(code)) issues.push("No <svg> element was found"); else if (!/<\/svg>/i.test(code)) issues.push("The SVG looks cut off");
    if (!/viewBox/i.test(code)) issues.push("The SVG has no viewBox, so it won't scale");
    return issues;
  }
  if (!/<!doctype html/i.test(code)) issues.push("Missing <!doctype html>");
  if (!/<\/html>\s*$/i.test(code)) issues.push("The page looks cut off before </html>");
  if (!/name=["']viewport/i.test(code)) issues.push("Missing the viewport meta tag, so it won't be responsive on phones");
  if (/<(?:script|img|iframe|source|video|audio)\b[^>]*\ssrc=["']https?:/i.test(code) || /<link\b[^>]*href=["']https?:/i.test(code) || /@import\s+url\(["']?https?:/i.test(code)) issues.push("Loads external resources, so it will not work offline");
  if (/lorem ipsum/i.test(code)) issues.push("Contains placeholder lorem ipsum text");
  if (code.length > 300000) issues.push("The file is very large (" + fmtBytes(code.length) + ")");
  return issues;
}
function titleFromCode(code, fallback) { const m = code.match(/<title[^>]*>([^<]{2,80})<\/title>/i); return (m && m[1].trim()) || fallback; }

// Links the user's Stop button with a wall-clock limit so long builds end cleanly and keep what was written.
function deadline(signal, ms) {
  const ctl = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
  const onAbort = () => { clearTimeout(timer); ctl.abort(); };
  if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
  return { signal: ctl.signal, timedOut: () => timedOut, done: () => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); } };
}

// The canvas preview is a sandboxed frame: localStorage throws there (killing the page's script) and IntersectionObserver does not report
// elements in the scaled frame, so pages would look blank. Preview-only shim: in-memory storage, and every observed element reports as visible. Exports always use the untouched code.
const PREVIEW_SHIM = "<script>(function(){try{localStorage.getItem('x')}catch(e){var mk=function(){var d={};return{getItem:function(k){return k in d?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};['localStorage','sessionStorage'].forEach(function(n){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(_){}})}function O(cb){this.cb=cb}O.prototype.observe=function(el){var s=this;setTimeout(function(){s.cb([{target:el,isIntersecting:true,intersectionRatio:1,boundingClientRect:el.getBoundingClientRect()}],s)},30)};O.prototype.unobserve=O.prototype.disconnect=function(){};O.prototype.takeRecords=function(){return[]};window.IntersectionObserver=O})()<\/script>";
const previewDoc = (code) => (/<head[^>]*>/i.test(code) ? String(code).replace(/<head[^>]*>/i, (m) => m + PREVIEW_SHIM) : PREVIEW_SHIM + code);
const Design = {
  pickType(chat, text) {
    const chosen = chat.designType && chat.designType !== "auto" ? chat.designType : detectDesignType(text);
    return designType(chosen) || designType("website");
  },
  // The most recent finished design on the active path before `node`, used to refine instead of starting over.
  latest(chat, node) {
    const path = chatPath(chat); const end = path.findIndex((n) => n.id === node.id);
    for (let i = (end < 0 ? path.length : end) - 1; i >= 0; i--) if (path[i].design && path[i].design.code) return path[i].design;
    return null;
  },
  async run(chat, node, userNode, signal) {
    const type = this.pickType(chat, userNode.text);
    if (type.kind === "deck") return Deck.run(chat, node, userNode, signal);
    const prev = this.latest(chat, node), refine = !!(prev && prev.type === type.id && !/\b(from scratch|start over|brand new|completely different|new (design|website|page|version))\b/i.test(userNode.text));
    const dl = deadline(signal, deepConfig().ms);
    try { await this.create(chat, node, type, userNode.text, dl.signal, refine ? prev : null); }
    catch (e) {
      if (e && e.name === "AbortError" && dl.timedOut() && !signal.aborted) {
        node.text = (node.text ? node.text + "\n\n" : "") + `I reached the Design time limit (${Math.round(deepConfig().ms / 60000)} minutes). The part written so far is kept; raise the limit in Settings → Models.`;
        if (node.design && node.design.code) this.finish(chat, node, type); return;
      }
      throw e;
    } finally { dl.done(); }
  },
  async create(chat, node, type, request, signal, prev) {
    const cfg = deepConfig(), d = (node.design = { type: type.id, kind: type.kind, label: type.label, title: (prev && prev.title) || type.label, code: "", brief: prev ? prev.brief : null, changes: prev ? (prev.changes || []).concat(request) : [request], v: prev ? prev.v + 1 : 1, live: true });
    Canvas.show({ type: "design", chatId: chat.id, nodeId: node.id }, true);
    // 1. Concept brief (new designs only)
    if (!prev && !d.brief) {
      const s = addStep(chat, node, "Designing the concept", type.label);
      d.brief = await askJson(chat, `You are an art director and UX writer designing: ${type.label}. Return only JSON matching this schema: ${BRIEF_SCHEMA}. Make bold, specific choices that fit the subject, choose a palette with accessible contrast, and write the real headline and supporting copy for every part. ${type.spec || ""}`, `Request: ${request.slice(0, 900)}\n\nRecent conversation:\n${pathMessages(chat, node.id).slice(-4, -1).map((m) => m.role + ": " + m.text.slice(0, 300)).join("\n")}`, signal, Math.min(4000, cfg.tokens), { quiet: false, live: { node, step: s } });
      d.title = String(d.brief.title || type.label).slice(0, 80);
      endStep(chat, node, s, "done", String(d.brief.artDirection || d.brief.summary || "").slice(0, 140));
    }
    // 2. Build, streamed into the live preview
    const compact = Dev.smallDevice(), rules = type.kind === "svg" ? (compact ? SVG_RULES_SMALL : SVG_RULES) : compact ? HTML_RULES_SMALL : HTML_RULES, size = type.size ? ` The canvas is ${type.size.w} by ${type.size.h} units (viewBox="0 0 ${type.size.w} ${type.size.h}").` : "", specText = compact ? String(type.spec || "").split(". ")[0] + "." : type.spec || "";
    let system, user;
    const room = Dev.limits.bodyBytes - 2800, fits = (sys, usr) => JSON.stringify(sys + usr).length <= Dev.limits.bodyBytes - 700;
    if (prev && prev.code.length * 1.15 + request.length < room) {
      system = `You are revising a design you built earlier. Apply ONLY the requested changes and keep everything else exactly as it is; the result must stay valid, complete and self-contained. ${rules}`;
      user = `CURRENT FILE:\n${prev.code}\n\nCHANGE REQUEST:\n${request}`;
    } else {
      // New design, or a file too big for this device to send back: rebuild from the brief plus every change asked for so far.
      system = `You are a senior front-end designer and engineer. Build exactly what the BRIEF describes.${size} ${specText} ${rules}`;
      const mk = (L) => `BRIEF:\n${JSON.stringify(d.brief).slice(0, L)}\n\nORIGINAL REQUEST:\n${(d.changes[0] || request).slice(0, 700)}${d.changes.length > 1 ? "\n\nAPPLY THESE CHANGES IN ORDER:\n" + d.changes.slice(1).map((c, i) => `${i + 1}. ${c.slice(0, 400)}`).join("\n") : ""}`;
      let L = 24000; user = mk(L);
      while (!fits(system, user) && L > 500) { L = Math.floor(L * 0.8); user = mk(L); }  // shrink the brief until the whole request fits this device
    }
    const s = addStep(chat, node, prev ? "Applying your changes" : "Writing the code", "0 tokens so far");
    let raw = "", lastUi = 0, lastPrev = 0;
    const onText = (t) => {
      raw += t; const now = performance.now();
      if (now - lastUi > 350) { lastUi = now; s.detail = `~${estimateTokens(raw).toLocaleString()} tokens written`; d.code = extractCode(raw, type.kind); refreshNode(chat, node); }
      if (now - lastPrev > 1400 && raw.length > 600) { lastPrev = now; d.code = extractCode(raw, type.kind); Canvas.liveDesign(node.id); }
    };
    const req = fitToLimit(chat.provider, { ...baseRequest(chat, "", { messages: [{ role: "user", text: user }] }), system, search: false });
    const res = await streamChat(chat.provider, req, { onText, onThink: (t) => { node.think = (node.think || "") + t; node.thinkStart = node.thinkStart || Date.now(); } }, signal);
    node.usage = res.usage; raw = res.text; d.code = extractCode(raw, type.kind);
    // 3. A reply that hit the token limit stops mid-file: ask for the rest, up to twice.
    for (let k = 0; k < 2 && d.code && !isComplete(d.code, type.kind); k++) {
      s.detail = `Reply was cut off, continuing (${k + 1} of 2)…`; refreshNode(chat, node);
      const tail = d.code.slice(-2400);
      const more = await completeText(chat.provider, { ...baseRequest(chat, "", { messages: [{ role: "user", text: `The file so far ends with:\n\n${tail}\n\nContinue.` }] }), system: `You are continuing a ${type.kind === "svg" ? "SVG" : "HTML"} file that was cut off. Output ONLY the remaining text, starting exactly where it stopped, with no repetition and no code fences. Finish every open tag so the file is complete.`, search: false }, signal);
      d.code = mergeContinuation(d.code, more);
    }
    if (type.kind === "svg") d.code = sanitizeSvg(d.code);
    if (!d.code || d.code.length < 80) throw new ApiError("design_empty", "The model did not return a usable file.", "Retry, or try a more capable model.");
    endStep(chat, node, s, "done", `${fmtBytes(d.code.length)} · ${estimateTokens(d.code).toLocaleString()} tokens`);
    this.finish(chat, node, type);
  },
  finish(chat, node, type) {
    const d = node.design; d.live = false; d.title = titleFromCode(d.code, d.title); d.size = d.code.length; d.issues = lintDesign(d.code, type.kind);
    Canvas.liveDesign(node.id, true);
    const issueNote = d.issues.length ? `\n\nThings to check:\n${d.issues.map((x) => "- " + x).join("\n")}` : "\n\nChecks passed: it is self-contained, responsive and has no external dependencies.";
    node.text = (node.text ? node.text + "\n\n" : "") + `I built **${d.title}** (${type.label.toLowerCase()}, ${fmtBytes(d.size)}). Open it to preview on phone, tablet and desktop, view or copy the code, and export it. Ask for any change and I will update it in place.${issueNote}`;
    node.design.file = designFilename(d);
    node.design.stored = false;
    const spec = { type: type.kind === "svg" ? "svg" : "html", filename: d.file, title: d.title, content: d.code };
    return buildAndStore(spec, { download: false }).then((rec) => { d.stored = rec.stored; node.artifacts = (node.artifacts || []).concat(rec); refreshNode(chat, node); Store.saveChat(chat); }).catch(() => {});
  },
};
function designFilename(d) { return safeFilename((d.title || d.label || "design").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-v" + d.v, d.kind === "svg" ? "svg" : "html"); }
// All designs on the active path, oldest first: used for the version picker in the canvas.
function designHistory(chat) { return chatPath(chat).filter((n) => n.design && n.design.code).map((n) => ({ nodeId: n.id, v: n.design.v, title: n.design.title })); }
