import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PHRASES, MAX_TEXT_LENGTH, applyAction, cleanText, normalizeState } from "../src/store.js";

const clock = { id: "p_test_1", now: "2026-11-19T03:00:00.000Z" };
const empty = { version: 1, phrases: [] };

function withPhrases(...texts) {
  return {
    version: 1,
    phrases: texts.map((text, index) => ({ id: `p_${index + 1}`, text, createdAt: "2026-11-19T00:00:00.000Z" })),
  };
}

test("an added phrase is trimmed and stamped", () => {
  const result = applyAction(empty, { action: "add", text: "  收到，我马上看  " }, clock);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.phrases, [
    { id: "p_test_1", text: "收到，我马上看", createdAt: "2026-11-19T03:00:00.000Z" },
  ]);
});

test("empty, oversized and duplicate phrases are refused", () => {
  assert.equal(applyAction(empty, { action: "add", text: "   " }).error, "内容不能为空");
  assert.match(applyAction(empty, { action: "add", text: "x".repeat(MAX_TEXT_LENGTH + 1) }).error, /不能超过/);
  const existing = withPhrases("好的");
  assert.equal(applyAction(existing, { action: "add", text: "好的" }).error, "这句已经存过了");
});

test("the list is capped", () => {
  const full = withPhrases(...Array.from({ length: MAX_PHRASES }, (_, i) => `第 ${i + 1} 句`));
  assert.match(applyAction(full, { action: "add", text: "多一句" }).error, /最多保存/);
});

test("update rewrites one phrase and preserves its identity", () => {
  const result = applyAction(withPhrases("旧文案", "另一句"), { action: "update", id: "p_1", text: "新文案" });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.phrases.map((row) => [row.id, row.text]), [
    ["p_1", "新文案"],
    ["p_2", "另一句"],
  ]);
});

test("update refuses an unknown id, an empty body and a duplicate", () => {
  const state = withPhrases("A", "B");
  assert.equal(applyAction(state, { action: "update", id: "nope", text: "C" }).error, "找不到这条口头禅");
  assert.equal(applyAction(state, { action: "update", id: "p_1", text: "  " }).error, "内容不能为空");
  assert.equal(applyAction(state, { action: "update", id: "p_1", text: "B" }).error, "这句已经存过了");
});

test("delete removes one phrase and refuses an unknown id", () => {
  const result = applyAction(withPhrases("A", "B"), { action: "delete", id: "p_1" });
  assert.deepEqual(result.state.phrases.map((row) => row.text), ["B"]);
  assert.equal(applyAction(withPhrases("A"), { action: "delete", id: "nope" }).error, "找不到这条口头禅");
});

test("an unknown action is an error, not a silent no-op", () => {
  assert.match(applyAction(empty, { action: "explode" }).error, /未知操作/);
  assert.match(applyAction(empty, {}).error, /未知操作/);
});

test("normalizeState drops junk, duplicates and over-cap rows", () => {
  const state = normalizeState({
    version: 1,
    phrases: [
      { id: "a", text: "  第一句  ", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", text: "   " },
      { id: "c", text: "第一句" },
      { id: "d", text: "x".repeat(MAX_TEXT_LENGTH + 1) },
      { id: "e", text: "第二句" },
      null,
      "junk",
    ],
  });
  assert.deepEqual(state.phrases.map((row) => row.text), ["第一句", "第二句"]);
});

test("cleanText normalizes CRLF but keeps an intentional line break", () => {
  assert.equal(cleanText("第一行\r\n第二行"), "第一行\n第二行");
  assert.equal(cleanText("  \n  好的  "), "好的");
});
