// Agent, Presentation and Research modes. All orchestration runs here in the browser with hard step/time caps.
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
const Agent = {
  MAX_STEPS: 8, MAX_MS: 4 * 60 * 1000,
  system() {
    return `You are ChatESP's agent. Work step by step with tools, then answer. Reply with ONE JSON object per turn and nothing else:
{"thought":"one short sentence","action":"search|read|calculate|create_file|make_presentation|final","args":{...}}
Tools:
- search {"query":"..."}: web search; returns titles, urls, snippets.
- read {"url":"..."}: fetch a page's text.
- calculate {"expression":"..."}: exact arithmetic.
- create_file {"type":"text|code|html|docx|xlsx","filename":"safe-name.ext","title":"...","content":"..." (text/code/html),"sections":[{"heading":"...","text":"...","bullets":["..."]}] (docx),"sheets":[{"name":"...","columns":["..."],"rows":[["..."]]}] (xlsx)}. Keep files modest (under 150 KB).
- make_presentation {"brief":"what the deck covers","slides":8}: designs and exports a PPTX deck.
- final {"answer":"Markdown reply for the user; mention any files you created"}.
Use at most ${this.MAX_STEPS} steps. Only search when the task needs current or external facts. Never run commands or code; you can only use the tools above.`;
  },
  async run(chat, node, userNode, signal) {
    const started = Date.now(), work = pathMessages(chat, node.id);
    node.artifacts = node.artifacts || [];
    for (let n = 1; n <= this.MAX_STEPS; n++) {
      if (Date.now() - started > this.MAX_MS) { node.text = node.text || "I stopped because the agent time limit was reached."; return; }
      const think = addStep(chat, node, `Step ${n}: thinking`);
      const req = fitToLimit(chat.provider, baseRequest(chat, this.system(), { messages: work.slice(), maxTokens: 6000, effort: "low" }));
      const raw = await completeText(chat.provider, req, signal);
      let act; try { act = extractJson(raw); } catch (_) { endStep(chat, node, think, "done", "Answered directly"); node.text = raw; return; }
      const name = String(act.action || "final"), args = act.args || act;  // some models put the arguments at the top level
      think.label = `Step ${n}: ${act.thought ? String(act.thought).slice(0, 110) : name}`; endStep(chat, node, think, "done");
      if (name === "final") { node.text = String(args.answer || args.text || act.answer || raw); return; }
      const s = addStep(chat, node, { search: "Searching the web", read: "Reading a page", calculate: "Calculating", create_file: "Creating a file", make_presentation: "Designing a presentation" }[name] || name, args.query || args.url || args.expression || args.filename || args.brief || "");
      let result = "";
      try {
        if (name === "search") { const r = await searchWeb(String(args.query || ""), 5, signal); r.forEach((x) => { if (!node.sources.some((y) => y.url === x.url)) node.sources.push({ title: x.title, url: x.url }); }); result = r.map((x, i) => `${i + 1}. ${x.title}\n${x.url}\n${x.snippet}`).join("\n\n") || "No results."; }
        else if (name === "read") result = await fetchPage(String(args.url || ""), signal, Math.min(6000, Math.max(1500, Dev.limits.bodyBytes / 6)));
        else if (name === "calculate") result = String(safeCalc(args.expression));
        else if (name === "create_file" || name === "make_presentation") {
          let spec = args;
          if (name === "make_presentation") { const deck = await Deck.generate(chat, String(args.brief || chat.title), clamp(+args.slides || 8, 3, 14), signal); node.deck = deck; spec = { type: "pptx", filename: safeFilename(deck.title, "pptx"), title: deck.title, deck }; }
          if (Store.settings.agentApprove && !(await confirmDialog("Create file?", `The agent wants to create ${validateSpec(spec).filename}.`, "Create"))) result = "The user declined to create this file.";
          else { const rec = await buildAndStore(spec); node.artifacts.push(rec); result = `Created ${rec.name} (${fmtBytes(rec.size)})${rec.stored ? " and stored it on the device" : "; it could not be stored on the device: " + rec.storeError}.`; }
        } else result = "Unknown tool: " + name;
        endStep(chat, node, s, "done");
      } catch (e) { if (e.name === "AbortError") throw e; result = "Tool error: " + e.message; endStep(chat, node, s, "err", e.message); }
      work.push({ role: "assistant", text: JSON.stringify(act).slice(0, 1500) }, { role: "user", text: "Tool result:\n" + result.slice(0, 5000) + "\n\nContinue. Reply with the next JSON action." });
    }
    node.text = node.text || (node.artifacts.length ? `Done. I created ${node.artifacts.map((a) => a.name).join(", ")}.` : "I reached the step limit before finishing. Try a narrower request.");
  },
};

// ---- Presentations ---------------------------------------------------------------------------
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
  async generate(chat, brief, count, signal) {
    const d = await askJson(chat, `You design presentations. Return only JSON matching this schema: ${this.schema}. Create exactly ${count} slides: start with a title slide, end with a closing slide, vary layouts (use a chart only when you have real numbers), keep text brief and concrete. Choose the theme that fits the topic.`, `Presentation brief: ${brief}\n\nConversation context:\n${pathMessages(chat).slice(-4).map((m) => m.role + ": " + m.text.slice(0, 400)).join("\n")}`, signal, 5000);
    return this.normalize(d, chat.title);
  },
  async run(chat, node, userNode, signal) {
    const count = clamp(+(userNode.text.match(/(\d{1,2})\s*(?:-|\s)?slides?/i) || [])[1] || chat.slideCount || 8, 3, 16);
    const s = addStep(chat, node, "Outlining the deck", `${count} slides`);
    const deck = await this.generate(chat, userNode.text, count, signal);
    endStep(chat, node, s, "done", `${deck.slides.length} slides, ${THEMES[deck.theme].name} theme`);
    node.deck = deck; node.text = `I made a ${deck.slides.length}-slide deck called **${deck.title}**. Open it to edit slides, change the theme, add images, and export to PowerPoint, HTML or PDF.`;
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
const Research = {
  async run(chat, node, userNode, signal) {
    const deep = chat.researchDepth === "deep", question = userNode.text;
    const history = pathMessages(chat, node.id).slice(-4, -1).map((m) => `${m.role}: ${m.text.slice(0, 300)}`).join("\n");
    let s = addStep(chat, node, "Planning the research");
    const plan = await askJson(chat, `You plan web research. Return only JSON: {"title":"short report title","queries":["up to ${deep ? 5 : 3} distinct web search queries"]}.`, `Question: ${question}\n${history ? "Context:\n" + history : ""}`, signal, 400);
    let queries = (plan.queries || []).map(String).filter(Boolean).slice(0, deep ? 5 : 3); if (!queries.length) queries = [question.slice(0, 120)];
    endStep(chat, node, s, "done", queries.join(" | "));
    const pool = new Map(); const read = []; const maxRead = deep ? 8 : 4;
    const rounds = deep ? 2 : 1;
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
        const gap = await askJson(chat, 'Given the question and source titles, return only JSON {"queries":["up to 3 new search queries that would fill gaps"]} or {"queries":[]} if coverage is already good.', `Question: ${question}\nSources:\n${read.map((x) => x.title).join("\n")}`, signal, 300).catch(() => ({ queries: [] }));
        queries = (gap.queries || []).map(String).slice(0, 3); endStep(chat, node, s, "done", queries.length ? queries.join(" | ") : "Coverage is good");
        if (!queries.length) break;
      }
    }
    if (!read.length) throw new ApiError("no_sources", "No usable sources were found.", "Check the browser has internet access, or choose another search provider in Settings.");
    s = addStep(chat, node, "Writing the report", `${read.length} sources`);
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
