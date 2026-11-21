// Boot.
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
  setInterval(async () => { if (document.hidden) return; try { await Dev.bootstrap(); UI.renderRail(); } catch (_) { UI.renderRail(); } }, 30000);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.addEventListener("unhandledrejection", (e) => { const err = e.reason; if (err && err.name === "AbortError") return; console.error(err); });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
