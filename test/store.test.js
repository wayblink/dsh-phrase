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
  assert.equal(applyAction(empty, { action: "add", text: "   " }).error, "empty");
  assert.equal(applyAction(empty, { action: "add", text: "x".repeat(MAX_TEXT_LENGTH + 1) }).error, "too_long");
  const existing = withPhrases("好的");
  assert.equal(applyAction(existing, { action: "add", text: "好的" }).error, "duplicate");
});

test("the list is capped", () => {
  const full = withPhrases(...Array.from({ length: MAX_PHRASES }, (_, i) => `第 ${i + 1} 句`));
  assert.equal(applyAction(full, { action: "add", text: "多一句" }).error, "too_many");
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
  assert.equal(applyAction(state, { action: "update", id: "nope", text: "C" }).error, "not_found");
  assert.equal(applyAction(state, { action: "update", id: "p_1", text: "  " }).error, "empty");
  assert.equal(applyAction(state, { action: "update", id: "p_1", text: "B" }).error, "duplicate");
});

test("delete removes one phrase and refuses an unknown id", () => {
  const result = applyAction(withPhrases("A", "B"), { action: "delete", id: "p_1" });
  assert.deepEqual(result.state.phrases.map((row) => row.text), ["B"]);
  assert.equal(applyAction(withPhrases("A"), { action: "delete", id: "nope" }).error, "not_found");
});

test("an unknown action is an error, not a silent no-op", () => {
  assert.equal(applyAction(empty, { action: "explode" }).error, "unknown_action");
  assert.equal(applyAction(empty, {}).error, "unknown_action");
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
