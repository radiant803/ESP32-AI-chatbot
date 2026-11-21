// Tests for Design mode's pure helpers: type detection, code extraction, continuation merging, linting.
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../src/06-design.js"), "utf8");
const pure = src.slice(0, src.indexOf("const Design = {"));
const H = new Function("fmtBytes", pure + "; return { DESIGN_TYPES, designType, detectDesignType, extractCode, isComplete, mergeContinuation, sanitizeSvg, lintDesign, titleFromCode, deadline };")((n) => n + "B");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const D = H.detectDesignType;
for (const [text, want] of [
  ["An 8-slide comparison between Apple Silicon and x86 laptops", "deck"], ["a pitch deck for my startup", "deck"], ["Design a portfolio website for a photographer", "website"], ["a landing page for a meditation app", "landing"],
  ["a clickable prototype of a banking app", "prototype"], ["an analytics dashboard for sales", "dashboard"], ["a pricing table component with three tiers", "component"], ["a newsletter email announcing our sale", "email"],
  ["a logo for a coffee roaster", "logo"], ["an Instagram post for our launch", "poster"], ["an infographic about sleep", "infographic"], ["a wireframe of a checkout flow", "wireframe"],
  ["an animated loading screen", "animation"], ["my resume as a one-pager", "onepager"], ["a design system for a fintech app", "system"], ["a pomodoro timer", "tool"], ["a website with an animated hero", "website"], ["something nice", "website"],
]) ok(D(text) === want, `detect "${text}" -> ${want} (got ${D(text)})`);
ok(H.DESIGN_TYPES.every((t) => t.id === "auto" || t.kind === "deck" || t.spec), "every buildable type has a spec");
ok(H.DESIGN_TYPES.filter((t) => t.kind === "svg").every((t) => t.size && t.size.w && t.size.h), "every SVG type has a canvas size");
const E = H.extractCode;
ok(E("```html\n<!doctype html><html><body>x</body></html>\n```", "html") === "<!doctype html><html><body>x</body></html>", "fenced html");
ok(E("Sure! Here it is:\n```html\n<!doctype html><html>\n<body>partial", "html") === "<!doctype html><html>\n<body>partial", "unterminated fence while streaming");
ok(E("<!DOCTYPE html><html></html>", "html").startsWith("<!DOCTYPE"), "no fence at all");
ok(E("intro text <!doctype html><html></html> trailing", "html").startsWith("<!doctype"), "prose before an unfenced file");
ok(E("```svg\n<svg viewBox=\"0 0 10 10\"><rect/></svg>\nthanks\n```", "svg").endsWith("</svg>"), "svg trimmed to the closing tag");
ok(H.isComplete("<html></html>\n", "html") && !H.isComplete("<html><body>", "html") && H.isComplete("<svg></svg>", "svg"), "completeness checks");
const M = H.mergeContinuation;
ok(M("<p>hello world and more te", "xt</p></body></html>") === "<p>hello world and more text</p></body></html>", "plain continuation");
ok(M("<div>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</div></html>") === "<div>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</div></html>", "repeated seam is dropped");
ok(M("<p>x", "```html\n</p></body></html>\n```") === "<p>x</p></body></html>", "fences stripped from continuation");
ok(!/script|onload|javascript:/i.test(H.sanitizeSvg('<svg onload="x()"><script>alert(1)</script><a href="javascript:alert(2)"><rect/></a></svg>')), "svg scripts, handlers and js links removed");
const L = H.lintDesign;
ok(L("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body>ok</body></html>", "html").length === 0, "clean page has no issues");
ok(L("<html><body>", "html").length >= 3, "broken page reports several issues");
ok(L('<!doctype html><html><head><meta name="viewport" content="x"><script src="https://cdn.example/x.js"></script></head></html>', "html").some((x) => /external/i.test(x)), "external script flagged");
ok(L('<!doctype html><html><head><meta name="viewport" content="x"></head><body>Lorem ipsum</body></html>', "html").some((x) => /lorem/i.test(x)), "lorem ipsum flagged");
ok(L('<svg viewBox="0 0 1 1"></svg>', "svg").length === 0 && L("<svg></svg>", "svg").some((x) => /viewBox/.test(x)), "svg viewBox check");
ok(H.titleFromCode("<title>My Site</title>", "x") === "My Site" && H.titleFromCode("<p>x</p>", "Fallback") === "Fallback", "title extraction");
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const user = new AbortController(); const d1 = H.deadline(user.signal, 40);
  await sleep(90); ok(d1.signal.aborted && d1.timedOut(), "deadline aborts and reports a timeout");
  const user2 = new AbortController(); const d2 = H.deadline(user2.signal, 500); user2.abort(); await sleep(10); ok(d2.signal.aborted && !d2.timedOut(), "user Stop aborts without reporting a timeout");
  const user3 = new AbortController(); const d3 = H.deadline(user3.signal, 40); d3.done(); await sleep(90); ok(!d3.signal.aborted, "done() cancels the timer");
  console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
return;
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
