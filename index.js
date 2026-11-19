/**
 * phrases — a DeepSeek Harness bundle for canned messages.
 *
 * The browser half never owns the data: the list lives in
 * `<DSH_HOME>/phrases.json`, and this half serves it and applies one mutation
 * per request. One store, two routes, no model tool.
 *
 * Every write is validated by `src/store.js` before it touches the file, and
 * writes are serialized so two browser tabs cannot interleave read-modify-write.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { applyAction, normalizeState } from "./src/store.js";

export const name = "phrases";

/** Only the web server is required; this plugin registers no tools. */
export const inject = ["webServer"];

const MAX_BODY_BYTES = 64 * 1024;

/** @param {string} home */
function storePathFor(home) {
  return join(home, "phrases.json");
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

export function apply(ctx) {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const file = storePathFor(home);

  /** Read the file; a missing file is an empty list, malformed JSON is an error. */
  const readState = async () => {
    let raw;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (/** @type {any} */ (error)?.code === "ENOENT") return normalizeState({});
      throw error;
    }
    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      throw new Error(`phrases.json 不是合法 JSON: ${file}`);
    }
  };

  const writeState = async (state) => {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tmp, file);
  };

  /** Serialize read-modify-write so two tabs cannot lose an edit. */
  let tail = Promise.resolve();
  const serialize = (task) => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const readBody = (request) =>
    new Promise((resolve, reject) => {
      /** @type {Buffer[]} */
      const chunks = [];
      let length = 0;
      request.on("data", (chunk) => {
        length += chunk.length;
        if (length > MAX_BODY_BYTES) {
          reject(new Error("请求体过大"));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      request.on("error", reject);
    });

  ctx.effect(() =>
    ctx.webServer.register({
      kind: "exact",
      path: "/api/phrases",
      handler: async (request, response) => {
        /** @param {number} status @param {unknown} value */
        const send = (status, value) => {
          response.writeHead(status, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          response.end(JSON.stringify(value));
        };

        try {
          if (request.method === "GET" || request.method === "HEAD") {
            const state = await readState();
            send(200, { phrases: state.phrases });
            return;
          }
          if (request.method !== "POST") {
            response.writeHead(405, { allow: "GET, HEAD, POST" });
            response.end();
            return;
          }

          // A write route on the loopback server: a JSON content type and a
          // custom header both force a CORS preflight this server never answers,
          // and the Origin check covers same-origin callers.
          const origin = typeof request.headers.origin === "string" ? request.headers.origin : "";
          if (origin !== "") {
            let host = "";
            try {
              host = new URL(origin).host;
            } catch {
              host = "";
            }
            if (host !== request.headers.host) {
              send(403, { error: "cross-origin write refused" });
              return;
            }
          }
          const type = String(request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
          if (type !== "application/json") {
            send(415, { error: "expected application/json" });
            return;
          }
          if (request.headers["x-phrases-write"] !== "1") {
            send(403, { error: "missing x-phrases-write header" });
            return;
          }

          /** @type {any} */
          let payload = null;
          try {
            payload = JSON.parse(await readBody(request));
          } catch {
            send(400, { error: "请求体不是合法 JSON" });
            return;
          }

          const result = await serialize(async () => {
            const state = await readState();
            const applied = applyAction(state, payload);
            if (applied.error !== undefined) return applied;
            await writeState(applied.state);
            return applied;
          });
          if (result.error !== undefined) {
            send(400, { error: result.error });
            return;
          }
          send(200, { phrases: result.state.phrases });
        } catch (error) {
          send(500, { error: messageOf(error) });
        }
      },
    }),
  );
}
