// Zero-dependency build: concatenates web/src/*.js into one script, copies assets, and gzips them into data/
// for LittleFS (`pio run -t uploadfs`). Use --dev to skip gzip and write to web/dist instead.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes("--dev");
const out = dev ? join(here, "dist") : join(here, "..", "data");
const src = join(here, "src");

const js = readdirSync(src).filter((f) => f.endsWith(".js")).sort()
  .map((f) => `/* ${f} */\n` + readFileSync(join(src, f), "utf8")).join("\n");
const bundle = `(() => {\n"use strict";\n${js}\n})();\n`;

// Light minification that is safe for this code base: drop full-line // comments and blank lines.
const strip = (s) => s.split("\n").filter((l) => !/^\s*\/\/(?!\s*@)/.test(l) && l.trim()).join("\n");
const css = readFileSync(join(here, "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*\n/g, "\n");
const jsOut = strip(bundle);
// Asset URLs carry a content hash so the browser can cache them for a long time and still pick up every new build;
// only index.html (tiny) is revalidated on each load.
const hash = createHash("sha1").update(css).update(jsOut).digest("hex").slice(0, 8);
const files = {
  "index.html": readFileSync(join(here, "index.html"), "utf8").replace('href="app.css"', `href="app.css?v=${hash}"`).replace('src="app.js"', `src="app.js?v=${hash}"`),
  "app.css": css,
  "app.js": jsOut,
};
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let total = 0;
for (const [name, body] of Object.entries(files)) {
  const buf = dev ? Buffer.from(body) : gzipSync(Buffer.from(body), { level: 9 });
  writeFileSync(join(out, dev ? name : name + ".gz"), buf);
  total += buf.length;
  console.log(`${name.padEnd(12)} ${String(Buffer.byteLength(body)).padStart(8)} B -> ${String(buf.length).padStart(7)} B${dev ? "" : " gz"}`);
}
console.log(`total ${total} bytes -> ${out}`);
