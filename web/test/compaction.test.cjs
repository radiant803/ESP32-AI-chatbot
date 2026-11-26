const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const source = ["00-util.js", "01-store.js", "02-api.js", "05-engine.js"]
  .map((file) => readFileSync(join(__dirname, "../src", file), "utf8")).join("\n");
const load = new Function("provider", "document", source + `
  const UI = { render() {}, updateNode() {}, afterTurn() {} };
  Store.saveChat = () => {};
  Dev.config = { providers: { openai: { configured: true }, anthropic: { configured: true }, google: { configured: true } } };
  streamChat = (name, req, _cb, signal) => provider(name, buildRequest(name, req).body, signal);
  return { Dev, Store, addNode, newChat, runTurn, pathMessages, fitToLimit, buildRequest };
`);

const summary = "Earlier settings: use the blue enclosure and keep the 20 mm mount.";
const latest = "Use the red enclosure now. Reply with exactly RED.";
const wireBytes = (body) => Buffer.byteLength(JSON.stringify(body));

function fixture(bodyBytes, replies = []) {
  const calls = [];
  const app = load(async (provider, body, signal) => {
    assert(!signal?.aborted);
    calls.push({ provider, body });
    assert(wireBytes(body) <= bodyBytes, "provider request exceeds the device byte cap");
    const reply = replies[calls.length - 1];
    if (reply instanceof Error) throw reply;
    return { text: reply || "RED", usage: {} };
  }, { addEventListener() {} });
  app.Dev.limits.bodyBytes = bodyBytes;
  const chat = app.newChat({ provider: "openai", model: "gpt-4o-mini" });
  let parent = null;
  const add = (role, text) => {
    const node = app.addNode(chat, parent, { role, text });
    parent = node.id;
    return node;
  };
  return { ...app, chat, calls, add };
}

test("a second turn compacts a long first answer and sends the current user instruction verbatim", async () => {
  const f = fixture(6000, [summary]);
  f.add("user", "Use a blue enclosure with a 20 mm mount.");
  const old = f.add("assistant", "Earlier explanation. ".repeat(450));
  const user = f.add("user", latest);
  await f.runTurn(f.chat, user);
  assert.equal(f.calls.length, 2);
  assert.doesNotMatch(f.calls[0].body.input[0].content[0].text, /exactly RED/);
  const request = f.calls[1].body;
  assert.equal(request.input.at(-1).content[0].text, latest);
  assert.match(request.instructions, /blue enclosure/);
  assert.equal(f.chat.compact.upTo, old.id);
});

test("a large historical summary yields to a UTF-8 current instruction", async () => {
  const f = fixture(6000);
  f.add("user", "Use blue");
  const old = f.add("assistant", "Ok");
  f.chat.compact = { upTo: old.id, text: "OLD SUMMARY ".repeat(291), n: 2 };
  const text = "🟧漢".repeat(665) + "\n" + latest;
  const user = f.add("user", text);
  await f.runTurn(f.chat, user);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.input.at(-1).content[0].text, text);
  assert(wireBytes(f.calls[0].body) <= 6000);
});

test("short exchanges skip compaction, and a failed summary still sends the last instruction", async () => {
  const short = fixture(6000);
  short.add("user", "Give me an enclosure idea.");
  short.add("assistant", "Try blue.");
  await short.runTurn(short.chat, short.add("user", latest));
  assert.equal(short.calls.length, 1);
  assert.equal(short.calls[0].body.input.length, 3);

  const failed = fixture(6000, [new Error("Simulated summary failure")]);
  failed.add("user", "Give me an enclosure idea.");
  failed.add("assistant", "Try blue. ".repeat(800));
  await failed.runTurn(failed.chat, failed.add("user", latest));
  assert.equal(failed.calls.length, 2);
  assert.equal(failed.calls[1].body.input.at(-1).content[0].text, latest);
  assert.equal(failed.chat.compact, undefined);
});

test("model overrides use the new summary and keep the most recent full exchange", async () => {
  const f = fixture(40000, [summary]);
  f.add("user", "First instruction");
  f.add("assistant", "Large old response. ".repeat(2700));
  f.add("user", "Does it fit?");
  f.add("assistant", "It fits a 20 mm mount.");
  const user = f.add("user", latest);
  await f.runTurn(f.chat, user, { provider: "anthropic", model: "claude-test" });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].provider, "anthropic");
  const body = f.calls[1].body;
  assert.match(body.system, /Follow the latest user message/);
  assert.match(body.system, /Earlier settings/);
  assert.deepEqual(body.messages.map((message) => message.content[0].text),
    ["Does it fit?", "It fits a 20 mm mount.", latest]);
});

test("an edited branch does not receive a summary of the replaced turn", async () => {
  const f = fixture(6000);
  const user = f.add("user", "Original task");
  const old = f.add("assistant", "Original answer");
  f.chat.compact = { upTo: old.id, text: "Summary from another branch", n: 2 };
  const edited = f.addNode(f.chat, user.id, { role: "user", text: latest });
  await f.runTurn(f.chat, edited);
  assert.equal(f.calls.length, 1);
  assert.doesNotMatch(f.calls[0].body.instructions, /Summary from another branch/);
  assert.match(f.calls[0].body.input.at(-1).content[0].text, /exactly RED/);
});

test("when an Agent tool result is too large, the task remains verbatim", () => {
  const f = fixture(6000);
  const task = { role: "user", text: latest };
  const tool = { role: "user", text: "Tool result: " + "🟧漢".repeat(1000) + " the newest result" };
  const request = f.fitToLimit("openai", {
    model: "gpt-4o-mini", system: "Agent tool instructions", messages: [task, tool],
  }, { pinFirst: true, shortenToolResult: true });
  assert.equal(request.messages[0].text, latest);
  assert.match(request.messages[1].text, /the newest result/);
  assert(wireBytes(f.buildRequest("openai", request).body) <= 6000);
  assert(tool.text.length > request.messages[1].text.length);
});
