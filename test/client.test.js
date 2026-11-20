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
 * The locale stub behaves like the real service for the two things this module
 * uses: `register` keeps the dictionaries, `bind` resolves the active language.
 * `language` picks which dictionary the panel reads.
 */
function mount(hookValues = [], language = "zh") {
  const tabs = [];
  const slots = new Map();
  const opened = [];
  const dictionaries = {};
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
    locale: {
      register(ns, dicts) {
        dictionaries[ns] = dicts;
        return () => {};
      },
      bind(ns) {
        return (key) => (dictionaries[ns]?.[language]?.[key] ?? key);
      },
      subscribe() {
        return () => {};
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
    useRef: () => ({ current: null }),
    Fragment: "fragment",
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
  error: null,
};

/** Hook order: useT, usePhrases(state), usePhrases(nonce), addText, editing, confirming, notice, busy. */
const PANEL_HOOKS = [0, READY, 0, "", null, "", null, false];

test("the panel, the composer chip and the guide entry register", () => {
  const { tabs, slots } = mount();
  assert.equal(tabs.length, 1);
  const definition = tabs[0];
  assert.equal(definition.kind, "dsh-phrase");
  assert.equal(definition.title(""), "口头禅");
  assert.ok(Array.isArray(definition.guide) && definition.guide.length === 1);
  assert.equal(definition.guide[0].title(""), "口头禅");

  const keys = [...slots.keys()];
  assert.ok(keys.includes("sidebar.right.pane.tab:dsh-phrase/panel"), "the panel body must register");
  assert.ok(keys.includes("conversation.input.left:dsh-phrase-chip"), "the composer tool-row chip must register");
  assert.ok(keys.includes("shell.overlay:dsh-phrase-menu"), "the dropdown layer must register");
  assert.ok(
    !keys.some(key => key.startsWith("conversation.hero.options")),
    "the chip lives in the tool row only, so the New Session page cannot show it twice",
  );
});

/** Hook order for the chip: useT, useHeroMenu, usePhrases(state), usePhrases(nonce). */
const CHIP_HOOKS = [0, 0, READY, 0];

test("the composer chip opens the dropdown and keeps the caret", () => {
  const mounted = mount(CHIP_HOOKS);
  const chip = mounted.slots.get("conversation.input.left:dsh-phrase-chip");
  const tree = expand(chip({ inputActions: undefined, useInput: () => "" }));
  const button = find(tree, (el) => el.type === "button");

  assert.ok(button !== null, "the chip must render a button");
  assert.ok("data-phrase-chip" in button.props, "the chip carries the marker the dropdown keeps clicks inside");
  assert.equal(button.props["aria-expanded"], false);
  assert.equal(button.props["aria-controls"], "dsh-phrase-menu");

  // Pressing must not move focus into the chip: the composer keeps the caret
  // that `captureInsertion` reads, so the phrase lands where it was typed.
  let prevented = false;
  button.props.onMouseDown({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented, "mousedown must be prevented");

  button.props.onClick({ detail: 1 });
  assert.deepEqual(mounted.opened, [], "the chip must not open the Sidebar tab any more");
});

test("the panel renders the stored phrases with insert, edit and delete", () => {
  const { slots } = mount(PANEL_HOOKS);
  const panel = slots.get("sidebar.right.pane.tab:dsh-phrase/panel");
  const tree = expand(panel({ inputActions: undefined, useInput: () => "" }));
  const text = JSON.stringify(tree);

  assert.ok(text.includes("口头禅"));
  assert.ok(text.includes("收到，我马上看"));
  assert.ok(text.includes("这个我晚点回复你"));
  assert.ok(text.includes("插入"));
  assert.ok(text.includes("编辑"));
  assert.ok(text.includes("删除"));
  assert.ok(text.includes("新增一句常说的话"), "the add prompt must be localized");
});

test("the panel follows the English dictionary", () => {
  const { tabs, slots } = mount(PANEL_HOOKS, "en");
  assert.equal(tabs[0].title(""), "Phrases");
  const panel = slots.get("sidebar.right.pane.tab:dsh-phrase/panel");
  const tree = expand(panel({ inputActions: undefined, useInput: () => "" }));
  const text = JSON.stringify(tree);

  assert.ok(text.includes("Phrases"));
  assert.ok(text.includes("Insert"));
  assert.ok(text.includes("Edit"));
  assert.ok(text.includes("Delete"));
  assert.ok(!text.includes("口头禅"), "no Chinese label should leak into the English UI");
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
  const { slots } = mount(PANEL_HOOKS);
  const panel = slots.get("sidebar.right.pane.tab:dsh-phrase/panel");
  const tree = expand(panel({ inputActions: actions, useInput: (selector) => selector({ draft: "草稿" }) }));
  const insertButton = find(tree, (el) => el.type === "button" && el.props?.title === "点击插入到输入框");
  assert.ok(insertButton !== null, "the insert control must render");
  insertButton.props.onClick({ stopPropagation() {} });

  assert.deepEqual(calls, [["收到，我马上看", { rev: 1 }]]);
});

test("without composer actions the panel explains instead of throwing", () => {
  const { slots } = mount(PANEL_HOOKS);
  const panel = slots.get("sidebar.right.pane.tab:dsh-phrase/panel");
  const tree = expand(panel({ inputActions: undefined, useInput: () => "" }));
  const insertButton = find(tree, (el) => el.type === "button" && el.props?.title === "点击插入到输入框");
  insertButton.props.onClick({ stopPropagation() {} });
  // The notice is state, not tree; the point is that the handler tolerates the
  // absence of the composer actions without throwing.
  assert.ok(true);
});
