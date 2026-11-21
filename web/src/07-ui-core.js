// UI core: rail, top bar, thread, composer, model picker.
const UI = {
  init() {
    $("icons").innerHTML = "";
    $("scrim").addEventListener("click", () => this.setRail(false));
    this.applyTheme();
    matchMedia("(max-width: 900px)").addEventListener("change", () => this.render());
  },
  applyTheme() {
    const s = Store.settings, r = document.documentElement;
    r.dataset.theme = s.theme; r.dataset.accent = s.accent;
    const meta = document.querySelector('meta[name="color-scheme"]'); if (meta) meta.content = s.theme === "auto" ? "light dark" : s.theme;
  },
  mobile: () => matchMedia("(max-width: 900px)").matches,
  setRail(open) { $("app").dataset.rail = open ? "open" : "closed"; this.renderTopbar(); },
  toggleRail() { this.setRail($("app").dataset.rail !== "open"); },
  render(o = {}) { this.renderRail(); this.renderTopbar(); this.renderView(o); Canvas.refresh(); },

  // ---- Rail ----
  renderRail() {
    const q = App.search.trim().toLowerCase();
    const chats = chatsSorted((c) => !c.temp && (!q || c.title.toLowerCase().includes(q) || Object.values(c.nodes).some((n) => (n.text || "").toLowerCase().includes(q))));
    let html = "", group = "";
    chats.forEach((c) => {
      const g = c.pinned ? "Pinned" : dayBucket(c.updatedAt);
      if (g !== group) { group = g; html += `<div class="rail-group">${g}</div>`; }
      html += `<div class="chat-item ${c.id === App.chatId && App.view === "chat" ? "active" : ""}" data-act="open-chat" data-id="${c.id}" role="button" tabindex="0"><span class="t">${esc(c.title)}</span>${App.busy.has(c.id) ? '<span class="dot ok"></span>' : ""}<button class="more" data-act="chat-menu" data-id="${c.id}" aria-label="Chat options">${ico("more", "sm")}</button></div>`;
    });
    if (!chats.length) html = `<div class="muted" style="padding:16px 10px;font-size:13.5px">${q ? "No chats match your search." : "Your chats will appear here."}</div>`;
    const h = Dev.health, st = h && h.storage, pct = st && st.totalBytes ? Math.round((st.usedBytes / st.totalBytes) * 100) : 0;
    const nav = (act, icon, label, view, kbd = "") => `<button class="nav-item ${App.view === view ? "active" : ""}" data-act="${act}">${ico(icon)}<span>${label}</span>${kbd ? `<kbd>${kbd}</kbd>` : ""}</button>`;
    $("rail").innerHTML = `
      <div class="rail-head"><div class="brand"><span class="brand-mark">${ico("cpu")}</span>ChatESP<small>v2</small></div><span class="grow"></span><button class="icon-btn" data-act="toggle-rail" aria-label="Close sidebar">${ico("panel")}</button></div>
      <div class="rail-actions"><button class="nav-item primary" data-act="new-chat">${ico("plus")}<span>New chat</span><kbd>${isMac() ? "⌘⇧O" : "Ctrl+Shift+O"}</kbd></button>
        ${nav("go-projects", "folder", "Projects", "projects")}${nav("go-library", "file", "Files", "library")}${nav("palette", "search", "Search &amp; commands", "", isMac() ? "⌘K" : "Ctrl K")}</div>
      <div class="rail-search">${ico("search", "sm")}<input id="rail-q" placeholder="Search chats" value="${esc(App.search)}" aria-label="Search chats" autocomplete="off"></div>
      <div class="rail-list">${html}</div>
      <div class="rail-foot">
        <div class="device"><span class="dot ${Dev.online === false ? "bad" : h && h.wifiConnected !== false ? "ok" : "warn"}"></span><span class="truncate grow">${Dev.online === false ? "Device offline" : h ? `${esc(h.chip || "ESP")} · ${esc(h.ip || "")}` : "Connecting…"}</span>${h && h.rssi ? `<span>${esc(h.rssi)} dBm</span>` : ""}</div>
        <div id="usage-slot">${usageChipHTML()}</div>
        <div class="row"><button class="nav-item" data-act="go-settings" style="flex:1">${ico("settings")}<span>Settings</span></button><button class="icon-btn" data-act="cycle-theme" aria-label="Change theme" title="Theme">${ico(Store.settings.theme === "dark" ? "moon" : "sun")}</button></div>
      </div>`;
    const input = $("rail-q");
    input.addEventListener("input", debounce((e) => { App.search = e.target.value; this.renderRail(); $("rail-q").focus(); $("rail-q").setSelectionRange(App.search.length, App.search.length); }, 180));
  },

  // ---- Top bar ----
  renderTopbar() {
    const chat = curChat(), railOpen = $("app").dataset.rail === "open", inChat = App.view === "chat" && chat;
    const titles = { library: "Files", projects: "Projects", settings: "Settings", setup: "Welcome", project: "Project" };
    let html = railOpen && !this.mobile() ? "" : `<button class="icon-btn" data-act="toggle-rail" aria-label="Open sidebar">${ico("menu")}</button>`;
    if (inChat) {
      const prov = chat.provider && PROVIDERS[chat.provider];
      html += `<button class="model-pill" data-act="pick-model" aria-haspopup="dialog">${prov ? `<span class="prov">${esc(prov.label)}</span>` : ""}<span class="truncate">${chat.model ? esc(chat.model) : "Choose a model"}</span>${ico("chevd", "sm")}</button>
        <input class="title-input hide-sm grow" id="title-input" value="${esc(chat.title)}" aria-label="Chat title" maxlength="72">`;
      if (chat.temp) html += `<span class="chip neutral">${ico("lock", "sm")}Temporary</span>`;
      html += `<span class="grow hide-sm"></span>
        <button class="icon-btn ${chat.temp ? "on" : ""}" data-act="toggle-temp" aria-label="Temporary chat" title="Temporary chat (not saved)">${ico("lock")}</button>
        <button class="icon-btn" data-act="compare" aria-label="Compare models" title="Compare with another model">${ico("compare")}</button>
        <button class="icon-btn" data-act="export-menu" aria-label="Share and export" title="Share and export">${ico("share")}</button>
        <button class="icon-btn ${$("app").dataset.canvas === "open" ? "on" : ""}" data-act="toggle-canvas" aria-label="Canvas" title="Canvas">${ico("panel")}</button>`;
    } else html += `<span class="grow" style="font-weight:620;font-size:16px">${titles[App.view] || ""}</span>`;
    $("topbar").innerHTML = html;
    const ti = $("title-input");
    if (ti) { ti.addEventListener("change", () => { chat.title = ti.value.trim() || "New chat"; Store.saveChat(chat); this.renderRail(); }); ti.addEventListener("keydown", (e) => e.key === "Enter" && ti.blur()); }
  },

  renderView(o = {}) {
    const v = $("view");
    if (App.view !== "chat") { v.dataset.shell = ""; v.innerHTML = ""; Pages.render(App.view); return; }
    if (v.dataset.shell !== "chat") { v.dataset.shell = "chat"; v.innerHTML = this.shellHTML(); this.bindComposer(); }
    this.renderThread(o); this.syncComposer();
  },
  shellHTML() {
    return `<div class="thread" id="thread"><div class="thread-inner" id="thread-inner"></div></div>
      <div class="composer-wrap"><div class="composer" id="composer">
        <div class="tray" id="tray"></div>
        <textarea id="prompt" rows="1" placeholder="Message ChatESP" aria-label="Message"></textarea>
        <div class="bar"><button class="icon-btn" data-act="attach-menu" aria-label="Add" title="Add files and tools">${ico("plus")}</button>
          <button class="mode-chip" id="mode-chip" data-act="mode-menu"></button>
          <button class="mode-chip" id="rz-chip" data-act="reasoning" aria-haspopup="dialog"></button>
          <button class="mode-chip hide-sm" id="web-chip" data-act="toggle-web" title="Use the provider's built-in web search (may incur provider cost)">${ico("globe", "sm")}Search</button>
          <span class="grow"></span>
          <button class="icon-btn" id="mic" data-act="mic" aria-label="Dictate" title="Dictate">${ico("mic")}</button>
          <button class="send" id="send" data-act="send" aria-label="Send">${ico("send")}</button></div>
      </div><div class="composer-note" id="note"></div></div><div class="drop">${ico("paperclip")}&nbsp;Drop files to attach</div>
      <input type="file" id="file-in" multiple hidden accept="image/*,.txt,.md,.csv,.json,.pdf,.html,.js,.ts,.py,.cpp,.h,.css">`;
  },
  bindComposer() {
    const ta = $("prompt"), v = $("view");
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; };
    ta.addEventListener("input", () => { grow(); App.drafts[App.chatId] = ta.value; });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && (Store.settings.enterToSend || e.metaKey || e.ctrlKey) && !this.mobile()) { e.preventDefault(); ACTS.send(); }
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ACTS.send(); }
    });
    ta.addEventListener("paste", (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); this.addFiles(fs); } });
    $("file-in").addEventListener("change", (e) => { this.addFiles([...e.target.files]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((t) => v.addEventListener(t, (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); v.classList.add("dragging"); } }));
    ["dragleave", "drop"].forEach((t) => v.addEventListener(t, (e) => { if (t === "drop" || e.target === v) v.classList.remove("dragging"); }));
    v.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); this.addFiles([...e.dataTransfer.files]); } });
    v.addEventListener("click", (e) => { const s = e.target.closest("[data-suggest]"); if (s) { startSend(s.dataset.suggest); } const st = e.target.closest("[data-starter]"); if (st) { const ta2 = $("prompt"); ta2.value = st.dataset.starter; ta2.focus(); grow(); App.drafts[App.chatId] = ta2.value; } });
    $("thread").addEventListener("scroll", () => { this.stick = this.nearBottom(); });
  },
  stick: true,
  nearBottom() { const t = $("thread"); return !t || t.scrollHeight - t.scrollTop - t.clientHeight < 160; },
  scrollBottom(force) { const t = $("thread"); if (t && (force || this.stick)) t.scrollTop = t.scrollHeight; },
  syncComposer() {
    const chat = curChat(); if (!chat) return;
    const ta = $("prompt"), busy = isBusy(), mode = MODES[chat.mode] || MODES.chat;
    if (document.activeElement !== ta || ta.dataset.chat !== chat.id) { if (ta.dataset.chat !== chat.id) { ta.value = App.drafts[chat.id] || ""; ta.dataset.chat = chat.id; } }
    ta.placeholder = chat.mode === "chat" ? "Message ChatESP" : mode.hint + "…";
    $("mode-chip").className = "mode-chip " + (chat.mode !== "chat" ? "on" : ""); $("mode-chip").innerHTML = ico(mode.icon, "sm") + esc(mode.label) + ico("chevd", "sm");
    const rz = reasoningFor(chat.provider, chat.model, chat.effort, chat.think), rzc = $("rz-chip");
    rzc.style.display = rz ? "" : "none";
    if (rz) { rzc.className = "mode-chip " + (rz.on ? "on" : ""); rzc.innerHTML = ico("brain", "sm") + `<span class="hide-sm">Reasoning</span><b>${rz.on ? (rz.level ? esc(rz.level[0].toUpperCase() + rz.level.slice(1)) : "On") : "Off"}</b>`; rzc.title = "Reasoning effort"; }
    $("web-chip").className = "mode-chip hide-sm " + (chat.webSearch ? "on" : ""); $("web-chip").style.display = Store.settings.nativeSearch ? "" : "none";
    const send = $("send"); send.className = "send " + (busy ? "stop" : ""); send.innerHTML = ico(busy ? "stop" : "send"); send.setAttribute("aria-label", busy ? "Stop" : "Send");
    $("mic").style.display = window.SpeechRecognition || window.webkitSpeechRecognition ? "" : "none";
    $("tray").innerHTML = App.atts.map((a, i) => `<span class="attach">${a.kind === "image" ? `<img alt="" src="${a.data}">` : ico("file")}<span class="truncate">${esc(a.name)}</span><button class="tool-btn" data-act="rm-att" data-i="${i}" aria-label="Remove">${ico("x", "sm")}</button></span>`).join("");
    $("tray").style.display = App.atts.length ? "" : "none";
    const lim = Dev.limits.bodyBytes;
    $("note").textContent = chat.temp ? "Temporary chat: nothing is saved in this browser." : `Keys stay on the ${Dev.health?.chip || "ESP"}. Chats stay in this browser.${lim < 12000 ? " This device has a small request limit; long chats are trimmed." : ""}`;
    const g = $("prompt"); g.style.height = "auto"; g.style.height = Math.min(g.scrollHeight, 220) + "px";
  },
  async addFiles(files) {
    for (const f of files) {
      try {
        if (f.type.startsWith("image/")) {
          if (Dev.limits.bodyBytes < 20000) throw new ApiError("small_device", "Images need more request memory than this device offers.", "Use an ESP32, or attach a text file instead.");
          const caps = modelCaps(curChat().provider, curChat().model);
          if (!caps.vision) toast("This model may not understand images.", "", "Pick a vision-capable model if the reply ignores it.");
          App.atts.push({ kind: "image", name: f.name, mime: "image/jpeg", data: await shrinkImage(f, Math.floor(Dev.limits.bodyBytes * 0.45)) });
        } else if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          const text = await pdfText(f); App.atts.push({ kind: "text", name: f.name, text: text.slice(0, Math.floor(Dev.limits.bodyBytes * 0.5)) });
        } else {
          const text = await readFileAs(f, "text"); if (/[\u0000-\u0008]/.test(text.slice(0, 2000))) throw new ApiError("file_binary", "That file type can't be read as text.", "Attach text, code, CSV, JSON, PDF or an image.");
          App.atts.push({ kind: "text", name: f.name, text: text.slice(0, Math.floor(Dev.limits.bodyBytes * 0.5)) });
          if (text.length > Dev.limits.bodyBytes * 0.5) toast(`${f.name} was shortened`, "", `This device accepts about ${fmtBytes(Dev.limits.bodyBytes)} per request.`);
        }
      } catch (e) { toast(errView(e).message, "bad", errView(e).hint); }
    }
    this.syncComposer();
  },

  // ---- Thread ----
  visibleNodes(chat) { return chatPath(chat).filter((n) => !n.hidden); },
  renderThread(o = {}) {
    const chat = curChat(); if (!chat) return;
    const inner = $("thread-inner"); const nodes = this.visibleNodes(chat);
    if (!nodes.length) { inner.innerHTML = this.heroHTML(chat); this.stick = true; return; }
    const lastAsst = [...nodes].reverse().find((n) => n.role === "assistant");
    inner.innerHTML = nodes.map((n) => this.msgHTML(chat, n, lastAsst && n.id === lastAsst.id)).join("");
    if (o.scroll) { this.stick = true; this.scrollBottom(true); } else this.scrollBottom();
  },
  updateNode(chat, node) {
    if (chat.id !== App.chatId) return;
    const el = document.querySelector(`[data-node="${node.id}"]`); if (!el) return;
    const last = this.visibleNodes(chat).filter((n) => n.role === "assistant").pop();
    const tmp = document.createElement("div"); tmp.innerHTML = this.msgHTML(chat, node, last && last.id === node.id);
    const open = [...el.querySelectorAll("details[open]")].length > 0;
    el.replaceWith(tmp.firstElementChild);
    this.scrollBottom();
  },
  afterTurn(chat, node) {
    this.syncComposer(); this.renderRail();
    if (node.error || node.stopped) return;
    // Best-effort extras, one after the other: a model-written title for a new chat, then follow-up suggestions.
    if (node.mode === "chat" || !node.mode) {
      const firstExchange = this.visibleNodes(chat).length <= 2 && chat.title === (this.visibleNodes(chat)[0].text || "").replace(/\s+/g, " ").slice(0, 56);
      (firstExchange ? autoTitle(chat) : Promise.resolve()).then(() => suggestFollowUps(chat, node)).catch(() => {});
    }
    if (node.report && chat.id === App.chatId) Canvas.show({ type: "report", chatId: chat.id, nodeId: node.id }, true);
    if (node.deck && chat.id === App.chatId) Canvas.show({ type: "deck", chatId: chat.id, nodeId: node.id }, true);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") safe(() => new Notification("ChatESP", { body: chat.title + " is ready" }));
  },
  heroHTML(chat) {
    const h = new Date().getHours(), s = Store.settings, name = s.name ? ", " + esc(s.name.split(" ")[0]) : "";
    const hello = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const S = {
      chat: [["sparkle", "Explain something", "Break down a tricky idea step by step.", "Explain how a transformer neural network works, step by step, for a curious beginner."], ["code", "Write code", "Draft, review or debug a snippet.", "Write a small Python script that renames files by date taken and explain how it works."], ["list", "Plan something", "Turn a rough goal into a plan.", "Help me plan a three-day trip to Kyoto on a modest budget."], ["edit", "Improve my writing", "Rewrite for clarity and tone.", "Rewrite this to be clearer and friendlier: "]],
      agent: [["file", "Make a document", "Research-free reports, briefs, memos.", "Create a one-page project brief for a home energy monitor built on an ESP32 and save it as a Word document."], ["grid", "Build a spreadsheet", "Budgets, trackers, comparisons.", "Create a monthly budget spreadsheet with income, fixed costs, variable costs and a savings goal."], ["deck", "Make a deck", "A full PPTX from a brief.", "Make a 6-slide presentation introducing the ESP32 to hobbyists."], ["globe", "Look it up and summarise", "Search, read, then answer.", "Find the current stable version of PlatformIO and summarise what changed recently."]],
      research: [["flask", "Deep dive", "Cited report from multiple sources.", "Research the current state of small on-device language models and write a cited report."], ["globe", "Compare options", "Pros, cons and sources.", "Compare MQTT, CoAP and HTTP for low-power IoT sensors, with sources."], ["info", "Fact-check a claim", "Check it against sources.", "Is it true that Wi-Fi 6E uses the 6 GHz band? Check against sources."], ["list", "Learn a topic", "A structured primer with links.", "Give me a researched primer on how LoRaWAN works."]],
      deck: [["deck", "Pitch deck", "Problem, solution, traction, ask.", "A 10-slide pitch deck for a pocket-sized AI gateway called ChatESP."], ["list", "Lesson slides", "Teach a topic in 8 slides.", "An 8-slide lesson on how the internet routes a web request."], ["grid", "Quarterly update", "Numbers with charts.", "A 7-slide quarterly business update with a revenue bar chart and a growth line chart."], ["sparkle", "Story talk", "A short narrative talk.", "A 6-slide lightning talk about why I built an AI chatbot on a microcontroller."]],
    }[chat.mode] || [];
    const need = !providerReady(chat);
    return `<div class="hero"><div class="orb">${ico("sparkle", "lg")}</div><h1>${hello}${name}.<br>What shall we work on?</h1><p>${esc((MODES[chat.mode] || MODES.chat).hint)}. Your keys stay on the device; your chats stay in this browser.</p>
      ${need ? `<div class="callout" style="width:100%;text-align:left">${ico("key")}<span class="grow">${Dev.configured(chat.provider) ? "Choose a model to start chatting." : "Add a provider key to start chatting."}</span><button class="btn primary sm" data-act="${Dev.configured(chat.provider) ? "pick-model" : "go-settings"}">${Dev.configured(chat.provider) ? "Choose model" : "Add key"}</button></div>` : ""}
      <div class="starters">${S.map((x) => `<button class="starter" data-starter="${esc(x[3])}"><span class="ic">${ico(x[0], "sm")}</span><b>${esc(x[1])}</b><span>${esc(x[2])}</span></button>`).join("")}</div></div>`;
  },
  msgHTML(chat, n, isLast) {
    const sibs = siblingsOf(chat, n), idx = sibs.indexOf(n.id);
    const pager = sibs.length > 1 ? `<span class="pager"><button class="tool-btn" data-act="sib" data-id="${n.id}" data-d="-1" ${idx === 0 ? "disabled" : ""} aria-label="Previous version">${ico("chevl", "sm")}</button>${idx + 1}/${sibs.length}<button class="tool-btn" data-act="sib" data-id="${n.id}" data-d="1" ${idx === sibs.length - 1 ? "disabled" : ""} aria-label="Next version">${ico("chev", "sm")}</button></span>` : "";
    if (n.role === "user") {
      const atts = (n.atts || []).length ? `<div class="attach-row">${n.atts.map((a) => `<span class="attach">${a.kind === "image" ? `<img alt="" src="${a.data}">` : ico("file")}<span class="truncate">${esc(a.name)}</span></span>`).join("")}</div>` : "";
      return `<div class="msg user ${isLast ? "last" : ""}" data-node="${n.id}">${atts}${n.text ? `<div class="body">${esc(n.text)}</div>` : ""}<div class="tools">${pager}<button class="tool-btn" data-act="copy-msg" data-id="${n.id}" aria-label="Copy" title="Copy">${ico("copy", "sm")}</button><button class="tool-btn" data-act="edit-msg" data-id="${n.id}" aria-label="Edit" title="Edit and resend">${ico("edit", "sm")}</button><button class="tool-btn" data-act="remember" data-id="${n.id}" aria-label="Remember" title="Remember this">${ico("brain", "sm")}</button></div></div>`;
    }
    const mode = n.mode || "chat", sources = n.sources || [];
    const cite = mode === "research" || sources.length ? sources : null;
    let steps = "";
    if ((n.steps || []).length) {
      const running = n.steps.some((s) => s.state === "run");
      steps = `<details class="steps" ${n.pending || running ? "open" : ""}><summary>${n.pending ? ico("loader", "sm") : ico("check", "sm")}<span class="grow">${n.pending ? "Working…" : `${n.steps.length} steps`}</span>${ico("chevd", "sm")}</summary>${n.steps.map((s) => `<div class="step ${s.state}"><span class="si">${ico(s.state === "err" ? "x" : s.state === "run" ? "loader" : "check", "sm")}</span><div class="grow"><div>${esc(s.label)}</div>${s.detail ? `<div class="sd">${esc(s.detail)}</div>` : ""}</div></div>`).join("")}</details>`;
    }
    const think = n.think ? `<details class="steps"><summary>${ico("brain", "sm")}<span class="grow">Reasoning summary</span>${ico("chevd", "sm")}</summary><div class="step"><div class="sd" style="white-space:pre-wrap">${esc(n.think)}</div></div></details>` : "";
    const body = n.text ? `<div class="md ${n.pending ? "caret" : ""}">${renderMarkdown(n.text, cite)}</div>` : n.pending && !(n.steps || []).length ? `<div class="thinking" aria-label="Thinking"><i></i><i></i><i></i></div>` : "";
    const err = n.error ? `<div class="err-card"><b>${esc(n.error.message)}</b><span>${esc(n.error.hint)}</span><div style="margin-top:8px"><button class="btn sm" data-act="regen" data-id="${n.id}">${ico("refresh", "sm")}Retry</button></div></div>` : "";
    const arts = (n.artifacts || []).map((a, i) => `<button class="artifact-card" data-act="open-artifact" data-id="${n.id}" data-i="${i}">${fileIcon(a.name)}<div class="grow"><div class="truncate" style="font-weight:600">${esc(a.name)}</div><div class="muted" style="font-size:12.5px">${fmtBytes(a.size)} · ${a.stored ? "Stored on device" : "Downloaded only"}</div></div>${ico("arrowr", "sm")}</button>`).join("");
    const deck = n.deck ? `<button class="artifact-card" data-act="open-deck" data-id="${n.id}"><span class="file-ico pptx">DECK</span><div class="grow"><div class="truncate" style="font-weight:600">${esc(n.deck.title)}</div><div class="muted" style="font-size:12.5px">${n.deck.slides.length} slides · open to edit and export</div></div>${ico("arrowr", "sm")}</button>` : "";
    const report = n.report ? `<button class="artifact-card" data-act="open-report" data-id="${n.id}"><span class="file-ico">RPT</span><div class="grow"><div class="truncate" style="font-weight:600">${esc(n.report.title)}</div><div class="muted" style="font-size:12.5px">${sources.length} sources · open to export</div></div>${ico("arrowr", "sm")}</button>` : "";
    const chips = sources.length && mode !== "research" ? `<div class="cites">${sources.slice(0, 8).map((s, i) => `<a class="cite-chip" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><b>${i + 1}</b><span class="truncate">${esc(safe(() => new URL(s.url).hostname.replace(/^www\./, ""), s.title))}</span></a>`).join("")}</div>` : "";
    const sug = isLast && !n.pending && (n.suggest || []).length ? `<div class="suggest">${n.suggest.map((q) => `<button data-suggest="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : "";
    const meta = !n.pending && n.model ? `<span class="meta">${esc(n.model)}${n.rz ? " · " + (n.rz === "off" ? "no reasoning" : n.rz + " effort") : ""}${n.usage ? ` · ${n.usage.est ? "~" : ""}${(n.usage.input || 0) + (n.usage.output || 0)} tokens` : ""}</span>` : "";
    const tools = n.pending ? "" : `<div class="tools">${pager}<button class="tool-btn" data-act="copy-msg" data-id="${n.id}" aria-label="Copy" title="Copy">${ico("copy", "sm")}</button><button class="tool-btn" data-act="regen" data-id="${n.id}" aria-label="Regenerate" title="Regenerate">${ico("refresh", "sm")}</button><button class="tool-btn" data-act="speak" data-id="${n.id}" aria-label="Read aloud" title="Read aloud">${ico("speaker", "sm")}</button><button class="tool-btn ${n.fb === "up" ? "on" : ""}" data-act="fb" data-id="${n.id}" data-v="up" aria-label="Good response" title="Good response">${ico("thumbup", "sm")}</button><button class="tool-btn ${n.fb === "down" ? "on" : ""}" data-act="fb" data-id="${n.id}" data-v="down" aria-label="Bad response" title="Bad response">${ico("thumbdown", "sm")}</button>${n.stopped ? `<button class="btn sm ghost" data-act="cont" data-id="${n.id}">Continue</button>` : ""}${meta}</div>`;
    return `<div class="msg assistant ${isLast ? "last" : ""}" data-node="${n.id}">${steps}${think}<div class="body">${body}${err}${n.stopped && !n.text ? `<span class="muted">Stopped.</span>` : ""}${arts}${deck}${report}${chips}${sug}</div>${tools}</div>`;
  },
};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

async function shrinkImage(file, maxChars) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new ApiError("image_unreadable", "That image could not be read.", "Try a JPEG or PNG.")); i.src = url; });
  let scale = Math.min(1, 1280 / Math.max(img.width, img.height)), q = 0.8, data = "";
  for (let k = 0; k < 8; k++) {
    const c = document.createElement("canvas"); c.width = Math.max(32, Math.round(img.width * scale)); c.height = Math.max(32, Math.round(img.height * scale));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL("image/jpeg", q); if (data.length <= maxChars) break; scale *= 0.8; q = Math.max(0.5, q - 0.06);
  }
  URL.revokeObjectURL(url);
  if (data.length > maxChars) throw new ApiError("image_too_large", "That image is too large for this device.", "Use a smaller or simpler image.");
  return data;
}
async function pdfText(file) {
  await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const doc = await window.pdfjsLib.getDocument({ data: await readFileAs(file, "buffer") }).promise; let out = "";
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) { const p = await doc.getPage(i); out += (await p.getTextContent()).items.map((x) => x.str).join(" ") + "\n\n"; }
  return out.trim();
}

// ---- Actions: chat ----
ACTS["toggle-rail"] = () => UI.toggleRail();
ACTS["new-chat"] = () => newChatAction();
ACTS["open-chat"] = (el) => openChat(el.dataset.id);
ACTS["go-settings"] = () => { App.view = "settings"; if (UI.mobile()) UI.setRail(false); UI.render(); };
ACTS["go-library"] = () => { App.view = "library"; if (UI.mobile()) UI.setRail(false); UI.render(); };
ACTS["go-projects"] = () => { App.view = "projects"; if (UI.mobile()) UI.setRail(false); UI.render(); };
ACTS["cycle-theme"] = () => { const o = ["auto", "light", "dark"]; const s = Store.settings; s.theme = o[(o.indexOf(s.theme) + 1) % 3]; Store.saveSettings(); UI.applyTheme(); UI.renderRail(); toast("Theme: " + s.theme, "", "", 1200); };
ACTS.send = () => { if (isBusy()) return stopChat(); const ta = $("prompt"); const t = ta.value; if (!t.trim() && !App.atts.length) return; ta.value = ""; App.drafts[App.chatId] = ""; startSend(t); };
ACTS["rm-att"] = (el) => { App.atts.splice(+el.dataset.i, 1); UI.syncComposer(); };
ACTS["attach-menu"] = (el) => openMenu(el, [{ label: "Upload files or images", icon: "paperclip", fn: () => $("file-in").click() }, { label: "Generate an image", icon: "image", fn: imageDialog }, { sep: 1 }, { label: "Saved prompts & personas", icon: "user", fn: personaMenu }], { up: true });
ACTS["mode-menu"] = (el) => { const c = curChat(); openMenu(el, Object.entries(MODES).map(([k, m]) => ({ label: m.label, icon: m.icon, sub: m.hint.split(" ").slice(0, 3).join(" "), sel: c.mode === k, fn: () => { c.mode = k; Store.saveChat(c); UI.render(); } })), { up: true }); };
ACTS.reasoning = (el) => {
  const chat = curChat(), rz = reasoningFor(chat.provider, chat.model, chat.effort, chat.think); if (!rz) return;
  const { spec } = rz, cap = (t) => t[0].toUpperCase() + t.slice(1);
  const how = { effort: "Controls how much the model thinks before answering.", budget: "Sets how many tokens the model may spend thinking.", glevel: "Sets how deeply the model thinks.", olevel: "Sets how deeply the model thinks.", think: "Lets the model think step by step before answering." }[spec.kind];
  const draw = (m) => {
    const cur = reasoningFor(chat.provider, chat.model, chat.effort, chat.think), n = spec.levels.length, idx = Math.max(0, spec.levels.indexOf(cur.level));
    m.innerHTML = `<div class="rz"><div class="row"><b>Reasoning</b><span class="grow"></span>${spec.canDisable ? `<input type="checkbox" class="switch" id="rz-on" ${cur.on ? "checked" : ""} aria-label="Reasoning on or off">` : `<span class="chip neutral">always on</span>`}</div>
      <p class="muted" style="margin:4px 0 0;font-size:13px">${esc(how)}</p>
      ${n > 1 ? `<div class="rz-slider ${cur.on ? "" : "off"}"><input type="range" id="rz-range" min="0" max="${n - 1}" step="1" value="${idx}" ${cur.on ? "" : "disabled"} aria-label="Effort level" aria-valuetext="${esc(cap(cur.level))}"><div class="rz-ticks" style="--n:${n}">${spec.levels.map((l, i) => `<button data-i="${i}" class="${i === idx ? "on" : ""}" ${cur.on ? "" : "disabled"}>${esc(cap(l))}</button>`).join("")}</div></div>
        <div class="muted" style="font-size:12.5px">Higher effort handles harder problems but is slower and uses more tokens.</div>` : ""}
      ${spec.note ? `<div class="muted" style="font-size:12.5px">${esc(spec.note)}</div>` : ""}</div>`;
    const set = (patch) => { Object.assign(chat, patch); Store.saveChat(chat); UI.syncComposer(); draw(m); };
    m.querySelector("#rz-on")?.addEventListener("change", (e) => set({ think: e.target.checked }));
    m.querySelector("#rz-range")?.addEventListener("input", (e) => set({ effort: spec.levels[+e.target.value] }));
    m.querySelectorAll(".rz-ticks button").forEach((b) => b.addEventListener("click", () => set({ effort: spec.levels[+b.dataset.i] })));
  };
  openPanel(el, "", { up: true, width: 320, onMount: draw });
};
ACTS["toggle-web"] = () => { const c = curChat(); c.webSearch = !c.webSearch; UI.syncComposer(); };
ACTS["toggle-temp"] = () => { const c = curChat(); if (chatPath(c).length) return toast("Start a new chat to use temporary mode."); c.temp = !c.temp; if (!c.temp) Store.saveChat(c); UI.render(); toast(c.temp ? "Temporary chat on: nothing will be saved" : "Temporary chat off", "", "", 1800); };
ACTS.sib = (el) => { const c = curChat(), n = c.nodes[el.dataset.id]; selectSibling(c, n, +el.dataset.d); Store.saveChat(c); UI.renderThread(); };
ACTS["copy-msg"] = (el) => { copyText(curChat().nodes[el.dataset.id].text || ""); toast("Copied", "ok", "", 1200); };
ACTS.regen = (el) => regenerate(el.dataset.id);
ACTS.cont = (el) => continueGeneration(el.dataset.id);
ACTS.fb = (el) => { const n = curChat().nodes[el.dataset.id]; n.fb = n.fb === el.dataset.v ? "" : el.dataset.v; Store.saveChat(curChat()); UI.updateNode(curChat(), n); };
ACTS.speak = (el) => { const n = curChat().nodes[el.dataset.id]; if (!("speechSynthesis" in window)) return toast("Speech isn't supported here."); if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; } const u = new SpeechSynthesisUtterance((n.text || "").replace(/[#*_`>\[\]]/g, "")); const v = speechSynthesis.getVoices().find((x) => x.name === Store.settings.ttsVoice); if (v) u.voice = v; speechSynthesis.speak(u); };
ACTS["edit-msg"] = async (el) => {
  const c = curChat(), n = c.nodes[el.dataset.id]; if (isBusy()) return;
  const m = openModal({ title: "Edit message", body: `<textarea class="input" id="em" rows="6">${esc(n.text)}</textarea>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save &amp; resend</button>` });
  m.el.querySelector("[data-ok]").addEventListener("click", () => { const t = m.el.querySelector("#em").value; m.close(); if (t.trim()) editAndResend(n.id, t); });
};
ACTS.remember = (el) => { const n = curChat().nodes[el.dataset.id]; Store.memory.push({ id: uid(), text: n.text.slice(0, 300) }); Store.saveMemory(); toast("Remembered", "ok", "It will be included in future chats. Manage in Settings → Personalization."); };
ACTS.mic = (el) => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
  if (ACTS.mic.rec) { ACTS.mic.rec.stop(); return; }
  const rec = new SR(); rec.interimResults = true; rec.continuous = true; rec.lang = navigator.language; const ta = $("prompt"), base = ta.value;
  rec.onresult = (e) => { ta.value = (base ? base + " " : "") + [...e.results].map((r) => r[0].transcript).join(""); ta.dispatchEvent(new Event("input")); };
  rec.onend = () => { ACTS.mic.rec = null; $("mic").classList.remove("on"); }; rec.onerror = () => rec.stop();
  ACTS.mic.rec = rec; $("mic").classList.add("on"); rec.start();
};
ACTS["open-artifact"] = (el) => { const n = curChat().nodes[el.dataset.id]; Canvas.show({ type: "artifact", chatId: App.chatId, nodeId: n.id, index: +el.dataset.i }); };
ACTS["open-deck"] = (el) => Canvas.show({ type: "deck", chatId: App.chatId, nodeId: el.dataset.id });
ACTS["open-report"] = (el) => Canvas.show({ type: "report", chatId: App.chatId, nodeId: el.dataset.id });
ACTS["toggle-canvas"] = () => (Canvas.isOpen() ? Canvas.close() : Canvas.reopen());

function newChatAction(over = {}) {
  const prev = curChat(); if (prev && prev.temp) Store.deleteChat(prev.id);
  const c = newChat(over); Store.chats[c.id] = c; App.chatId = c.id; App.view = "chat"; App.atts = [];
  if (UI.mobile()) UI.setRail(false);
  UI.render(); Canvas.close(); setTimeout(() => $("prompt") && $("prompt").focus(), 50); return c;
}
function openChat(id) {
  const prev = curChat(); if (prev && prev.temp && prev.id !== id) Store.deleteChat(prev.id);
  App.chatId = id; App.view = "chat"; App.atts = []; if (UI.mobile()) UI.setRail(false); UI.render({ scroll: true }); Canvas.close();
}
ACTS["chat-menu"] = (el, e) => {
  e.stopPropagation(); const c = Store.chats[el.dataset.id];
  openMenu(el, [
    { label: c.pinned ? "Unpin" : "Pin", icon: "pin", fn: () => { c.pinned = !c.pinned; Store.saveChat(c); UI.renderRail(); } },
    { label: "Rename", icon: "edit", fn: async () => { const t = await promptDialog("Rename chat", c.title, "Title"); if (t) { c.title = t.slice(0, 72); Store.saveChat(c); UI.render(); } } },
    { label: "Move to project", icon: "folder", fn: () => moveToProject(c) },
    { label: "Archive", icon: "archive", fn: () => { c.archived = true; Store.saveChat(c); if (App.chatId === c.id) newChatAction(); else UI.renderRail(); } },
    { sep: 1 }, { label: "Delete", icon: "trash", danger: true, fn: async () => { if (await confirmDialog("Delete chat?", "This removes it from this browser.", "Delete", true)) { Store.deleteChat(c.id); if (App.chatId === c.id) newChatAction(); else UI.renderRail(); } } },
  ]);
};
ACTS["open-chat"] = (el, e) => { if (e.target.closest("[data-act=chat-menu]")) return; openChat(el.dataset.id); };
function moveToProject(c) {
  const ps = Object.values(Store.projects);
  openMenu(document.querySelector(`[data-id="${c.id}"]`) || $("rail"), [{ label: "No project", sel: !c.projectId, fn: () => { c.projectId = ""; Store.saveChat(c); toast("Moved"); } }, ...ps.map((p) => ({ label: p.name, icon: "folder", sel: c.projectId === p.id, fn: () => { c.projectId = p.id; Store.saveChat(c); toast("Moved to " + p.name); } }))]);
}
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); ACTS.palette(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newChatAction(); }
  else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); UI.toggleRail(); }
  else if (e.key === "Escape" && isBusy() && !document.querySelector(".modal-back,.menu")) stopChat();
  else if (e.key === "?" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector(".modal-back")) shortcutsDialog();
});
document.addEventListener("keydown", (e) => { const t = e.target.closest && e.target.closest(".chat-item"); if (t && (e.key === "Enter" || e.key === " ") && e.target === t) { e.preventDefault(); openChat(t.dataset.id); } });
