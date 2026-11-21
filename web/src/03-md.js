// Small, safe markdown renderer (escapes all HTML) with code highlighting and citation chips.
const KW = /\b(abstract|as|async|await|break|case|catch|class|const|continue|def|default|del|do|elif|else|enum|except|export|extends|false|final|finally|fn|for|from|func|function|if|impl|import|in|interface|is|lambda|let|match|mod|new|nil|none|None|not|null|of|or|and|pass|pub|raise|return|self|static|struct|super|switch|this|throw|true|True|False|try|type|typeof|use|var|void|while|with|yield|int|float|double|char|bool|string|String|long|short|unsigned|include|define|namespace|template|public|private|protected)\b/g;
function highlight(code, lang) {
  lang = (lang || "").toLowerCase();
  if (!lang || /^(text|txt|plain|md|markdown|csv)$/.test(lang)) return esc(code);
  if (/^(html|xml|svg)$/.test(lang)) return esc(code).replace(/(&lt;\/?[a-zA-Z][\w-]*)/g, '<span class="tk-k">$1</span>').replace(/(&quot;[^&]*?&quot;)/g, '<span class="tk-s">$1</span>');
  const hash = /^(py|python|sh|bash|zsh|yaml|yml|toml|rb|ruby|r|ini)$/.test(lang);
  const tokens = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)|(#[^\n]*)|(\b\d[\d_.]*\b)|([A-Za-z_]\w*)(?=\s*\()/g;
  let out = "", last = 0, m;
  const kwify = (s) => esc(s).replace(KW, '<span class="tk-k">$1</span>');
  while ((m = tokens.exec(code))) {
    if (m[3] && !hash) continue; // '#' is only a comment in hash languages
    if (m[2] && m[2].startsWith("--") && !/sql|lua|hs/.test(lang)) continue;
    out += kwify(code.slice(last, m.index));
    const cls = m[1] ? "tk-s" : m[2] || m[3] ? "tk-c" : m[4] ? "tk-n" : "tk-f";
    out += `<span class="${cls}">${esc(m[0])}</span>`; last = tokens.lastIndex;
  }
  return out + kwify(code.slice(last));
}
function codeBlock(code, lang) {
  const id = "cb" + uid();
  const runnable = /^(html|svg)$/i.test(lang);
  return `<div class="code"><div class="code-head"><span class="grow">${esc(lang || "text")}</span>${runnable ? `<button class="tool-btn" data-act="preview-code" data-id="${id}" title="Preview" aria-label="Preview">${ico("eye", "sm")}</button>` : ""}<button class="tool-btn" data-act="copy-code" data-id="${id}" title="Copy" aria-label="Copy code">${ico("copy", "sm")}</button></div><pre><code id="${id}" data-raw="${esc(code)}">${highlight(code, lang)}</code></pre></div>`;
}
function inline(s, sources) {
  const stash = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { stash.push(`<code>${esc(c)}</code>`); return "\u0000" + (stash.length - 1) + "\u0000"; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\((data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;border-radius:12px">');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>").replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  if (sources) s = s.replace(/\[(\d{1,2})\]/g, (m, n) => { const src = sources[+n - 1]; return src ? `<sup class="cite"><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title)}">[${n}]</a></sup>` : m; });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}
function renderMarkdown(src, sources) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n"); const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || "");
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^\s*(```|~~~)\s*([\w+#.-]*)/))) {
      const fence = m[1]; const body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++; out.push(codeBlock(body.join("\n"), m[2])); continue;
    }
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2], sources)}</h${m[1].length}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (line.includes("|") && isTableSep(lines[i + 1])) {
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c, sources)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, sources)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue;
    }
    if (/^\s*>/.test(line)) { const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${renderMarkdown(q.join("\n"), sources)}</blockquote>`); continue; }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line); const items = []; const base = line.match(/^\s*/)[0].length;
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s+\S/.test(lines[i]) && items.length))) {
        const l = lines[i]; const mm = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (mm && mm[1].length <= base + 1) items.push(mm[3]); else if (mm) items[items.length - 1] += "\n" + l.trim().replace(/^([-*+]|\d+[.)])\s+/, "- "); else items[items.length - 1] += " " + l.trim();
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => { const [first, ...rest] = t.split("\n"); return `<li>${inline(first, sources)}${rest.length ? renderMarkdown(rest.join("\n"), sources) : ""}</li>`; }).join("")}</${tag}>`); continue;
    }
    const p = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,4}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i]) && !(lines[i].includes("|") && isTableSep(lines[i + 1]))) p.push(lines[i++]);
    out.push(`<p>${inline(p.join("\n"), sources).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("");
}
ACTS["copy-code"] = (el) => { const c = $(el.dataset.id); copyText(c.dataset.raw); toast("Code copied", "ok", "", 1400); };
ACTS["preview-code"] = (el) => { const c = $(el.dataset.id); Canvas.show({ type: "html", title: "Preview", html: c.dataset.raw }); };
