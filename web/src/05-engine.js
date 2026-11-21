// Chat engine: builds prompts, runs streaming turns, and dispatches to agent / deck / research modes.
const App = { chatId: null, view: "chat", busy: new Set(), abort: {}, drafts: {}, atts: [], settingsTab: "providers", search: "", projectId: "" };
const MODES = {
  chat: { label: "Chat", icon: "sparkle", hint: "Ask anything" },
  agent: { label: "Agent", icon: "bolt", hint: "Beta · plan, use tools, create files" },
  research: { label: "Research", icon: "flask", hint: "Search the web and write a cited report" },
  design: { label: "Design", icon: "brush", hint: "Websites, slides, prototypes, UI modules and graphics" },
};
// Agent and Design get real room to think and write; Chat stays quick and capped.
const DEEP = (chat) => chat.mode === "agent" || chat.mode === "design";
const deepConfig = () => { const s = Store.settings; return { tokens: clamp(+s.deepTokens || 16000, 2000, 64000), ms: clamp(+s.deepMinutes || 15, 2, 60) * 60000, effort: s.deepEffort || "high" }; };
const effortFor = (chat) => (DEEP(chat) && !chat.effortTouched ? deepConfig().effort : chat.effort || Store.settings.effort);
// Reasoning tokens count against the output limit, so the thinking needs its own room on top of the answer budget; otherwise
// a high-effort call can spend everything thinking and write nothing. Chat gets a smaller allowance so it stays quick.
const REASON_RESERVE = { none: 0, minimal: 400, low: 1500, medium: 5000, high: 12000 };
function reasoningReserve(chat, effort) {
  const rz = reasoningFor(chat.provider, chat.model, effort || effortFor(chat), chat.think); if (!rz || !rz.on) return 0;
  const r = REASON_RESERVE[rz.level] == null ? 3000 : REASON_RESERVE[rz.level]; return DEEP(chat) ? r : Math.min(r, 2000);
}
const maxTokensFor = (chat) => Math.min(64000, (DEEP(chat) ? deepConfig().tokens : Math.min(Store.settings.maxTokens || 4096, 8192)) + reasoningReserve(chat));
const EFFORTS = ["minimal", "low", "medium", "high"];
const curChat = () => Store.chats[App.chatId];
const isBusy = (id = App.chatId) => App.busy.has(id);
const providerReady = (chat) => chat && chat.provider && chat.model && Dev.configured(chat.provider);

function systemPromptFor(chat, extra = "") {
  const s = Store.settings, parts = [];
  parts.push(`You are ChatESP, a capable, thoughtful assistant. Today is ${new Date().toDateString()}.
Lead with the answer, then explain. Match depth to the question: brief for simple asks, thorough and well structured for complex ones.
Format in Markdown. Use headings and lists to organise longer answers, tables for comparisons, and fenced code blocks with a language tag. Write math in LaTeX: $...$ inline and $$...$$ for display. Keep casual conversation plain; do not over-format.
Be accurate. Say so when you are unsure or lack current information, and never invent sources, quotes, numbers or URLs. If a request is ambiguous, state your assumption or ask one short clarifying question.
Be warm and direct, not sycophantic: skip filler openings like "Great question". Follow the user's instructions and constraints exactly.`);
  if (s.name) parts.push(`The user's name is ${s.name}.`);
  const tone = { concise: "Keep answers short and direct.", friendly: "Use a warm, friendly tone.", formal: "Use a formal, professional tone.", balanced: "" }[s.tone];
  if (tone) parts.push(tone);
  if (s.instructions) parts.push("User's custom instructions:\n" + s.instructions);
  if (s.memoryOn && Store.memory.length) parts.push("Things to remember about the user:\n" + Store.memory.map((m) => "- " + m.text).join("\n"));
  const proj = chat.projectId && Store.projects[chat.projectId];
  if (proj) { if (proj.instructions) parts.push(`Project "${proj.name}" instructions:\n${proj.instructions}`); (proj.files || []).forEach((f) => parts.push(`Project file ${f.name}:\n${String(f.text).slice(0, 6000)}`)); }
  if (chat.system) parts.push(chat.system);
  const cb = compactionBase(chat); if (cb) parts.push("Summary of the earlier part of this conversation (those messages were compacted to save space; treat it as established context):\n" + cb.text);
  if (extra) parts.push(extra);
  return parts.join("\n\n");
}
// Convert the visible path into provider messages. Messages already folded into the rolling summary are skipped.
const eligibleNode = (n) => (n.role === "user" || n.role === "assistant") && !n.error && !n.pending;
function nodeMessage(n) {
  let text = n.text || "";
  (n.atts || []).filter((a) => a.kind === "text").forEach((a) => { text = `[Attached file: ${a.name}]\n${a.text}\n[End of file]\n\n` + text; });
  if (n.role === "assistant" && n.artifacts && n.artifacts.length) text += "\n\n[Created files: " + n.artifacts.map((a) => a.name).join(", ") + "]";
  if (n.role === "assistant" && n.gen && n.gen.length) text += "\n\n[Generated " + n.gen.length + " image(s) for the user]";
  return { role: n.role, text, images: (n.atts || []).filter((a) => a.kind === "image").map((a) => ({ mime: a.mime, b64: a.data.split(",")[1] || "" })) };
}
// The summary only applies while the node it covers is still on the visible branch (editing an old message abandons it).
function compactionBase(chat) { const c = chat.compact; return c && c.text && chatPath(chat).some((n) => n.id === c.upTo) ? c : null; }
function pathMessages(chat, upto) {
  const path = chatPath(chat); const end = upto ? path.findIndex((n) => n.id === upto) : path.length, stop = end < 0 ? path.length : end;
  const cb = compactionBase(chat), from = cb ? path.findIndex((n) => n.id === cb.upTo) + 1 : 0;
  return path.slice(Math.min(from, stop), stop).filter(eligibleNode).map(nodeMessage);
}
// Automatic compaction: when the next request would crowd the device's limit, fold the oldest turns into a rolling summary
// (kept on the chat and merged with any earlier summary) instead of silently dropping them. Trimming stays as the last resort.
const COMPACT_AT = 0.7;
async function compactIfNeeded(chat, rc, node, signal) {
  if (!providerReady(rc)) return;
  const limit = Dev.limits.bodyBytes - 600;
  const sizeOf = () => JSON.stringify(buildRequest(rc.provider, baseRequest(rc, "", { messages: pathMessages(chat, node.id) })).body).length;
  if (sizeOf() < limit * COMPACT_AT) return;
  const path = chatPath(chat), end = path.findIndex((n) => n.id === node.id), base = compactionBase(chat), start = base ? path.findIndex((n) => n.id === base.upTo) + 1 : 0;
  const cand = path.slice(start, Math.max(start, end)).filter(eligibleNode); if (cand.length < 3) return;
  // Keep the newest turns verbatim (always the last message, then more while they fit a third of the budget), starting on a user turn.
  let keep = 0, used = 0;
  for (let i = cand.length - 1; i >= 0; i--) { const len = nodeMessage(cand[i]).text.length + 200; if (keep >= 1 && used + len > limit * 0.3) break; used += len; keep++; }
  while (keep < cand.length && cand[cand.length - keep].role !== "user") keep++;
  const old = cand.slice(0, cand.length - keep); if (old.length < 2) return;
  const budget = Math.max(1500, Math.floor(limit * 0.5) - (base ? base.text.length : 0)), per = clamp(Math.floor(budget / old.length), 200, 1600);
  const transcript = old.map((n) => `${n.role === "user" ? "User" : "Assistant"}: ${nodeMessage(n).text.replace(/\s+/g, " ").slice(0, per)}`).join("\n");
  const step = addStep(chat, node, "Compacting earlier messages", `${old.length} messages`);
  try {
    const text = (await completeText(rc.provider, { model: rc.model, system: "You compress conversations so they can continue in less space. Write a faithful, dense summary of the conversation so far that preserves: the user's goals and preferences, names, numbers, decisions, code and identifiers, constraints, files or designs produced, and open questions. If a previous summary is given, merge it in. Plain text, at most 300 words, no preamble.", messages: [{ role: "user", text: (base ? `Previous summary:\n${base.text}\n\n` : "") + `Messages to fold in:\n${transcript}` }], maxTokens: 800, temperature: 0.2, quiet: true }, signal)).trim();
    if (text.length < 40) throw new Error("empty summary");
    chat.compact = { upTo: old[old.length - 1].id, text: text.slice(0, 3500), n: (base ? base.n : 0) + old.length, at: Date.now() };
    node.compacted = old.length; Store.saveChat(chat);
    endStep(chat, node, step, "done", `${old.length} earlier messages folded into a summary`);
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    console.warn("Compaction failed; falling back to trimming", e); endStep(chat, node, step, "err", "Skipped; oldest messages will be trimmed instead");
  }
}
function fitToLimit(provider, req, { pinFirst = false } = {}) {
  // Drop oldest turns, then oldest images, until the encoded body fits the device limit.
  const limit = Dev.limits.bodyBytes - 600;
  for (let guard = 0; guard < 60; guard++) {
    const size = JSON.stringify(buildRequest(provider, req).body).length;
    if (size <= limit) return req;
    const withImg = req.messages.findIndex((m) => m.images && m.images.length);
    if (req.messages.length > (pinFirst ? 2 : 1) && (withImg < 0 || withImg >= req.messages.length - 1)) req.messages.splice(pinFirst ? 1 : 0, 1);
    else if (withImg >= 0) req.messages[withImg].images = [];
    else break;
  }
  return req;
}
function baseRequest(chat, extraSystem, over = {}) {
  const s = Store.settings;
  return { model: chat.model, system: systemPromptFor(chat, extraSystem), messages: [], temperature: chat.temperature, effort: effortFor(chat), think: chat.think !== false, maxTokens: maxTokensFor(chat), noSummary: DEEP(chat) && Dev.smallDevice(), buffered: DEEP(chat) && Dev.smallDevice(), search: !!chat.webSearch && Store.settings.nativeSearch, ...over };
}
const render = { thread: () => UI.renderThread(), all: () => UI.render(), last: 0 };
function refreshNode(chat, node) { UI.updateNode(chat, node); }

async function startSend(text, opts = {}) {
  const chat = curChat(); if (!chat) return;
  if (isBusy(chat.id)) return;
  text = String(text || "").trim();
  const atts = opts.atts || App.atts.splice(0);
  if (!text && !atts.length) return;
  if (!providerReady(chat)) { Setup.nudge(chat); return; }
  const path = chatPath(chat);
  const parent = opts.parent !== undefined ? opts.parent : path.length ? path[path.length - 1].id : null;
  const user = addNode(chat, parent, { role: "user", text, atts });
  if (chat.title === "New chat" && !opts.keepTitle) chat.title = text.replace(/\s+/g, " ").slice(0, 56) || "New chat";
  await runTurn(chat, user);
}
async function runTurn(chat, userNode, over) {
  const rc = over ? Object.assign({}, chat, over) : chat;  // a per-reply model override; nodes/rootsList stay shared with the real chat
  const ctl = new AbortController(); App.abort[chat.id] = ctl; App.busy.add(chat.id);
  const rz = reasoningFor(rc.provider, rc.model, effortFor(rc), rc.think);
  const node = addNode(chat, userNode.id, { role: "assistant", text: "", pending: true, provider: rc.provider, model: rc.model, mode: rc.mode, steps: [], sources: [], rz: rz ? (rz.on ? rz.level || "on" : "off") : undefined });
  Store.saveChat(chat); UI.render({ scroll: true });
  try {
    await compactIfNeeded(chat, rc, node, ctl.signal);
    if (rc.mode === "agent") await Agent.run(rc, node, userNode, ctl.signal);
    else if (rc.mode === "research") await Research.run(rc, node, userNode, ctl.signal);
    else if (rc.mode === "design") await Design.run(rc, node, userNode, ctl.signal);
    else await plainTurn(rc, node, userNode, ctl.signal);
  } catch (e) {
    if (e && e.name === "AbortError") { node.stopped = true; if (!node.text && !(node.artifacts || []).length && !node.report && !node.deck) node.text = ""; }
    else { console.error(e); const v = errView(e); node.error = v; }
  } finally {
    node.pending = false; if (node.think && node.thinkStart && !node.thinkMs) node.thinkMs = Date.now() - node.thinkStart;
    // A step still marked "running" after a failure or Stop must not keep spinning.
    (node.steps || []).forEach((st) => { if (st.state === "run") { const why = node.stopped ? "Stopped" : "Failed"; st.state = "err"; st.detail = st.detail ? st.detail + " · " + why : why; } });
    App.busy.delete(chat.id); delete App.abort[chat.id];
    Store.saveChat(chat); UI.updateNode(chat, node); UI.afterTurn(chat, node);  // patch in place: no flash at the end of a reply
  }
}
async function plainTurn(chat, node, userNode, signal) {
  const req = fitToLimit(chat.provider, baseRequest(chat, "", { messages: pathMessages(chat, node.id) }));
  let last = 0;
  const res = await streamChat(chat.provider, req, {
    onText: (d) => { if (!node.text && node.think && node.thinkStart && !node.thinkMs) node.thinkMs = Date.now() - node.thinkStart; node.text += d; const now = performance.now(); if (now - last > 60) { last = now; refreshNode(chat, node); } },
    onThink: (d) => { node.think = (node.think || "") + d; node.thinkStart = node.thinkStart || Date.now(); const now = performance.now(); if (now - last > 120) { last = now; refreshNode(chat, node); } },
    onSource: (s) => node.sources.push(s),
  }, signal);
  node.text = res.text; node.usage = res.usage;
  if (!res.usage) node.usage = { input: estimateTokens(JSON.stringify(req.messages)), output: estimateTokens(res.text), est: true };
}
async function autoTitle(chat) {
  if (Dev.smallDevice() || Dev.pending > 0) return;  // best effort: never compete with a real request or a tiny device
  try {
    const first = chatPath(chat).filter((n) => n.role === "user")[0]; if (!first || !providerReady(chat)) return;
    const t = await completeText(chat.provider, { model: chat.model, system: "Write a 2-5 word title for this chat. Reply with the title only, no quotes or punctuation.", messages: [{ role: "user", text: first.text.slice(0, 400) }], maxTokens: 24, temperature: 0.3, quiet: true });
    const clean = t.replace(/["\n*#]/g, "").trim().slice(0, 56); if (clean) { chat.title = clean; Store.saveChat(chat); UI.renderRail(); UI.renderTopbar(); }
  } catch (_) { /* keep the fallback title */ }
}
async function suggestFollowUps(chat, node) {
  if (!Store.settings.suggestions || !providerReady(chat) || Dev.smallDevice() || Dev.pending > 0) return;
  try {
    const t = await completeText(chat.provider, { model: chat.model, system: 'Suggest 3 short follow-up questions the user might ask next. Reply with a JSON array of strings only.', messages: [{ role: "user", text: `Question: ${chatPath(chat).filter((n) => n.role === "user").pop().text.slice(0, 300)}\nAnswer: ${node.text.slice(0, 700)}` }], maxTokens: 160, temperature: 0.7, quiet: true });
    const arr = JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1)); node.suggest = arr.filter((x) => typeof x === "string").slice(0, 3); Store.saveChat(chat); UI.updateNode(chat, node);
  } catch (_) {}
}
function stopChat(id = App.chatId) { const c = App.abort[id]; if (c) c.abort(); }
async function regenerate(nodeId, over) {
  const chat = curChat(), node = chat.nodes[nodeId]; if (!node || isBusy()) return;
  const user = chat.nodes[node.parent]; if (!user) return;
  await runTurn(chat, user, over);
}
// Copies the conversation up to a reply into a new chat so the user can take it in another direction.
function branchChat(nodeId) {
  const c = curChat(), path = chatPath(c), end = path.findIndex((n) => n.id === nodeId); if (end < 0) return;
  const nc = newChat({ title: c.title.replace(/ \(branch\)$/, "") + " (branch)", provider: c.provider, model: c.model, projectId: c.projectId, mode: c.mode, effort: c.effort, effortTouched: c.effortTouched, think: c.think });
  let parent = null;
  for (const n of path.slice(0, end + 1)) {
    const copy = JSON.parse(JSON.stringify({ role: n.role, text: n.text, atts: n.atts, model: n.model, provider: n.provider, mode: n.mode, sources: n.sources || [], gen: n.gen, artifacts: n.artifacts, deck: n.deck, report: n.report, usage: n.usage, rz: n.rz, hidden: n.hidden, steps: [] }));
    parent = addNode(nc, parent, copy).id;
  }
  Store.chats[nc.id] = nc; Store.saveChat(nc); openChat(nc.id); toast("Branched into a new chat", "ok");
}
// Image generation as a proper chat turn: the reply shows a placeholder, then the image.
async function runImageTurn(chat, prompt) {
  if (isBusy(chat.id)) return;
  const path = chatPath(chat), user = addNode(chat, path.length ? path[path.length - 1].id : null, { role: "user", text: "Generate an image: " + prompt });
  const ctl = new AbortController(); App.abort[chat.id] = ctl; App.busy.add(chat.id);
  const node = addNode(chat, user.id, { role: "assistant", text: "", pending: true, genPending: true, provider: chat.provider, model: "image", mode: "image", steps: [], sources: [] });
  if (chat.title === "New chat") chat.title = prompt.slice(0, 50);
  Store.saveChat(chat); UI.render({ scroll: true });
  try { const url = await generateImage(chat.provider, prompt, ctl.signal); node.gen = [await downscaleDataUrl(url, 1024, 380000)]; node.text = "Here is your image."; }
  catch (e) { if (e && e.name === "AbortError") node.stopped = true; else node.error = errView(e); }
  finally { node.pending = false; node.genPending = false; App.busy.delete(chat.id); delete App.abort[chat.id]; Store.saveChat(chat); UI.render(); UI.afterTurn(chat, node); }
}
async function editAndResend(nodeId, text) {
  const chat = curChat(), old = chat.nodes[nodeId]; if (!old || isBusy()) return;
  const user = addNode(chat, old.parent, { role: "user", text: text.trim(), atts: old.atts || [] });
  await runTurn(chat, user);
}
async function continueGeneration(nodeId) {
  const chat = curChat(), node = chat.nodes[nodeId]; if (!node || isBusy()) return;
  const user = addNode(chat, nodeId, { role: "user", text: "Continue exactly where you left off.", hidden: true });
  await runTurn(chat, user);
}

// JSON helper for tool-style prompts (agent, deck, research). Tolerates fences, prose around the JSON, trailing commas,
// comments, and output cut off by the token limit (open strings and brackets are closed).
function repairJson(str) {
  let out = "", inStr = false, esc = false; const stack = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i]; out += c;
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") stack.push("}"); else if (c === "[") stack.push("]"); else if ((c === "}" || c === "]") && stack[stack.length - 1] === c) stack.pop();
  }
  if (inStr) out += '"';
  out = out.replace(/[,:\s]+$/, "").replace(/,\s*([}\]])/g, "$1");
  if (/"[^"]*"\s*:$/.test(out)) out += "null";
  return out + stack.reverse().join("");
}
function extractJson(text) {
  let t = String(text || "").trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i); if (fence) t = fence[1].trim();  // only a fence wrapping the whole reply, never one inside a string
  const a = t.search(/[{[]/);
  const fail = () => { console.warn("Unparseable JSON from model:", t.slice(0, 160), "…", t.slice(-160)); return new ApiError("json_invalid", "The model returned malformed structured data.", `Retry, or try a more capable model. The reply ended with: “${t.slice(-70).replace(/\s+/g, " ")}”`); };
  if (a < 0) throw fail();
  const open = t[a], close = open === "{" ? "}" : "]", b = t.lastIndexOf(close), body = t.slice(a, b > a ? b + 1 : undefined);
  const repaired = repairJson(t.slice(a));
  // Cut off inside an object key leaves a key with no value: drop that last token and close again.
  const attempts = [body, body.replace(/,\s*([}\]])/g, "$1"), body.replace(/\/\/[^\n"]*$/gm, "").replace(/,\s*([}\]])/g, "$1"), repaired, repaired.replace(/,\s*"[^"]*"\s*([}\]]*)$/, "$1")];
  for (const x of attempts) { try { return JSON.parse(x); } catch (_) { /* try the next repair */ } }
  throw fail();
}
async function askJson(chat, system, userText, signal, maxTokens = 3000, { quiet = true, live = null } = {}) {
  // live = {node, step}: show "~N tokens written" and the reasoning summary while a long structured reply is generated.
  const call = (limit) => { const req = { model: chat.model, system, messages: [{ role: "user", text: userText }], temperature: 0.3, maxTokens: quiet ? limit : Math.min(64000, limit + reasoningReserve(chat)), noSummary: true, buffered: Dev.smallDevice() && limit >= 3000, ...(quiet ? { quiet: true } : { effort: effortFor(chat), think: chat.think }) }; return live ? completeLive(chat, live.node, req, signal, live.step) : completeText(chat.provider, req, signal); };
  const text = await call(maxTokens);
  try { return extractJson(text); }
  catch (e) {
    // Often the answer hit the token limit mid-way. Ask again with more room before giving up.
    if (e.code !== "json_invalid") throw e;
    return extractJson(await call(Math.min(Math.max(9000, maxTokens), Math.round(maxTokens * 1.8))));
  }
}
const addStep = (chat, node, label, detail = "") => { const s = { id: uid(), label, detail, state: "run" }; node.steps.push(s); refreshNode(chat, node); return s; };
const endStep = (chat, node, step, state = "done", detail) => { step.state = state; if (detail != null) step.detail = detail; refreshNode(chat, node); };
