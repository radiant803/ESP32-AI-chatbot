// Safe markdown renderer (escapes all HTML): nested lists, aligned tables, task lists, footnotes, math (KaTeX, lazy),
// fenced code with syntax highlighting, citations. Output is plain HTML strings so streaming re-renders stay cheap.
const LANG_GROUP = { js: "c", javascript: "c", jsx: "c", ts: "c", tsx: "c", typescript: "c", mjs: "c", node: "c", java: "c", c: "c", "c++": "c", cpp: "c", h: "c", hpp: "c", cs: "c", csharp: "c", go: "c", golang: "c", rust: "c", rs: "c", swift: "c", kotlin: "c", kt: "c", php: "c", dart: "c", scala: "c", arduino: "c", ino: "c", py: "py", python: "py", python3: "py", rb: "py", ruby: "py", sh: "sh", bash: "sh", zsh: "sh", shell: "sh", console: "sh", powershell: "sh", ps1: "sh", sql: "sql", json: "json", jsonc: "json", yaml: "yaml", yml: "yaml", toml: "yaml", ini: "yaml", html: "html", xml: "html", svg: "html", css: "css", scss: "css", less: "css", diff: "diff", patch: "diff" };
const LANG_NAME = { js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", jsx: "JSX", py: "Python", python: "Python", sh: "Shell", bash: "Bash", zsh: "Zsh", cpp: "C++", "c++": "C++", cs: "C#", csharp: "C#", go: "Go", rs: "Rust", rust: "Rust", rb: "Ruby", ruby: "Ruby", sql: "SQL", json: "JSON", yaml: "YAML", yml: "YAML", html: "HTML", xml: "XML", css: "CSS", md: "Markdown", markdown: "Markdown", ino: "Arduino", arduino: "Arduino", diff: "Diff", java: "Java", kotlin: "Kotlin", swift: "Swift", php: "PHP", toml: "TOML", ini: "INI", c: "C", text: "Text", txt: "Text" };
const LANG_EXT = { js: "js", javascript: "js", ts: "ts", typescript: "ts", tsx: "tsx", jsx: "jsx", py: "py", python: "py", sh: "sh", bash: "sh", zsh: "sh", cpp: "cpp", "c++": "cpp", c: "c", cs: "cs", go: "go", rust: "rs", rs: "rs", ruby: "rb", sql: "sql", json: "json", yaml: "yaml", yml: "yml", html: "html", xml: "xml", css: "css", md: "md", markdown: "md", ino: "ino", arduino: "ino", java: "java", kotlin: "kt", swift: "swift", php: "php", toml: "toml", diff: "diff" };
const KW_C = new Set("abstract as async await break case catch class const continue debugger default defer delete do else enum export extends false final finally for from func function go if implements import in instanceof interface is let loop match mod mut namespace new nil null of override package private protected pub public readonly return select self static struct super switch template this throw trait true try type typedef typeof unsigned use var void volatile where while with yield int float double char bool string long short byte auto fn impl include define sizeof".split(" "));
const KW_PY = new Set("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield print".split(" "));
const KW_SH = new Set("if then else elif fi for do done while until case esac function in select echo cd export source sudo return exit local readonly set unset alias".split(" "));
const KW_SQL = new Set("select from where join left right inner outer full cross on group by order limit offset insert into values update set delete create table alter drop index view and or not null as distinct having union all case when then else end exists in like between is primary key foreign references default unique with returning".split(" "));
const KW_JSON = new Set(["true", "false", "null"]);

function langGroup(lang) { return LANG_GROUP[String(lang || "").toLowerCase()] || ""; }
function highlight(code, lang) {
  const g = langGroup(lang);
  if (!g) return esc(code);
  if (g === "diff") return code.split("\n").map((l) => `<span class="${/^\+(?!\+\+)/.test(l) ? "df-a" : /^-(?!--)/.test(l) ? "df-d" : l.startsWith("@@") ? "tk-k" : ""}">${esc(l)}</span>`).join("\n");
  if (g === "html") return esc(code).replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tk-c">$1</span>').replace(/(&lt;\/?[a-zA-Z][\w-]*)/g, '<span class="tk-k">$1</span>').replace(/(\s)([\w:@-]+)(=)(&quot;[^&]*?&quot;)/g, '$1<span class="tk-n">$2</span>$3<span class="tk-s">$4</span>');
  const line = g === "py" || g === "sh" || g === "yaml" ? "#[^\\n]*" : g === "sql" ? "--[^\\n]*" : g === "json" ? "(?!)" : g === "css" ? "(?!)" : "\\/\\/[^\\n]*";
  const block = g === "c" || g === "css" || g === "sql" ? "\\/\\*[\\s\\S]*?\\*\\/" : "(?!)";
  const ident = g === "css" || g === "yaml" || g === "sh" ? "[A-Za-z_$][\\w$-]*" : "[A-Za-z_$][\\w$]*";
  const re = new RegExp('("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)|(' + line + "|" + block + ")|(\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*\\.?\\d*(?:[eE][+-]?\\d+)?%?)|(" + ident + ")", "g");
  const kw = { c: KW_C, py: KW_PY, sh: KW_SH, sql: KW_SQL, json: KW_JSON }[g] || new Set();
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index)); last = re.lastIndex;
    const rest = code.slice(last, last + 40);
    let cls = "";
    if (m[1]) cls = (g === "json" || g === "yaml") && /^\s*:/.test(rest) ? "tk-f" : "tk-s";
    else if (m[2]) cls = "tk-c";
    else if (m[3]) cls = "tk-n";
    else { const w = g === "sql" ? m[4].toLowerCase() : m[4]; cls = kw.has(w) ? "tk-k" : g === "yaml" && /^\s*:(\s|$)/.test(rest) ? "tk-f" : g === "css" && /^\s*:/.test(rest) ? "tk-f" : /^\(/.test(rest) && g !== "sql" ? "tk-f" : ""; }
    out += cls ? `<span class="${cls}">${esc(m[0])}</span>` : esc(m[0]);
  }
  return out + esc(code.slice(last));
}
function codeBlock(code, lang) {
  const id = "cb" + uid(), l = String(lang || "").toLowerCase(), lines = code.split("\n").length, long = lines > 26;
  const name = LANG_NAME[l] || (l ? l[0].toUpperCase() + l.slice(1) : "Code"), runnable = /^(html|svg)$/.test(l), ext = LANG_EXT[l] || "txt";
  return `<div class="code${long ? " collapsed" : ""}"><div class="code-head"><span class="grow">${esc(name)}</span>${runnable ? `<button class="tool-btn" data-act="preview-code" data-id="${id}" title="Preview" aria-label="Preview">${ico("eye", "sm")}</button>` : ""}<button class="tool-btn hide-sm" data-act="wrap-code" title="Wrap lines" aria-label="Wrap lines">${ico("list", "sm")}</button><button class="tool-btn" data-act="download-code" data-id="${id}" data-ext="${ext}" title="Download" aria-label="Download">${ico("download", "sm")}</button><button class="tool-btn" data-act="copy-code" data-id="${id}" title="Copy" aria-label="Copy code">${ico("copy", "sm")}</button></div><pre><code id="${id}" data-raw="${esc(code)}">${highlight(code, l)}</code></pre>${long ? `<button class="code-more" data-act="code-expand">Show all ${lines} lines</button>` : ""}</div>`;
}

// ---- Math ----
const MATH_CACHE = new Map(); let katexState = 0;  // 0 = not requested, 1 = loading, 2 = ready, 3 = failed
function ensureKatex() {
  if (katexState) return; katexState = 1;
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"; document.head.append(css);
  loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js").then(() => { katexState = 2; MATH_CACHE.clear(); if (typeof UI !== "undefined") UI.render(); }, () => { katexState = 3; });
}
function renderMath(tex, display) {
  const key = (display ? "D" : "I") + tex;
  if (window.katex && katexState === 2) {
    if (!MATH_CACHE.has(key)) MATH_CACHE.set(key, safe(() => window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" }), `<code class="tex">${esc(tex)}</code>`));
    return MATH_CACHE.get(key);
  }
  ensureKatex();
  return `<code class="tex${display ? " tex-block" : ""}">${esc(tex)}</code>`;
}
// Pulls math out of the source (never inside code) and leaves \u0001<n>\u0002 placeholders.
function extractMath(src, ctx) {
  const put = (tex, display) => { ctx.math.push({ tex: tex.trim(), display }); return "\u0001" + (ctx.math.length - 1) + "\u0002"; };
  return src.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`)/).map((part, i) => i % 2 ? part : part
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => put(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => put(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => put(t, false))
    .replace(/(^|[^\\$\w])\$(?![\s$])((?:\\.|[^$\n\\])+?)(?<![\s\\])\$(?![\w$])/g, (m, pre, t) => (/^\d/.test(t) && /\s/.test(t) ? m : pre + put(t, false)))).join("");
}

// ---- Inline ----
function inline(s, ctx) {
  const stash = [];
  const keep = (html) => { stash.push(html); return "\u0000" + (stash.length - 1) + "\u0000"; };
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|~$<>])/g, (_, c) => "\u0003" + c.charCodeAt(0) + "\u0003");
  s = s.replace(/`+([^`\n]+?)`+/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\((data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)\)/g, (_, alt, src) => keep(`<img alt="${alt}" src="${src}" class="md-img" loading="lazy">`));
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+&quot;[^&]*?&quot;)?\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?![\s*])([^*\n]*?[^\s*])\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_(?![\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>").replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  s = s.replace(/(^|[\s(>])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  if (ctx.fn) s = s.replace(/\[\^([^\]\s]+)\]/g, (m, id) => { if (ctx.fn.defs[id] == null) return m; let n = ctx.fn.order.indexOf(id) + 1; if (!n) n = ctx.fn.order.push(id); return `<sup class="fn" id="fnr-${n}"><a href="#fn-${n}" data-act="noop">${n}</a></sup>`; });
  if (ctx.sources) s = s.replace(/\[(\d{1,2})\]/g, (m, n) => { const src = ctx.sources[+n - 1]; return src ? `<sup class="cite"><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title)}">[${n}]</a></sup>` : m; });
  s = s.replace(/\u0001(\d+)\u0002/g, (_, i) => `<span class="math">${renderMath(ctx.math[+i].tex, false)}</span>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]).replace(/\u0003(\d+)\u0003/g, (_, c) => esc(String.fromCharCode(+c)));
}

// ---- Blocks ----
const LI_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE_RE = /^\s*(```+|~~~+)\s*([\w+#.-]*)/;
const isTableSep = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l || "") || /^\s*\|\s*:?-+:?\s*\|?\s*$/.test(l || "");
const splitCells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
function startsBlock(lines, i) { const l = lines[i]; return FENCE_RE.test(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || LI_RE.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) || (l.includes("|") && isTableSep(lines[i + 1])); }

function renderList(items, ctx) {
  let out = "", i = 0;
  while (i < items.length) {
    const ordered = items[i].ordered, group = [];
    while (i < items.length && items[i].ordered === ordered) group.push(items[i++]);
    const tag = ordered ? "ol" : "ul", start = ordered && group[0].num !== 1 ? ` start="${group[0].num}"` : "";
    const tasks = group.some((it) => /^\[[ xX]\]\s/.test(it.text));
    out += `<${tag}${start}${tasks ? ' class="tasks"' : ""}>` + group.map((it) => {
      const task = it.text.match(/^\[([ xX])\]\s+([\s\S]*)$/);
      const body = inline(task ? task[2] : it.text, ctx).replace(/\n/g, "<br>");
      return `<li${task ? ' class="task"' : ""}>${task ? `<input type="checkbox" disabled ${task[1] !== " " ? "checked" : ""} aria-label="${task[1] !== " " ? "done" : "to do"}">` : ""}<span>${body}</span>${it.extra.map((e) => (e.code != null ? codeBlock(e.code, e.lang) : "")).join("")}${it.children.length ? renderList(it.children, ctx) : ""}</li>`;
    }).join("") + `</${tag}>`;
  }
  return out;
}
function parseList(lines, i, ctx) {
  const rows = [];
  while (i < lines.length) {
    const l = lines[i];
    if (LI_RE.test(l) || (rows.length && /^\s+\S/.test(l)) || (rows.length && !l.trim() && i + 1 < lines.length && (LI_RE.test(lines[i + 1]) || /^\s{2,}\S/.test(lines[i + 1])))) { rows.push(l); i++; } else break;
  }
  const roots = [], stack = [];
  for (let k = 0; k < rows.length; k++) {
    const l = rows[k], m = l.match(LI_RE);
    if (m) {
      const it = { indent: m[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m[2]), num: parseInt(m[2], 10) || 1, text: m[3], children: [], extra: [] };
      while (stack.length && stack[stack.length - 1].indent >= it.indent) stack.pop();
      (stack.length ? stack[stack.length - 1].children : roots).push(it); stack.push(it);
    } else if (l.trim() && stack.length) {
      const last = stack[stack.length - 1], f = l.match(FENCE_RE);
      if (f) { const body = []; k++; while (k < rows.length && !FENCE_RE.test(rows[k])) body.push(rows[k++].replace(/^\s{0,4}/, "")); last.extra.push({ code: body.join("\n"), lang: f[2] }); } else last.text += "\n" + l.trim();
    }
  }
  return { html: renderList(roots, ctx), next: i };
}
function blocks(lines, ctx) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i]; let m;
    if ((m = line.match(FENCE_RE))) {
      const fence = m[1], body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++; out.push(codeBlock(body.join("\n"), m[2])); continue;
    }
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { const n = Math.min(m[1].length, 4); out.push(`<h${n}>${inline(m[2], ctx)}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (line.includes("|") && isTableSep(lines[i + 1])) {
      const head = splitCells(line), aligns = splitCells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : "")); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitCells(lines[i++]));
      const st = (k) => (aligns[k] ? ` style="text-align:${aligns[k]}"` : "");
      const tsv = [head, ...rows].map((r) => r.join("\t")).join("\n");
      out.push(`<div class="tbl"><button class="tool-btn tbl-copy" data-act="copy-table" data-tsv="${esc(tsv)}" title="Copy table" aria-label="Copy table">${ico("copy", "sm")}</button><div class="tbl-scroll"><table><thead><tr>${head.map((c, k) => `<th${st(k)}>${inline(c, ctx)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td${st(k)}>${inline(r[k] || "", ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`); continue;
    }
    if (/^\s*>/.test(line)) { const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${blocks(q, ctx)}</blockquote>`); continue; }
    if (LI_RE.test(line)) { const r = parseList(lines, i, ctx); out.push(r.html); i = r.next; continue; }
    const p = [line]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) p.push(lines[i++]);
    const text = p.join("\n").trim(), only = text.match(/^\u0001(\d+)\u0002$/);
    if (only && ctx.math[+only[1]].display) out.push(`<div class="math-block">${renderMath(ctx.math[+only[1]].tex, true)}</div>`);
    else out.push(`<p>${inline(text, ctx).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("");
}
function renderMarkdown(src, sources) {
  const ctx = { sources, math: [], fn: { defs: {}, order: [] } };
  let text = String(src || "").replace(/\r\n?/g, "\n");
  text = text.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.+)$/gm, (_, id, body) => { ctx.fn.defs[id] = body; return ""; });
  text = extractMath(text, ctx);
  let html = blocks(text.split("\n"), ctx);
  if (ctx.fn.order.length) html += `<div class="footnotes"><hr><ol>${ctx.fn.order.map((id, k) => `<li id="fn-${k + 1}">${inline(ctx.fn.defs[id], { ...ctx, fn: null })} <a href="#fnr-${k + 1}" data-act="noop" aria-label="Back to text">↩</a></li>`).join("")}</ol></div>`;
  return html;
}

ACTS.noop = (el, e) => { e && e.preventDefault(); const id = (el.getAttribute("href") || "").slice(1), t = id && document.getElementById(id); if (t) t.scrollIntoView({ block: "center", behavior: "smooth" }); };
const flashOk = (el) => { const old = el.innerHTML; el.innerHTML = ico("check", "sm"); el.classList.add("ok"); setTimeout(() => { el.innerHTML = old; el.classList.remove("ok"); }, 1400); };
ACTS["copy-code"] = (el) => { copyText($(el.dataset.id).dataset.raw); flashOk(el); };
ACTS["copy-table"] = (el) => { copyText(el.dataset.tsv); flashOk(el); };
ACTS["wrap-code"] = (el) => { const c = el.closest(".code"); c.classList.toggle("wrap"); el.classList.toggle("on", c.classList.contains("wrap")); };
ACTS["code-expand"] = (el) => { el.closest(".code").classList.remove("collapsed"); el.remove(); };
ACTS["download-code"] = (el) => download(new Blob([$(el.dataset.id).dataset.raw], { type: "text/plain" }), "snippet." + (el.dataset.ext || "txt"));
ACTS["preview-code"] = (el) => { const c = $(el.dataset.id); Canvas.show({ type: "html", title: "Preview", html: c.dataset.raw }); };
