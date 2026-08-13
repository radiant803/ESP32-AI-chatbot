#pragma once

static const char CHAT_ESP_HTML[] PROGMEM = R"CHATESP_UI(
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#172235">
  <title>ChatESP</title>
  <style>
    :root {
      --ink: #172033;
      --muted: #66758a;
      --quiet: #8e9aae;
      --canvas: #f3f6fa;
      --surface: #ffffff;
      --surface-soft: #f8faff;
      --line: #dfe6ef;
      --line-strong: #cbd6e5;
      --rail: #172235;
      --rail-soft: #22324c;
      --rail-text: #eaf0f8;
      --accent: #5d5ce6;
      --accent-deep: #4947c9;
      --accent-soft: #eeedff;
      --success: #087b68;
      --success-soft: #def7ef;
      --warning: #a15c00;
      --warning-soft: #fff3d8;
      --danger: #b42318;
      --danger-soft: #fee9e7;
      --shadow: 0 18px 42px rgba(24, 40, 64, 0.10);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    html { background: var(--canvas); }
    body {
      min-width: 0;
      margin: 0;
      overflow-x: hidden;
      color: var(--ink);
      background:
        radial-gradient(circle at 82% -8%, rgba(93, 92, 230, 0.12), transparent 28rem),
        var(--canvas);
      font: 15px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    button, input, select, textarea { -webkit-tap-highlight-color: transparent; }
    :focus-visible { outline: 3px solid rgba(93, 92, 230, 0.34); outline-offset: 2px; }

    .app-shell { display: flex; min-height: 100dvh; }
    .sidebar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      flex: 0 0 278px;
      width: 278px;
      height: 100dvh;
      flex-direction: column;
      gap: 16px;
      padding: 22px 14px 16px;
      color: var(--rail-text);
      background: var(--rail);
      box-shadow: inset -1px 0 rgba(255, 255, 255, 0.06);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px 14px;
      font-size: 19px;
      font-weight: 760;
      letter-spacing: -0.04em;
    }
    .brand-mark {
      position: relative;
      display: grid;
      width: 29px;
      height: 29px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 9px;
      background: linear-gradient(140deg, #7b7aff, #5d5ce6);
      box-shadow: 0 7px 20px rgba(8, 14, 28, 0.26);
    }
    .brand-mark::before, .brand-mark::after {
      position: absolute;
      width: 9px;
      height: 9px;
      content: "";
      border: 2px solid white;
      border-radius: 50%;
    }
    .brand-mark::before { transform: translateX(-4px); opacity: 0.72; }
    .brand-mark::after { transform: translateX(4px); }
    .new-chat {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      padding: 11px 13px;
      border: 1px solid rgba(255, 255, 255, 0.17);
      border-radius: 12px;
      color: white;
      background: rgba(255, 255, 255, 0.09);
      font-weight: 700;
      text-align: left;
      transition: background 150ms ease, transform 150ms ease;
    }
    .new-chat:hover { background: rgba(255, 255, 255, 0.15); transform: translateY(-1px); }
    .new-chat .plus { font-size: 21px; font-weight: 300; line-height: 0.8; }
    .rail-label {
      margin: 5px 9px -5px;
      color: rgba(234, 240, 248, 0.55);
      font-size: 10px;
      font-weight: 760;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }
    .conversation-list { min-height: 0; overflow-y: auto; }
    .conversation {
      display: grid;
      width: 100%;
      gap: 3px;
      margin: 2px 0;
      padding: 10px 10px;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 10px;
      color: rgba(234, 240, 248, 0.79);
      background: transparent;
      text-align: left;
    }
    .conversation:hover { background: rgba(255, 255, 255, 0.07); }
    .conversation.active {
      border-color: rgba(166, 181, 255, 0.22);
      color: white;
      background: var(--rail-soft);
    }
    .conversation-title { overflow: hidden; font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .conversation-meta { overflow: hidden; color: rgba(234, 240, 248, 0.52); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .rail-footer {
      display: grid;
      gap: 3px;
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.09);
    }
    .rail-action {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border: 0;
      border-radius: 9px;
      color: rgba(234, 240, 248, 0.72);
      background: transparent;
      text-align: left;
    }
    .rail-action:hover, .rail-action.selected { color: white; background: rgba(255, 255, 255, 0.08); }
    .rail-icon { width: 17px; color: #b5c2d8; font-size: 14px; font-weight: 760; text-align: center; }
    .mobile-rail-close { display: none; }
    .rail-backdrop { display: none; }

    .main { min-width: 0; flex: 1; }
    .main-inner { display: flex; width: min(1280px, 100%); min-height: 100dvh; flex-direction: column; margin: 0 auto; padding: 0 clamp(16px, 4vw, 52px); }
    .topbar {
      display: flex;
      min-height: 76px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(203, 214, 229, 0.72);
    }
    .topbar-title { min-width: 0; }
    .eyebrow { margin: 0 0 2px; color: var(--muted); font-size: 11px; font-weight: 760; letter-spacing: 0.08em; text-transform: uppercase; }
    .page-title { margin: 0; overflow: hidden; font-size: 18px; font-weight: 730; letter-spacing: -0.035em; text-overflow: ellipsis; white-space: nowrap; }
    .connection-chip {
      display: inline-flex;
      max-width: min(43vw, 310px);
      align-items: center;
      gap: 7px;
      padding: 7px 10px;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.65);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--warning); }
    .connection-chip.connected { border-color: #bfe6db; color: var(--success); background: var(--success-soft); }
    .connection-chip.connected .status-dot { background: var(--success); box-shadow: 0 0 0 4px rgba(8, 123, 104, 0.10); }
    .mobile-menu { display: none; }

    .screen { width: 100%; min-height: 0; flex: 1; }
    .chat-screen { display: flex; min-height: calc(100dvh - 76px); flex-direction: column; }
    .chat-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 0 14px; }
    .chat-heading { min-width: 0; }
    .chat-heading h2 { margin: 0; overflow: hidden; font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif; font-size: clamp(25px, 3vw, 34px); font-weight: 540; letter-spacing: -0.045em; text-overflow: ellipsis; white-space: nowrap; }
    .chat-heading p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .header-actions { display: inline-flex; flex: 0 0 auto; gap: 6px; }
    .icon-button, .button {
      min-height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: 10px;
      color: var(--ink);
      background: var(--surface);
      font-weight: 670;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .icon-button { width: 38px; padding: 0; font-size: 16px; }
    .icon-button svg { width: 16px; height: 16px; vertical-align: middle; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.9; }
    .button { padding: 8px 12px; }
    .button:hover, .icon-button:hover { border-color: #aab8cc; background: #fbfcfe; transform: translateY(-1px); }
    .button.primary { border-color: var(--accent); color: white; background: var(--accent); box-shadow: 0 8px 18px rgba(93, 92, 230, 0.20); }
    .button.primary:hover { border-color: var(--accent-deep); background: var(--accent-deep); }
    .button.danger { border-color: #f5c7c2; color: var(--danger); background: #fffafa; }
    .button.ghost { border-color: transparent; background: transparent; }
    .button.compact { min-height: 34px; padding: 6px 9px; font-size: 12px; }

    .chat-controls {
      display: grid;
      grid-template-columns: minmax(150px, 0.9fr) minmax(190px, 1.4fr) auto;
      gap: 9px;
      align-items: end;
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.76);
      box-shadow: 0 8px 26px rgba(28, 43, 68, 0.04);
    }
    .select-field { display: grid; min-width: 0; gap: 4px; }
    .select-field label, .field-label { color: var(--muted); font-size: 10px; font-weight: 770; letter-spacing: 0.08em; text-transform: uppercase; }
    select, input, textarea {
      width: 100%;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      color: var(--ink);
      background: var(--surface);
    }
    select, input { min-height: 39px; padding: 8px 10px; }
    select:disabled { color: var(--quiet); background: #f4f6f9; }
    .messages { display: grid; gap: 17px; width: min(900px, 100%); margin: 0 auto; padding: 29px 0 24px; }
    .message { display: grid; gap: 7px; }
    .message.user { justify-items: end; }
    .message-label { color: var(--muted); font-size: 11px; font-weight: 760; letter-spacing: 0.05em; text-transform: uppercase; }
    .bubble { max-width: min(88%, 720px); padding: 13px 15px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: 0 3px 10px rgba(21, 35, 55, 0.035); white-space: pre-wrap; word-break: break-word; }
    .message.user .bubble { border-color: #d9d7ff; border-bottom-right-radius: 4px; background: var(--accent-soft); }
    .message.assistant .bubble { border-bottom-left-radius: 4px; }
    .message.pending .bubble { color: var(--muted); font-style: italic; }
    .typing-line { display: inline-flex; gap: 4px; align-items: center; }
    .typing-line i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: typing 1.1s infinite ease-in-out; }
    .typing-line i:nth-child(2) { animation-delay: 0.12s; }
    .typing-line i:nth-child(3) { animation-delay: 0.24s; }
    @keyframes typing { 0%, 80%, 100% { transform: translateY(0); opacity: 0.35; } 40% { transform: translateY(-3px); opacity: 1; } }

    .welcome { display: grid; width: min(860px, 100%); flex: 1; place-items: center; margin: 0 auto; padding: 42px 0 28px; }
    .welcome-card { width: 100%; padding: clamp(26px, 5vw, 48px); border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(145deg, rgba(255,255,255,0.96), rgba(247,249,254,0.93)); box-shadow: var(--shadow); }
    .signal-line { display: flex; width: 112px; height: 24px; align-items: center; gap: 7px; margin-bottom: 24px; }
    .signal-line span { display: block; height: 1px; flex: 1; background: #a8b4c5; }
    .signal-line b { display: block; width: 11px; height: 11px; border: 3px solid var(--accent); border-radius: 50%; background: white; box-shadow: 0 0 0 5px var(--accent-soft); }
    .welcome h2 { max-width: 630px; margin: 0; font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif; font-size: clamp(33px, 5vw, 52px); font-weight: 520; letter-spacing: -0.055em; line-height: 0.98; }
    .welcome p { max-width: 570px; margin: 18px 0 0; color: var(--muted); font-size: 16px; }
    .starter-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 34px; }
    .starter { min-height: 106px; padding: 15px; border: 1px solid var(--line); border-radius: 13px; color: var(--ink); background: var(--surface); text-align: left; }
    .starter:hover { border-color: #bbb9ef; background: #fbfbff; }
    .starter strong { display: block; margin-bottom: 7px; font-size: 13px; }
    .starter span { color: var(--muted); font-size: 12px; line-height: 1.35; }
    .setup-callout { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 13px; margin-top: 26px; padding: 13px 15px; border-radius: 12px; color: #464180; background: #eeedff; font-size: 13px; }

    .composer-area { width: min(900px, 100%); margin: auto auto 0; padding: 0 0 max(20px, env(safe-area-inset-bottom)); position: sticky; bottom: 0; }
    .composer { padding: 10px; border: 1px solid #ccd7e6; border-radius: 17px; background: rgba(255, 255, 255, 0.96); box-shadow: 0 18px 45px rgba(25, 42, 68, 0.16); }
    .composer textarea { display: block; min-height: 62px; max-height: 180px; padding: 8px 8px 6px; resize: none; border: 0; outline: none; background: transparent; line-height: 1.42; }
    .composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 5px; }
    .composer-note { color: var(--muted); font-size: 11px; }
    .composer-actions { display: flex; align-items: center; gap: 8px; }
    .agent-toggle { display: inline-flex; min-height: 34px; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid var(--line-strong); border-radius: 9px; color: #5c6a7e; background: var(--surface-soft); font-size: 12px; font-weight: 700; }
    .agent-toggle .toggle-dot { width: 7px; height: 7px; border-radius: 50%; background: #9ba8b8; }
    .agent-toggle.on { border-color: #bcb8ff; color: #4844b8; background: var(--accent-soft); }
    .agent-toggle.on .toggle-dot { background: var(--accent); box-shadow: 0 0 0 3px rgba(93, 92, 230, 0.15); }
    .send-button { min-height: 36px; padding: 7px 14px; border: 0; border-radius: 9px; color: white; background: var(--accent); font-weight: 760; }
    .send-button:hover { background: var(--accent-deep); }

    .panel { width: min(1040px, 100%); margin: 0 auto; padding: 36px 0 56px; }
    .panel-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 25px; }
    .panel-heading h2 { margin: 0; font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif; font-size: clamp(30px, 4vw, 43px); font-weight: 540; letter-spacing: -0.052em; }
    .panel-heading p { max-width: 620px; margin: 7px 0 0; color: var(--muted); }
    .panel-grid { display: grid; grid-template-columns: minmax(180px, 0.55fr) minmax(0, 1.45fr); gap: 16px; align-items: start; }
    .card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: 0 8px 22px rgba(28, 43, 68, 0.035); }
    .card-pad { padding: clamp(18px, 3vw, 27px); }
    .provider-tabs { display: grid; gap: 5px; padding: 10px; }
    .provider-tab { display: grid; width: 100%; grid-template-columns: 1fr auto; gap: 7px; padding: 11px; border: 1px solid transparent; border-radius: 10px; color: var(--ink); background: transparent; text-align: left; }
    .provider-tab:hover { background: var(--surface-soft); }
    .provider-tab.active { border-color: #d4d2ff; color: #4541bc; background: var(--accent-soft); }
    .provider-tab small { grid-column: 1; color: var(--muted); font-size: 11px; }
    .provider-tab .config-state { align-self: center; color: var(--quiet); font-size: 11px; }
    .provider-tab .config-state.ready { color: var(--success); }
    .settings-card h3, .artifact-card h3 { margin: 0; font-size: 17px; letter-spacing: -0.025em; }
    .settings-card > p, .artifact-card > p { margin: 7px 0 0; color: var(--muted); font-size: 13px; }
    .form-grid { display: grid; gap: 17px; margin-top: 24px; }
    .field { display: grid; gap: 6px; }
    .field-help { margin: 0; color: var(--muted); font-size: 12px; }
    .form-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 2px; }
    .detail-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 22px; padding: 12px 13px; border: 1px solid #d6e3f1; border-radius: 11px; color: #45627f; background: #f3f8fd; font-size: 12px; }
    .detail-strip strong { color: #264c72; }
    .status-box { display: none; margin-top: 17px; padding: 12px 13px; border-radius: 11px; font-size: 13px; }
    .status-box.visible { display: block; }
    .status-box.success { border: 1px solid #b7eadb; color: #086b5b; background: var(--success-soft); }
    .status-box.error { border: 1px solid #f7cac5; color: #8e281e; background: var(--danger-soft); }
    .status-box .hint { display: block; margin-top: 4px; opacity: 0.88; font-size: 12px; }
    .range-row { display: flex; align-items: center; gap: 12px; }
    .range-row input { min-height: auto; padding: 0; border: 0; accent-color: var(--accent); }
    .range-value { min-width: 31px; padding: 3px 6px; border-radius: 6px; color: #4844a6; background: var(--accent-soft); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
    .live-note { margin-top: 26px; padding: 15px; border-radius: 12px; color: #4b5582; background: #f1f3ff; font-size: 13px; }
    .live-note strong { display: block; margin-bottom: 5px; color: #30368b; }

    .artifact-summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 13px 15px; border: 1px solid #d7e3ef; border-radius: 13px; background: #f8fbfe; }
    .storage-caption { color: var(--muted); font-size: 12px; }
    .storage-bar { width: min(260px, 100%); height: 7px; overflow: hidden; border-radius: 99px; background: #dee7f1; }
    .storage-bar > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5d5ce6, #6988e9); }
    .artifact-list { overflow: hidden; }
    .artifact-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    .artifact-row:last-child { border-bottom: 0; }
    .artifact-name { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .artifact-meta { margin-top: 2px; color: var(--muted); font-size: 11px; }
    .artifact-link { color: #4844ba; font-size: 12px; font-weight: 720; text-decoration: none; }
    .empty-artifacts { padding: 44px 22px; color: var(--muted); text-align: center; }
    .help-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .help-grid h3 { margin-top: 0; font-size: 16px; }
    .help-grid p, .help-grid li { color: var(--muted); font-size: 13px; }
    .help-grid ul { margin: 10px 0 0; padding-left: 18px; }

    .toast { position: fixed; right: 20px; bottom: 20px; z-index: 60; display: none; width: min(390px, calc(100vw - 32px)); padding: 13px 15px; border: 1px solid var(--line-strong); border-radius: 12px; color: var(--ink); background: white; box-shadow: 0 18px 42px rgba(17, 32, 51, 0.20); font-size: 13px; }
    .toast.show { display: block; animation: toast-in 180ms ease-out; }
    .toast.error { border-color: #f4c7c2; color: #8e281e; background: #fffafa; }
    .toast.success { border-color: #b7eadb; color: #086b5b; background: #f7fffc; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 900px) {
      .main-inner { padding: 0 22px; }
      .panel-grid { grid-template-columns: 1fr; }
      .provider-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .provider-tab small { display: none; }
    }
    @media (max-width: 760px) {
      .sidebar { position: fixed; left: 0; transform: translateX(-105%); transition: transform 180ms ease; box-shadow: 15px 0 40px rgba(10, 18, 30, 0.28); }
      .sidebar.open { transform: translateX(0); }
      .rail-backdrop.open { position: fixed; inset: 0; z-index: 19; display: block; background: rgba(14, 23, 38, 0.40); }
      .mobile-rail-close { display: block; margin-left: auto; }
      .mobile-menu { display: inline-grid; width: 36px; height: 36px; place-items: center; padding: 0; border: 1px solid var(--line-strong); border-radius: 9px; color: var(--ink); background: white; font-size: 17px; }
      .topbar { justify-content: flex-start; }
      .connection-chip { margin-left: auto; }
      .topbar-title .eyebrow { display: none; }
      .main-inner { padding: 0 16px; }
      .chat-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .chat-controls > .refresh-models { grid-column: span 2; }
      .starter-grid { grid-template-columns: 1fr; }
      .starter { min-height: auto; }
      .welcome-card { padding: 28px 22px; }
      .panel { padding-top: 28px; }
    }
    @media (max-width: 520px) {
      body { font-size: 14px; }
      .topbar { min-height: 64px; gap: 9px; }
      .page-title { max-width: 130px; font-size: 16px; }
      .connection-chip { max-width: 126px; padding: 6px 8px; font-size: 11px; }
      .chat-screen { min-height: calc(100dvh - 64px); }
      .chat-header { gap: 10px; padding: 17px 0 12px; }
      .chat-heading h2 { font-size: 28px; }
      .chat-heading p { font-size: 12px; }
      .header-actions { gap: 3px; }
      .icon-button { width: 34px; min-height: 34px; }
      .chat-controls { gap: 7px; padding: 10px; border-radius: 12px; }
      .messages { gap: 14px; padding: 22px 0 18px; }
      .bubble { max-width: 94%; padding: 11px 12px; }
      .composer { border-radius: 14px; }
      .composer textarea { min-height: 54px; }
      .composer-footer { align-items: flex-end; }
      .composer-note { max-width: 120px; line-height: 1.25; }
      .agent-toggle { gap: 4px; padding: 6px 7px; }
      .agent-toggle .agent-word { display: inline; font-size: 11px; }
      .send-button { padding: 7px 11px; }
      .panel-heading { display: block; margin-bottom: 18px; }
      .panel-heading h2 { font-size: 34px; }
      .provider-tabs { grid-template-columns: 1fr; }
      .provider-tab small { display: block; }
      .form-actions .button { flex: 1 1 auto; }
      .artifact-row { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
      .artifact-row .button { grid-column: 2; grid-row: 1 / span 2; }
      .artifact-link { grid-column: 1; }
      .help-grid { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside id="sidebar" class="sidebar" aria-label="ChatESP navigation">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>ChatESP</span><button class="rail-action mobile-rail-close" type="button" data-action="close-sidebar" aria-label="Close navigation">x</button></div>
      <button class="new-chat" type="button" data-action="new-chat"><span>New chat</span><span class="plus" aria-hidden="true">+</span></button>
      <p class="rail-label">Conversations</p>
      <div id="conversation-list" class="conversation-list"></div>
      <div class="rail-footer">
        <button class="rail-action" type="button" data-action="show-settings"><span class="rail-icon" aria-hidden="true">S</span>Settings</button>
        <button class="rail-action" type="button" data-action="show-artifacts"><span class="rail-icon" aria-hidden="true">A</span>Artifacts</button>
        <button class="rail-action" type="button" data-action="show-help"><span class="rail-icon" aria-hidden="true">?</span>How it works</button>
      </div>
    </aside>
    <div id="rail-backdrop" class="rail-backdrop" data-action="close-sidebar"></div>
    <main class="main">
      <div class="main-inner">
        <header class="topbar">
          <button class="mobile-menu" type="button" data-action="open-sidebar" aria-label="Open navigation">=</button>
          <div class="topbar-title"><p id="topbar-eyebrow" class="eyebrow">Local model gateway</p><h1 id="page-title" class="page-title">ChatESP</h1></div>
          <div id="connection-chip" class="connection-chip" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span id="connection-text">Checking device</span></div>
        </header>
        <section id="screen" class="screen" aria-live="polite"></section>
      </div>
    </main>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
  (() => {
    "use strict";

    const STORE_KEY = "chatesp.v2";
    const MAX_LOCAL_CONVERSATIONS = 20;
    const PROVIDERS = [
      { id: "openai", label: "OpenAI", note: "Cloud key" },
      { id: "anthropic", label: "Anthropic", note: "Cloud key" },
      { id: "google", label: "Google Gemini", note: "Cloud key" },
      { id: "ollama", label: "Ollama", note: "LAN server" }
    ];
    const $ = (id) => document.getElementById(id);
    let toastTimer = 0;

    const state = {
      screen: "chat",
      health: null,
      configuration: null,
      models: {},
      loadingModels: {},
      conversations: loadConversations(),
      activeId: null,
      agent: false,
      busy: false,
      sidebarOpen: false,
      settingsProvider: "openai",
      settingsModel: {},
      settingsStatus: null,
      artifacts: null
    };

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
      }[character]));
    }

    function loadConversations() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages))
          .slice(0, MAX_LOCAL_CONVERSATIONS)
          .map((chat) => ({
            id: chat.id,
            title: typeof chat.title === "string" && chat.title ? chat.title.slice(0, 72) : "New chat",
            provider: validProvider(chat.provider) ? chat.provider : "",
            model: typeof chat.model === "string" ? chat.model.slice(0, 128) : "",
            temperature: Number.isFinite(chat.temperature) ? Math.min(2, Math.max(0, chat.temperature)) : 0.7,
            updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : Date.now(),
            messages: chat.messages.filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
              .slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 1400) }))
          }));
      } catch (_) {
        return [];
      }
    }

    function validProvider(provider) { return PROVIDERS.some((item) => item.id === provider); }

    function providerMeta(provider) { return PROVIDERS.find((item) => item.id === provider) || PROVIDERS[0]; }

    function configured(provider) {
      return Boolean(state.configuration && state.configuration.providers && state.configuration.providers[provider] && state.configuration.providers[provider].configured);
    }

    function preferences() {
      return state.configuration && state.configuration.preferences ? state.configuration.preferences : { provider: "openai", model: "", temperature: 0.7 };
    }

    function makeId() {
      return crypto.randomUUID ? crypto.randomUUID() : "chat-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }

    function createConversation() {
      const defaults = preferences();
      const chat = {
        id: makeId(),
        title: "New chat",
        provider: validProvider(defaults.provider) ? defaults.provider : "openai",
        model: typeof defaults.model === "string" ? defaults.model : "",
        temperature: Number.isFinite(defaults.temperature) ? defaults.temperature : 0.7,
        updatedAt: Date.now(),
        messages: []
      };
      state.conversations.unshift(chat);
      state.activeId = chat.id;
      persistConversations();
      return chat;
    }

    function activeChat() {
      let chat = state.conversations.find((item) => item.id === state.activeId);
      if (!chat) chat = createConversation();
      return chat;
    }

    function persistConversations() {
      state.conversations = state.conversations.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, MAX_LOCAL_CONVERSATIONS);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state.conversations)); } catch (_) { showToast("Browser storage is unavailable; chats will not persist.", "error"); }
    }

    function touch(chat) {
      chat.updatedAt = Date.now();
      persistConversations();
    }

    class ChatEspError extends Error {
      constructor(code, message, hint) {
        super(message || "Request failed.");
        this.code = code || "request_failed";
        this.hint = hint || "Try again.";
      }
    }

    async function request(path, method = "GET", body = undefined, timeoutMs = 35000) {
      const options = { method, headers: { "Accept": "application/json" } };
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      options.signal = controller.signal;
      if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }
      let response;
      try {
        response = await fetch(path, options);
      } catch (error) {
        if (error && error.name === "AbortError") {
          throw new ChatEspError("gateway_timeout", "ChatESP did not finish the request in time.", "Check Wi-Fi and the provider, then try loading models again.");
        }
        throw new ChatEspError("gateway_unreachable", "This browser cannot reach ChatESP.", "Check the ESP32 URL and your local Wi-Fi connection.");
      } finally {
        window.clearTimeout(timeout);
      }
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok || !payload || !payload.ok) {
        const error = payload && payload.error ? payload.error : {};
        throw new ChatEspError(error.code, error.message || "ChatESP could not complete that request.", error.hint || "Retry the action.");
      }
      return payload;
    }

    async function uploadArtifact(blob, filename) {
      const data = new FormData();
      data.append("name", filename);
      data.append("file", blob, filename);
      let response;
      try { response = await fetch("/api/artifacts", { method: "POST", body: data }); }
      catch (_) { throw new ChatEspError("gateway_unreachable", "The artifact could not reach ChatESP.", "Check the local device connection and retry."); }
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok || !payload || !payload.ok) {
        const error = payload && payload.error ? payload.error : {};
        throw new ChatEspError(error.code, error.message || "ChatESP could not save the artifact.", error.hint || "Check available storage and retry.");
      }
      return payload;
    }

    function setConfiguration(payload) {
      if (payload && payload.configuration) state.configuration = payload.configuration;
    }

    function setModels(provider, payload) {
      state.models[provider] = Array.isArray(payload.models) ? payload.models
        .filter((model) => model && typeof model.id === "string" && model.id)
        .map((model) => ({ id: model.id, name: String(model.name || model.id) })) : [];
    }

    function statusText(error) {
      return error instanceof ChatEspError ? { message: error.message, hint: error.hint } : { message: "Something unexpected happened.", hint: "Retry the action." };
    }

    function showToast(message, kind = "") {
      const toast = $("toast");
      toast.textContent = message;
      toast.className = "toast show " + kind;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.className = "toast"; }, 5000);
    }

    function formatBytes(value) {
      const bytes = Number(value) || 0;
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function formatDate(value) {
      try { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
      catch (_) { return "Recent"; }
    }

    function renderChrome() {
      const chat = activeChat();
      const title = state.screen === "chat" ? chat.title : state.screen === "settings" ? "Settings" : state.screen === "artifacts" ? "Artifacts" : "How ChatESP works";
      $("page-title").textContent = title;
      $("topbar-eyebrow").textContent = state.screen === "chat" ? "Local model gateway" : "ChatESP control room";
      const chip = $("connection-chip");
      const text = $("connection-text");
      const connected = Boolean(state.health && state.health.wifi && state.health.wifi.stationConnected);
      chip.classList.toggle("connected", connected);
      if (!state.health) text.textContent = "Checking device";
      else if (connected) text.textContent = "ESP32 online";
      else text.textContent = "Setup AP active";

      const list = $("conversation-list");
      list.innerHTML = state.conversations.map((item) => {
        const model = item.model ? item.model : "No model selected";
        return `<button class="conversation ${item.id === state.activeId && state.screen === "chat" ? "active" : ""}" type="button" data-action="open-chat" data-chat-id="${escapeHtml(item.id)}"><span class="conversation-title">${escapeHtml(item.title)}</span><span class="conversation-meta">${escapeHtml(model)} - ${escapeHtml(formatDate(item.updatedAt))}</span></button>`;
      }).join("");
      $("sidebar").classList.toggle("open", state.sidebarOpen);
      $("rail-backdrop").classList.toggle("open", state.sidebarOpen);
      const mobileRail = window.matchMedia("(max-width: 760px)").matches;
      $("sidebar").setAttribute("aria-hidden", mobileRail && !state.sidebarOpen ? "true" : "false");
      $("sidebar").inert = mobileRail && !state.sidebarOpen;
    }

    function renderModelOptions(provider, selected, allowEmpty = true) {
      const models = state.models[provider] || [];
      const leading = allowEmpty ? `<option value="">${models.length ? "Choose a live model" : configured(provider) ? "Load live models" : "Configure this provider"}</option>` : "";
      return leading + models.map((model) => `<option value="${escapeHtml(model.id)}" ${model.id === selected ? "selected" : ""}>${escapeHtml(model.name)}</option>`).join("");
    }

    function renderChat() {
      const chat = activeChat();
      const provider = validProvider(chat.provider) ? chat.provider : "openai";
      chat.provider = provider;
      const providerInfo = providerMeta(provider);
      const hasModels = (state.models[provider] || []).length > 0;
      const configuredProvider = configured(provider);
      const needsSetup = !configuredProvider;
      const messages = chat.messages || [];
      const messageHtml = messages.length ? `<div id="messages" class="messages">${messages.map((message) => `<article class="message ${message.role}"><span class="message-label">${message.role === "user" ? "You" : "ChatESP"}</span><div class="bubble">${escapeHtml(message.content)}</div></article>`).join("")}${state.busy ? `<article class="message assistant pending"><span class="message-label">ChatESP</span><div class="bubble"><span class="typing-line"><i></i><i></i><i></i></span> ${state.agent ? "Preparing artifact" : "Thinking"}</div></article>` : ""}</div>` : renderWelcome(needsSetup);
      const modelDisabled = !configuredProvider || (!hasModels && !state.loadingModels[provider]);
      $("screen").innerHTML = `<div class="chat-screen">
        <div class="chat-header">
          <div class="chat-heading"><h2>${escapeHtml(chat.title)}</h2><p>${chat.model ? escapeHtml(providerInfo.label + " - " + chat.model) : "Select a provider and live model to begin."}</p></div>
          <div class="header-actions"><button class="icon-button" type="button" data-action="rename-chat" aria-label="Rename chat" title="Rename chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h8"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button><button class="icon-button" type="button" data-action="delete-chat" aria-label="Delete chat" title="Delete chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg></button></div>
        </div>
        <div class="chat-controls">
          <div class="select-field"><label for="chat-provider">Provider</label><select id="chat-provider">${PROVIDERS.map((item) => `<option value="${item.id}" ${item.id === provider ? "selected" : ""}>${item.label}</option>`).join("")}</select></div>
          <div class="select-field"><label for="chat-model">Live model</label><select id="chat-model" ${modelDisabled || state.loadingModels[provider] ? "disabled" : ""}>${state.loadingModels[provider] ? "<option>Loading live models...</option>" : renderModelOptions(provider, chat.model)}</select></div>
          <button class="button compact refresh-models" type="button" data-action="refresh-chat-models" ${state.loadingModels[provider] ? "disabled" : ""}>${hasModels ? "Refresh models" : "Load models"}</button>
        </div>
        ${messageHtml}
        <div class="composer-area"><div class="composer">
          <textarea id="prompt" maxlength="1400" placeholder="Message ChatESP" ${state.busy ? "disabled" : ""} aria-label="Message ChatESP"></textarea>
          <div class="composer-footer"><span class="composer-note">${needsSetup ? "Configure " + escapeHtml(providerInfo.label) + " to send a message." : state.agent ? "Agent makes a file plan, then saves the finished file." : "Enter sends. Shift+Enter adds a line."}</span>
          <div class="composer-actions"><button class="agent-toggle ${state.agent ? "on" : ""}" type="button" data-action="toggle-agent" aria-pressed="${state.agent}"><span class="toggle-dot"></span><span class="agent-word">Agent</span></button><button class="send-button" type="button" data-action="send-message" ${state.busy ? "disabled" : ""}>${state.busy ? "Working" : "Send"}</button></div></div>
        </div></div>
      </div>`;
      if (messages.length) requestAnimationFrame(scrollMessagesToBottom);
    }

    function renderWelcome(needsSetup) {
      return `<div class="welcome"><div class="welcome-card"><div class="signal-line" aria-hidden="true"><span></span><b></b><span></span></div><h2>Bring your own models. Keep control local.</h2><p>ChatESP runs on your ESP32, fetches models directly from your chosen provider, and keeps saved provider credentials in device flash.</p><div class="starter-grid"><button class="starter" type="button" data-action="starter" data-prompt="Turn a rough idea into a practical plan."><strong>Build a plan</strong><span>Structure an idea into useful next steps.</span></button><button class="starter" type="button" data-action="starter" data-prompt="Explain this topic clearly for a beginner."><strong>Explain clearly</strong><span>Turn complexity into a concise explanation.</span></button><button class="starter" type="button" data-action="starter" data-prompt="Create a useful document about this topic."><strong>Create a file</strong><span>Use Agent mode to make a document or spreadsheet.</span></button></div>${needsSetup ? `<div class="setup-callout"><span>Before your first message, test and save a provider key or Ollama LAN URL.</span><button class="button compact" type="button" data-action="show-settings">Open settings</button></div>` : ""}</div></div>`;
    }

    function settingsProviderInfo(provider) {
      const entry = state.configuration && state.configuration.providers ? state.configuration.providers[provider] : null;
      return entry || { configured: false, host: "" };
    }

    function renderSettings() {
      const provider = validProvider(state.settingsProvider) ? state.settingsProvider : "openai";
      state.settingsProvider = provider;
      const metadata = providerMeta(provider);
      const providerInfo = settingsProviderInfo(provider);
      const selectedModel = state.settingsModel[provider] || (preferences().provider === provider ? preferences().model : "");
      const temperature = preferences().provider === provider ? preferences().temperature : 0.7;
      const status = state.settingsStatus && state.settingsStatus.provider === provider ? state.settingsStatus : null;
      const isOllama = provider === "ollama";
      $("screen").innerHTML = `<div class="panel">
        <div class="panel-heading"><div><h2>Provider settings</h2><p>Test a key before saving it. ChatESP stores only the successful configuration in ESP32 NVS and never sends a saved key back to this browser.</p></div></div>
        <div class="panel-grid">
          <nav class="card provider-tabs" aria-label="Provider settings">${PROVIDERS.map((item) => {
            const entry = settingsProviderInfo(item.id);
            return `<button class="provider-tab ${item.id === provider ? "active" : ""}" type="button" data-action="settings-provider" data-provider="${item.id}"><span>${item.label}</span><span class="config-state ${entry.configured ? "ready" : ""}">${entry.configured ? "Saved" : "Not set"}</span><small>${item.note}</small></button>`;
          }).join("")}</nav>
          <section class="card card-pad settings-card">
            <h3>${metadata.label}</h3><p>${isOllama ? "Use the LAN address of the machine running Ollama, never localhost." : "Paste a key only when you want to test and save it. The field is cleared after a successful save."}</p>
            <div class="form-grid">
              ${isOllama ? `<div class="field"><label class="field-label" for="ollama-url">Ollama LAN URL</label><input id="ollama-url" type="url" inputmode="url" maxlength="160" autocomplete="off" placeholder="http://192.168.1.20:11434" value="${escapeHtml(providerInfo.host ? (providerInfo.scheme || "http") + "://" + providerInfo.host : "")}"><p class="field-help">The ESP32 must be able to reach this address on your network.</p></div>` : `<div class="field"><label class="field-label" for="provider-key">API key</label><input id="provider-key" type="password" maxlength="512" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste a new ${escapeHtml(metadata.label)} key"><p class="field-help">Test & Save checks live models first. Existing saved keys are kept if validation fails.</p></div>`}
              <div class="form-actions"><button class="button primary" type="button" data-action="test-save">Test &amp; Save</button><button class="button" type="button" data-action="refresh-settings-models" ${providerInfo.configured ? "" : "disabled"}>Refresh live models</button><button class="button danger" type="button" data-action="delete-provider" ${providerInfo.configured ? "" : "disabled"}>Delete stored ${isOllama ? "URL" : "key"}</button></div>
              <div class="field"><label class="field-label" for="settings-model">Default model</label><select id="settings-model" ${!(state.models[provider] || []).length ? "disabled" : ""}>${renderModelOptions(provider, selectedModel)}</select><p class="field-help">Only models returned live by ${escapeHtml(metadata.label)} appear here.</p></div>
              <div class="field"><label class="field-label" for="settings-temperature">Default temperature</label><div class="range-row"><input id="settings-temperature" type="range" min="0" max="2" step="0.1" value="${escapeHtml(temperature)}"><output id="temperature-value" class="range-value">${escapeHtml(temperature)}</output></div></div>
              <div class="form-actions"><button class="button" type="button" data-action="save-preferences">Save chat defaults</button></div>
            </div>
            ${status ? `<div class="status-box visible ${status.kind}"><strong>${escapeHtml(status.message)}</strong><span class="hint">${escapeHtml(status.hint)}</span></div>` : ""}
            <div class="detail-strip"><strong>Live models only</strong><span>There is no preset model list in ChatESP. Refresh models whenever your provider account changes.</span></div>
          </section>
        </div>
      </div>`;
    }

    function renderArtifacts() {
      const data = state.artifacts;
      const storage = data && data.storage ? data.storage : { totalBytes: 0, usedBytes: 0, freeBytes: 0 };
      const items = data && Array.isArray(data.artifacts) ? data.artifacts : [];
      const percent = storage.totalBytes ? Math.min(100, Math.round((storage.usedBytes / storage.totalBytes) * 100)) : 0;
      $("screen").innerHTML = `<div class="panel"><div class="panel-heading"><div><h2>Artifacts</h2><p>Finished files are stored on the ESP32 until you download or delete them. Generated code is never executed by ChatESP.</p></div><button class="button" type="button" data-action="refresh-artifacts">Refresh</button></div>
      <div class="artifact-summary"><div><strong>${formatBytes(storage.freeBytes)} free</strong><div class="storage-caption">${formatBytes(storage.usedBytes)} of ${formatBytes(storage.totalBytes)} used</div></div><div class="storage-bar" aria-label="${percent}% storage used"><span style="width:${percent}%"></span></div></div>
      <section class="card artifact-list">${items.length ? items.map((item) => `<div class="artifact-row"><div><div class="artifact-name">${escapeHtml(item.name)}</div><div class="artifact-meta">${formatBytes(item.size)} - ${escapeHtml(item.mime || "file")}</div></div><a class="artifact-link" href="/api/artifacts/download?name=${encodeURIComponent(item.name)}">Download</a><button class="button danger compact" type="button" data-action="delete-artifact" data-name="${escapeHtml(item.name)}">Delete</button></div>`).join("") : `<div class="empty-artifacts">No saved artifacts yet. Turn on Agent in a chat to plan, compose, and save a document, presentation, spreadsheet, text file, or code file.</div>`}</section></div>`;
    }

    function renderHelp() {
      $("screen").innerHTML = `<div class="panel"><div class="panel-heading"><div><h2>How it works</h2><p>ChatESP is a direct local gateway. Your browser controls the device; the ESP32 talks to your selected provider.</p></div></div><div class="help-grid"><section class="card card-pad"><h3>1. Configure a provider</h3><p>In Settings, paste a key or Ollama LAN URL and use Test &amp; Save. The ESP32 discovers live models before it saves anything.</p><ul><li>Keys remain in ESP32 NVS until deleted.</li><li>The browser receives only saved/not-saved status.</li><li>A network error does not overwrite a good key.</li></ul></section><section class="card card-pad"><h3>2. Choose live models</h3><p>The model picker is filled by the selected provider. ChatESP does not include a built-in model catalog.</p><ul><li>Use Refresh models after changing account access.</li><li>Each chat keeps its own provider and model choice.</li><li>Chats stay in this browser's local storage.</li></ul></section><section class="card card-pad"><h3>3. Use Agent carefully</h3><p>Agent asks the chosen model for a bounded file plan. Your browser makes the file, downloads it, then uploads it to the ESP32 artifact partition.</p><ul><li>Text and code work without extra browser libraries.</li><li>DOCX, PPTX, and XLSX load pinned open-source generators only when needed.</li><li>Generated code is never run.</li></ul></section><section class="card card-pad"><h3>LAN safety</h3><p>Keep this ESP32 on a trusted local network. This small direct gateway does not add user accounts or internet-facing access controls.</p><ul><li>Cloud HTTPS certificate validation is disabled for this constrained prototype.</li><li>Delete provider keys before handing the device to another person.</li><li>Use a dedicated, scoped provider key where available.</li></ul></section></div></div>`;
    }

    function render() {
      renderChrome();
      if (state.screen === "settings") return renderSettings();
      if (state.screen === "artifacts") return renderArtifacts();
      if (state.screen === "help") return renderHelp();
      renderChat();
    }

    function scrollMessagesToBottom() {
      const messages = $("messages");
      if (messages) messages.lastElementChild && messages.lastElementChild.scrollIntoView({ block: "end", behavior: "smooth" });
    }

    async function refreshModels(provider, silent = false) {
      if (!configured(provider) || state.loadingModels[provider]) {
        if (!configured(provider) && !silent) showToast("Configure this provider with Test & Save first.", "error");
        return;
      }
      state.loadingModels[provider] = true;
      render();
      try {
        const payload = await request("/api/providers/models?provider=" + encodeURIComponent(provider));
        setModels(provider, payload);
        if (!silent) showToast(`${(state.models[provider] || []).length} live models loaded.`, "success");
      } catch (error) {
        const detail = statusText(error);
        if (state.screen === "settings") state.settingsStatus = { provider, kind: "error", message: detail.message, hint: detail.hint };
        if (!silent) showToast(detail.message + " " + detail.hint, "error");
      } finally {
        delete state.loadingModels[provider];
        render();
      }
    }

    async function validateAndSave() {
      const provider = state.settingsProvider;
      const isOllama = provider === "ollama";
      const input = $(isOllama ? "ollama-url" : "provider-key");
      const value = input ? input.value.trim() : "";
      if (!value) {
        state.settingsStatus = { provider, kind: "error", message: isOllama ? "Enter an Ollama LAN URL." : "Paste an API key to test.", hint: "Nothing is saved until live model discovery succeeds." };
        render();
        return;
      }
      state.settingsStatus = { provider, kind: "success", message: "Testing provider and loading live models...", hint: "The submitted value exists only in this request until validation succeeds." };
      render();
      try {
        const payload = await request("/api/providers/validate", "POST", isOllama ? { provider, ollamaUrl: value } : { provider, apiKey: value });
        setConfiguration(payload);
        setModels(provider, payload);
        state.settingsStatus = { provider, kind: "success", message: `${(state.models[provider] || []).length} live models found. Configuration is saved on the ESP32.`, hint: "Select a default model, then save chat defaults if you want to reuse it." };
        if (input) input.value = "";
        showToast("Provider tested and saved.", "success");
      } catch (error) {
        const detail = statusText(error);
        state.settingsStatus = { provider, kind: "error", message: detail.message, hint: detail.hint };
      }
      render();
    }

    async function savePreferences() {
      const provider = state.settingsProvider;
      const modelField = $("settings-model");
      const temperatureField = $("settings-temperature");
      const model = modelField ? modelField.value : "";
      const temperature = temperatureField ? Number(temperatureField.value) : 0.7;
      try {
        const payload = await request("/api/preferences", "PUT", { provider, model, temperature });
        setConfiguration(payload);
        state.settingsModel[provider] = model;
        state.settingsStatus = { provider, kind: "success", message: "Chat defaults are saved on the ESP32.", hint: "New chats can start with this provider and model." };
        showToast("Chat defaults saved.", "success");
      } catch (error) {
        const detail = statusText(error);
        state.settingsStatus = { provider, kind: "error", message: detail.message, hint: detail.hint };
      }
      render();
    }

    async function deleteProvider() {
      const provider = state.settingsProvider;
      const label = provider === "ollama" ? "saved Ollama URL" : "saved " + providerMeta(provider).label + " key";
      if (!confirm("Delete the " + label + " from ESP32 flash?")) return;
      try {
        const payload = await request("/api/providers/key?provider=" + encodeURIComponent(provider), "DELETE");
        setConfiguration(payload);
        delete state.models[provider];
        state.settingsModel[provider] = "";
        state.settingsStatus = { provider, kind: "success", message: "Stored configuration deleted.", hint: "The next model refresh requires Test & Save again." };
        const chat = activeChat();
        if (chat.provider === provider) chat.model = "";
        touch(chat);
        showToast("Stored configuration deleted.", "success");
      } catch (error) {
        const detail = statusText(error);
        state.settingsStatus = { provider, kind: "error", message: detail.message, hint: detail.hint };
      }
      render();
    }

    function validArtifact(artifact) {
      if (!artifact || typeof artifact !== "object") throw new ChatEspError("agent_plan_invalid", "The agent did not return an artifact plan.", "Try a simpler artifact request.");
      const type = String(artifact.type || "");
      const filename = String(artifact.filename || "");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(filename) || filename.includes("..")) throw new ChatEspError("agent_plan_invalid", "The agent returned an unsafe filename.", "Try the request again.");
      const extensions = { docx: ".docx", pptx: ".pptx", xlsx: ".xlsx" };
      if (!(["docx", "pptx", "xlsx", "text", "code"].includes(type))) throw new ChatEspError("agent_plan_invalid", "The agent requested an unsupported file type.", "Choose document, presentation, spreadsheet, text, or code.");
      if (extensions[type] && !filename.toLowerCase().endsWith(extensions[type])) throw new ChatEspError("agent_plan_invalid", "The artifact filename does not match its type.", "Try again with a matching extension.");
      if ((artifact.sections || []).length > 8 || (artifact.slides || []).length > 8 || (artifact.sheets || []).length > 3) throw new ChatEspError("agent_plan_too_large", "The agent plan exceeds ChatESP's limits.", "Ask for a shorter artifact.");
      return { ...artifact, type, filename };
    }

    async function loadScript(source) {
      if (document.querySelector(`script[src="${source}"]`)) return;
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = source;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new ChatEspError("artifact_library_unavailable", "The browser could not load the required file generator.", "Check browser internet access and try again."));
        document.head.append(script);
      });
    }

    function plainArtifactContent(artifact) {
      if (typeof artifact.content === "string" && artifact.content) return artifact.content;
      if (Array.isArray(artifact.sections)) return artifact.sections.slice(0, 8).map((section) => `${section.heading || ""}\n${section.text || ""}`.trim()).join("\n\n");
      return artifact.title || "";
    }

    async function composeArtifact(artifact) {
      if (artifact.type === "text" || artifact.type === "code") {
        return new Blob([plainArtifactContent(artifact)], { type: artifact.type === "code" ? "text/plain;charset=utf-8" : "text/plain;charset=utf-8" });
      }
      if (artifact.type === "docx") {
        await loadScript("https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js");
        const Docx = window.docx;
        if (!Docx || !Docx.Document || !Docx.Packer) throw new ChatEspError("artifact_library_unavailable", "DOCX generation is unavailable in this browser.", "Reload ChatESP and retry.");
        const children = [new Docx.Paragraph({ text: String(artifact.title || "Document"), heading: Docx.HeadingLevel.TITLE })];
        (artifact.sections || []).slice(0, 8).forEach((section) => {
          if (section.heading) children.push(new Docx.Paragraph({ text: String(section.heading), heading: Docx.HeadingLevel.HEADING_1 }));
          if (section.text) children.push(new Docx.Paragraph({ text: String(section.text) }));
        });
        return Docx.Packer.toBlob(new Docx.Document({ sections: [{ children }] }));
      }
      if (artifact.type === "pptx") {
        await loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js");
        if (!window.PptxGenJS) throw new ChatEspError("artifact_library_unavailable", "PPTX generation is unavailable in this browser.", "Reload ChatESP and retry.");
        const presentation = new window.PptxGenJS();
        presentation.layout = "LAYOUT_WIDE";
        presentation.author = "ChatESP";
        (artifact.slides || []).slice(0, 8).forEach((slide, index) => {
          const page = presentation.addSlide();
          page.background = { color: "F7F8FC" };
          page.addShape(presentation.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.22, fill: { color: "5D5CE6" }, line: { color: "5D5CE6" } });
          page.addText(String(slide.title || artifact.title || "Slide " + (index + 1)), { x: 0.65, y: 0.66, w: 11.9, h: 0.52, fontFace: "Aptos Display", fontSize: 25, bold: true, color: "172033", margin: 0 });
          const bullets = (slide.bullets || []).slice(0, 8).map((bullet) => ({ text: String(bullet), options: { bullet: { indent: 16 }, hanging: 3 } }));
          page.addText(bullets.length ? bullets : [{ text: "", options: {} }], { x: 0.82, y: 1.56, w: 11.2, h: 4.8, fontFace: "Aptos", fontSize: 17, color: "34435B", breakLine: true, paraSpaceAfterPt: 12, margin: 0.04 });
        });
        let result;
        try { result = await presentation.write({ outputType: "blob" }); }
        catch (_) { result = await presentation.write("blob"); }
        return result instanceof Blob ? result : new Blob([result], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      }
      await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
      if (!window.XLSX) throw new ChatEspError("artifact_library_unavailable", "XLSX generation is unavailable in this browser.", "Reload ChatESP and retry.");
      const workbook = window.XLSX.utils.book_new();
      (artifact.sheets || []).slice(0, 3).forEach((sheet, index) => {
        const rows = [Array.isArray(sheet.columns) ? sheet.columns.slice(0, 16) : []].concat(Array.isArray(sheet.rows) ? sheet.rows.slice(0, 30).map((row) => Array.isArray(row) ? row.slice(0, 16) : []) : []);
        const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
        const name = String(sheet.name || "Sheet" + (index + 1)).replace(/[\\/*?:\[\]]/g, "_").slice(0, 31) || "Sheet" + (index + 1);
        window.XLSX.utils.book_append_sheet(workbook, worksheet, name);
      });
      if (!workbook.SheetNames.length) window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet([[String(artifact.title || "ChatESP artifact")]]), "Sheet1");
      const contents = window.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      return new Blob([contents], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }

    function downloadBlob(blob, filename) {
      const anchor = document.createElement("a");
      const url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function sendMessage() {
      const chat = activeChat();
      const field = $("prompt");
      const text = field ? field.value.trim() : "";
      if (!text || state.busy) return;
      if (!configured(chat.provider) || !chat.model) {
        state.screen = "settings";
        state.settingsProvider = chat.provider;
        showToast("Configure a provider and choose a live model before sending.", "error");
        render();
        return;
      }
      chat.messages.push({ role: "user", content: text.slice(0, 1400) });
      chat.messages = chat.messages.slice(-12);
      if (chat.title === "New chat") chat.title = text.replace(/\s+/g, " ").slice(0, 52) || "New chat";
      touch(chat);
      state.busy = true;
      render();
      try {
        if (state.agent) {
          const plan = await request("/api/agent/plan", "POST", { provider: chat.provider, model: chat.model, messages: chat.messages, temperature: 0.3 }, 60000);
          const artifact = validArtifact(plan.artifact);
          const blob = await composeArtifact(artifact);
          if (!blob.size || blob.size > 700 * 1024) throw new ChatEspError("artifact_too_large", "The finished artifact is too large for ESP32 storage.", "Ask for a shorter or simpler file.");
          downloadBlob(blob, artifact.filename);
          const uploaded = await uploadArtifact(blob, artifact.filename);
          state.artifacts = uploaded;
          chat.messages.push({ role: "assistant", content: "Created " + artifact.filename + ". It downloaded in your browser and is saved in Artifacts." });
          showToast("Artifact created and saved on the ESP32.", "success");
        } else {
          const reply = await request("/api/chat", "POST", { provider: chat.provider, model: chat.model, messages: chat.messages, temperature: chat.temperature });
          chat.messages.push({ role: "assistant", content: String(reply.content || "") });
        }
        chat.messages = chat.messages.slice(-12);
        touch(chat);
      } catch (error) {
        const detail = statusText(error);
        showToast(detail.message + " " + detail.hint, "error");
      } finally {
        state.busy = false;
        render();
      }
    }

    async function loadArtifacts() {
      try { state.artifacts = await request("/api/artifacts"); }
      catch (error) { const detail = statusText(error); showToast(detail.message, "error"); }
      render();
    }

    async function deleteArtifact(name) {
      if (!confirm("Delete " + name + " from ESP32 storage?")) return;
      try {
        state.artifacts = await request("/api/artifacts?name=" + encodeURIComponent(name), "DELETE");
        showToast("Artifact deleted.", "success");
      } catch (error) { const detail = statusText(error); showToast(detail.message, "error"); }
      render();
    }

    function changeChatProvider(provider) {
      const chat = activeChat();
      chat.provider = validProvider(provider) ? provider : "openai";
      chat.model = "";
      touch(chat);
      render();
    }

    function changeChatModel(model) {
      const chat = activeChat();
      const available = state.models[chat.provider] || [];
      chat.model = available.some((item) => item.id === model) ? model : "";
      touch(chat);
      render();
    }

    function renameChat() {
      const chat = activeChat();
      const name = prompt("Name this chat", chat.title);
      if (name === null) return;
      const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 72);
      if (!trimmed) return;
      chat.title = trimmed;
      touch(chat);
      render();
    }

    function deleteChat() {
      const chat = activeChat();
      if (!confirm("Delete this browser-only conversation?")) return;
      state.conversations = state.conversations.filter((item) => item.id !== chat.id);
      state.activeId = state.conversations[0] ? state.conversations[0].id : null;
      if (!state.activeId) createConversation();
      persistConversations();
      state.screen = "chat";
      render();
    }

    async function handleAction(action, source) {
      if (action === "new-chat") { createConversation(); state.screen = "chat"; state.sidebarOpen = false; render(); return; }
      if (action === "open-chat") { state.activeId = source.dataset.chatId; state.screen = "chat"; state.sidebarOpen = false; render(); return; }
      if (action === "open-sidebar") { state.sidebarOpen = true; renderChrome(); return; }
      if (action === "close-sidebar") { state.sidebarOpen = false; renderChrome(); return; }
      if (action === "show-settings") { state.screen = "settings"; state.settingsProvider = activeChat().provider || "openai"; state.sidebarOpen = false; render(); return; }
      if (action === "show-artifacts") { state.screen = "artifacts"; state.sidebarOpen = false; render(); if (!state.artifacts) await loadArtifacts(); return; }
      if (action === "show-help") { state.screen = "help"; state.sidebarOpen = false; render(); return; }
      if (action === "rename-chat") { renameChat(); return; }
      if (action === "delete-chat") { deleteChat(); return; }
      if (action === "refresh-chat-models") { await refreshModels(activeChat().provider); return; }
      if (action === "toggle-agent") { state.agent = !state.agent; render(); return; }
      if (action === "send-message") { await sendMessage(); return; }
      if (action === "starter") { const field = $("prompt"); if (field) { field.value = source.dataset.prompt || ""; field.focus(); } return; }
      if (action === "settings-provider") { state.settingsProvider = source.dataset.provider; state.settingsStatus = null; render(); return; }
      if (action === "test-save") { await validateAndSave(); return; }
      if (action === "refresh-settings-models") { await refreshModels(state.settingsProvider); return; }
      if (action === "save-preferences") { await savePreferences(); return; }
      if (action === "delete-provider") { await deleteProvider(); return; }
      if (action === "refresh-artifacts") { await loadArtifacts(); return; }
      if (action === "delete-artifact") { await deleteArtifact(source.dataset.name); }
    }

    document.addEventListener("click", (event) => {
      const control = event.target.closest("[data-action]");
      if (!control) return;
      void handleAction(control.dataset.action, control).catch((error) => { const detail = statusText(error); showToast(detail.message + " " + detail.hint, "error"); });
    });

    document.addEventListener("change", (event) => {
      if (event.target.id === "chat-provider") changeChatProvider(event.target.value);
      if (event.target.id === "chat-model") changeChatModel(event.target.value);
      if (event.target.id === "settings-model") state.settingsModel[state.settingsProvider] = event.target.value;
      if (event.target.id === "settings-temperature") $("temperature-value").textContent = event.target.value;
    });

    document.addEventListener("keydown", (event) => {
      if (event.target.id === "prompt" && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    });

    window.addEventListener("resize", () => renderChrome());

    async function boot() {
      if (!state.conversations.length) createConversation();
      else state.activeId = state.conversations[0].id;
      render();
      try {
        const bootstrap = await request("/api/bootstrap");
        setConfiguration(bootstrap);
        state.health = bootstrap;
      } catch (error) {
        const detail = statusText(error);
        showToast(detail.message + " " + detail.hint, "error");
      }
      render();
    }

    void boot();
  })();
  </script>
</body>
</html>
)CHATESP_UI";
