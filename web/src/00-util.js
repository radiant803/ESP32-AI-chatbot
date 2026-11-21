// Shared helpers: DOM, icons, menus, modals, toasts, action registry.
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

function fmtBytes(n) { n = Number(n) || 0; if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(1) + " KB"; return (n / 1048576).toFixed(1) + " MB"; }
function fmtDate(ts) { return safe(() => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ts)), ""); }
function dayBucket(ts) {
  const d = new Date(ts), n = new Date(); const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(n) - start(d)) / 864e5);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 8 ? "Previous 7 days" : diff < 31 ? "Previous 30 days" : "Older";
}

// Icons (24px grid, stroke). One sprite, referenced with <use>.
const ICON_PATHS = {
  plus: "M12 5v14M5 12h14", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", menu: "M4 7h16M4 12h16M4 17h10",
  send: "M12 19V5M5 12l7-7 7 7", stop: "M7 7h10v10H7z", paperclip: "M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l8-8",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  more: "M5 12h.01M12 12h.01M19 12h.01", copy: "M9 9h11v11H9zM5 15V5a1 1 0 0 1 1-1h10", check: "M5 12.5l4.5 4.5L19 7.5", x: "M6 6l12 12M18 6L6 18",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4", edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  chev: "M9 6l6 6-6 6", chevd: "M6 9l6 6 6-6", chevl: "M15 6l-6 6 6 6", up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6", thumbup: "M7 11v9H4v-9zM7 11l4-8c1.7 0 3 1.3 3 3v3h5.5a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H7", thumbdown: "M17 13V4h3v9zM17 13l-4 8c-1.7 0-3-1.3-3-3v-3H4.5a2 2 0 0 1-2-2.3l1.2-7a2 2 0 0 1 2-1.7H17",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM19 11a7 7 0 0 1-14 0M12 18v3", speaker: "M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13", download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5", folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", pin: "M12 17v5M8 3h8l-1 6 3 4H6l3-4z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z", bolt: "M13 2L4 14h7l-1 8 9-12h-7z", globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  deck: "M3 4h18v12H3zM8 20h8M12 16v4", flask: "M9 3h6M10 3v6L4 19a2 2 0 0 0 1.8 3h12.4A2 2 0 0 0 20 19l-6-10V3", image: "M4 5h16v14H4zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM20 16l-5-5-9 8", code: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4", moon: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z", panel: "M3 4h18v16H3zM15 4v16", share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4", wifi: "M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M2 9a15 15 0 0 1 20 0", cpu: "M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4", key: "M15 7a4 4 0 1 1-3.3 6.2L4 21v-3l2-2 2 .5.5-2 2-.5A4 4 0 0 1 15 7z",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", branch: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 6-12 3-12 6", compare: "M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 2v20",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", arrowr: "M5 12h14M13 6l6 6-6 6", play: "M7 4l13 8-13 8z", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  cmd: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z", archive: "M3 5h18v4H3zM5 9v10h14V9M10 13h4", power: "M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0", warn: "M12 3l10 18H2zM12 10v5M12 18h.01", info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01", loader: "M12 3a9 9 0 1 0 9 9",
};
function ico(name, cls = "") { return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name] || ""}"/></svg>`; }

// Delegated actions: <button data-act="name" data-x="..."> -> ACTS.name(el, event)
const ACTS = {};
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.disabled) return;
  const fn = ACTS[t.dataset.act];
  if (!fn) return;
  Promise.resolve(fn(t, e)).catch((err) => { console.error(err); toast(err.message || "Something went wrong", "bad", err.hint); });
});

function toast(message, kind = "", sub = "", ms = 4200) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `<div class="grow">${esc(message)}${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  $("toasts").append(el);
  setTimeout(() => el.remove(), ms);
}

// Floating menu anchored to an element. items: {label, icon, act, data, danger, sub, sel, hd, sep, fn}
let menuClose = null;
function openMenu(anchor, items, opts = {}) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "menu";
  m.setAttribute("role", "menu");
  m.innerHTML = items.map((it, i) => it.sep ? `<div class="sep"></div>` : it.hd ? `<div class="hd">${esc(it.hd)}</div>` :
    `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? "danger" : ""} ${it.sel ? "sel" : ""}" ${it.disabled ? "disabled" : ""}>${it.icon ? ico(it.icon, "sm") : ""}<span class="truncate">${esc(it.label)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : it.sel ? `<span class="sub">${ico("check", "sm")}</span>` : ""}</button>`).join("");
  document.body.append(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let left = opts.align === "right" ? r.right - mw : r.left;
  let top = opts.up ? r.top - mh - 6 : r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  left = clamp(left, 8, innerWidth - mw - 8);
  m.style.left = left + "px"; m.style.top = top + "px";
  m.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    if (it.fn) Promise.resolve(it.fn()).catch((err) => toast(err.message || "Failed", "bad"));
  });
  const off = (e) => { if (!m.contains(e.target)) closeMenu(); };
  const key = (e) => { if (e.key === "Escape") closeMenu(); };
  setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); });
  menuClose = () => { m.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); menuClose = null; };
  m.querySelector("button:not(:disabled)")?.focus?.();
}
function closeMenu() { if (menuClose) menuClose(); }
// Floating panel with arbitrary HTML, closed like a menu (outside click or Escape).
function openPanel(anchor, html, { up = false, align = "left", width = 300, onMount } = {}) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "menu panel"; m.style.width = Math.min(width, innerWidth - 16) + "px"; m.innerHTML = html;
  document.body.append(m);
  onMount && onMount(m);  // draw first so the height is known when positioning
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let left = align === "right" ? r.right - mw : r.left, top = up ? r.top - mh - 8 : r.bottom + 8;
  if (top < 8) top = r.bottom + 8; if (top + mh > innerHeight - 8) top = Math.max(8, innerHeight - mh - 8);
  m.style.left = clamp(left, 8, innerWidth - mw - 8) + "px"; m.style.top = top + "px";
  const off = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  const key = (e) => { if (e.key === "Escape") closeMenu(); };
  setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); });
  menuClose = () => { m.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); menuClose = null; };
  return m;
}

// Modal. Returns {el, close}. body/foot are HTML strings.
function openModal({ title = "", body = "", foot = "", cls = "", locked = false, onMount, onClose }) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">${title ? `<div class="modal-head"><span class="grow">${esc(title)}</span><button class="icon-btn" data-close aria-label="Close">${ico("x")}</button></div>` : ""}<div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}</div>`;
  $("overlay").append(back);
  const prev = document.activeElement;
  const close = (v) => { back.remove(); document.removeEventListener("keydown", key, true); if (prev && prev.focus) prev.focus(); onClose && onClose(v); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); if (!locked) close(); } };
  document.addEventListener("keydown", key, true);
  back.addEventListener("pointerdown", (e) => { if (e.target === back && !locked) close(); });
  back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => close()));
  const first = back.querySelector("[autofocus], input, textarea, select, .btn.primary");
  setTimeout(() => first && first.focus(), 30);
  const api = { el: back, close };
  onMount && onMount(api);
  return api;
}
function confirmDialog(title, text, okLabel = "Confirm", danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({ title, body: `<p style="margin:0;color:var(--ink-2)">${esc(text)}</p>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-ok autofocus>${esc(okLabel)}</button>`, onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector("[data-ok]").addEventListener("click", () => { done = true; m.close(); resolve(true); });
  });
}
function promptDialog(title, value = "", label = "Name") {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({ title, body: `<div class="field"><label for="pd-in">${esc(label)}</label><input id="pd-in" class="input" value="${esc(value)}" maxlength="120" autocomplete="off"></div>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>`, onClose: () => { if (!done) resolve(null); } });
    const input = m.el.querySelector("#pd-in");
    const ok = () => { done = true; const v = input.value.trim(); m.close(); resolve(v || null); };
    m.el.querySelector("[data-ok]").addEventListener("click", ok);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
    setTimeout(() => input.select(), 40);
  });
}

function download(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function copyText(text) {
  return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => {
    const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); try { document.execCommand("copy"); } catch (_) {} t.remove();
  });
}
function readFileAs(file, mode) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); r.onerror = () => reject(r.error);
    mode === "text" ? r.readAsText(file) : mode === "buffer" ? r.readAsArrayBuffer(file) : r.readAsDataURL(file);
  });
}
function loadScript(src) {
  if (loadScript.cache[src]) return loadScript.cache[src];
  return (loadScript.cache[src] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res;
    s.onerror = () => { delete loadScript.cache[src]; rej(new ApiError("library_unavailable", "A helper library could not be loaded.", "This feature needs browser internet access. Check your connection and retry.")); };
    document.head.append(s);
  }));
}
loadScript.cache = {};

class ApiError extends Error {
  constructor(code, message, hint, status) { super(message || "Request failed"); this.code = code || "error"; this.hint = hint || "Retry the action."; this.status = status || 0; }
}
function errView(err) { return err instanceof ApiError ? { message: err.message, hint: err.hint } : { message: (err && err.message) || "Something unexpected happened.", hint: "Retry the action." }; }
