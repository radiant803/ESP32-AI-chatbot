// Tests for extractJson/repairJson (model output that is almost, but not quite, valid JSON).
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../src/05-engine.js"), "utf8");
const chunk = src.slice(src.indexOf("function repairJson"), src.indexOf("async function askJson"));
class ApiError extends Error { constructor(c, m, h) { super(m); this.code = c; this.hint = h; } }
const { extractJson } = new Function("ApiError", chunk + "; return { extractJson };")(ApiError);
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const eq = (t, expected, m) => { try { ok(JSON.stringify(extractJson(t)) === JSON.stringify(expected), m); } catch (e) { ok(false, m + " threw " + e.message); } };
eq('{"a":1}', { a: 1 }, "plain object");
eq('```json\n{"a":1}\n```', { a: 1 }, "whole-reply fence");
eq('Here you go:\n{"a":1}\nHope that helps!', { a: 1 }, "prose around JSON");
eq('{"md":"```python\\nprint(1)\\n```","n":2}', { md: "```python\nprint(1)\n```", n: 2 }, "code fence inside a string value");
eq('{"a":[1,2,],"b":{"c":3,},}', { a: [1, 2], b: { c: 3 } }, "trailing commas");
eq('{"a":1, // note\n"b":2}', { a: 1, b: 2 }, "line comment");
eq('{"title":"Deck","slides":[{"title":"One","bullets":["a","b"]},{"title":"Two","bul', { title: "Deck", slides: [{ title: "One", bullets: ["a", "b"] }, { title: "Two" }] }, "cut off mid key (dangling key dropped)");
eq('{"title":"Deck","slides":[{"title":"One"},{"title":"Tw', { title: "Deck", slides: [{ title: "One" }, { title: "Tw" }] }, "cut off inside a string");
eq('{"queries":["a","b",', { queries: ["a", "b"] }, "cut off after comma in array");
eq('{"a":{"b":[1,2', { a: { b: [1, 2] } }, "deeply nested truncation");
eq('[{"x":1},{"x":2}]', [{ x: 1 }, { x: 2 }], "top-level array");
eq('{"action":"final","answer":"done"}', { action: "final", answer: "done" }, "agent shape without args");
try { extractJson("I am sorry, I cannot do that."); ok(false, "prose only should throw"); } catch (e) { ok(e.code === "json_invalid" && /ended with/.test(e.hint), "prose only throws a helpful json_invalid"); }
try { extractJson(""); ok(false, "empty should throw"); } catch (e) { ok(e.code === "json_invalid", "empty throws json_invalid"); }
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
