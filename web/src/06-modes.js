// Agent, Research and slide-deck generation (Design mode routes decks here). All orchestration runs here in the browser with hard step/time caps.
function safeCalc(expr) {
  const src = String(expr).replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**");
  if (!/^[0-9a-z.+\-*/%(),**]+$/i.test(src) || src.length > 200) throw new Error("Unsupported expression");
  let p = 0;
  const F = { sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow };
  const C = { pi: Math.PI, e: Math.E };
  const peek = () => src[p];
  function num() {
    if (peek() === "(") { p++; const v = add(); if (src[p++] !== ")") throw new Error("Missing )"); return v; }
    if (peek() === "-") { p++; return -pow(); }
    if (peek() === "+") { p++; return pow(); }
    const m = src.slice(p).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?|^[a-z]+/i);
    if (!m) throw new Error("Unexpected token");
    p += m[0].length;
    if (/^[a-z]/i.test(m[0])) {
      const name = m[0].toLowerCase();
      if (peek() === "(") { p++; const args = [add()]; while (peek() === ",") { p++; args.push(add()); } if (src[p++] !== ")") throw new Error("Missing )"); if (!F[name]) throw new Error("Unknown function " + name); return F[name](...args); }
      if (name in C) return C[name]; throw new Error("Unknown name " + name);
    }
    return parseFloat(m[0]);
  }
  function pow() { let b = num(); if (src.slice(p, p + 2) === "**") { p += 2; return Math.pow(b, pow()); } return b; }
  function mul() { let v = pow(); for (;;) { const c = peek(); if (c === "*" && src[p + 1] !== "*") { p++; v *= pow(); } else if (c === "/") { p++; v /= pow(); } else if (c === "%") { p++; v %= pow(); } else return v; } }
  function add() { let v = mul(); for (;;) { const c = peek(); if (c === "+") { p++; v += mul(); } else if (c === "-") { p++; v -= mul(); } else return v; } }
  const r = add(); if (p !== src.length) throw new Error("Unexpected input"); return r;
}

// ---- Agent -----------------------------------------------------------------------------------
// Runs a model call while showing live progress on a step ("~2,300 tokens written") and capturing any reasoning summary.
async function completeLive(chat, node, req, signal, step) {
  let n = 0, last = 0, ticker = null;
  // A buffered reply arrives in one piece, so show a live timer instead of a silent wait.
  if (step && req.buffered) {
    const t0 = Date.now(), tick = () => { const sec = Math.round((Date.now() - t0) / 1000); step.detail = `Waiting for the full reply · ${sec >= 60 ? Math.floor(sec / 60) + "m " + (sec % 60) + "s" : sec + "s"}`; refreshNode(chat, node); };
    tick(); ticker = setInterval(tick, 1000);
  }
  try {
    const res = await streamChat(chat.provider, req, {
      onText: (t) => { n += t.length; const now = performance.now(); if (step && now - last > 500) { last = now; step.detail = `~${Math.round(n / 4).toLocaleString()} tokens written`; refreshNode(chat, node); } },
      onThink: (t) => { node.think = (node.think || "") + t; node.thinkStart = node.thinkStart || Date.now(); },
    }, signal);
    return res.text;
  } finally { if (ticker) clearInterval(ticker); }
}
const Agent = {
  MAX_STEPS: 16,
  system(context) {
    return `You are ChatESP's agent. Work step by step with tools, check your own work, then answer. Reply with ONE JSON object per turn and nothing else:
{"thought":"your reasoning for this step, up to two sentences","action":"plan|search|read|calculate|create_file|make_design|make_presentation|final","args":{...}}
Tools:
- plan {"steps":["..."]}: write your plan before starting a multi-part task. Do this first for anything non-trivial.
- search {"query":"..."}: web search; returns titles, urls, snippets.
- read {"url":"..."}: fetch a page's text.
- calculate {"expression":"..."}: exact arithmetic.
- create_file {"type":"text|code|html|svg|docx|xlsx","filename":"safe-name.ext","title":"...","content":"..." (text/code/html/svg),"markdown":"full document in Markdown with headings, lists and tables (docx; preferred over sections)","sections":[{"heading":"...","text":"...","bullets":["..."]}] (docx alternative),"sheets":[{"name":"...","columns":["..."],"rows":[["..."]]}] (xlsx; use real numbers, and formulas like =SUM(B2:B9) where useful)}. Files must stay under 700 KB.
- make_design {"type":"website|landing|prototype|component|dashboard|email|poster|logo|infographic|wireframe|animation|onepager|system|tool","request":"detailed description of what to build"}: designs and builds a complete, polished, self-contained page or graphic with a live preview. Prefer this over create_file for any website or visual work.
- make_presentation {"brief":"what the deck covers","slides":8}: designs and exports a PPTX deck.
- final {"answer":"Markdown reply for the user; mention any files you created"}.
You may use up to ${this.MAX_STEPS} steps; use them to verify facts, fix mistakes and reach a high-quality result rather than rushing. Only search when the task needs current or external facts. Never run commands or code; you can only use the tools above.${context ? "\n\nConversation so far:\n" + context : ""}`;
  },
  async run(chat, node, userNode, signal) {
    const cfg = deepConfig(), dl = deadline(signal, cfg.ms), sig = dl.signal, started = Date.now();
    const hist = pathMessages(chat, node.id), task = hist.pop() || { role: "user", text: userNode.text, images: [] };
    const context = hist.slice(-4).map((m) => `${m.role}: ${m.text.slice(0, 350)}`).join("\n").slice(0, 1400);
    const work = [task];  // the task stays pinned as the first message even when a small device has to drop older steps
    node.artifacts = node.artifacts || [];
    try {
      for (let n = 1; n <= this.MAX_STEPS; n++) {
        const think = addStep(chat, node, `Step ${n}: thinking`);
        const stepEffort = chat.effortTouched || n === 1 ? undefined : (cfg.effort === "high" ? "medium" : undefined);  // deep thinking for the plan; tool-choice steps need less
        const req = fitToLimit(chat.provider, baseRequest(chat, this.system(context), { messages: work.slice(), maxTokens: cfg.tokens, smallRecords: Dev.smallDevice(), ...(stepEffort ? { effort: stepEffort } : {}) }), { pinFirst: true });
        const raw = await completeLive(chat, node, req, sig, think);
        let act; try { act = extractJson(raw); } catch (_) { endStep(chat, node, think, "done", "Answered directly"); node.text = raw; return; }
        const name = String(act.action || "final"), args = act.args || act;  // some models put the arguments at the top level
        think.label = `Step ${n}: ${act.thought ? String(act.thought).slice(0, 130) : name}`; endStep(chat, node, think, "done", "");
        if (name === "final") { node.text = String(args.answer || args.text || act.answer || raw); return; }
        const label = { plan: "Planning", search: "Searching the web", read: "Reading a page", calculate: "Calculating", create_file: "Creating a file", make_design: "Designing", make_presentation: "Designing a presentation" }[name] || name;
        const s = addStep(chat, node, label, (name === "plan" ? (args.steps || []).join(" → ") : args.query || args.url || args.expression || args.filename || args.request || args.brief || "").toString().slice(0, 160));
        let result = "";
        try {
          if (name === "plan") result = "Plan recorded. Carry it out step by step.";
          else if (name === "search") { const r = await searchWeb(String(args.query || ""), 5, sig); r.forEach((x) => { if (!node.sources.some((y) => y.url === x.url)) node.sources.push({ title: x.title, url: x.url }); }); result = r.map((x, i) => `${i + 1}. ${x.title}\n${x.url}\n${x.snippet}`).join("\n\n") || "No results."; }
          else if (name === "read") result = await fetchPage(String(args.url || ""), sig, Math.min(8000, Math.max(1500, Dev.limits.bodyBytes / 5)));
          else if (name === "calculate") result = String(safeCalc(args.expression));
          else if (name === "make_design") {
            const type = designType(String(args.type || "").toLowerCase()); if (!type || type.kind === "deck" || type.id === "auto") throw new Error("Unknown design type. Use one of: website, landing, prototype, component, dashboard, email, poster, logo, infographic, wireframe, animation, onepager, system, tool.");
            await Design.create(chat, node, type, String(args.request || args.brief || chat.title), sig, null);
            const d = node.design; result = `Built "${d.title}" (${type.label}, ${fmtBytes(d.size || d.code.length)}) and stored it as ${d.file}. ${d.issues && d.issues.length ? "Checks flagged: " + d.issues.join("; ") + "." : "All checks passed."}`;
          } else if (name === "create_file" || name === "make_presentation") {
            let spec = args;
            if (name === "make_presentation") { const deck = await Deck.generate(chat, String(args.brief || chat.title), clamp(+args.slides || 8, 3, 14), sig); node.deck = deck; spec = { type: "pptx", filename: safeFilename(deck.title, "pptx"), title: deck.title, deck }; }
            if (Store.settings.agentApprove && !(await confirmDialog("Create file?", `The agent wants to create ${validateSpec(spec).filename}.`, "Create"))) result = "The user declined to create this file.";
            else { const rec = await buildAndStore(spec); node.artifacts.push(rec); result = `Created ${rec.name} (${fmtBytes(rec.size)})${rec.stored ? " and stored it on the device" : "; it could not be stored on the device: " + rec.storeError}.`; }
          } else result = "Unknown tool: " + name;
          endStep(chat, node, s, "done");
        } catch (e) { if (e.name === "AbortError") throw e; result = "Tool error: " + e.message; endStep(chat, node, s, "err", e.message); }
        work.push({ role: "assistant", text: JSON.stringify(act).slice(0, 1800) }, { role: "user", text: "Tool result:\n" + result.slice(0, Math.min(9000, Math.max(1200, Dev.limits.bodyBytes / 2))) + "\n\nContinue. Reply with the next JSON action." });
      }
      // Out of steps: ask once for an honest wrap-up instead of ending with nothing.
      node.text = node.text || await completeText(chat.provider, { model: chat.model, system: "Summarise for the user what was done and what is left, in Markdown. Be honest about anything unfinished.", messages: [{ role: "user", text: `Task: ${task.text.slice(0, 600)}\n\nWork log:\n${work.slice(1).filter((m) => m.role === "assistant").map((m) => m.text.slice(0, 200)).join("\n").slice(-1800)}` }], maxTokens: 700, temperature: 0.3, quiet: true }, signal).catch(() => "");
      if (!node.text) node.text = node.artifacts.length ? `Done. I created ${node.artifacts.map((a) => a.name).join(", ")}.` : "I reached the step limit before finishing. Try a narrower request.";
    } catch (e) {
      if (e && e.name === "AbortError" && dl.timedOut() && !signal.aborted) { node.text = (node.text ? node.text + "\n\n" : "") + `I reached the Agent time limit (${Math.round(cfg.ms / 60000)} minutes) after ${Math.round((Date.now() - started) / 60000)} minutes. Anything created so far is kept; raise the limit in Settings → Models.`; return; }
      throw e;
    } finally { dl.done(); }
  },
};

// ---- Slide decks ---------------------------------------------------------------------------
const Deck = {
  schema: `{"title":"...","subtitle":"...","theme":"paper|midnight|sunrise|forest|mono|aurora","slides":[{"layout":"title|section|bullets|two-column|image-text|chart|quote|closing","title":"...","subtitle":"(title/section/closing)","bullets":["max 5, under 14 words each"],"left":["two-column"],"right":["two-column"],"quote":"(quote)","attribution":"(quote)","chart":{"type":"bar|line|pie","title":"...","labels":["..."],"values":[1,2]},"imagePrompt":"(image-text) what the picture should show","notes":"speaker notes, 2-3 sentences"}]}`,
  normalize(d, fallbackTitle) {
    const slides = (Array.isArray(d.slides) ? d.slides : []).slice(0, 20).map((s) => ({
      layout: LAYOUTS.includes(s.layout) ? s.layout : "bullets", title: String(s.title || "").slice(0, 120), subtitle: s.subtitle ? String(s.subtitle).slice(0, 160) : "", bullets: (s.bullets || []).slice(0, 6).map(String), left: (s.left || []).slice(0, 6).map(String), right: (s.right || []).slice(0, 6).map(String),
      quote: s.quote ? String(s.quote).slice(0, 300) : "", attribution: s.attribution ? String(s.attribution).slice(0, 80) : "", chart: s.chart && Array.isArray(s.chart.values) ? { type: ["bar", "line", "pie"].includes(s.chart.type) ? s.chart.type : "bar", title: String(s.chart.title || ""), labels: (s.chart.labels || []).map(String), values: s.chart.values.map(Number) } : null,
      imagePrompt: s.imagePrompt ? String(s.imagePrompt).slice(0, 200) : "", image: "", notes: s.notes ? String(s.notes).slice(0, 600) : "",
    }));
    if (!slides.length) throw new ApiError("deck_empty", "The model returned no slides.", "Retry with a clearer topic.");
    return { title: String(d.title || fallbackTitle || "Presentation").slice(0, 100), subtitle: d.subtitle || "", theme: THEMES[d.theme] ? d.theme : "paper", slides };
  },
  wantsResearch: (t) => /\b(research|sources?|cite|citations?|benchmarks?|verify|fact[- ]?check|up[- ]to[- ]date|latest|current|statistics|stats|data[- ]driven|evidence|back(?:ed)? up)\b/i.test(t),
  sourceContext(sources, reserve) {
    const per = Math.max(350, Math.floor(Math.max(1500, Dev.limits.bodyBytes - reserve) / sources.length));
    return sources.map((x, i) => `[${i + 1}] ${x.title} (${hostOf(x.url)})\n${x.digest !== undefined ? x.digest || "(no usable figures on this page)" : String(x.text || x.snippet || "").slice(0, per)}`).join("\n\n");
  },
  async generate(chat, brief, count, signal, sources, live) {
    const grounded = sources && sources.length ? ` Ground every claim and every number strictly in the numbered SOURCES. Never invent or estimate benchmark scores: if the sources give no figure, leave it out or write "not reported". Put the supporting source numbers like [1][3] in each slide's speaker notes. Charts may only use numbers that appear in the sources. Do not add a sources slide; one is added automatically.` : "";
    const ctx = grounded ? "\n\nSOURCES (numbered):\n" + this.sourceContext(sources, 4300) : "";
    const system = `You design presentations. Return only JSON matching this schema: ${this.schema}. Create exactly ${count} slides: start with a title slide, end with a closing slide, vary layouts (use a chart only when you have real numbers), keep text brief and concrete. Choose the theme that fits the topic.${grounded}`;
    const user = `Presentation brief: ${brief.slice(0, 700)}${grounded ? "" : "\n\nConversation context:\n" + pathMessages(chat).slice(-4).map((m) => m.role + ": " + m.text.slice(0, 400)).join("\n")}${ctx}`;
    const budget = Math.min(deepConfig().tokens, 12000);
    let deck = this.normalize(await askJson(chat, system, user, signal, budget, { quiet: false, live }), chat.title);
    if (deck.slides.length !== count) {  // models often miscount: ask once more with the exact number
      const again = await askJson(chat, system, user + `\n\nIMPORTANT: your previous answer had ${deck.slides.length} slides. Return exactly ${count} slides.`, signal, budget, { quiet: false }).catch(() => null);
      if (again) { const d2 = this.normalize(again, chat.title); if (Math.abs(d2.slides.length - count) < Math.abs(deck.slides.length - count)) deck = d2; }
    }
    return deck;
  },
  // Second pass: compare the finished deck with the sources and fix or remove unsupported claims.
  async verify(chat, node, deck, sources, signal) {
    const s = addStep(chat, node, "Checking facts against the sources");
    const payload = JSON.stringify({ title: deck.title, slides: deck.slides.map(({ image, ...r }) => r) }), ctx = this.sourceContext(sources, payload.length + 2600);
    if (JSON.stringify(payload + ctx).length + 1500 > Dev.limits.bodyBytes) { endStep(chat, node, s, "err", "The deck is too large to re-check on this device"); return { skipped: true }; }
    try {
      const d = await askJson(chat, 'You are a strict fact-checker. Compare the deck with the numbered SOURCES. Return only JSON: {"issues":[{"slide":1,"problem":"..."}],"deck":<the corrected deck, same schema and slide count, or null if nothing needs to change>}. Remove or fix any claim or number that the sources do not support.', `DECK:\n${payload}\n\nSOURCES:\n${ctx}`, signal, 5000, { quiet: false });
      const issues = Array.isArray(d.issues) ? d.issues.slice(0, 12) : [];
      let corrected = false;
      if (d.deck && Array.isArray(d.deck.slides) && d.deck.slides.length === deck.slides.length) { const fixed = this.normalize({ ...d.deck, theme: d.deck.theme || deck.theme }, deck.title); fixed.slides.forEach((sl, i) => { sl.image = deck.slides[i].image; }); Object.assign(deck, { slides: fixed.slides, title: fixed.title || deck.title }); corrected = true; }
      // Anything the checker flagged but could not fix is written into that slide's speaker notes, so it is not lost.
      if (!corrected) issues.forEach((it) => { const sl = deck.slides[(+it.slide || 0) - 1]; if (sl && it.problem) sl.notes = (sl.notes ? sl.notes + "\n" : "") + "CHECK BEFORE PRESENTING: " + String(it.problem).slice(0, 200); });
      endStep(chat, node, s, "done", !issues.length ? "No unsupported claims found" : corrected ? `${issues.length} issue${issues.length === 1 ? "" : "s"} found and corrected` : `${issues.length} possible issue${issues.length === 1 ? "" : "s"} flagged in speaker notes`);
      return { issues, corrected };
    } catch (e) { if (e.name === "AbortError") throw e; endStep(chat, node, s, "err", "Could not complete the check: " + String(e.message || "").slice(0, 90)); return { skipped: true }; }
  },
  async run(chat, node, userNode, signal) {
    const asked = +(userNode.text.match(/(\d{1,2})\s*(?:-|\s)?slides?/i) || [])[1] || chat.slideCount || 8, count = clamp(asked, 3, 16);
    let sources = null;
    if (this.wantsResearch(userNode.text)) {
      const focus = /benchmark|performance|speed|score/i.test(userNode.text) ? "Aim every query at pages that publish measured benchmark numbers (for example Geekbench, Cinebench, Notebookcheck, Phoronix, AnandTech, Tom's Hardware), not general explainers." : "";
      sources = (await Research.gather(chat, node, userNode.text, signal, { focus })).read;
      if (sources.reduce((a, x) => a + String(x.text || "").length, 0) > Dev.limits.bodyBytes - 4300) await Research.digest(chat, node, sources, userNode.text, signal);
      node.sources = sources.map((x) => ({ title: x.title, url: x.url }));
    }
    const s = addStep(chat, node, "Outlining the deck", `${count} slides${sources ? ", grounded in " + sources.length + " sources" : ""}`);
    const deck = await this.generate(chat, userNode.text, sources ? Math.max(3, count - 1) : count, signal, sources, { node, step: s });
    endStep(chat, node, s, "done", `${deck.slides.length} slides, ${THEMES[deck.theme].name} theme`);
    let note = "";
    if (sources) {
      const v = await this.verify(chat, node, deck, sources, signal);
      deck.slides.push({ layout: "bullets", title: "Sources", subtitle: "", bullets: sources.slice(0, 6).map((x, i) => `[${i + 1}] ${x.title.slice(0, 72)} (${hostOf(x.url)})`), left: [], right: [], quote: "", attribution: "", chart: null, imagePrompt: "", image: "", notes: sources.map((x, i) => `[${i + 1}] ${x.url}`).join("\n") });
      deck.sources = sources.map((x) => ({ title: x.title, url: x.url }));
      note = v.skipped ? `\n\nEvery figure was drawn from the ${sources.length} sources on the last slide, but I couldn't run a second verification pass on this device. Please check the numbers before presenting.` : `\n\nI checked the deck against ${sources.length} sources${!v.issues.length ? " and found no unsupported claims" : v.corrected ? ` and corrected ${v.issues.length} unsupported claim${v.issues.length === 1 ? "" : "s"}` : `, and flagged ${v.issues.length} possible unsupported claim${v.issues.length === 1 ? "" : "s"} in the speaker notes ("CHECK BEFORE PRESENTING")`}. Benchmark figures are only included where those sources reported them, so confirm key numbers before presenting.`;
    }
    const noFigures = sources && sources.every((x) => x.digest === "");
    if (deck.slides.length !== asked) note += `\n\nYou asked for ${asked} slides and the deck has ${deck.slides.length}; add or remove slides in the editor.`;
    if (noFigures) note += `\n\nNone of the pages I could read contained concrete benchmark figures, so the deck says so instead of inventing any. Try naming specific benchmarks (for example Geekbench 6 or Cinebench 2024) or chips.`;
    node.deck = deck; node.text = `I made a ${deck.slides.length}-slide deck called **${deck.title}**. Open it to edit slides, change the theme, add images, and export to PowerPoint, HTML or PDF.${note}`;
    Canvas.show({ type: "deck", chatId: chat.id, nodeId: node.id });
  },
  async regenSlide(chat, node, i, instruction, signal) {
    const deck = node.deck, cur = deck.slides[i];
    const d = await askJson(chat, `You rewrite one slide of a presentation. Return only one JSON slide object with this shape (same fields as the deck schema's slide): ${this.schema}. Keep layout "${cur.layout}" unless the instruction says otherwise.`, `Deck: ${deck.title}\nSlide ${i + 1} of ${deck.slides.length}: ${JSON.stringify({ ...cur, image: "" })}\nInstruction: ${instruction || "Improve clarity and make it more concrete."}`, signal, 1500);
    const slide = this.normalize({ slides: [d.slides ? d.slides[0] : d] }).slides[0]; slide.image = cur.image;
    deck.slides[i] = slide; Store.saveChat(chat);
  },
};

// ---- Research --------------------------------------------------------------------------------
const hostOf = (u) => safe(() => new URL(u).hostname.replace(/^www\./, ""), u);
const Research = {
  // Plans queries, searches, and reads pages. Shared by Research mode and research-grounded presentations.
  async gather(chat, node, question, signal, { deep = false, focus = "" } = {}) {
    const history = pathMessages(chat, node.id).slice(-4, -1).map((m) => `${m.role}: ${m.text.slice(0, 300)}`).join("\n");
    let s = addStep(chat, node, "Planning the research");
    const plan = await askJson(chat, `You plan web research. Return only JSON: {"title":"short report title","queries":["up to ${deep ? 5 : 3} distinct web search queries"]}.${focus ? " " + focus : ""}`, `Question: ${question.slice(0, 600)}\n${history ? "Context:\n" + history : ""}`, signal, 400);
    let queries = (plan.queries || []).map(String).filter(Boolean).slice(0, deep ? 5 : 3); if (!queries.length) queries = [question.slice(0, 120)];
    endStep(chat, node, s, "done", queries.join(" | "));
    const pool = new Map(), read = [], maxRead = deep ? 8 : 4, rounds = deep ? 2 : 1;
    for (let r = 0; r < rounds; r++) {
      for (const q of queries) {
        s = addStep(chat, node, "Searching", q);
        try { (await searchWeb(q, 5, signal)).forEach((x) => { if (!pool.has(x.url)) pool.set(x.url, x); }); endStep(chat, node, s, "done", `${pool.size} candidate sources`); }
        catch (e) { if (e.name === "AbortError") throw e; endStep(chat, node, s, "err", e.message); }
      }
      const cands = [...pool.values()].filter((x) => !read.some((y) => y.url === x.url)).slice(0, maxRead - read.length);
      for (const c of cands) {
        s = addStep(chat, node, "Reading", c.title);
        try { const text = await fetchPage(c.url, signal, 5000); read.push({ ...c, text: text.length > 200 ? text : c.snippet + "\n" + text }); node.sources = read.map((x) => ({ title: x.title, url: x.url })); endStep(chat, node, s, "done"); }
        catch (e) { if (e.name === "AbortError") throw e; if (c.snippet) read.push({ ...c, text: c.snippet }); node.sources = read.map((x) => ({ title: x.title, url: x.url })); endStep(chat, node, s, "err", "Using the search snippet instead"); }
      }
      if (r + 1 < rounds && read.length) {
        s = addStep(chat, node, "Checking for gaps");
        const gap = await askJson(chat, 'Given the question and source titles, return only JSON {"queries":["up to 3 new search queries that would fill gaps"]} or {"queries":[]} if coverage is already good.', `Question: ${question.slice(0, 400)}\nSources:\n${read.map((x) => x.title).join("\n")}`, signal, 300).catch(() => ({ queries: [] }));
        queries = (gap.queries || []).map(String).slice(0, 3); endStep(chat, node, s, "done", queries.length ? queries.join(" | ") : "Coverage is good");
        if (!queries.length) break;
      }
    }
    if (!read.length) throw new ApiError("no_sources", "No usable sources were found.", "Check the browser has internet access, or choose another search provider in Settings.");
    return { plan, read };
  },
  // Boils each long page down to its concrete facts so a small device can still use real numbers (map, then reduce).
  async digest(chat, node, read, topic, signal) {
    const s = addStep(chat, node, "Extracting key figures", `${read.length} sources`); let withFacts = 0;
    for (const x of read) {
      try {
        const text = await completeText(chat.provider, { model: chat.model, system: `Extract only concrete, checkable facts from this web page that help with: ${topic.slice(0, 200)}. Prefer measured benchmark results (test name, score, units, chip or device names), specs, dates and prices, exactly as written. At most 700 characters, plain text, no commentary. If the page has none, reply exactly NONE.`, messages: [{ role: "user", text: `PAGE (${hostOf(x.url)}):\n${String(x.text || "").slice(0, Math.max(1500, Dev.limits.bodyBytes - 1800))}` }], maxTokens: 400, temperature: 0.1, quiet: true }, signal);
        x.digest = /^\s*NONE\b/i.test(text) ? "" : text.trim().slice(0, 800); if (x.digest) withFacts++;
      } catch (e) { if (e.name === "AbortError") throw e; x.digest = ""; }
    }
    endStep(chat, node, s, "done", `${withFacts} of ${read.length} sources had usable figures`);
    return withFacts;
  },
  async run(chat, node, userNode, signal) {
    const deep = chat.researchDepth === "deep", question = userNode.text;
    const { plan, read } = await this.gather(chat, node, question, signal, { deep });
    const s = addStep(chat, node, "Writing the report", `${read.length} sources`);
    const budget = Math.max(1800, Dev.limits.bodyBytes - 5000), per = Math.floor(budget / (read.length + 1));
    const ctx = read.map((x, i) => `[${i + 1}] ${x.title}\n${x.url}\n${x.text.slice(0, per)}`).join("\n\n");
    const req = fitToLimit(chat.provider, baseRequest(chat, `You write research reports. Use ONLY the numbered sources below. Cite claims inline as [n]. Structure: a one-paragraph summary, then ## sections with findings, then ## Limitations noting gaps or disagreement between sources. Do not invent sources or facts. Do not include a reference list; it is added automatically.\n\nSOURCES:\n${ctx}`, { messages: [{ role: "user", text: question }], maxTokens: Math.max(Store.settings.maxTokens, 3000) }));
    let last = 0; node.text = "";
    const res = await streamChat(chat.provider, req, { onText: (d) => { node.text += d; const now = performance.now(); if (now - last > 80) { last = now; refreshNode(chat, node); } }, onThink: (d) => { node.think = (node.think || "") + d; } }, signal);
    node.text = res.text; node.usage = res.usage;
    node.sources = read.map((x) => ({ title: x.title, url: x.url, snippet: x.snippet }));
    node.report = { title: String(plan.title || question).slice(0, 100), question, depth: deep ? "deep" : "standard" };
    endStep(chat, node, s, "done");
  },
};
function mdToSections(md, sources = []) {
  const parts = String(md).split(/^##\s+/m); const out = [];
  if (parts[0].trim()) out.push({ heading: "Summary", text: parts[0].trim().replace(/\*\*/g, "") });
  parts.slice(1).forEach((p) => { const nl = p.indexOf("\n"); out.push({ heading: p.slice(0, nl < 0 ? undefined : nl).trim(), text: (nl < 0 ? "" : p.slice(nl + 1)).replace(/\*\*/g, "").replace(/^[-*]\s+/gm, "- ").trim() }); });
  if (sources.length) out.push({ heading: "Sources", text: "", bullets: sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`) });
  return out;
}
