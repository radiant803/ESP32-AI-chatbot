// Chat engine: builds prompts, runs streaming turns, and dispatches to agent / deck / research modes.
const App = { chatId: null, view: "chat", busy: new Set(), abort: {}, drafts: {}, atts: [], settingsTab: "providers", search: "", projectId: "" };
const MODES = {
  chat: { label: "Chat", icon: "sparkle", hint: "Ask anything" },
  agent: { label: "Agent", icon: "bolt", hint: "Plan, use tools and create files" },
  research: { label: "Research", icon: "flask", hint: "Search the web and write a cited report" },
  deck: { label: "Presentation", icon: "deck", hint: "Outline, design and export slides" },
};
const EFFORTS = ["minimal", "low", "medium", "high"];
const curChat = () => Store.chats[App.chatId];
const isBusy = (id = App.chatId) => App.busy.has(id);
const providerReady = (chat) => chat && chat.provider && chat.model && Dev.configured(chat.provider);

function systemPromptFor(chat, extra = "") {
  const s = Store.settings, parts = [];
  parts.push("You are ChatESP, a helpful assistant running through a small ESP microcontroller gateway. Be accurate, concise and well organised. Use Markdown. Today is " + new Date().toDateString() + ".");
  if (s.name) parts.push(`The user's name is ${s.name}.`);
  const tone = { concise: "Keep answers short and direct.", friendly: "Use a warm, friendly tone.", formal: "Use a formal, professional tone.", balanced: "" }[s.tone];
  if (tone) parts.push(tone);
  if (s.instructions) parts.push("User's custom instructions:\n" + s.instructions);
  if (s.memoryOn && Store.memory.length) parts.push("Things to remember about the user:\n" + Store.memory.map((m) => "- " + m.text).join("\n"));
  const proj = chat.projectId && Store.projects[chat.projectId];
  if (proj) { if (proj.instructions) parts.push(`Project "${proj.name}" instructions:\n${proj.instructions}`); (proj.files || []).forEach((f) => parts.push(`Project file ${f.name}:\n${String(f.text).slice(0, 6000)}`)); }
  if (chat.system) parts.push(chat.system);
  if (extra) parts.push(extra);
  return parts.join("\n\n");
}
// Convert the visible path into provider messages, trimmed to fit the device's request limit.
function pathMessages(chat, upto) {
  const path = chatPath(chat); const end = upto ? path.findIndex((n) => n.id === upto) : path.length;
  const msgs = path.slice(0, end < 0 ? path.length : end).filter((n) => (n.role === "user" || n.role === "assistant") && !n.error && !n.pending).map((n) => {
    let text = n.text || "";
    (n.atts || []).filter((a) => a.kind === "text").forEach((a) => { text = `[Attached file: ${a.name}]\n${a.text}\n[End of file]\n\n` + text; });
    if (n.role === "assistant" && n.artifacts && n.artifacts.length) text += "\n\n[Created files: " + n.artifacts.map((a) => a.name).join(", ") + "]";
    return { role: n.role, text, images: (n.atts || []).filter((a) => a.kind === "image").map((a) => ({ mime: a.mime, b64: a.data.split(",")[1] || "" })) };
  });
  return msgs;
}
function fitToLimit(provider, req) {
  // Drop oldest turns, then oldest images, until the encoded body fits the device limit.
  const limit = Dev.limits.bodyBytes - 600;
  for (let guard = 0; guard < 60; guard++) {
    const size = JSON.stringify(buildRequest(provider, req).body).length;
    if (size <= limit) return req;
    const withImg = req.messages.findIndex((m) => m.images && m.images.length);
    if (req.messages.length > 1 && (withImg < 0 || withImg >= req.messages.length - 1)) req.messages.shift();
    else if (withImg >= 0) req.messages[withImg].images = [];
    else break;
  }
  return req;
}
function baseRequest(chat, extraSystem, over = {}) {
  const s = Store.settings;
  return { model: chat.model, system: systemPromptFor(chat, extraSystem), messages: [], temperature: chat.temperature, effort: chat.effort || s.effort, think: chat.think !== false, maxTokens: s.maxTokens, search: !!chat.webSearch && Store.settings.nativeSearch, ...over };
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
async function runTurn(chat, userNode) {
  const ctl = new AbortController(); App.abort[chat.id] = ctl; App.busy.add(chat.id);
  const node = addNode(chat, userNode.id, { role: "assistant", text: "", pending: true, provider: chat.provider, model: chat.model, mode: chat.mode, steps: [], sources: [] });
  Store.saveChat(chat); UI.render({ scroll: true });
  try {
    if (chat.mode === "agent") await Agent.run(chat, node, userNode, ctl.signal);
    else if (chat.mode === "research") await Research.run(chat, node, userNode, ctl.signal);
    else if (chat.mode === "deck") await Deck.run(chat, node, userNode, ctl.signal);
    else await plainTurn(chat, node, userNode, ctl.signal);
  } catch (e) {
    if (e && e.name === "AbortError") { node.stopped = true; if (!node.text && !(node.artifacts || []).length && !node.report && !node.deck) node.text = ""; }
    else { console.error(e); const v = errView(e); node.error = v; }
  } finally {
    node.pending = false; App.busy.delete(chat.id); delete App.abort[chat.id];
    Store.saveChat(chat); UI.render({ scroll: false, final: node.id }); UI.afterTurn(chat, node);
  }
}
async function plainTurn(chat, node, userNode, signal) {
  const req = fitToLimit(chat.provider, baseRequest(chat, "", { messages: pathMessages(chat, node.id) }));
  let last = 0;
  const res = await streamChat(chat.provider, req, {
    onText: (d) => { node.text += d; const now = performance.now(); if (now - last > 60) { last = now; refreshNode(chat, node); } },
    onThink: (d) => { node.think = (node.think || "") + d; },
    onSource: (s) => node.sources.push(s),
  }, signal);
  node.text = res.text; node.usage = res.usage;
  { const rz = reasoningFor(chat.provider, chat.model, chat.effort, chat.think); if (rz) node.rz = rz.on ? (rz.level || "on") : "off"; }
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
async function regenerate(nodeId) {
  const chat = curChat(), node = chat.nodes[nodeId]; if (!node || isBusy()) return;
  const user = chat.nodes[node.parent]; if (!user) return;
  await runTurn(chat, user);
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

// JSON helper for tool-style prompts (agent, deck, research). Tolerates fences and prose around the JSON.
function extractJson(text) {
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) t = fence[1].trim();
  const a = t.search(/[{[]/); if (a < 0) throw new ApiError("json_invalid", "The model did not return structured data.", "Retry, or try a more capable model.");
  const open = t[a], close = open === "{" ? "}" : "]", b = t.lastIndexOf(close);
  try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {
    // Repair trailing commas, the most common slip.
    try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*([}\]])/g, "$1")); } catch (e) { throw new ApiError("json_invalid", "The model returned malformed structured data.", "Retry, or try a more capable model."); }
  }
}
async function askJson(chat, system, userText, signal, maxTokens = 3000) {
  const text = await completeText(chat.provider, { model: chat.model, system, messages: [{ role: "user", text: userText }], temperature: 0.3, maxTokens, quiet: true }, signal);
  return extractJson(text);
}
const addStep = (chat, node, label, detail = "") => { const s = { id: uid(), label, detail, state: "run" }; node.steps.push(s); refreshNode(chat, node); return s; };
const endStep = (chat, node, step, state = "done", detail) => { step.state = state; if (detail != null) step.detail = detail; refreshNode(chat, node); };
