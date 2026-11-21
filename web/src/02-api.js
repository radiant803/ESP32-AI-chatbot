// Device API + provider adapters. The ESP32/ESP8266 is a key vault and a thin streaming proxy;
// every provider-specific request/response mapping lives here, in the browser.
const PROVIDERS = {
  openai: { label: "OpenAI", short: "O", color: "#10a37f", kind: "key", note: "Recommended · GPT and o-series models", keyHint: "sk-..." },
  anthropic: { label: "Anthropic", short: "A", color: "#d97757", kind: "key", note: "Beta · Claude models", keyHint: "sk-ant-..." },
  google: { label: "Google Gemini", short: "G", color: "#4285f4", kind: "key", note: "Beta · Gemini models", keyHint: "AIza..." },
  // Ollama support is disabled for now.
};
const TOOL_PROVIDERS = {
  tavily: { label: "Tavily search", short: "T", color: "#3b82f6", kind: "key", note: "Optional web search API key", keyHint: "tvly-..." },
  brave: { label: "Brave Search", short: "B", color: "#fb542b", kind: "key", note: "Optional web search API key", keyHint: "BSA..." },
  searxng: { label: "SearXNG", short: "S", color: "#3050ff", kind: "url", note: "Self-hosted search on your LAN", keyHint: "http://192.168.1.30:8080" },
};
const ALL_PROVIDERS = { ...PROVIDERS, ...TOOL_PROVIDERS };

const Dev = {
  config: null, health: null, limits: { bodyBytes: 40000, fetchBytes: 160000 }, models: {}, online: null,

  async json(path, method = "GET", body, timeout = 15000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try { res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
    catch (e) {
      this.online = false;
      throw e && e.name === "AbortError" ? new ApiError("gateway_timeout", "ChatESP did not answer in time.", "Check Wi-Fi and the device, then retry.") : new ApiError("gateway_unreachable", "This browser cannot reach ChatESP.", "Check the device address and your Wi-Fi connection.");
    } finally { clearTimeout(t); }
    this.online = true;
    let data = null; try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok === false) { const er = (data && data.error) || {}; throw new ApiError(er.code, er.message || "ChatESP could not complete that request.", er.hint, res.status); }
    return data;
  },
  async bootstrap() {
    const d = await this.json("/api/bootstrap");
    this.config = d.configuration; this.health = d.device || d.health || null;
    if (d.device && d.device.limits) this.limits = { ...this.limits, ...d.device.limits };
    return d;
  },
  configured(p) { return !!(this.config && this.config.providers && this.config.providers[p] && this.config.providers[p].configured); },
  async saveCredential(provider, value) { const d = await this.json("/api/providers/key", "PUT", { provider, value }); this.config = d.configuration; return d; },
  async deleteCredential(provider) { const d = await this.json("/api/providers/key?provider=" + encodeURIComponent(provider), "DELETE"); this.config = d.configuration; delete this.models[provider]; return d; },

  // Raw proxy call: returns a fetch Response for 2xx, throws ApiError otherwise.
  async proxy(provider, path, opts = {}) {
    // A busy ESP answers low_memory; wait briefly and retry instead of failing the request. Transient provider trouble (HTTP 5xx such as
    // "high demand", rate limits, or the device failing to open a connection) is retried a few times too: an Agent run makes many calls
    // and one hiccup should not end it.
    const transient = ["provider_unavailable", "rate_limited", "network_unreachable"];
    for (let attempt = 0; ; attempt++) {
      try { return await this._proxy(provider, path, opts); }
      catch (e) {
        const mem = e.code === "low_memory", busy = transient.includes(e.code);
        if (!(mem || busy) || attempt >= (mem ? 4 : 3) || (opts.signal && opts.signal.aborted)) throw e;
        if (busy && attempt === 0) toast("The provider or network is busy", "", "Retrying automatically.", 3500);
        await sleep(mem ? 3000 + attempt * 1500 : 4000 * (attempt + 1));
      }
    }
  },
  async _proxy(provider, path, { method = "POST", body, signal, headers = {} } = {}) {
    let res;
    try {
      res = await fetch("/api/proxy", { method: "POST", signal, headers: { "Content-Type": "application/json", "X-CE-Provider": provider, "X-CE-Path": path, "X-CE-Method": method, ...headers }, body: body == null ? "" : typeof body === "string" ? body : JSON.stringify(body) });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new ApiError("gateway_unreachable", "This browser lost contact with ChatESP.", "Check the device is powered and on the same network.");
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    throw upstreamError(res.status, text);
  },
  modelStatus: {}, effortCaps: {},
  // The device handles one upstream request at a time and has little spare memory, so every call that
  // touches the proxy or relay runs through this queue. `pending` lets best-effort calls skip when busy.
  _q: Promise.resolve(), pending: 0,
  serial(fn) {
    this.pending++;
    const run = this._q.then(fn, fn);
    const done = () => { this.pending--; };
    run.then(done, done);  // registered before the caller awaits, so pending is already updated when they resume
    this._q = run.then(() => {}, () => {});
    return run;
  },
  smallDevice() { return this.limits.bodyBytes < 12000; },
  async refreshModels(provider) {
    this.modelStatus[provider] = { state: "loading" };
    try {
      const list = await listModels(provider);
      this.models[provider] = list; this.modelStatus[provider] = { state: "ok" };
      Store.settings.modelCache[provider] = list; Store.settings.modelCacheTs[provider] = Date.now(); Store.saveSettings();
      return list;
    } catch (e) { this.modelStatus[provider] = { state: "err", msg: e.message, hint: e.hint }; throw e; }
  },
  // Loads the catalog for every configured provider, one at a time (the ESP serves one request at once).
  // Cached lists are shown immediately; stale or forced ones are refreshed in the background.
  async loadCatalog({ force = false, onUpdate } = {}) {
    const ps = Object.keys(PROVIDERS).filter((p) => this.configured(p));
    for (const p of ps) { if (!this.models[p] && Store.settings.modelCache[p]) this.models[p] = Store.settings.modelCache[p]; }
    onUpdate && onUpdate();
    for (const p of ps) {
      const stale = !Store.settings.modelCacheTs[p] || Date.now() - Store.settings.modelCacheTs[p] > 3600e3;
      if (!force && this.models[p] && !stale) { this.modelStatus[p] = { state: "ok" }; continue; }
      this.modelStatus[p] = { state: this.models[p] ? "refresh" : "loading" }; onUpdate && onUpdate();
      try { await this.refreshModels(p); } catch (_) { if (this.models[p]) this.modelStatus[p] = { state: "ok", stale: true }; }
      onUpdate && onUpdate();
    }
  },
  testCredential(provider, value) { return this.serial(() => this._testCredential(provider, value)); },
  async _testCredential(provider, value) {
    let res;
    try { res = await fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, value }) }); }
    catch (_) { throw new ApiError("gateway_unreachable", "This browser cannot reach ChatESP.", "Check the device address and your Wi-Fi connection."); }
    const text = await res.text().catch(() => "");
    if (!res.ok) throw upstreamError(res.status, text);
    return parseModels(provider, parseJsonBody(text));
  },
};

// Maps a provider/device failure to the same error classes v1 used.
function upstreamError(status, text) {
  let data = null; try { data = JSON.parse(text); } catch (_) {}
  // Providers always answer errors with JSON. A bare 404/405 means this address is not a ChatESP device (wrong address or old firmware).
  if (!data && (status === 404 || status === 405)) return new ApiError("gateway_mismatch", "That address answered, but it doesn't behave like a ChatESP device.", "Check the device address, or reflash the firmware if you updated the web app recently.", status);
  if (data && data.ok === false && data.error) return new ApiError(data.error.code, data.error.message, data.error.hint, status);
  let detail = data && (data.error && (data.error.message || data.error) || data.message) || "";
  if (typeof detail !== "string") detail = JSON.stringify(detail);
  detail = detail.slice(0, 240);
  const hint = (fb) => (detail ? "Provider says: " + detail : fb);
  if (status === 401 || status === 403) return new ApiError("authentication_failed", "The provider rejected the credential (HTTP " + status + ").", hint("Paste a current key and run Test & Save again."), status);
  if (status === 404) return new ApiError("model_or_endpoint_not_found", "The provider could not find that model or endpoint.", hint("Refresh live models and pick one the provider returned."), status);
  if (status === 408 || status === 504) return new ApiError("provider_timeout", "The provider request timed out.", "Retry after checking the network.", status);
  if (status === 413) return new ApiError("request_too_large", "That request is too large for the ESP.", "Shorten the conversation or attach smaller files.", status);
  if (status === 429) return new ApiError("rate_limited", "The provider is rate-limiting this request.", hint("Wait a moment, then retry."), status);
  if (status >= 500) return new ApiError("provider_unavailable", "The provider is temporarily unavailable (HTTP " + status + ").", hint("Retry later; nothing was changed."), status);
  return new ApiError("provider_request_failed", "The provider rejected this request (HTTP " + status + ").", hint("Check the selected model and account settings."), status);
}

// ---- Model discovery -------------------------------------------------------------------------
const NON_CHAT = /embed|whisper|tts|dall-e|moderation|davinci|babbage|transcribe|realtime|audio|search-preview|computer-use|image-1|imagen|veo|aqa|rerank/i;
function parseJsonBody(text) {
  try { return JSON.parse(text); } catch (_) {
    throw new ApiError("response_incomplete", "The model list arrived incomplete (" + fmtBytes(String(text).length) + " received).", "This is usually a weak Wi-Fi link to the device. Retry, or move the device closer to the router.", 502);
  }
}
function parseModels(provider, data) {
  let out = [];
  if (provider === "openai") out = (data.data || []).filter((m) => m.id && !NON_CHAT.test(m.id)).map((m) => ({ id: m.id, name: m.id }));
  else if (provider === "anthropic") out = (data.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  else if (provider === "google") out = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && !/aqa|embedding|imagen|veo/i.test(m.name)).map((m) => ({ id: String(m.name).replace(/^models\//, ""), name: m.displayName || String(m.name).replace(/^models\//, ""), ctx: m.inputTokenLimit || 0 }));
  else if (provider === "ollama") out = (data.models || []).map((m) => ({ id: m.model || m.name, name: m.name || m.model, size: (m.details && m.details.parameter_size) || "" }));
  out = out.filter((m) => m.id);
  if (provider === "google") out.forEach((m) => { if (/image/i.test(m.id)) m.image = true; });
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!out.length) throw new ApiError("no_models", "The provider returned no usable models.", "Check the account has model access, then retry.");
  return out;
}
function listModels(provider) { return Dev.serial(() => listModelsNow(provider)); }
async function listModelsNow(provider) {
  const path = { openai: "/v1/models", anthropic: "/v1/models?limit=100", google: "/v1beta/models?pageSize=200", ollama: "/api/tags" }[provider];
  const res = await Dev.proxy(provider, path, { method: "GET" });
  return parseModels(provider, parseJsonBody(await res.text()));
}
function modelCaps(provider, id) {
  const m = String(id || "").toLowerCase();
  const vision = provider === "anthropic" || provider === "google" || (provider === "openai" && /gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|^o\d|gpt-4-turbo|omni/.test(m)) || (provider === "ollama" && /llava|vision|gemma3|minicpm-v|qwen.*vl|bakllava|moondream|llama4/.test(m));
  return { vision, reasoning: !!reasoningSpec(provider, id) };
}

// What reasoning control a model offers, or null. levels: selectable efforts (low to high); canDisable: can reasoning be turned fully off.
// kind decides how the setting is sent: OpenAI reasoning.effort, Anthropic thinking budget, Gemini thinkingBudget/thinkingLevel, Ollama think.
const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high"];
function reasoningSpec(provider, id) {
  const m = String(id || "").toLowerCase();
  if (provider === "openai") {
    if (/chat|search|audio|realtime|image|tts|transcribe|embed|moderation|instruct/.test(m)) return null;
    if (/^o\d/.test(m)) return { kind: "effort", levels: ["low", "medium", "high"], canDisable: false, note: "o-series models always reason." };
    const g = m.match(/^gpt-(\d+)(?:\.(\d+))?/);
    if (!g || +g[1] < 5) return null;
    if (/-pro/.test(m)) return { kind: "effort", levels: ["high"], canDisable: false, note: "This model always reasons at high effort." };
    // gpt-5 itself can't turn reasoning off; 5.1 and every later generation can ("none").
    if (+g[1] > 5 || (g[2] && +g[2] >= 1)) return { kind: "effort", levels: ["low", "medium", "high"], canDisable: true, off: "none" };
    return { kind: "effort", levels: ["minimal", "low", "medium", "high"], canDisable: false, note: "This model always reasons; Minimal is its lowest setting." };
  }
  if (provider === "anthropic") {
    if (/3-7|(sonnet|opus|haiku)-[4-9]|fable|(sonnet|opus|haiku)-?[4-9]/.test(m)) return { kind: "budget", levels: ["low", "medium", "high"], budgets: { low: 1024, medium: 4096, high: 12000 }, canDisable: true, note: "Extended thinking uses a token budget." };
    return null;
  }
  if (provider === "google") {
    if (/gemini-2\.5/.test(m)) return { kind: "budget", levels: ["low", "medium", "high"], budgets: { low: 1024, medium: 8192, high: 24576 }, canDisable: !/pro/.test(m), minBudget: 128, note: /pro/.test(m) ? "This model can't turn thinking fully off." : "" };
    if (/gemini-3/.test(m)) return { kind: "glevel", levels: ["low", "high"], canDisable: false, note: "Gemini 3 offers Low and High thinking." };
    return null;
  }
  if (provider === "ollama") {
    if (/gpt-oss/.test(m)) return { kind: "olevel", levels: ["low", "medium", "high"], canDisable: false, note: "gpt-oss always reasons." };
    if (/qwen3|deepseek-r1|magistral|phi4-reasoning|cogito|smollm3|nemotron|deepcoder|exaone-deep|openthinker|qwq|granite3\.[23]|r1/.test(m)) return { kind: "think", levels: [], canDisable: true };
    return null;
  }
  return null;
}
// Nearest supported level to the requested effort.
function levelFor(spec, effort) {
  if (!spec.levels.length) return "";
  if (spec.levels.includes(effort)) return effort;
  const want = EFFORT_ORDER.indexOf(effort === "off" ? "none" : effort || "medium");
  return spec.levels.slice().sort((a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - want) - Math.abs(EFFORT_ORDER.indexOf(b) - want))[0];
}
// Resolves the chat's reasoning choice for a model: {on, level} or null when the model has no reasoning control.
// quiet = utility calls (titles, suggestions): the lowest setting the model allows, ignoring the chat's choice.
function reasoningFor(provider, model, effort, think, quiet) {
  const spec = reasoningSpec(provider, model); if (!spec) return null;
  if (quiet) return { spec, quiet: true, on: !spec.canDisable, level: spec.levels[0] || "" };
  let level = levelFor(spec, effort);
  const cap = Dev.effortCaps[provider + "|" + model];  // learned this session: this model used its whole budget thinking at a higher level
  if (cap && spec.levels.indexOf(cap) >= 0 && spec.levels.indexOf(level) > spec.levels.indexOf(cap)) level = cap;
  return { spec, on: think !== false || !spec.canDisable, level };
}


// ---- Parameters a model refuses ----
// Providers differ per model (e.g. reasoning models reject temperature). When one answers 400 naming the offending parameter,
// drop or adjust it, retry, and remember the choice so the next request is right the first time.
function dropPath(body, path) {
  const parts = String(path).split(".");
  let o = body; for (let i = 0; i < parts.length - 1 && o; i++) o = o[parts[i]];
  const leaf = parts[parts.length - 1];
  if (o && typeof o === "object" && leaf in o) { delete o[leaf]; return true; }
  if (parts.length === 1) for (const c of ["generationConfig", "options"]) if (body[c] && leaf in body[c]) { delete body[c][leaf]; return true; }
  return false;
}
function applyQuirks(provider, model, body) {
  for (const p of ((Store.settings.quirks || {})[provider + "|" + model] || [])) dropPath(body, p);
  const cap = (Store.settings.tokenCaps || {})[provider + "|" + model];  // a ceiling learned from an earlier rejection
  if (cap) { if (body.max_output_tokens > cap) body.max_output_tokens = cap; if (body.max_tokens > cap) body.max_tokens = cap; if (body.generationConfig && body.generationConfig.maxOutputTokens > cap) body.generationConfig.maxOutputTokens = cap; if (body.options && body.options.num_predict > cap) body.options.num_predict = cap; if (body.thinking && body.thinking.budget_tokens >= cap) body.thinking.budget_tokens = Math.max(1024, Math.floor(cap / 2)); }
}
function adaptToRejection(provider, model, body, e) {
  if (e.status !== 400 && e.status !== 422) return false;
  const msg = (e.message || "") + " " + (e.hint || ""); let m, dropped = null;
  if ((m = msg.match(/(?:unsupported|unknown|invalid) (?:parameter|field)s?:? '?"?([\w.]+)/i)) || (m = msg.match(/Unknown name "(\w+)"/i)) || (m = msg.match(/'([\w.]+)' is not supported with this model/i)) || (m = msg.match(/Unrecognized request argument supplied: (\w+)/i))) { if (m[1] !== "value" && dropPath(body, m[1])) dropped = m[1]; }
  if (!dropped && (m = msg.match(/Unsupported value: '([\w.]+)' does not support '([^']+)'/i)) && /effort/.test(m[1]) && body.reasoning) {
    const i = EFFORT_ORDER.indexOf(body.reasoning.effort); if (i >= 0 && i < EFFORT_ORDER.length - 1) { body.reasoning.effort = EFFORT_ORDER[i + 1]; return true; }
  }
  if (!dropped && /temperature/i.test(msg) && /thinking|reasoning|only|not supported|default/i.test(msg) && dropPath(body, "temperature")) dropped = "temperature";
  if (!dropped && /think/i.test(msg) && /not support|unsupported/i.test(msg) && "think" in body) { delete body.think; dropped = "think"; }
  if (!dropped && /summary/i.test(msg) && body.reasoning && body.reasoning.summary) { delete body.reasoning.summary; dropped = "reasoning.summary"; }
  if (!dropped && provider === "openai" && body.reasoning && /effort|reasoning/i.test(msg)) { const i = EFFORT_ORDER.indexOf(body.reasoning.effort); if (i >= 0 && i < EFFORT_ORDER.length - 1) { body.reasoning.effort = EFFORT_ORDER[i + 1]; return true; } }
  // "max_tokens: 16000 > 8192", "must be less than or equal to 8192", "supported range is from 1 to 8192": lower the cap to what the model allows.
  if (!dropped && /max[_ ]?(?:output[_ ]?)?tokens|maxOutputTokens|num_predict|output tokens/i.test(msg)) {
    const nums = ((e.hint || "").match(/\d{3,6}/g) || []).map(Number),  // the provider's own wording only: the status code in e.message is not a ceiling
      cur = body.max_output_tokens || body.max_tokens || (body.generationConfig && body.generationConfig.maxOutputTokens) || (body.options && body.options.num_predict) || 0;
    const cap = nums.filter((n) => n < cur).sort((a, b) => b - a)[0];
    if (cap && cap >= 1000) {
      if (body.max_output_tokens) body.max_output_tokens = cap; else if (body.max_tokens) body.max_tokens = cap; else if (body.generationConfig && body.generationConfig.maxOutputTokens) body.generationConfig.maxOutputTokens = cap; else if (body.options) body.options.num_predict = cap;
      if (body.thinking && body.thinking.budget_tokens >= cap) body.thinking.budget_tokens = Math.max(1024, Math.floor(cap / 2));
      (Store.settings.tokenCaps = Store.settings.tokenCaps || {})[provider + "|" + model] = cap; Store.saveSettings(); return true;
    }
  }
  if (!dropped) return false;
  const q = (Store.settings.quirks = Store.settings.quirks || {}), k = provider + "|" + model;
  q[k] = [...new Set([...(q[k] || []), dropped])]; Store.saveSettings(); return true;
}

// ---- Streaming chat --------------------------------------------------------------------------
// req: {model, system, messages:[{role:'user'|'assistant', text, images:[{mime,b64}]}], temperature, effort, maxTokens, search}
// Yields text lines from a streamed response. If nothing at all arrives for `idleMs` the stream is treated as dead
// (for example the device restarted mid-reply and left the connection half open).
async function* readLines(res, signal, idleMs = 240000) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  const stalled = () => new ApiError("stream_stalled", "The device stopped sending data.", "It may have restarted or lost Wi-Fi. Press Retry. If this keeps happening, lower the reasoning effort for this chat.", 504);
  try {
    for (;;) {
      let timer; const { value, done } = await Promise.race([reader.read(), new Promise((_, rej) => { timer = setTimeout(() => rej(stalled()), idleMs); })]).finally(() => clearTimeout(timer));
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1); yield line; }
    }
    buf += dec.decode(); if (buf.trim()) yield buf;
  } finally { try { reader.cancel(); } catch (_) {} try { reader.releaseLock(); } catch (_) {} }
}
function mergeTurns(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.text && !(m.images && m.images.length)) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) { last.text += "\n\n" + m.text; last.images = (last.images || []).concat(m.images || []); } else out.push({ role: m.role, text: m.text || "", images: m.images ? m.images.slice() : [] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
function buildRequest(provider, req) {
  const turns = mergeTurns(req.messages);
  // Small devices cannot afford minutes of per-token events (each token is ~240 bytes on the wire and the board is down to a few KB
  // of heap while the TLS session is open), so long replies are fetched in one piece instead. Anthropic needs streaming for long output.
  const buffered = !!req.buffered && provider !== "anthropic";
  const rz = reasoningFor(provider, req.model, req.effort, req.think, req.quiet);
  const maxTokens = req.maxTokens || Store.settings.maxTokens || 4096;
  if (provider === "openai") {
    const body = {
      model: req.model, ...(buffered ? {} : { stream: true, stream_options: { include_obfuscation: false } }), store: false, max_output_tokens: maxTokens,
      input: turns.map((m) => ({ role: m.role, content: m.role === "assistant" ? [{ type: "output_text", text: m.text }] : [{ type: "input_text", text: m.text }].concat(m.images.map((i) => ({ type: "input_image", image_url: `data:${i.mime};base64,${i.b64}` }))) })),
    };
    if (req.system) body.instructions = req.system;
    // Reasoning summaries stream one tiny event per token (hundreds of KB at high effort): skip them when the caller does not show them.
    if (rz) body.reasoning = rz.on ? (rz.quiet || req.noSummary ? { effort: rz.level } : { effort: rz.level, summary: "auto" }) : { effort: rz.spec.off };
    else if (req.temperature != null) body.temperature = req.temperature;
    if (req.search) body.tools = [{ type: "web_search" }];
    return { path: "/v1/responses", body, buffered };
  }
  if (provider === "anthropic") {
    const body = { model: req.model, max_tokens: maxTokens, stream: true, messages: turns.map((m) => ({ role: m.role, content: m.images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.b64 } })).concat([{ type: "text", text: m.text }]) })) };
    if (req.system) body.system = req.system;
    if (rz && rz.on) { const budget = rz.spec.budgets[rz.level]; body.thinking = { type: "enabled", budget_tokens: budget }; body.max_tokens = Math.max(maxTokens, budget + 1024); }
    else if (req.temperature != null) body.temperature = clamp(req.temperature, 0, 1);  // thinking requires the default temperature
    if (req.search) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
    return { path: "/v1/messages", body, buffered: false };
  }
  if (provider === "google") {
    const body = { contents: turns.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: m.images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.b64 } })).concat([{ text: m.text }]) })), generationConfig: { maxOutputTokens: maxTokens } };
    if (req.temperature != null) body.generationConfig.temperature = clamp(req.temperature, 0, 2);
    if (rz && rz.spec.kind === "budget") { const b = rz.on && !rz.quiet ? rz.spec.budgets[rz.level] : rz.spec.canDisable ? 0 : rz.spec.minBudget; body.generationConfig.thinkingConfig = { thinkingBudget: b, includeThoughts: b > 0 && !req.noSummary }; body.generationConfig.maxOutputTokens = Math.max(maxTokens, b + 1024); }
    else if (rz && rz.spec.kind === "glevel") body.generationConfig.thinkingConfig = { thinkingLevel: rz.level, includeThoughts: !req.noSummary };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.search) body.tools = [{ google_search: {} }];
    return { path: `/v1beta/models/${encodeURIComponent(req.model)}:${buffered ? "generateContent" : "streamGenerateContent?alt=sse"}`, body, buffered };
  }
  const body = { model: req.model, stream: !buffered, options: { num_predict: maxTokens }, messages: [] };
  if (req.temperature != null) body.options.temperature = clamp(req.temperature, 0, 2);
  if (rz) body.think = rz.spec.kind === "olevel" ? rz.level : rz.on;
  if (req.system) body.messages.push({ role: "system", content: req.system });
  turns.forEach((m) => body.messages.push({ role: m.role, content: m.text, ...(m.images.length ? { images: m.images.map((i) => i.b64) } : {}) }));
  return { path: "/api/chat", body, buffered };
}

async function streamChat(provider, req, cb = {}, signal) {
  try { return await Dev.serial(() => streamChatNow(provider, req, cb, signal)); }
  catch (e) {
    // A small TLS receive buffer was requested and the reply did not arrive intact: retry once with the full-size buffer.
    if (e && req.smallRecords && (e.code === "response_incomplete" || e.code === "stream_interrupted" || e.code === "network_unreachable")) return streamChat(provider, { ...req, smallRecords: false }, cb, signal);
    // The model used its entire output budget on reasoning and wrote nothing: try once more with lighter reasoning and more room.
    if (e && e.code === "provider_empty_response" && !req.__lowered) {
      const rz = reasoningFor(provider, req.model, req.effort, req.think, req.quiet), i = rz && rz.on && !rz.quiet ? rz.spec.levels.indexOf(rz.level) : -1;
      if (i > 0) { toast("The model spent its whole budget thinking", "", `Retrying with ${rz.spec.levels[i - 1]} reasoning and more room.`, 4500); const res = await streamChat(provider, { ...req, effort: rz.spec.levels[i - 1], maxTokens: Math.min(64000, Math.round((req.maxTokens || 4096) * 1.5)), __lowered: true }, cb, signal); Dev.effortCaps[provider + "|" + req.model] = rz.spec.levels[i - 1]; return res; }
    }
    throw e;
  }
}
async function streamChatNow(provider, req, cb = {}, signal) {
  const { path, body, buffered } = buildRequest(provider, req);
  const bytes = JSON.stringify(body).length;
  if (bytes > Dev.limits.bodyBytes) throw new ApiError("request_too_large", `This request is ${fmtBytes(bytes)}; this device accepts up to ${fmtBytes(Dev.limits.bodyBytes)}.`, "Shorten the conversation, start a new chat, or attach smaller files.", 413);
  applyQuirks(provider, req.model, body);
  let res;
  for (let attempt = 0; ; attempt++) {
    try { res = await Dev.proxy(provider, path, { body, signal, headers: buffered ? { "X-CE-Timeout": "600", ...(req.smallRecords ? { "X-CE-Rx": "8192" } : {}) } : {} }); break; }
    catch (e) { if (attempt >= 4 || !adaptToRejection(provider, req.model, body, e)) throw e; }  // the provider refused a parameter: adjust and retry
  }
  let text = "", usage = null; const sources = [];
  try { return await (buffered ? readBuffered(provider, req, res, body, cb, sources) : readStream(provider, req, res, body, cb, signal, sources, (t, u) => { text = t; usage = u; })); }
  catch (e) {
    if (text) Store.addUsage(provider, req.model, estimateTokens(JSON.stringify(body)), estimateTokens(text), true);
    if (e && e.name !== "AbortError" && !(e instanceof ApiError)) throw new ApiError("stream_interrupted", "The connection dropped in the middle of the reply.", text ? "The part that arrived is kept below. Press Continue to pick up where it stopped, or Retry. Frequent drops usually mean a weak Wi-Fi link to the device." : "Press Retry. Frequent drops usually mean a weak Wi-Fi link to the device.", 502);
    throw e;
  }
}
async function readStream(provider, req, res, body, cb, signal, sources, report) {
  let text = "", usage = null;
  const addSource = (title, url) => { if (url && !sources.some((s) => s.url === url)) { const s = { title: title || url, url }; sources.push(s); cb.onSource && cb.onSource(s); } };
  for await (const line of readLines(res, signal)) {
    report(text, usage);
    if (provider === "ollama") {
      if (!line.trim()) continue;
      const j = safe(() => JSON.parse(line)); if (!j) continue;
      if (j.error) throw new ApiError("provider_request_failed", String(j.error), "Check the model is pulled on the Ollama host.", 502);
      if (j.message && j.message.thinking) cb.onThink && cb.onThink(j.message.thinking);
      const d = j.message && j.message.content; if (d) { text += d; cb.onText && cb.onText(d); }
      if (j.done) usage = { input: j.prompt_eval_count || 0, output: j.eval_count || 0 };
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue;
    const j = safe(() => JSON.parse(raw)); if (!j) continue;
    if (provider === "openai") {
      if (j.type === "response.output_text.delta") { text += j.delta; cb.onText && cb.onText(j.delta); }
      else if (j.type === "response.reasoning_summary_text.delta") cb.onThink && cb.onThink(j.delta);
      else if (j.type === "response.output_text.annotation.added" && j.annotation && j.annotation.type === "url_citation") addSource(j.annotation.title, j.annotation.url);
      else if (j.type === "response.completed") { const u = j.response && j.response.usage; if (u) usage = { input: u.input_tokens, output: u.output_tokens }; }
      else if (j.type === "response.failed" || j.type === "error") { const m = (j.response && j.response.error && j.response.error.message) || j.message || "The model run failed."; throw new ApiError("provider_request_failed", m, "Try another model or retry.", 502); }
      else if (j.type === "response.incomplete" && !text) throw new ApiError("provider_empty_response", "The model stopped before writing text.", "Raise the token limit in Settings or retry.", 502);
    } else if (provider === "anthropic") {
      if (j.type === "content_block_delta") { if (j.delta.type === "text_delta") { text += j.delta.text; cb.onText && cb.onText(j.delta.text); } else if (j.delta.type === "thinking_delta") cb.onThink && cb.onThink(j.delta.thinking); }
      else if (j.type === "content_block_start" && j.content_block && j.content_block.type === "web_search_tool_result") (j.content_block.content || []).forEach((r) => addSource(r.title, r.url));
      else if (j.type === "message_start" && j.message.usage) usage = { input: j.message.usage.input_tokens, output: 0 };
      else if (j.type === "message_delta" && j.usage) usage = { input: (usage && usage.input) || 0, output: j.usage.output_tokens };
      else if (j.type === "error") throw new ApiError("provider_request_failed", (j.error && j.error.message) || "The model run failed.", "Retry.", 502);
    } else if (provider === "google") {
      const c = j.candidates && j.candidates[0];
      if (c && c.content) for (const p of c.content.parts || []) { if (p.text) { if (p.thought) cb.onThink && cb.onThink(p.text); else { text += p.text; cb.onText && cb.onText(p.text); } } }
      if (c && c.groundingMetadata) (c.groundingMetadata.groundingChunks || []).forEach((g) => g.web && addSource(g.web.title, g.web.uri));
      if (j.usageMetadata) usage = { input: j.usageMetadata.promptTokenCount || 0, output: j.usageMetadata.candidatesTokenCount || 0 };
      if (j.error) throw new ApiError("provider_request_failed", j.error.message || "The model run failed.", "Retry.", 502);
    }
  }
  report(text, usage);
  if (!text.trim()) throw new ApiError("provider_empty_response", "The provider returned no text.", "Choose another model or retry.", 502);
  const est = !usage;
  const u = usage || { input: estimateTokens(JSON.stringify(body)), output: estimateTokens(text) };
  Store.addUsage(provider, req.model, u.input || 0, u.output || 0, est);
  return { text, usage: usage || { ...u, est: true }, sources };
}
// Reads a whole (non-streamed) reply and hands it to the callbacks in one piece, producing the same result as readStream.
async function readBuffered(provider, req, res, body, cb, sources) {
  const j = await res.json().catch(() => null);
  if (!j) throw new ApiError("response_incomplete", "The provider reply arrived incomplete.", "Retry.", 502);
  const addSource = (title, url) => { if (url && !sources.some((s) => s.url === url)) { const s = { title: title || url, url }; sources.push(s); cb.onSource && cb.onSource(s); } };
  let text = "", think = "", usage = null;
  if (provider === "openai") {
    if (j.error) throw new ApiError("provider_request_failed", j.error.message || "The model run failed.", "Try another model or retry.", 502);
    for (const item of j.output || []) {
      if (item.type === "message") for (const c of item.content || []) { if (c.type === "output_text") { text += c.text || ""; (c.annotations || []).forEach((a) => a.type === "url_citation" && addSource(a.title, a.url)); } }
      else if (item.type === "reasoning") (item.summary || []).forEach((p) => { if (p.text) think += p.text; });
    }
    if (j.usage) usage = { input: j.usage.input_tokens, output: j.usage.output_tokens };
    if (!text.trim() && j.status === "incomplete") throw new ApiError("provider_empty_response", "The model stopped before writing text.", "Raise the token limit in Settings or retry.", 502);
  } else if (provider === "google") {
    if (j.error) throw new ApiError("provider_request_failed", j.error.message || "The model run failed.", "Retry.", 502);
    const c = j.candidates && j.candidates[0];
    if (c && c.content) for (const p of c.content.parts || []) { if (p.text) { if (p.thought) think += p.text; else text += p.text; } }
    if (c && c.groundingMetadata) (c.groundingMetadata.groundingChunks || []).forEach((g) => g.web && addSource(g.web.title, g.web.uri));
    if (j.usageMetadata) usage = { input: j.usageMetadata.promptTokenCount || 0, output: j.usageMetadata.candidatesTokenCount || 0 };
    if (!text.trim() && c && c.finishReason === "MAX_TOKENS") throw new ApiError("provider_empty_response", "The model stopped before writing text.", "Raise the token limit in Settings or retry.", 502);
  } else {
    if (j.error) throw new ApiError("provider_request_failed", String(j.error), "Check the model is pulled on the Ollama host.", 502);
    text = (j.message && j.message.content) || ""; think = (j.message && j.message.thinking) || "";
    usage = { input: j.prompt_eval_count || 0, output: j.eval_count || 0 };
  }
  if (think && cb.onThink) cb.onThink(think);
  if (text && cb.onText) cb.onText(text);
  if (!text.trim()) throw new ApiError("provider_empty_response", "The provider returned no text.", "Choose another model or retry.", 502);
  const est = !usage, u = usage || { input: estimateTokens(JSON.stringify(body)), output: estimateTokens(text) };
  Store.addUsage(provider, req.model, u.input || 0, u.output || 0, est);
  return { text, usage: usage || { ...u, est: true }, sources };
}
async function completeText(provider, req, signal) { return (await streamChat(provider, req, {}, signal)).text; }

// Image generation (OpenAI gpt-image-1 or a Gemini image model). Returns a data URL.
function generateImage(provider, prompt, signal) { return Dev.serial(() => generateImageNow(provider, prompt, signal)); }
async function generateImageNow(provider, prompt, signal) {
  if (provider === "openai") {
    const res = await Dev.proxy("openai", "/v1/images/generations", { body: { model: "gpt-image-1", prompt, size: "1024x1024", n: 1 }, signal });
    const j = await res.json(); const b = j.data && j.data[0] && j.data[0].b64_json;
    if (!b) throw new ApiError("image_failed", "No image came back.", "Try a different prompt.", 502);
    return "data:image/png;base64," + b;
  }
  if (provider === "google") {
    const model = (Dev.models.google || []).find((m) => m.image);
    if (!model) throw new ApiError("image_unavailable", "No Gemini image model was found on this key.", "Refresh models or use OpenAI for images.", 400);
    const res = await Dev.proxy("google", `/v1beta/models/${encodeURIComponent(model.id)}:generateContent`, { body: { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }, signal });
    const j = await res.json(); const part = ((j.candidates || [])[0]?.content?.parts || []).find((p) => p.inlineData);
    if (!part) throw new ApiError("image_failed", "No image came back.", "Try a different prompt.", 502);
    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  throw new ApiError("image_unavailable", "Image generation needs an OpenAI or Google key.", "Switch provider in the model menu.", 400);
}

// ---- Web access (research / agent) -----------------------------------------------------------
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
function relayFetch(url, signal) { return Dev.serial(() => relayFetchNow(url, signal)); }
async function relayFetchNow(url, signal) {
  // A busy ESP answers low_memory; wait briefly and retry, like the proxy does.
  for (let attempt = 0; ; attempt++) {
    try { return await relayFetchOnce(url, signal); }
    catch (e) { if (e.code !== "low_memory" || attempt >= 4 || (signal && signal.aborted)) throw e; await sleep(3000 + attempt * 1500); }
  }
}
async function relayFetchOnce(url, signal) {
  let res;
  try { res = await fetch("/api/fetch?url=" + encodeURIComponent(url), { signal }); } catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("gateway_unreachable", "Could not reach ChatESP.", "Check the device connection."); }
  const text = await res.text();
  if (!res.ok) throw upstreamError(res.status, text);
  return text;
}
async function searchWeb(query, n = 6, signal) {
  return Dev.serial(() => searchWebNow(query, n, signal));
}
async function searchWebNow(query, n, signal) {
  const sp = Store.settings.searchProvider;
  if (sp === "tavily") {
    const j = await (await Dev.proxy("tavily", "/search", { body: { query, max_results: n, search_depth: "basic" }, signal })).json();
    return (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: (r.content || "").slice(0, 300) }));
  }
  if (sp === "brave") {
    const j = await (await Dev.proxy("brave", `/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`, { method: "GET", signal })).json();
    return ((j.web && j.web.results) || []).map((r) => ({ title: r.title, url: r.url, snippet: stripHtml(r.description).slice(0, 300) }));
  }
  if (sp === "searxng") {
    const j = await (await Dev.proxy("searxng", `/search?q=${encodeURIComponent(query)}&format=json`, { method: "GET", signal })).json();
    return (j.results || []).slice(0, n).map((r) => ({ title: r.title, url: r.url, snippet: (r.content || "").slice(0, 300) }));
  }
  if (sp === "duckduckgo") {
    const html = await relayFetchNow("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), signal);
    const doc = new DOMParser().parseFromString(html, "text/html"); const out = [];
    doc.querySelectorAll(".result").forEach((el) => {
      const a = el.querySelector(".result__a"); if (!a) return;
      let href = a.getAttribute("href") || ""; const m = href.match(/[?&]uddg=([^&]+)/); if (m) href = decodeURIComponent(m[1]);
      if (/^https?:/.test(href) && out.length < n) out.push({ title: a.textContent.trim(), url: href, snippet: (el.querySelector(".result__snippet")?.textContent || "").trim().slice(0, 300) });
    });
    return out;
  }
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${n}`, { signal }).catch(() => { throw new ApiError("search_unreachable", "Wikipedia could not be reached from this browser.", "The browser needs internet access for the default search.", 502); });
  const j = await r.json();
  return ((j.query && j.query.search) || []).map((x) => ({ title: x.title, url: "https://en.wikipedia.org/?curid=" + x.pageid, snippet: stripHtml(x.snippet) }));
}
async function fetchPage(url, signal, cap = 7000) {
  let text = url.includes("wikipedia.org/?curid=") ? null : await relayFetch(url, signal).catch(() => null);
  if (text == null) {
    const m = url.match(/wikipedia\.org\/\?curid=(\d+)/);
    if (m) { const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exlimit=1&pageids=${m[1]}&format=json&origin=*`, { signal })).json(); const p = j.query && j.query.pages && j.query.pages[m[1]]; return (p && p.extract || "").replace(/\n{3,}/g, "\n\n").slice(0, cap); }
    throw new ApiError("page_unavailable", "That page could not be fetched.", "Skip it and use other sources.", 502);
  }
  if (/^\s*</.test(text)) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,nav,footer,header,aside,form,noscript,svg,iframe").forEach((e) => e.remove());
    const root = doc.querySelector("main,article,[role=main]") || doc.body;
    text = (root ? root.textContent : "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n");
  }
  return text.trim().slice(0, cap);
}
const estimateTokens = (s) => Math.ceil(String(s || "").length / 4);
