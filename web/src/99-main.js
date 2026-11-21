// Boot.
// Tells the user when the device serves a newer build than the one running in this tab (the page file is never cached,
// and asset URLs carry a content hash), so nobody keeps using stale code after an update.
function watchForNewVersion() {
  const current = (document.querySelector("script[src^='app.js']") || {}).getAttribute && document.querySelector("script[src^='app.js']").getAttribute("src");
  if (!current || !/\?v=/.test(current)) return;
  let shown = false;
  const check = async () => {
    if (shown || Dev.pending > 0 || App.busy.size > 0) return;
    try {
      const html = await (await fetch("./?_=" + Date.now(), { cache: "no-store" })).text();
      const latest = (html.match(/app\.js\?v=[0-9a-f]+/) || [])[0];
      if (latest && latest !== current) {
        shown = true;
        const el = document.createElement("div"); el.className = "toast ok"; el.style.pointerEvents = "auto";
        el.innerHTML = `<div class="grow">A new version of ChatESP is available<small>Reload to use it. Your chats are kept.</small></div><button class="btn sm" style="background:#fff;color:#111">Reload</button>`;
        el.querySelector("button").addEventListener("click", () => location.reload());
        $("toasts").append(el);
      }
    } catch (_) { /* offline: try again later */ }
  };
  setInterval(check, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
}

async function boot() {
  await Store.open();
  UI.init();
  if (Store.settings.pinHash) await lockScreen();
  // Pick or create the active chat. Empty, unsaved chats are reused rather than piling up.
  const existing = chatsSorted((c) => !c.temp)[0];
  if (existing && !chatPath(existing).length) App.chatId = existing.id;
  else { const c = newChat(); Store.chats[c.id] = c; App.chatId = c.id; }
  $("app").dataset.rail = UI.mobile() ? "closed" : "open";
  UI.render();
  try { await Dev.bootstrap(); } catch (e) { Dev.online = false; toast(errView(e).message, "bad", errView(e).hint, 6000); }
  const anyProvider = Object.keys(PROVIDERS).some((p) => Dev.configured(p));
  const s = Store.settings, c = curChat();
  if (!s.provider && anyProvider) { s.provider = Object.keys(PROVIDERS).find((p) => Dev.configured(p)); Store.saveSettings(); }
  if (c && !c.provider && s.provider) { c.provider = s.provider; c.model = s.model; }
  const pref = Dev.config && Dev.config.preferences;
  if (pref && pref.provider && !s.model && pref.model && Dev.configured(pref.provider)) { s.provider = pref.provider; s.model = pref.model; if (c && !chatPath(c).length) { c.provider = s.provider; c.model = s.model; } }
  if (!anyProvider && !s.onboarded && Dev.online !== false) App.view = "setup";
  UI.render();
  if (anyProvider) Dev.loadCatalog().catch(() => {});
  watchForNewVersion();
  // Background polling must never compete with a running request: a small device has only a few KB to spare during a long stream.
  setInterval(async () => { if (document.hidden || Dev.pending > 0 || App.busy.size > 0) return; try { await Dev.bootstrap(); UI.renderRail(); } catch (_) { UI.renderRail(); } }, 30000);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.addEventListener("unhandledrejection", (e) => { const err = e.reason; if (err && err.name === "AbortError") return; console.error(err); });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
