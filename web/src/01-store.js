// Local data layer: IndexedDB (falls back to localStorage, then memory). Everything stays in this browser.
const DB_NAME = "chatesp2", KV = "kv";
const DEFAULT_SETTINGS = {
  theme: "auto", accent: "indigo", name: "", instructions: "", tone: "balanced", memoryOn: true,
  searchProvider: "duckduckgo", suggestions: true, agentApprove: false, nativeSearch: false, enterToSend: true, pinHash: "",
  provider: "", model: "", temperature: 0.7, effort: "medium", think: true, maxTokens: 4096, deepTokens: 16000, deepMinutes: 15, deepEffort: "high", onboarded: false, ttsVoice: "", favModels: [], recentModels: [], modelCache: {}, modelCacheTs: {}, dailyBudget: 0,
};
const Store = {
  settings: { ...DEFAULT_SETTINGS }, chats: {}, projects: {}, memory: [], personas: [], usage: {}, ready: false, mode: "idb",
  _idb: null, _timers: {},

  async open() {
    try {
      this._idb = await new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(KV);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (_) { this._idb = null; this.mode = safe(() => (localStorage.setItem("__t", "1"), localStorage.removeItem("__t"), "ls"), "mem"); }
    const all = await this._all();
    for (const [k, v] of all) {
      if (k === "settings") this.settings = { ...DEFAULT_SETTINGS, ...v };
      else if (k === "memory") this.memory = v || [];
      else if (k === "personas") this.personas = v || [];
      else if (k === "usage") this.usage = v || {};
      else if (k.startsWith("chat:")) { if (v.mode === "deck") v.mode = "design"; this.chats[v.id] = v; }
      else if (k.startsWith("project:")) this.projects[v.id] = v;
    }
    await this.migrateV1();
    this.ready = true;
  },
  _all() {
    if (this._idb) return new Promise((res) => {
      const out = []; const tx = this._idb.transaction(KV).objectStore(KV).openCursor();
      tx.onsuccess = () => { const c = tx.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
      tx.onerror = () => res(out);
    });
    if (this.mode === "ls") return Promise.resolve(Object.keys(localStorage).filter((k) => k.startsWith("ce2:")).map((k) => [k.slice(4), safe(() => JSON.parse(localStorage.getItem(k)))]).filter((x) => x[1]));
    return Promise.resolve([]);
  },
  _put(key, value) {
    if (this._idb) { try { this._idb.transaction(KV, "readwrite").objectStore(KV).put(value, key); } catch (e) { console.warn(e); } }
    else if (this.mode === "ls") safe(() => localStorage.setItem("ce2:" + key, JSON.stringify(value)));
  },
  _del(key) {
    if (this._idb) safe(() => this._idb.transaction(KV, "readwrite").objectStore(KV).delete(key));
    else if (this.mode === "ls") safe(() => localStorage.removeItem("ce2:" + key));
  },
  save(key, value, delay = 250) {
    clearTimeout(this._timers[key]);
    this._timers[key] = setTimeout(() => this._put(key, value), delay);
  },
  saveSettings() { this.save("settings", this.settings, 50); },
  saveChat(chat) { if (chat.temp || this.deleted.has(chat.id)) return; chat.updatedAt = Date.now(); this.save("chat:" + chat.id, chat); },
  deleted: new Set(),  // ids deleted this session: a reply still arriving must not re-save them
  deleteChat(id) { this.deleted.add(id); delete this.chats[id]; clearTimeout(this._timers["chat:" + id]); this._del("chat:" + id); },
  saveProject(p) { this.save("project:" + p.id, p); },
  deleteProject(id) { delete this.projects[id]; this._del("project:" + id); },
  saveMemory() { this.save("memory", this.memory, 100); },
  savePersonas() { this.save("personas", this.personas, 100); },

  // ---- Token usage: per local day, per provider|model. Counts come from provider responses; est = estimated. ----
  dayKey(d = new Date()) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
  addUsage(provider, model, input, output, est) {
    const day = (this.usage[this.dayKey()] = this.usage[this.dayKey()] || { models: {} });
    const m = (day.models[provider + "|" + model] = day.models[provider + "|" + model] || { in: 0, out: 0, calls: 0, est: 0 });
    m.in += Math.max(0, input | 0); m.out += Math.max(0, output | 0); m.calls++; if (est) m.est++;
    const keys = Object.keys(this.usage).sort(); while (keys.length > 62) delete this.usage[keys.shift()];
    this.save("usage", this.usage, 500);
    if (typeof UI !== "undefined" && UI.renderUsageChip) UI.renderUsageChip();
  },
  // Aggregates the last `days` days (1 = today). Returns totals, per-model rows sorted by tokens, and a per-day series.
  usageSummary(days = 1) {
    const models = {}, series = []; let tin = 0, tout = 0, calls = 0, est = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const k = this.dayKey(d), day = this.usage[k]; let dt = 0;
      if (day) for (const [key, m] of Object.entries(day.models)) {
        const r = (models[key] = models[key] || { key, provider: key.split("|")[0], model: key.split("|").slice(1).join("|"), in: 0, out: 0, calls: 0, est: 0 });
        r.in += m.in; r.out += m.out; r.calls += m.calls; r.est += m.est; tin += m.in; tout += m.out; calls += m.calls; est += m.est; dt += m.in + m.out;
      }
      series.push({ key: k, total: dt, date: d });
    }
    const rows = Object.values(models).map((r) => ({ ...r, total: r.in + r.out })).sort((a, b) => b.total - a.total);
    return { total: tin + tout, in: tin, out: tout, calls, est, rows, series };
  },
  async wipe() {
    if (this._idb) await new Promise((res) => { const r = this._idb.transaction(KV, "readwrite").objectStore(KV).clear(); r.onsuccess = r.onerror = res; });
    if (this.mode === "ls") Object.keys(localStorage).filter((k) => k.startsWith("ce2:")).forEach((k) => localStorage.removeItem(k));
    this.settings = { ...DEFAULT_SETTINGS }; this.chats = {}; this.projects = {}; this.memory = []; this.personas = []; this.usage = {};
  },
  exportAll() { return { app: "ChatESP", version: 2, exportedAt: new Date().toISOString(), settings: { ...this.settings, pinHash: "" }, chats: Object.values(this.chats), projects: Object.values(this.projects), memory: this.memory, personas: this.personas, usage: this.usage }; },
  importAll(data) {
    if (!data || data.app !== "ChatESP") throw new ApiError("import_invalid", "That file is not a ChatESP export.", "Choose a file created by Export data.");
    let n = 0;
    for (const c of data.chats || []) if (c && c.id && c.nodes) { this.chats[c.id] = c; this._put("chat:" + c.id, c); n++; }
    for (const p of data.projects || []) if (p && p.id) { this.projects[p.id] = p; this._put("project:" + p.id, p); }
    if (Array.isArray(data.memory)) { this.memory = data.memory; this.saveMemory(); }
    if (Array.isArray(data.personas)) { this.personas = data.personas; this.savePersonas(); }
    if (data.usage && typeof data.usage === "object") { this.usage = data.usage; this._put("usage", this.usage); }
    return n;
  },

  // v1 kept a flat list of {role, content} in localStorage "chatesp.v2". Convert once.
  async migrateV1() {
    if (this.settings.migratedV1) return;
    const raw = safe(() => JSON.parse(localStorage.getItem("chatesp.v2") || "[]"), []);
    if (Array.isArray(raw)) {
      for (const old of raw) {
        if (!old || !Array.isArray(old.messages) || !old.messages.length || this.chats["v1-" + old.id]) continue;
        const chat = newChat({ id: "v1-" + old.id, title: old.title || "Imported chat", provider: old.provider || "", model: old.model || "", temperature: old.temperature ?? 0.7 });
        chat.createdAt = chat.updatedAt = old.updatedAt || Date.now();
        let parent = null;
        for (const m of old.messages) parent = addNode(chat, parent, { role: m.role === "assistant" ? "assistant" : "user", text: String(m.content || "") }).id;
        this.chats[chat.id] = chat; this._put("chat:" + chat.id, chat);
      }
    }
    this.settings.migratedV1 = true; this.saveSettings();
  },
};

// Chat tree helpers: a chat is a tree of nodes; `sel` on each node picks the visible child (branching/versions).
function newChat(over = {}) {
  const s = Store.settings;
  return { id: uid(), title: "New chat", projectId: "", pinned: false, archived: false, temp: false, provider: s.provider, model: s.model, temperature: s.temperature, effort: s.effort, think: s.think !== false, system: "", mode: "chat", webSearch: false, createdAt: Date.now(), updatedAt: Date.now(), root: null, rootsList: [], rootSel: 0, nodes: {}, ...over };
}
function addNode(chat, parentId, data) {
  const node = { id: uid(), parent: parentId, children: [], sel: 0, ts: Date.now(), ...data };
  chat.nodes[node.id] = node;
  if (parentId) { const p = chat.nodes[parentId]; p.children.push(node.id); p.sel = p.children.length - 1; }
  else { chat.rootsList.push(node.id); chat.rootSel = chat.rootsList.length - 1; chat.root = node.id; }
  return node;
}
function chatPath(chat) {
  const out = []; let id = chat.rootsList[chat.rootSel] || null;
  while (id && chat.nodes[id]) { const n = chat.nodes[id]; out.push(n); id = n.children[n.sel] || null; }
  return out;
}
function siblingsOf(chat, node) {
  if (node.parent) return chat.nodes[node.parent].children;
  return chat.rootsList;
}
function selectSibling(chat, node, delta) {
  const sibs = siblingsOf(chat, node); const i = sibs.indexOf(node.id); const j = clamp(i + delta, 0, sibs.length - 1);
  if (node.parent) chat.nodes[node.parent].sel = j; else { chat.rootSel = j; chat.root = sibs[j]; }
}
function deleteSubtree(chat, id) {
  const n = chat.nodes[id]; if (!n) return; n.children.slice().forEach((c) => deleteSubtree(chat, c)); delete chat.nodes[id];
}
function chatsSorted(filter = () => true) {
  return Object.values(Store.chats).filter((c) => !c.archived && filter(c)).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
