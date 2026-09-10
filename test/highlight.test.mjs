import assert from "node:assert/strict";
import test from "node:test";
import { instructionHighlights } from "../lib/highlight.js";

const spans = (text) => instructionHighlights(text).map(({ start, end, category }) => [text.slice(start, end), category]);

test("case-insensitive Unicode word boundaries and UTF-16 offsets", () => {
  assert.deepEqual(spans("México 🐋: IF(x), When ready; unless busy. iffy gift elsewhere if_ready if2 ifé if's"), [
    ["IF", "Condition"], ["When", "Condition"], ["unless", "Restriction"],
  ]);
});

test("longest phrases distinguish prohibition, permission, and advice", () => {
  assert.deepEqual(spans("MUST NOT edit. NOT REQUIRED. do not have to. Don't. Don’t need to. should not."), [
    ["MUST NOT", "Prohibition"], ["NOT REQUIRED", "Discretion"],
    ["do not have to", "Discretion"], ["Don't", "Prohibition"],
    ["Don’t need to", "Discretion"], ["should not", "Discouraged"],
  ]);
});

test("phrases cross whitespace but never punctuation", () => {
  assert.deepEqual(spans("Only IF needed, at\tMOST 3 tries. Do\nnot edit; must, not; at, most."), [
    ["Only IF", "Restriction"], ["at\tMOST", "Quantity"], ["Do\nnot", "Prohibition"],
    ["must", "Directive"], ["not", "Prohibition"],
  ]);
});

test("questions and not-only statements suppress misleading individual words", () => {
  assert.deepEqual(spans("Do you know? Do I? Do we? Do they? Not only fast. Do this. Make sure each result works."), [
    ["Do", "Directive"], ["Make sure", "Directive"], ["each", "Quantity"],
  ]);
});
