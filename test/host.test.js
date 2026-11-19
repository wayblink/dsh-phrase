import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

/** Mount the host half against a fake context and a throwaway DSH_HOME. */
async function mount() {
  const home = await mkdtemp(join(tmpdir(), "phrases-test-"));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const routes = new Map();
  const context = {
    effect: (fn) => {
      const disposer = fn();
      return typeof disposer === "function" ? disposer : () => {};
    },
    webServer: {
      register(route) {
        routes.set(route.path, route);
        return () => {};
      },
    },
  };
  const { apply } = await import("../index.js");
  apply(context);
  const handler = routes.get("/api/dsh-phrase")?.handler;
  assert.equal(typeof handler, "function", "the phrases route must register");

  const call = async ({ method = "GET", headers = {}, body = "" } = {}) => {
    const request = new EventEmitter();
    request.method = method;
    request.headers = headers;
    request.destroy = () => {};
    process.nextTick(() => {
      if (body !== "") request.emit("data", Buffer.from(body));
      request.emit("end");
    });
    const response = {
      status: 0,
      headers: {},
      body: "",
      writeHead(status, responseHeaders) {
        this.status = status;
        this.headers = responseHeaders ?? {};
      },
      end(chunk) {
        if (chunk !== undefined) this.body = String(chunk);
      },
    };
    await handler(request, response);
    let json = null;
    try {
      json = JSON.parse(response.body);
    } catch {
      json = null;
    }
    return { status: response.status, json, body: response.body };
  };

  const cleanup = async () => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  };
  return { home, call, cleanup };
}

const jsonHeaders = { "content-type": "application/json", "x-dsh-phrase-write": "1", host: "localhost" };

test("the list starts empty and an add round-trips through the file", async (t) => {
  const { home, call, cleanup } = await mount();
  t.after(cleanup);

  const before = await call({});
  assert.equal(before.status, 200);
  assert.deepEqual(before.json, { phrases: [] });

  const added = await call({
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "add", text: "  收到，我马上看  " }),
  });
  assert.equal(added.status, 200, added.body);
  assert.equal(added.json.phrases.length, 1);
  assert.equal(added.json.phrases[0].text, "收到，我马上看");

  const disk = JSON.parse(await readFile(join(home, "dsh-phrase.json"), "utf8"));
  assert.equal(disk.phrases[0].text, "收到，我马上看");

  const after = await call({});
  assert.equal(after.json.phrases.length, 1);
});

test("duplicates and empty phrases are refused with a message", async (t) => {
  const { call, cleanup } = await mount();
  t.after(cleanup);

  await call({ method: "POST", headers: jsonHeaders, body: JSON.stringify({ action: "add", text: "好的" }) });
  const duplicate = await call({
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "add", text: "好的" }),
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.json.error, "duplicate");

  const empty = await call({ method: "POST", headers: jsonHeaders, body: JSON.stringify({ action: "add", text: " " }) });
  assert.equal(empty.status, 400);
  assert.equal(empty.json.error, "empty");
});

test("update and delete go through one action each", async (t) => {
  const { call, cleanup } = await mount();
  t.after(cleanup);

  const added = await call({
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "add", text: "旧文案" }),
  });
  const id = added.json.phrases[0].id;

  const updated = await call({
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "update", id, text: "新文案" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.phrases[0].text, "新文案");

  const deleted = await call({
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "delete", id }),
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.json.phrases, []);
});

test("the write route refuses a missing header, a wrong type and a foreign origin", async (t) => {
  const { call, cleanup } = await mount();
  t.after(cleanup);

  const noHeader = await call({
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost" },
    body: JSON.stringify({ action: "add", text: "x" }),
  });
  assert.equal(noHeader.status, 403);

  const wrongType = await call({
    method: "POST",
    headers: { "content-type": "text/plain", "x-dsh-phrase-write": "1", host: "localhost" },
    body: JSON.stringify({ action: "add", text: "x" }),
  });
  assert.equal(wrongType.status, 415);

  const crossOrigin = await call({
    method: "POST",
    headers: { ...jsonHeaders, origin: "http://evil.example" },
    body: JSON.stringify({ action: "add", text: "x" }),
  });
  assert.equal(crossOrigin.status, 403);
});

test("a malformed store file is reported instead of silently emptied", async (t) => {
  const { home, call, cleanup } = await mount();
  t.after(cleanup);
  await writeFile(join(home, "dsh-phrase.json"), "{not json", "utf8");

  const response = await call({});
  assert.equal(response.status, 500);
  assert.equal(response.json.error, "store_corrupt");
});
