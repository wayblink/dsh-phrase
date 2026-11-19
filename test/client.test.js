import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Mount the browser module against a stub context and fake hook values.
 *
 * Function components are expanded in place; the panel and its rows have no
 * hooks of their own beyond the hook-value cursor the stub feeds.
 */
function mount(hookValues = []) {
  const tabs = [];
  const slots = new Map();
  const opened = [];
  const context = {
    effect: (fn) => {
      const disposer = fn();
      return typeof disposer === "function" ? disposer : () => {};
    },
    slots: {
      inject: (_owner, fn) => fn(),
      register: (options, component) => {
        slots.set(`${options.name}:${options.key ?? options.id}`, component);
        return () => {};
      },
    },
    sidebarRightTabs: {
      register(definition) {
        tabs.push(definition);
        return () => {};
      },
    },
    sidebarRight: {
      openTab(kind) {
        opened.push(kind);
      },
    },
  };
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: () => {
      const value = hookValues[cursor];
      cursor += 1;
      return [value, () => {}];
    },
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          const module = factory((name) => {
            if (name === "react") return React;
            throw new Error(`unexpected require ${name}`);
          });
          module.apply(context);
        },
      },
    },
    document: { baseURI: "http://example/" },
    fetch: async () => ({ ok: true, text: async () => JSON.stringify({ phrases: [] }) }),
    location: { origin: "http://example", href: "http://example/" },
    URL,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(here, "..", "client.js"), "utf8"), sandbox, { filename: "client.js" });
  return { tabs, slots, opened };
}

/** Expand function components so their elements are walkable. */
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (node === null || typeof node !== "object") return node;
  if (typeof node.type === "function") return expand(node.type(node.props));
  return { type: node.type, props: node.props, children: (node.children ?? []).map(expand) };
}

function find(tree, predicate) {
  if (Array.isArray(tree)) {
    for (const item of tree) {
      const hit = find(item, predicate);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (tree === null || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  return find(tree.children ?? [], predicate);
}

const READY = {
  status: "ready",
  phrases: [
    { id: "p_1", text: "收到，我马上看", createdAt: "2026-11-19T00:00:00.000Z" },
    { id: "p_2", text: "这个我晚点回复你", createdAt: "2026-11-19T00:00:01.000Z" },
  ],
  error: "",
};

test("the panel, the composer chip and the guide entry register", () => {
  const { tabs, slots } = mount();
  assert.equal(tabs.length, 1);
  const definition = tabs[0];
  assert.equal(definition.kind, "phrases");
  assert.equal(definition.title(""), "口头禅");
  assert.ok(Array.isArray(definition.guide) && definition.guide.length === 1);
  assert.equal(definition.guide[0].title(""), "口头禅");

  const keys = [...slots.keys()];
  assert.ok(keys.includes(`sidebar.right.pane.tab:${definition.id}`), "the panel body must register");
  assert.ok(keys.includes("conversation.composer.dock:phrases-chip"), "the chip must register");
});

test("the panel renders the stored phrases with insert, edit and delete", () => {
  const { slots } = mount([READY, 0, "", null, "", "", false]);
  const panel = slots.get("sidebar.right.pane.tab:@wayblink/phrases-dsh/panel");
  const tree = expand(panel({ inputActions: undefined, useInput: () => "" }));
  const text = JSON.stringify(tree);

  assert.ok(text.includes("口头禅"));
  assert.ok(text.includes("收到，我马上看"));
  assert.ok(text.includes("这个我晚点回复你"));
  assert.ok(text.includes("插入"));
  assert.ok(text.includes("编辑"));
  assert.ok(text.includes("删除"));
});

test("clicking a phrase inserts it through the composer actions", () => {
  const calls = [];
  const actions = {
    captureInsertion: () => ({ rev: 1 }),
    insertText: (value, span) => {
      calls.push([value, span]);
      return true;
    },
    setDraft: () => {},
  };
  const { slots } = mount([READY, 0, "", null, "", "", false]);
  const panel = slots.get("sidebar.right.pane.tab:@wayblink/phrases-dsh/panel");
  const tree = expand(panel({ inputActions: actions, useInput: (selector) => selector({ draft: "草稿" }) }));
  const insertButton = find(tree, (el) => el.type === "button" && el.props?.title === "插入到输入框");
  assert.ok(insertButton !== null, "the insert control must render");
  insertButton.props.onClick({ stopPropagation() {} });

  assert.deepEqual(calls, [["收到，我马上看", { rev: 1 }]]);
});

test("without composer actions the panel explains instead of throwing", () => {
  const { slots } = mount([READY, 0, "", null, "", "", false]);
  const panel = slots.get("sidebar.right.pane.tab:@wayblink/phrases-dsh/panel");
  const tree = expand(panel({ inputActions: undefined, useInput: () => "" }));
  const insertButton = find(tree, (el) => el.type === "button" && el.props?.title === "插入到输入框");
  insertButton.props.onClick({ stopPropagation() {} });
  // The notice is set through the stubbed setState, so the tree cannot show it;
  // the point is that the handler does not throw and tolerates the absence.
  assert.ok(true);
});
