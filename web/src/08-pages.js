// Pages: model picker, command palette, settings, files, projects, onboarding, lock screen.
const Setup = {
  nudge(chat) {
    if (!Object.keys(PROVIDERS).some((p) => Dev.configured(p))) { toast("Add a provider key first", "", "Open Settings → Providers."); App.view = "settings"; App.settingsTab = "providers"; UI.render(); return; }
    if (!Dev.configured(chat.provider)) chat.provider = Object.keys(PROVIDERS).find((p) => Dev.configured(p));
    openModelPicker();
  },
};

// ---- Model catalog selector ----
const fmtTokens = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n | 0));
const fmtCtx = (n) => (n >= 1e6 ? Math.round(n / 1e5) / 10 + "M" : Math.round(n / 1e3) + "K");
function pickModel(chat, provider, id) {
  chat.provider = provider; chat.model = id;
  const s = Store.settings; s.provider = provider; s.model = id;
  const key = provider + "|" + id; s.recentModels = [key, ...s.recentModels.filter((k) => k !== key)].slice(0, 4);
  Store.saveSettings(); Store.saveChat(chat);
}
async function openModelPicker(forChat) {
  const chat = forChat || curChat(), s = Store.settings;
  let q = "", prov = "all", cap = { vision: false, reasoning: false, fav: false }, sel = 0, rows = [];
  const m = openModal({ title: "Choose a model", cls: "palette mpk", body: `<div id="mp"></div>` });
  const body = m.el.querySelector(".modal-body"); body.style.padding = "0"; body.style.gap = "0";
  const isFav = (p, id) => s.favModels.includes(p + "|" + id);
  const gather = () => {
    const out = [];
    for (const p of Object.keys(PROVIDERS)) for (const x of Dev.models[p] || []) out.push({ p, ...x, caps: modelCaps(p, x.id) });
    return out;
  };
  const draw = (keepFocus) => {
    const root = m.el.querySelector("#mp"); if (!root) return;
    const all = gather(), needle = q.trim().toLowerCase();
    const match = (x) => (prov === "all" || x.p === prov) && (!needle || (x.id + " " + x.name + " " + PROVIDERS[x.p].label).toLowerCase().includes(needle)) && (!cap.vision || x.caps.vision) && (!cap.reasoning || x.caps.reasoning) && (!cap.fav || isFav(x.p, x.id));
    const shown = all.filter(match); rows = [];
    const row = (x) => { rows.push(x); const i = rows.length - 1, cur = chat.provider === x.p && chat.model === x.id; return `<div class="mp-row ${i === sel ? "kb" : ""} ${cur ? "cur" : ""}" data-i="${i}" role="option" aria-selected="${cur}"><span class="mp-dot" style="background:${PROVIDERS[x.p].color}"></span><span class="mp-name truncate">${esc(x.name)}${x.name !== x.id ? `<small class="mono">${esc(x.id)}</small>` : ""}</span><span class="mp-chips">${x.caps.vision ? '<span class="chip neutral">vision</span>' : ""}${x.caps.reasoning ? '<span class="chip neutral">reasoning</span>' : ""}${x.ctx ? `<span class="chip neutral">${fmtCtx(x.ctx)} ctx</span>` : ""}${x.size ? `<span class="chip neutral">${esc(x.size)}</span>` : ""}</span><button class="tool-btn ${isFav(x.p, x.id) ? "on" : ""}" data-fav="${i}" aria-label="Favourite" title="Favourite">${ico("pin", "sm")}</button><span class="mp-check">${cur ? ico("check", "sm") : ""}</span></div>`; };
    let list = "";
    if (!needle && prov === "all" && !cap.vision && !cap.reasoning && !cap.fav) {
      const rec = s.recentModels.map((k) => all.find((x) => x.p + "|" + x.id === k)).filter(Boolean), fav = s.favModels.map((k) => all.find((x) => x.p + "|" + x.id === k)).filter(Boolean);
      if (fav.length) list += `<div class="mp-group">${ico("pin", "sm")}Favourites</div>` + fav.map(row).join("");
      if (rec.length) list += `<div class="mp-group">${ico("refresh", "sm")}Recent</div>` + rec.map(row).join("");
    }
    for (const p of Object.keys(PROVIDERS)) {
      if (prov !== "all" && prov !== p) continue;
      const st = Dev.modelStatus[p] || {}, cfg = Dev.configured(p), items = shown.filter((x) => x.p === p);
      if (!cfg && (needle || cap.vision || cap.reasoning || cap.fav)) continue;
      list += `<div class="mp-group"><span class="mp-dot" style="background:${PROVIDERS[p].color}"></span>${esc(PROVIDERS[p].label)}<span class="muted">${cfg ? (Dev.models[p] ? items.length + (items.length !== (Dev.models[p] || []).length ? " of " + Dev.models[p].length : "") : "") : "not connected"}</span><span class="grow"></span>${st.state === "loading" || st.state === "refresh" ? `<span class="mp-spin">${ico("loader", "sm")}</span>` : ""}${cfg ? `<button class="tool-btn" data-refresh="${p}" aria-label="Refresh ${esc(PROVIDERS[p].label)} models" title="Refresh">${ico("refresh", "sm")}</button>` : ""}</div>`;
      if (!cfg) list += `<div class="mp-empty"><button class="btn sm" data-add>Add ${esc(PROVIDERS[p].label)}</button></div>`;
      else if (st.state === "err" && !Dev.models[p]) list += `<div class="mp-empty err"><b>${esc(st.msg || "Could not load models")}</b><span>${esc(st.hint || "")}</span></div>`;
      else if (!Dev.models[p]) list += Array.from({ length: 3 }, () => `<div class="mp-row"><div class="skeleton grow"></div></div>`).join("");
      else if (!items.length) list += `<div class="mp-empty">No matches</div>`;
      else list += items.map(row).join("");
    }
    sel = Math.min(sel, Math.max(0, rows.length - 1));
    const chips = [["all", "All"], ...Object.keys(PROVIDERS).map((p) => [p, PROVIDERS[p].label])].map(([k, l]) => `<button class="mp-pill ${prov === k ? "on" : ""}" data-prov="${k}">${k !== "all" ? `<span class="mp-dot" style="background:${PROVIDERS[k].color};opacity:${Dev.configured(k) ? 1 : 0.35}"></span>` : ""}${esc(l)}</button>`).join("");
    const caps = [["vision", "Vision", "eye"], ["reasoning", "Reasoning", "brain"], ["fav", "Favourites", "pin"]].map(([k, l, i]) => `<button class="mp-pill ${cap[k] ? "on" : ""}" data-cap="${k}">${ico(i, "sm")}${l}</button>`).join("");
    root.innerHTML = `<div class="mp-head"><div class="mp-search">${ico("search", "sm")}<input id="mq" placeholder="Search ${all.length || ""} models across providers…" value="${esc(q)}" autocomplete="off" aria-label="Search models"></div></div><div class="mp-filters">${chips}<span class="mp-sep"></span>${caps}</div><div class="mp-list" id="mpl" role="listbox">${list}</div><div class="mp-foot"><span class="muted">${all.length} models · from your connected providers</span><span class="grow"></span><span class="kbd">↑↓</span><span class="kbd">↵</span></div>`;
    if (keepFocus) { const i = root.querySelector("#mq"); i.focus(); i.setSelectionRange(q.length, q.length); }
    const kb = root.querySelector(".mp-row.kb, .mp-row.cur"); if (kb && !keepFocus) kb.scrollIntoView({ block: "center" });
  };
  const choose = (i) => { const x = rows[i]; if (!x) return; pickModel(chat, x.p, x.id); m.close(); UI.render(); };
  m.el.addEventListener("click", (e) => {
    const t = e.target;
    const f = t.closest("[data-fav]"); if (f) { const x = rows[+f.dataset.fav], k = x.p + "|" + x.id; s.favModels = s.favModels.includes(k) ? s.favModels.filter((y) => y !== k) : [k, ...s.favModels]; Store.saveSettings(); return draw(true); }
    const r = t.closest("[data-refresh]"); if (r) { const p = r.dataset.refresh; Dev.modelStatus[p] = { state: "refresh" }; draw(true); Dev.refreshModels(p).catch(() => {}).finally(() => draw(true)); return; }
    if (t.closest("[data-add]")) { m.close(); App.view = "settings"; App.settingsTab = "providers"; return UI.render(); }
    const p = t.closest("[data-prov]"); if (p) { prov = p.dataset.prov; sel = 0; return draw(true); }
    const c = t.closest("[data-cap]"); if (c) { cap[c.dataset.cap] = !cap[c.dataset.cap]; sel = 0; return draw(true); }
    const row = t.closest(".mp-row[data-i]"); if (row) choose(+row.dataset.i);
  });
  m.el.addEventListener("input", (e) => { if (e.target.id === "mq") { q = e.target.value; sel = 0; draw(true); } });
  m.el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % Math.max(1, rows.length); m.el.querySelectorAll(".mp-row").forEach((el) => el.classList.toggle("kb", +el.dataset.i === sel)); m.el.querySelector(`.mp-row[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter" && e.target.id === "mq") { e.preventDefault(); choose(sel); }
  });
  draw(); setTimeout(() => m.el.querySelector("#mq")?.focus(), 30);
  Dev.loadCatalog({ onUpdate: () => document.body.contains(m.el) && draw(document.activeElement && document.activeElement.id === "mq") });
}
ACTS["pick-model"] = () => openModelPicker();

// ---- Token usage ----
const USAGE_COLORS = ["#5b5bf0", "#0ea5a4", "#f59e0b", "#e11d48", "#8b5cf6", "#10b981", "#f97316", "#64748b"];
function usageColorMap(rows) { const m = {}; rows.forEach((r, i) => (m[r.key] = USAGE_COLORS[i % USAGE_COLORS.length])); return m; }
function stackBar(rows, total, colors, cls = "") {
  if (!total) return `<div class="stack empty ${cls}"></div>`;
  return `<div class="stack ${cls}">${rows.map((r) => `<i style="width:${(r.total / total) * 100}%;background:${colors[r.key]}" title="${esc(r.model)}: ${r.total.toLocaleString()} tokens"></i>`).join("")}</div>`;
}
function usageChipHTML() {
  const u = Store.usageSummary(1), colors = usageColorMap(u.rows), b = Store.settings.dailyBudget;
  const bar = b ? `<div class="stack"><i style="width:${Math.min(100, (u.total / b) * 100)}%;background:${u.total > b ? "var(--bad)" : "linear-gradient(90deg,var(--accent),var(--accent-2))"}"></i></div>` : stackBar(u.rows, u.total, colors);
  return `<button class="usage-chip" data-act="usage" aria-label="Token usage today"><div class="row"><span class="label">Today</span><span class="grow"></span><b>${fmtTokens(u.total)}</b><span class="muted">${b ? "/ " + fmtTokens(b) : "tokens"}</span></div>${bar}</button>`;
}
UI.renderUsageChip = () => { const el = $("usage-slot"); if (el) el.innerHTML = usageChipHTML(); };
function openUsage() {
  let range = 1;
  const m = openModal({ title: "Token usage", cls: "usage-modal", body: `<div id="us"></div>`, foot: `<button class="btn ghost danger sm" data-clear>Clear history</button><span class="grow"></span><button class="btn" data-close>Done</button>` });
  const draw = () => {
    const u = Store.usageSummary(range), colors = usageColorMap(u.rows), maxDay = Math.max(1, ...u.series.map((d) => d.total)), label = range === 1 ? "today" : range === 7 ? "in the last 7 days" : "in the last 30 days";
    const b = Store.settings.dailyBudget;
    $("us") && ($("us").innerHTML = `<div class="seg" style="align-self:flex-start">${[[1, "Today"], [7, "7 days"], [30, "30 days"]].map(([d, l]) => `<button data-r="${d}" class="${range === d ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="usage-hero"><div class="big">${u.total.toLocaleString()}</div><div class="muted">tokens ${label}${u.est ? ' · <span title="Some counts are estimated because the provider sent no usage data">includes estimates</span>' : ""}</div>
        <div class="io"><span><i class="dot" style="background:var(--accent)"></i>${u.in.toLocaleString()} in</span><span><i class="dot" style="background:var(--accent-2)"></i>${u.out.toLocaleString()} out</span><span>${u.calls} request${u.calls === 1 ? "" : "s"}</span></div></div>
      ${range === 1 && b ? `<div class="budget"><div class="row"><span class="label">Daily budget</span><span class="grow"></span><b>${Math.round((u.total / b) * 100)}%</b></div><div class="stack"><i style="width:${Math.min(100, (u.total / b) * 100)}%;background:${u.total > b ? "var(--bad)" : "linear-gradient(90deg,var(--accent),var(--accent-2))"}"></i></div></div>` : ""}
      ${range > 1 ? `<div class="spark" style="--n:${u.series.length}">${u.series.map((d) => `<div class="sp" title="${esc(d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}: ${d.total.toLocaleString()} tokens"><i style="height:${Math.max(d.total ? 4 : 1, (d.total / maxDay) * 100)}%"></i></div>`).join("")}</div>` : ""}
      ${stackBar(u.rows, u.total, colors, "lg")}
      <div class="u-list">${u.rows.length ? u.rows.map((r) => `<div class="u-row"><span class="mp-dot" style="background:${colors[r.key]}"></span><div class="grow" style="min-width:0"><div class="truncate" style="font-weight:600">${esc(r.model)}</div><div class="muted" style="font-size:12.5px">${esc(PROVIDERS[r.provider] ? PROVIDERS[r.provider].label : r.provider)} · ${r.calls} request${r.calls === 1 ? "" : "s"} · ${fmtTokens(r.in)} in / ${fmtTokens(r.out)} out</div></div><div class="u-num"><b>${r.total.toLocaleString()}</b><span class="muted">${Math.round((r.total / u.total) * 100)}%</span></div></div>`).join("") : `<div class="empty" style="border:0;padding:28px 12px">No tokens used ${range === 1 ? "today" : "yet"}.<br><span style="font-size:13px">Counts appear after your first reply.</span></div>`}</div>
      <p class="muted" style="font-size:12.5px;margin:0">Counts come from each provider's own response; “~” marks estimates (about 4 characters per token). History is kept in this browser for 60 days.</p>`);
    m.el.querySelectorAll("[data-r]").forEach((b2) => b2.addEventListener("click", () => { range = +b2.dataset.r; draw(); }));
  };
  m.el.querySelector("[data-clear]").addEventListener("click", async () => { if (await confirmDialog("Clear usage history?", "Removes the token counts stored in this browser.", "Clear", true)) { Store.usage = {}; Store.save("usage", {}, 0); UI.renderUsageChip(); draw(); } });
  draw();
}
ACTS.usage = () => openUsage();


// ---- Export / share ----
function chatToMarkdown(chat) {
  return `# ${chat.title}\n\n` + UI.visibleNodes(chat).map((n) => `**${n.role === "user" ? "You" : "ChatESP"}**\n\n${n.text || ""}`).join("\n\n---\n\n") + "\n";
}
ACTS["export-menu"] = (el) => {
  const c = curChat();
  openMenu(el, [
    { label: "Copy as Markdown", icon: "copy", fn: () => { copyText(chatToMarkdown(c)); toast("Copied", "ok", "", 1200); } },
    { label: "Download Markdown", icon: "download", fn: () => download(new Blob([chatToMarkdown(c)], { type: "text/markdown" }), safeFilename(c.title, "md")) },
    { label: "Download JSON", icon: "download", fn: () => download(new Blob([JSON.stringify(c, null, 1)], { type: "application/json" }), safeFilename(c.title, "json")) },
    { label: "Print / save as PDF", icon: "file", fn: () => setTimeout(() => print(), 50) },
  ], { align: "right" });
};

// ---- Compare ----
ACTS.compare = () => {
  const chat = curChat(); const users = chatPath(chat).filter((n) => n.role === "user" && !n.hidden); const last = users[users.length - 1];
  const opts = []; Object.keys(PROVIDERS).filter((p) => Dev.configured(p)).forEach((p) => (Dev.models[p] || []).slice(0, 80).forEach((x) => opts.push({ p, id: x.id })));
  const m = openModal({ title: "Compare models", cls: "palette", body: `<p class="muted" style="margin:0">Sends the ${last ? "last message" : "prompt below"} to two models side by side. Load models from the model picker first.</p>
    ${last ? "" : `<textarea class="input" id="cmp-q" rows="3" placeholder="Type a prompt"></textarea>`}
    <div class="row"><select class="input" id="cmp-a">${opts.map((o, i) => `<option value="${i}" ${o.p === chat.provider && o.id === chat.model ? "selected" : ""}>${PROVIDERS[o.p].label}: ${esc(o.id)}</option>`).join("")}</select><select class="input" id="cmp-b">${opts.map((o, i) => `<option value="${i}" ${i === Math.min(1, opts.length - 1) && opts.length > 1 ? "selected" : ""}>${PROVIDERS[o.p].label}: ${esc(o.id)}</option>`).join("")}</select></div>
    <div id="cmp-out" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div>`, foot: `<button class="btn" data-close>Close</button><button class="btn primary" id="cmp-go">Run both</button>` });
  if (opts.length < 2) m.el.querySelector(".modal-body").insertAdjacentHTML("afterbegin", `<div class="callout">Open the model picker for at least two providers/models to load them.</div>`);
  m.el.querySelector("#cmp-go").addEventListener("click", () => {
    const text = last ? last.text : m.el.querySelector("#cmp-q").value.trim(); if (!text) return;
    const out = m.el.querySelector("#cmp-out"); out.innerHTML = [0, 1].map((i) => `<div class="card pad"><div class="label truncate" id="ct${i}"></div><div class="md" id="co${i}"><div class="thinking"><i></i><i></i><i></i></div></div></div>`).join("");
    ["a", "b"].forEach(async (k, i) => {
      const o = opts[+m.el.querySelector("#cmp-" + k).value]; if (!o) return; m.el.querySelector("#ct" + i).textContent = o.id;
      let t = "";
      try { await streamChat(o.p, { model: o.id, system: systemPromptFor(chat), messages: pathMessages(chat, last ? chatPath(chat)[chatPath(chat).indexOf(last) + 1]?.id : undefined).concat(last ? [] : [{ role: "user", text }]), temperature: chat.temperature, maxTokens: 1500 }, { onText: (d) => { t += d; const el = m.el.querySelector("#co" + i); if (el) el.innerHTML = renderMarkdown(t); } }); }
      catch (e) { const el = m.el.querySelector("#co" + i); if (el) el.innerHTML = `<div class="err-card"><b>${esc(errView(e).message)}</b><span>${esc(errView(e).hint)}</span></div>`; }
    });
  });
};

// ---- Image generation / personas ----
function imageDialog() {
  const chat = curChat();
  const m = openModal({ title: "Generate an image", body: `<div class="field"><label for="ig">Describe the image</label><textarea class="input" id="ig" rows="3" placeholder="A watercolour of an ESP32 board on a desk, morning light"></textarea><span class="help">Uses ${esc(PROVIDERS[chat.provider]?.label || "your provider")} image generation (OpenAI or Gemini). Provider charges may apply.</span></div><div id="ig-out"></div>`, foot: `<button class="btn" data-close>Close</button><button class="btn primary" id="ig-go">Generate</button>` });
  m.el.querySelector("#ig-go").addEventListener("click", () => {
    const p = m.el.querySelector("#ig").value.trim(); if (!p) return;
    if (!["openai", "google"].includes(chat.provider)) { m.el.querySelector("#ig-out").innerHTML = `<div class="err-card"><b>Image generation needs OpenAI or Google.</b><span>Switch the model first.</span></div>`; return; }
    m.close(); runImageTurn(chat, p);
  });
}
function personaMenu() {
  const chat = curChat(), btn = $("composer");
  openMenu(btn, [...Store.personas.map((p) => ({ label: p.name, icon: "user", sel: chat.system === p.prompt, fn: () => { chat.system = chat.system === p.prompt ? "" : p.prompt; Store.saveChat(chat); toast(chat.system ? "Persona: " + p.name : "Persona cleared", "", "", 1500); } })), { sep: Store.personas.length ? 1 : 0 }, { label: "Manage personas…", icon: "settings", fn: () => { App.view = "settings"; App.settingsTab = "personal"; UI.render(); } }].filter((x) => !(x.sep === 0)), { up: true });
}

// ---- Command palette & shortcuts ----
ACTS.palette = () => {
  if (document.querySelector(".palette")) return;
  const cmds = [
    { t: "New chat", i: "plus", k: isMac() ? "⌘⇧O" : "Ctrl+Shift+O", f: () => newChatAction() },
    { t: "Chat mode", i: "sparkle", f: () => setMode("chat") }, { t: "Agent mode", i: "bolt", f: () => setMode("agent") }, { t: "Research mode", i: "flask", f: () => setMode("research") }, { t: "Design mode", i: "brush", f: () => setMode("design") },
    { t: "Token usage", i: "grid", f: () => openUsage() }, { t: "Choose model", i: "cpu", f: () => { App.view = "chat"; UI.render(); openModelPicker(); } },
    { t: "Open Settings", i: "settings", f: () => ACTS["go-settings"]() }, { t: "Providers & keys", i: "key", f: () => { App.settingsTab = "providers"; ACTS["go-settings"](); } }, { t: "Device status", i: "wifi", f: () => { App.settingsTab = "device"; ACTS["go-settings"](); } },
    { t: "Files on device", i: "file", f: () => ACTS["go-library"]() }, { t: "Projects", i: "folder", f: () => ACTS["go-projects"]() },
    { t: "Toggle theme", i: "moon", f: () => ACTS["cycle-theme"]() }, { t: "Toggle sidebar", i: "panel", k: isMac() ? "⌘B" : "Ctrl+B", f: () => UI.toggleRail() },
    { t: "Keyboard shortcuts", i: "cmd", k: "?", f: shortcutsDialog },
    { t: "Export this chat as Markdown", i: "download", f: () => curChat() && download(new Blob([chatToMarkdown(curChat())], { type: "text/markdown" }), safeFilename(curChat().title, "md")) },
  ];
  let sel = 0, items = [];
  const m = openModal({ cls: "palette", body: `<input id="pq" placeholder="Type a command or search chats…" autocomplete="off" aria-label="Command palette"><div class="pal-list" id="pl"></div>` });
  m.el.querySelector(".modal-body").style.padding = "0"; m.el.querySelector(".modal-body").style.gap = "0";
  const q = m.el.querySelector("#pq"), list = m.el.querySelector("#pl");
  const build = () => {
    const s = q.value.trim().toLowerCase();
    const cs = cmds.filter((c) => !s || c.t.toLowerCase().includes(s));
    const chats = s ? chatsSorted().filter((c) => c.title.toLowerCase().includes(s) || Object.values(c.nodes).some((n) => (n.text || "").toLowerCase().includes(s))).slice(0, 8).map((c) => ({ t: c.title, i: "sparkle", k: "Chat", f: () => openChat(c.id) })) : chatsSorted().slice(0, 4).map((c) => ({ t: c.title, i: "sparkle", k: "Recent", f: () => openChat(c.id) }));
    items = cs.concat(chats); sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((c, i) => `<button class="pal-item ${i === sel ? "on" : ""}" data-i="${i}">${ico(c.i, "sm")}<span class="truncate">${esc(c.t)}</span>${c.k ? `<small>${esc(c.k)}</small>` : ""}</button>`).join("") || `<div class="empty" style="border:0">Nothing found.</div>`;
  };
  const run = (i) => { const c = items[i]; if (c) { m.close(); setTimeout(c.f, 30); } };
  q.addEventListener("input", () => { sel = 0; build(); });
  q.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { sel = (sel + 1) % items.length; build(); e.preventDefault(); } else if (e.key === "ArrowUp") { sel = (sel - 1 + items.length) % items.length; build(); e.preventDefault(); } else if (e.key === "Enter") run(sel); });
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) run(+b.dataset.i); });
  build();
};
function setMode(k) { App.view = "chat"; const c = curChat(); c.mode = k; Store.saveChat(c); UI.render(); }
function shortcutsDialog() {
  const mod = isMac() ? "⌘" : "Ctrl";
  const rows = [["Command palette", `${mod} K`], ["New chat", `${mod} Shift O`], ["Toggle sidebar", `${mod} B`], ["Send message", "Enter"], ["New line", "Shift Enter"], ["Stop generating", "Esc"], ["Shortcut help", "?"]];
  openModal({ title: "Keyboard shortcuts", body: rows.map((r) => `<div class="row"><span class="grow">${r[0]}</span>${r[1].split(" ").map((k) => `<span class="kbd">${k}</span>`).join(" ")}</div>`).join("") });
}

// ---- Settings ----
const SET_TABS = [["providers", "key", "Providers"], ["models", "cpu", "Models"], ["personal", "user", "Personalization"], ["appearance", "sun", "Appearance"], ["tools", "globe", "Tools & search"], ["data", "archive", "Data & privacy"], ["device", "wifi", "Device"], ["about", "info", "About"]];
App.provStatus = {}; App.dev = {};
function providerCard(p) {
  const meta = ALL_PROVIDERS[p], cfg = Dev.config?.providers?.[p] || {}, ok = !!cfg.configured, url = meta.kind === "url", st = App.provStatus[p];
  return `<div class="card prov-card"><div class="prov-head"><span class="prov-logo" style="background:${meta.color}">${meta.short}</span><div class="grow"><b>${esc(meta.label)}</b><div class="muted" style="font-size:13px">${esc(meta.note)}</div></div>${ok ? `<span class="chip ok">${ico("check", "sm")}${url && cfg.host ? esc(cfg.host) : "Saved on device"}</span>` : `<span class="chip neutral">Not set</span>`}</div>
    <div class="field"><label for="cred-${p}">${url ? "LAN URL" : "API key"}</label><input class="input mono" id="cred-${p}" type="${url ? "url" : "password"}" autocomplete="off" spellcheck="false" placeholder="${ok ? (url ? "Enter a new URL to replace" : "Saved. Paste a new key to replace") : esc(meta.keyHint)}"><span class="help">${url ? "Use the machine's LAN IP, never localhost." : "Tested against the provider first; saved to the device only if it works. Never sent back to the browser."}</span></div>
    ${st ? `<div class="status ${st.kind}"><b>${esc(st.msg)}</b>${st.hint ? esc(st.hint) : ""}</div>` : ""}
    <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="prov-save" data-p="${p}">${ico("check", "sm")}Test &amp; Save</button>${ok && PROVIDERS[p] ? `<button class="btn" data-act="prov-refresh" data-p="${p}">${ico("refresh", "sm")}Refresh models</button>` : ""}${ok ? `<button class="btn danger" data-act="prov-del" data-p="${p}">${ico("trash", "sm")}Remove</button>` : ""}</div></div>`;
}
ACTS["prov-save"] = async (el) => {
  const p = el.dataset.p, v = $("cred-" + p).value.trim(); if (!v) { App.provStatus[p] = { kind: "bad", msg: ALL_PROVIDERS[p].kind === "url" ? "Enter a URL to test." : "Paste a key to test.", hint: "Nothing is saved until the provider accepts it." }; return Pages.render(App.view); }
  App.provStatus[p] = { kind: "", msg: "Testing…", hint: "Asking the provider for its model list." }; Pages.render(App.view); el = null;
  try {
    let n = "";
    if (PROVIDERS[p]) { const models = await Dev.testCredential(p, v); Dev.models[p] = models; n = `${models.length} live models found. `; }
    else await Dev.testCredential(p, v).catch((e) => { if (!(e instanceof ApiError) || e.code === "authentication_failed" || e.code === "gateway_unreachable") throw e; });
    await Dev.saveCredential(p, v);
    App.provStatus[p] = { kind: "ok", msg: "Saved on the device.", hint: n + "Pick a default model in Models." };
    if (!Store.settings.provider && PROVIDERS[p]) { Store.settings.provider = p; Store.saveSettings(); }
    const c = curChat(); if (c && !c.provider && PROVIDERS[p]) c.provider = p;
    UI.renderRail(); toast("Provider saved", "ok");
  } catch (e) { App.provStatus[p] = { kind: "bad", msg: errView(e).message, hint: errView(e).hint }; }
  Pages.render(App.view);
};
ACTS["prov-refresh"] = async (el) => { const p = el.dataset.p; try { const l = await Dev.refreshModels(p); toast(`${l.length} models loaded`, "ok"); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); } };
ACTS["prov-del"] = async (el) => { const p = el.dataset.p; if (!(await confirmDialog("Remove " + ALL_PROVIDERS[p].label + "?", "Deletes the saved credential from the device flash.", "Remove", true))) return; await Dev.deleteCredential(p); App.provStatus[p] = null; Pages.render(App.view); UI.render(); };

const Pages = {
  render(view) {
    const v = $("view");
    if (view === "settings") return (v.innerHTML = this.settings());
    if (view === "library") { v.innerHTML = this.library(); if (!App.files) this.loadFiles(); return; }
    if (view === "projects") return (v.innerHTML = this.projects());
    if (view === "project") return (v.innerHTML = this.project());
    if (view === "setup") return (v.innerHTML = this.setup());
  },
  shell(inner) { return `<div class="page"><div class="page-inner">${inner}</div></div>`; },
  settings() {
    const s = Store.settings, tab = App.settingsTab;
    const sw = (key, label, help) => `<label class="row" style="align-items:flex-start;gap:12px"><input type="checkbox" class="switch" data-set="${key}" ${s[key] ? "checked" : ""}><span class="grow"><b style="font-weight:600">${label}</b><br><span class="muted" style="font-size:13px">${help}</span></span></label>`;
    const models = (p) => (Dev.models[p] || []);
    let body = "";
    if (tab === "providers") body = `<div class="sec"><h2>Providers</h2><p class="muted" style="margin:0">Keys are stored in the device's flash and used only by the device. The browser never receives a saved key.</p><p class="muted" style="margin:0"><b>OpenAI works best.</b> Anthropic, Google Gemini and Agent mode are in beta and may be slow or unreliable, especially on the ESP8266.</p>${Object.keys(PROVIDERS).map(providerCard).join("")}</div>`;
    else if (tab === "models") body = `<div class="sec"><h2>Model defaults</h2><div class="card pad col" style="gap:16px">
      <div class="field"><label>Default provider</label><select class="input" data-set="provider">${["", ...Object.keys(PROVIDERS)].map((p) => `<option value="${p}" ${s.provider === p ? "selected" : ""}>${p ? PROVIDERS[p].label : "Ask each time"}</option>`).join("")}</select></div>
      <div class="field"><label>Default model</label><div class="row"><select class="input" data-set="model"><option value="">None</option>${models(s.provider).map((m) => `<option value="${esc(m.id)}" ${s.model === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}${s.model && !models(s.provider).some((m) => m.id === s.model) ? `<option selected value="${esc(s.model)}">${esc(s.model)}</option>` : ""}</select><button class="btn" data-act="load-default-models">${ico("refresh", "sm")}</button></div><span class="help">Only models returned live by the provider appear here.</span></div>
      <div class="field"><label>Temperature <b id="tv">${s.temperature}</b></label><input type="range" min="0" max="2" step="0.1" value="${s.temperature}" data-set="temperature"><span class="help">Ignored by reasoning models.</span></div>
      <div class="field"><label>Default reasoning effort</label><div class="seg" style="align-self:flex-start">${EFFORTS.map((e) => `<button data-act="set-effort" data-v="${e}" class="${s.effort === e ? "on" : ""}">${e}</button>`).join("")}</div><span class="help">Used for new chats with models that can reason. Each chat has its own slider next to the message box, showing only the levels that model supports.</span></div>
      ${sw("think", "Reasoning on by default", "Models that allow it start new chats with reasoning on. Titles and follow-up suggestions never use reasoning.")}
      <div class="field"><label>Chat: max response tokens</label><input class="input" type="number" min="256" max="32000" step="256" value="${s.maxTokens}" data-set="maxTokens"></div>
      <div class="field"><label>Agent &amp; Design: reasoning effort</label><div class="seg" style="align-self:flex-start">${["low", "medium", "high"].map((e) => `<button data-act="set-deep-effort" data-v="${e}" class="${(s.deepEffort || "high") === e ? "on" : ""}">${e}</button>`).join("")}</div><span class="help">Agent and Design start at this level and think harder than Chat. Move the slider next to the message box to change it for one chat.</span></div>
      <div class="field"><label>Agent &amp; Design: max output tokens per call</label><input class="input" type="number" min="2000" max="64000" step="1000" value="${s.deepTokens || 16000}" data-set="deepTokens"><span class="help">Room for long files, pages and plans. Models with a lower ceiling are detected automatically.</span></div>
      <div class="field"><label>Agent &amp; Design: time limit (minutes)</label><input class="input" type="number" min="2" max="60" step="1" value="${s.deepMinutes || 15}" data-set="deepMinutes"><span class="help">Work stops cleanly at the limit and keeps what was built. Chat is always short and capped.</span></div>
      <div class="field"><label>Daily token budget <span class="muted">(optional)</span></label><input class="input" type="number" min="0" step="10000" value="${s.dailyBudget || ""}" placeholder="No budget" data-set="dailyBudget"><span class="help">When set, the sidebar meter fills toward this number and turns red if you pass it. It never blocks requests.</span></div></div></div>`;
    else if (tab === "personal") body = `<div class="sec"><h2>Personalization</h2><div class="card pad col" style="gap:16px">
      <div class="field"><label>Your name</label><input class="input" data-set="name" value="${esc(s.name)}" maxlength="40"></div>
      <div class="field"><label>Tone</label><select class="input" data-set="tone">${["balanced", "concise", "friendly", "formal"].map((t) => `<option ${s.tone === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Custom instructions</label><textarea class="input" data-set="instructions" rows="4" maxlength="1500" placeholder="Anything the assistant should always know or do">${esc(s.instructions)}</textarea></div></div>
      <h2>Memory</h2><div class="card pad col">${sw("memoryOn", "Use memory", "Saved notes are added to every chat's context.")}${Store.memory.map((m) => `<div class="list-row" style="padding:8px 0"><span class="grow">${esc(m.text)}</span><button class="tool-btn" data-act="mem-del" data-id="${m.id}" aria-label="Delete">${ico("trash", "sm")}</button></div>`).join("") || '<span class="muted">Nothing remembered yet. Use the brain icon on a message, or add a note.</span>'}<div class="row"><input class="input" id="mem-in" placeholder="Remember that…" maxlength="300"><button class="btn" data-act="mem-add">Add</button></div></div>
      <h2>Personas</h2><div class="card pad col">${Store.personas.map((p) => `<div class="list-row" style="padding:8px 0"><div class="grow"><b>${esc(p.name)}</b><div class="muted truncate" style="max-width:420px">${esc(p.prompt)}</div></div><button class="tool-btn" data-act="persona-edit" data-id="${p.id}" aria-label="Edit">${ico("edit", "sm")}</button><button class="tool-btn" data-act="persona-del" data-id="${p.id}" aria-label="Delete">${ico("trash", "sm")}</button></div>`).join("") || '<span class="muted">Personas are reusable system prompts you can apply to a chat from the + menu.</span>'}<button class="btn" style="align-self:flex-start" data-act="persona-edit">${ico("plus", "sm")}New persona</button></div></div>`;
    else if (tab === "appearance") body = `<div class="sec"><h2>Appearance</h2><div class="card pad col" style="gap:16px"><div class="field"><label>Theme</label><div class="seg" style="align-self:flex-start">${["auto", "light", "dark"].map((t) => `<button data-act="set-theme" data-v="${t}" class="${s.theme === t ? "on" : ""}">${t}</button>`).join("")}</div></div>
      <div class="field"><label>Accent</label><div class="swatches">${[["indigo", "#5b5bf0"], ["teal", "#0d9488"], ["rose", "#e11d48"], ["amber", "#d97706"], ["graphite", "#3f3f46"]].map(([k, c]) => `<button class="swatch ${s.accent === k ? "on" : ""}" style="background:${c}" data-act="set-accent" data-v="${k}" aria-label="${k}"></button>`).join("")}</div></div>
      ${sw("enterToSend", "Enter sends", "Turn off to send with Ctrl/⌘+Enter and use Enter for new lines.")}${sw("suggestions", "Suggest follow-ups", "Uses a few extra tokens after each reply.")}</div></div>`;
    else if (tab === "tools") body = `<div class="sec"><h2>Web search</h2><div class="card pad col" style="gap:16px"><div class="field"><label>Search source for Agent and Research</label><select class="input" data-set="searchProvider">${[["wikipedia", "Wikipedia (free, no key)"], ["duckduckgo", "DuckDuckGo (free, no key, via device relay)"], ["searxng", "SearXNG (your own instance)"], ["tavily", "Tavily (API key)"], ["brave", "Brave Search (API key)"]].map(([k, l]) => `<option value="${k}" ${s.searchProvider === k ? "selected" : ""}>${l}</option>`).join("")}</select><span class="help">Wikipedia and DuckDuckGo cost nothing. Tavily and Brave give better results but have usage limits or fees set by those services.</span></div>
      ${sw("nativeSearch", "Offer provider-native web search", "Adds a Search toggle that uses OpenAI, Anthropic or Gemini built-in search. These can add charges on your provider account, so it is off by default.")}${sw("agentApprove", "Ask before the agent creates files", "Shows a confirmation for each file.")}</div>
      ${Object.keys(TOOL_PROVIDERS).map(providerCard).join("")}</div>`;
    else if (tab === "data") body = `<div class="sec"><h2>Data &amp; privacy</h2><div class="card pad col" style="gap:14px"><p style="margin:0;color:var(--ink-2)">${Object.keys(Store.chats).length} chats are stored in this browser (${Store.mode === "idb" ? "IndexedDB" : Store.mode === "ls" ? "localStorage" : "memory only"}). Provider keys never leave the device.</p><div class="row" style="flex-wrap:wrap"><button class="btn" data-act="export-all">${ico("download", "sm")}Export data</button><button class="btn" data-act="import-all">${ico("share", "sm")}Import data</button><button class="btn danger" data-act="wipe-all">${ico("trash", "sm")}Delete all chats</button></div><input type="file" id="imp" accept="application/json" hidden></div>
      <h2>Screen lock</h2><div class="card pad col"><p class="muted" style="margin:0">A PIN hides ChatESP in this browser. It is a privacy screen, not network security: anyone on your Wi-Fi can still reach the device API.</p><div class="row">${s.pinHash ? `<button class="btn" data-act="pin-clear">Remove PIN</button>` : `<input class="input" id="pin-in" type="password" inputmode="numeric" maxlength="12" placeholder="Choose a PIN" style="max-width:200px"><button class="btn" data-act="pin-set">Set PIN</button>`}</div></div>
      <h2>Notifications</h2><div class="card pad"><button class="btn" data-act="notif">Enable "reply ready" notifications</button></div></div>`;
    else if (tab === "device") body = this.deviceTab();
    else body = `<div class="sec"><h2>About ChatESP v2</h2><div class="card pad col"><p style="margin:0">ChatESP turns an ESP microcontroller into a private AI gateway. The device stores your provider keys and streams requests to OpenAI (recommended), Anthropic or Google Gemini (both beta). Everything else, including chats, agents (beta), research and design, runs in this browser.</p><b>Security notes</b><ul style="margin:0;padding-left:18px;color:var(--ink-2)"><li>Keep the device on a trusted LAN. There is no sign-in on the device API.</li><li>Cloud TLS certificates are not validated by the device (constrained hardware), so avoid untrusted networks.</li><li>Use scoped, low-limit provider keys and remove them before handing the device to anyone.</li><li>Generated code is never run. HTML previews are sandboxed.</li></ul></div></div>`;
    return this.shell(`<h1>Settings</h1><div class="settings"><nav class="tabs" aria-label="Settings sections">${SET_TABS.map(([k, i, l]) => `<button class="tab ${tab === k ? "on" : ""}" data-act="set-tab" data-v="${k}">${ico(i, "sm")}${l}</button>`).join("")}</nav><div>${body}</div></div>`);
  },
  deviceTab() {
    const h = Dev.health || {}, st = h.storage || {}, pct = st.totalBytes ? Math.round((st.usedBytes / st.totalBytes) * 100) : 0;
    const kv = (a, b) => `<div class="list-row"><span class="grow muted">${a}</span><span class="mono">${esc(b)}</span></div>`;
    return `<div class="sec"><h2>Device</h2><div class="card">${kv("Chip", (h.chip || "unknown") + (h.cores ? " · " + h.cores + " core" + (h.cores > 1 ? "s" : "") : ""))}${kv("Firmware", h.version || "unknown")}${kv("Address", (h.ip || "") + (h.hostname ? "  ·  " + h.hostname + ".local" : ""))}${kv("Wi-Fi", h.ssid ? h.ssid + " (" + (h.rssi || "?") + " dBm)" : "not connected")}${kv("Free memory", h.heapFree ? fmtBytes(h.heapFree) + " (min " + fmtBytes(h.heapMin || 0) + ")" : "unknown")}${kv("Request limit", fmtBytes(Dev.limits.bodyBytes))}${kv("Uptime", h.uptime ? Math.floor(h.uptime / 60) + " min" : "unknown")}
      <div class="list-row" style="flex-direction:column;align-items:stretch;gap:6px"><div class="row"><span class="grow muted">Storage</span><span class="mono">${fmtBytes(st.usedBytes)} / ${fmtBytes(st.totalBytes)}</span></div><div class="meter"><i style="width:${pct}%"></i></div></div></div>
      <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="dev-refresh">${ico("refresh", "sm")}Refresh</button><button class="btn" data-act="dev-reboot">${ico("power", "sm")}Restart device</button></div>
      <h2>Wi-Fi</h2><div class="card pad col"><div class="row"><input class="input" id="w-ssid" placeholder="Network name" list="w-list" autocomplete="off"><datalist id="w-list"></datalist><button class="btn" data-act="wifi-scan">Scan</button></div><input class="input" id="w-pass" type="password" placeholder="Password" autocomplete="off"><span class="help">The device reconnects and may change address. Then open the new address printed in the serial log or ${esc(h.hostname || "chatesp")}.local.</span><button class="btn primary" style="align-self:flex-start" data-act="wifi-save">Save and reconnect</button></div>
      <h2>Firmware update</h2><div class="card pad col"><span class="help">Upload a firmware .bin built for this chip. The device restarts when finished. Stored keys and files are kept.</span><div class="row"><input type="file" id="ota-file" accept=".bin"><button class="btn" data-act="ota">Upload</button></div><div class="progress hide" id="ota-bar"><i style="width:0"></i></div></div></div>`;
  },
  library() {
    const f = App.files, st = f && f.storage, list = (f && f.artifacts) || [], pct = st && st.totalBytes ? Math.round((st.usedBytes / st.totalBytes) * 100) : 0;
    return this.shell(`<div class="row"><div class="grow"><h1>Files</h1><p class="sub">Documents, decks and code stored on your device. Download or delete them any time.</p></div><button class="btn" data-act="lib-refresh">${ico("refresh", "sm")}Refresh</button></div>
      ${st ? `<div class="card pad col"><div class="row"><b>${fmtBytes(st.freeBytes)} free</b><span class="muted">of ${fmtBytes(st.totalBytes)}</span></div><div class="meter"><i style="width:${pct}%"></i></div></div>` : ""}
      <div class="card list">${!f ? Array.from({ length: 3 }, () => `<div class="list-row"><div class="skeleton grow" style="height:36px"></div></div>`).join("") : list.length ? list.map((a) => `<div class="list-row">${fileIcon(a.name)}<div class="grow"><div class="truncate" style="font-weight:600">${esc(a.name)}</div><div class="muted" style="font-size:12.5px">${fmtBytes(a.size)}</div></div>${TEXT_EXT.test(a.name) ? `<button class="btn sm" data-act="lib-preview" data-name="${esc(a.name)}">Preview</button>` : ""}<a class="btn sm" href="/api/artifacts/download?name=${encodeURIComponent(a.name)}" download>${ico("download", "sm")}</a><button class="btn sm danger" data-act="lib-del" data-name="${esc(a.name)}" aria-label="Delete">${ico("trash", "sm")}</button></div>`).join("") : `<div class="empty" style="border:0">No files yet. Ask Agent mode to create a document, spreadsheet or deck.</div>`}</div>`);
  },
  async loadFiles() { try { App.files = await Files.list(); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); App.files = { artifacts: [], storage: null }; } if (App.view === "library") $("view").innerHTML = this.library(); },
  projects() {
    const ps = Object.values(Store.projects).sort((a, b) => b.updatedAt - a.updatedAt);
    return this.shell(`<div class="row"><div class="grow"><h1>Projects</h1><p class="sub">Group chats with shared instructions and reference files.</p></div><button class="btn primary" data-act="proj-new">${ico("plus", "sm")}New project</button></div>
      ${ps.length ? `<div class="grid">${ps.map((p) => `<button class="tile" data-act="proj-open" data-id="${p.id}"><span class="ic file-ico" style="width:34px;height:34px">${ico("folder", "sm")}</span><h3>${esc(p.name)}</h3><p>${Object.values(Store.chats).filter((c) => c.projectId === p.id).length} chats · ${(p.files || []).length} files</p></button>`).join("")}</div>` : `<div class="empty">No projects yet.<br>Create one to keep related chats and files together.</div>`}`);
  },
  project() {
    const p = Store.projects[App.projectId]; if (!p) return this.projects();
    const chats = chatsSorted((c) => c.projectId === p.id);
    return this.shell(`<div class="row"><button class="icon-btn" data-act="go-projects" aria-label="Back">${ico("chevl")}</button><input class="title-input grow" style="font-size:22px" data-proj="name" value="${esc(p.name)}" aria-label="Project name"><button class="btn danger sm" data-act="proj-del">${ico("trash", "sm")}</button></div>
      <div class="field"><label>Project instructions</label><textarea class="input" rows="4" data-proj="instructions" placeholder="How should the assistant behave in this project?">${esc(p.instructions || "")}</textarea></div>
      <div class="field"><label>Reference files</label><div class="card list">${(p.files || []).map((f, i) => `<div class="list-row">${ico("file")}<span class="grow truncate">${esc(f.name)}</span><span class="muted">${fmtBytes(f.text.length)}</span><button class="tool-btn" data-act="proj-file-del" data-i="${i}" aria-label="Remove">${ico("x", "sm")}</button></div>`).join("") || '<div class="list-row muted">No files attached.</div>'}</div><div><button class="btn sm" data-act="proj-file-add">${ico("plus", "sm")}Add text file</button><input type="file" id="pf" accept=".txt,.md,.csv,.json,.html,.js,.py,.pdf" hidden></div><span class="help">File text is added to the context of every chat in this project, trimmed to fit the device's request limit.</span></div>
      <div class="row"><b class="grow">Chats</b><button class="btn primary sm" data-act="proj-chat">${ico("plus", "sm")}New chat here</button></div>
      <div class="card list">${chats.map((c) => `<div class="list-row" style="cursor:pointer" data-act="open-chat" data-id="${c.id}"><span class="grow truncate">${esc(c.title)}</span><span class="muted">${fmtDate(c.updatedAt)}</span></div>`).join("") || '<div class="list-row muted">No chats yet.</div>'}</div>`);
  },
  setup() {
    const step = App.setupStep || 0, any = Object.keys(PROVIDERS).find((p) => Dev.configured(p)), h = Dev.health || {};
    const bar = `<div class="stepper">${[0, 1, 2].map((i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>`;
    let body = "";
    if (step === 0) body = `<div class="orb hero" style="padding:0;width:64px;height:64px;border-radius:20px;background:conic-gradient(from 210deg,var(--accent),var(--accent-2),var(--accent));display:grid;place-items:center;color:#fff">${ico("cpu", "lg")}</div><h1 style="font:600 32px/1.15 var(--serif);margin:0">Welcome to ChatESP</h1><p class="muted" style="margin:0">A private AI workspace that lives on a tiny microcontroller. Your keys stay in its flash memory, and your chats stay in this browser.</p><div class="card pad col"><div class="row"><span class="dot ${Dev.online === false ? "bad" : "ok"}"></span><b>${Dev.online === false ? "Can't reach the device" : "Device connected"}</b></div><span class="muted" style="font-size:13.5px">${esc(h.chip || "ESP")} · ${esc(h.ip || location.host)} · ${fmtBytes(Dev.limits.bodyBytes)} request limit</span></div><button class="btn primary" data-act="setup-next">Get started ${ico("arrowr", "sm")}</button>`;
    else if (step === 1) body = `<h1 style="font:600 28px/1.15 var(--serif);margin:0">Connect a provider</h1><p class="muted" style="margin:0">Add at least one. You can add more later in Settings.</p>${Object.keys(PROVIDERS).map(providerCard).join("")}<div class="row"><button class="btn" data-act="setup-back">Back</button><span class="grow"></span><button class="btn primary" data-act="setup-next" ${any ? "" : "disabled"}>Continue ${ico("arrowr", "sm")}</button></div>`;
    else body = `<h1 style="font:600 28px/1.15 var(--serif);margin:0">Pick a default model</h1><p class="muted" style="margin:0">Models come live from your provider.</p><div class="card list" style="max-height:44vh;overflow:auto">${(Dev.models[any] || []).map((m) => `<button class="pal-item ${Store.settings.model === m.id ? "on" : ""}" data-act="setup-model" data-id="${esc(m.id)}" data-p="${any}"><span class="truncate">${esc(m.name)}</span></button>`).join("") || `<div class="list-row"><button class="btn" data-act="prov-refresh" data-p="${any}">Load models</button></div>`}</div><div class="row"><button class="btn" data-act="setup-back">Back</button><span class="grow"></span><button class="btn primary" data-act="setup-done">Start chatting</button></div>`;
    return `<div class="page"><div class="onboard">${bar}${body}</div></div>`;
  },
};
ACTS["set-tab"] = (el) => { App.settingsTab = el.dataset.v; Pages.render("settings"); };
ACTS["set-theme"] = (el) => { Store.settings.theme = el.dataset.v; Store.saveSettings(); UI.applyTheme(); Pages.render("settings"); };
ACTS["set-accent"] = (el) => { Store.settings.accent = el.dataset.v; Store.saveSettings(); UI.applyTheme(); Pages.render("settings"); };
ACTS["set-deep-effort"] = (el) => { Store.settings.deepEffort = el.dataset.v; Store.saveSettings(); Pages.render("settings"); };
ACTS["set-effort"] = (el) => { Store.settings.effort = el.dataset.v; Store.saveSettings(); Pages.render("settings"); };
ACTS["load-default-models"] = async () => { const p = Store.settings.provider; if (!p || !Dev.configured(p)) return toast("Choose a configured provider first."); try { await Dev.refreshModels(p); Pages.render("settings"); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); } };
document.addEventListener("change", (e) => {
  const t = e.target, k = t.dataset && t.dataset.set; if (!k) return;
  const s = Store.settings; s[k] = t.type === "checkbox" ? t.checked : t.type === "range" || t.type === "number" ? +t.value : t.value;
  if (k === "provider") { s.model = ""; Pages.render("settings"); } if (k === "temperature") { const tv = $("tv"); if (tv) tv.textContent = t.value; }
  Store.saveSettings(); if (App.view === "chat") UI.syncComposer();
  if (k === "searchProvider" || k === "nativeSearch") Pages.render("settings");
});
document.addEventListener("input", (e) => { const t = e.target; if (t.dataset && t.dataset.set === "temperature") { const tv = $("tv"); if (tv) tv.textContent = t.value; } if (t.dataset && t.dataset.proj) { const p = Store.projects[App.projectId]; if (p) { p[t.dataset.proj] = t.value; p.updatedAt = Date.now(); Store.saveProject(p); } } });
ACTS["mem-add"] = () => { const i = $("mem-in"), t = i.value.trim(); if (!t) return; Store.memory.push({ id: uid(), text: t }); Store.saveMemory(); Pages.render("settings"); };
ACTS["mem-del"] = (el) => { Store.memory = Store.memory.filter((m) => m.id !== el.dataset.id); Store.saveMemory(); Pages.render("settings"); };
ACTS["persona-edit"] = (el) => {
  const p = Store.personas.find((x) => x.id === el.dataset.id) || { id: uid(), name: "", prompt: "" };
  const m = openModal({ title: p.name ? "Edit persona" : "New persona", body: `<div class="field"><label>Name</label><input class="input" id="pn" value="${esc(p.name)}" maxlength="40"></div><div class="field"><label>System prompt</label><textarea class="input" id="pp" rows="6" maxlength="2000">${esc(p.prompt)}</textarea></div>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>` });
  m.el.querySelector("[data-ok]").addEventListener("click", () => { p.name = m.el.querySelector("#pn").value.trim(); p.prompt = m.el.querySelector("#pp").value.trim(); if (!p.name || !p.prompt) return; if (!Store.personas.includes(p)) Store.personas.push(p); Store.savePersonas(); m.close(); Pages.render("settings"); });
};
ACTS["persona-del"] = (el) => { Store.personas = Store.personas.filter((x) => x.id !== el.dataset.id); Store.savePersonas(); Pages.render("settings"); };
ACTS["export-all"] = () => download(new Blob([JSON.stringify(Store.exportAll())], { type: "application/json" }), "chatesp-export.json");
ACTS["import-all"] = () => { const i = $("imp"); i.onchange = async () => { try { const n = Store.importAll(JSON.parse(await readFileAs(i.files[0], "text"))); toast(`Imported ${n} chats`, "ok"); UI.render(); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); } }; i.click(); };
ACTS["wipe-all"] = async () => { if (!(await confirmDialog("Delete all chats?", "This clears every chat, project, memory and persona stored in this browser. Device keys are not affected.", "Delete everything", true))) return; await Store.wipe(); UI.applyTheme(); newChatAction(); App.view = "settings"; UI.render(); toast("Cleared", "ok"); };
ACTS["pin-set"] = async () => { const v = $("pin-in").value.trim(); if (v.length < 4) return toast("Use at least 4 digits"); Store.settings.pinHash = await sha256("chatesp:" + v); Store.saveSettings(); Pages.render("settings"); toast("PIN set", "ok"); };
ACTS["pin-clear"] = () => { Store.settings.pinHash = ""; Store.saveSettings(); Pages.render("settings"); };
ACTS.notif = async () => { if (!("Notification" in window)) return toast("Not supported here"); const r = await Notification.requestPermission(); toast(r === "granted" ? "Notifications on" : "Permission " + r); };
ACTS["dev-refresh"] = async () => { await Dev.bootstrap(); Pages.render("settings"); UI.renderRail(); };
ACTS["dev-reboot"] = async () => { if (!(await confirmDialog("Restart device?", "ChatESP will be unavailable for about 10 seconds.", "Restart"))) return; await Dev.json("/api/reboot", "POST", {}).catch(() => {}); toast("Restarting…"); };
ACTS["wifi-scan"] = async (el) => { el.disabled = true; try { const d = await Dev.json("/api/wifi/scan", "GET", null, 20000); $("w-list").innerHTML = (d.networks || []).map((n) => `<option value="${esc(n.ssid)}">${n.rssi} dBm</option>`).join(""); toast(`${(d.networks || []).length} networks found`); } catch (e) { toast(errView(e).message, "bad", errView(e).hint); } el.disabled = false; };
ACTS["wifi-save"] = async () => { const ssid = $("w-ssid").value.trim(); if (!ssid) return; if (!(await confirmDialog("Switch Wi-Fi?", "The device will reconnect to " + ssid + ". If it fails it falls back to its setup access point.", "Save"))) return; await Dev.json("/api/wifi", "PUT", { ssid, password: $("w-pass").value }).catch((e) => toast(errView(e).message, "bad")); toast("Saved. Reconnecting…"); };
ACTS.ota = () => {
  const f = $("ota-file").files[0]; if (!f) return toast("Choose a .bin file first.");
  const bar = $("ota-bar"); bar.classList.remove("hide"); const fd = new FormData(); fd.append("firmware", f, f.name);
  const x = new XMLHttpRequest(); x.open("POST", "/api/ota"); x.upload.onprogress = (e) => { bar.firstElementChild.style.width = (e.loaded / e.total) * 100 + "%"; };
  x.onload = () => toast(x.status === 200 ? "Update installed. Restarting…" : "Update failed", x.status === 200 ? "ok" : "bad"); x.onerror = () => toast("Upload interrupted", "bad"); x.send(fd);
};
ACTS["lib-refresh"] = () => { App.files = null; Pages.render("library"); };
ACTS["lib-del"] = async (el) => { if (!(await confirmDialog("Delete " + el.dataset.name + "?", "Removes it from device storage.", "Delete", true))) return; App.files = await Files.remove(el.dataset.name); Pages.render("library"); };
ACTS["lib-preview"] = async (el) => { const n = el.dataset.name; const r = await fetch("/api/artifacts/download?name=" + encodeURIComponent(n)); Canvas.show({ type: "text", title: n, text: await r.text(), name: n }); };
ACTS["proj-new"] = async () => { const name = await promptDialog("New project", "", "Project name"); if (!name) return; const p = { id: uid(), name: name.slice(0, 60), instructions: "", files: [], createdAt: Date.now(), updatedAt: Date.now() }; Store.projects[p.id] = p; Store.saveProject(p); App.projectId = p.id; App.view = "project"; UI.render(); };
ACTS["proj-open"] = (el) => { App.projectId = el.dataset.id; App.view = "project"; UI.render(); };
ACTS["proj-del"] = async () => { if (!(await confirmDialog("Delete project?", "Chats stay but are removed from the project.", "Delete", true))) return; const id = App.projectId; Object.values(Store.chats).forEach((c) => { if (c.projectId === id) { c.projectId = ""; Store.saveChat(c); } }); Store.deleteProject(id); App.view = "projects"; UI.render(); };
ACTS["proj-chat"] = () => { const c = newChatAction({ projectId: App.projectId }); };
ACTS["proj-file-add"] = () => { const i = $("pf"); i.onchange = async () => { const f = i.files[0]; if (!f) return; const text = /pdf$/i.test(f.name) ? await pdfText(f) : await readFileAs(f, "text"); const p = Store.projects[App.projectId]; p.files.push({ name: f.name, text: text.slice(0, 20000) }); Store.saveProject(p); UI.render(); }; i.click(); };
ACTS["proj-file-del"] = (el) => { const p = Store.projects[App.projectId]; p.files.splice(+el.dataset.i, 1); Store.saveProject(p); UI.render(); };
ACTS["setup-next"] = () => { App.setupStep = (App.setupStep || 0) + 1; if (App.setupStep === 2) { const p = Object.keys(PROVIDERS).find((x) => Dev.configured(x)); if (p && !Dev.models[p]) Dev.refreshModels(p).then(() => App.view === "setup" && Pages.render("setup")).catch(() => {}); } Pages.render("setup"); };
ACTS["setup-back"] = () => { App.setupStep = Math.max(0, (App.setupStep || 0) - 1); Pages.render("setup"); };
ACTS["setup-model"] = (el) => { Store.settings.provider = el.dataset.p; Store.settings.model = el.dataset.id; Store.saveSettings(); Pages.render("setup"); };
ACTS["setup-done"] = () => { const s = Store.settings; s.onboarded = true; if (!s.provider) s.provider = Object.keys(PROVIDERS).find((p) => Dev.configured(p)) || ""; Store.saveSettings(); const c = curChat(); if (c && !chatPath(c).length) { c.provider = s.provider; c.model = s.model; } App.view = "chat"; UI.render(); };

// ---- Lock screen ----
function lockScreen() {
  return new Promise((resolve) => {
    const m = openModal({ title: "ChatESP is locked", locked: true, body: `<div class="field"><label for="lk">PIN</label><input class="input" id="lk" type="password" inputmode="numeric" autocomplete="off" autofocus></div><div id="lk-e" class="muted"></div>`, foot: `<button class="btn primary" data-ok>Unlock</button>` });
    m.el.querySelector(".modal-head [data-close]")?.remove();
    const input = m.el.querySelector("#lk");
    const go = async () => { if ((await sha256("chatesp:" + input.value.trim())) === Store.settings.pinHash) { m.close(); resolve(); } else { m.el.querySelector("#lk-e").textContent = "Incorrect PIN."; input.value = ""; } };
    m.el.querySelector("[data-ok]").addEventListener("click", go); input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  });
}
