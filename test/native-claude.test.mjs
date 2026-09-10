import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { instructionHighlights } from "../lib/highlight.js";
import { nativeHighlights } from "../claude/native-runtime.js";
import { patchComposer, patchMarker, runtimeSource } from "../claude/native-patch.js";
import { prepareClaude } from "../scripts/prepare-claude.mjs";
import { moduleSource, readBunGraph, replaceModule } from "../claude/bun-module.js";

const prompt = (value, highlights = []) => ({ value, highlights, getInputMode: () => "prompt", showCursor: true, focus: true });
const plain = (value) => JSON.parse(JSON.stringify(value));

// Authored contract fixture; no proprietary Claude source is distributed with tests.
const composerFixture = `
function input(state) { let g=state; const active=Boolean(g.focus&&g.showCursor),cursor=g.cursorOffset; return {value:g.value,highlights:g.highlights,cursor}; }
function render(w) { return {color:w.highlight?.color,dimColor:w.highlight?.dimColor,underline:w.highlight?.underline,children:jsx(Text,{children:w.text})}; }
function placeholder(i) { let u; if(!i)u="";else if(u=paint.dim(i),i.length)u=u;return u; }
`;

test("embedded native matcher agrees with the shared vocabulary, including Unicode and phrase precedence", () => {
  const runtime = runInNewContext(`${runtimeSource()}; __promptlang`, { Intl });
  for (const value of ["Do not have to. Do not edit. Only if ready.", "🐋 Don’t edit. You must fix every failure.",
    "Do you know? Not only this. if_ready iffy", "You may use at most 3 attempts; otherwise stop.", "DO\nNOT\thave to", "must, not"]) {
    const expected = instructionHighlights(value).map(({ start, end, category }) => ({ start, end, promptlang: category, priority: 0 }));
    assert.deepEqual(plain(runtime.highlights(prompt(value))), expected);
  }
});

test("native ranges protect existing styles, attachments, paste markers, and prompt bytes", () => {
  const value = "Do not edit @only/if [Pasted text #1 +3 lines] [Image #2] if ready";
  const existing = [{ start: 3, end: 6, color: "warning", priority: 20 }];
  const props = prompt(value, existing);
  const ranges = nativeHighlights(props);
  assert.equal(ranges[0], existing[0]);
  assert.deepEqual(ranges.slice(1).map((range) => value.slice(range.start, range.end)), ["if"]);
  assert.equal(props.value, value);
  assert.equal(props.highlights, existing);
  assert.equal(existing.length, 1);
});

test("native styling stays out of shell mode, masked fields, and other input boxes", () => {
  const existing = [{ start: 0, end: 2, color: "warning" }];
  for (const props of [{ ...prompt("Do not", existing), mask: "*" },
    { ...prompt("Do not", existing), getInputMode: () => "bash" }, { value: "Do not", highlights: existing }]) {
    assert.equal(nativeHighlights(props), existing);
  }
});

test("composer patch adds fresh ranges on edits and leaves native rendering and cursor state intact", () => {
  const patched = patchComposer(composerFixture);
  assert.ok(patched.includes(patchMarker));
  const context = { Intl, jsx: (component, props) => props, Text: "text", paint: { dim: (text) => text } };
  const api = runInNewContext(`${patched}; ({input,render})`, context);
  const props = { ...prompt("Do not"), cursorOffset: 3 };
  const first = api.input(props);
  assert.equal(first.value, "Do not");
  assert.equal(first.cursor, 3);
  assert.equal(first.highlights[0].promptlang, "Prohibition");
  assert.deepEqual(props.highlights, []);
  const edited = api.input({ ...props, value: "Do not have to", cursorOffset: 14 });
  assert.equal(edited.highlights[0].promptlang, "Discretion");
  assert.equal(edited.highlights[0].end, 14);
  const native = api.render({ text: "unchanged", highlight: { color: "warning", dimColor: true, underline: true } });
  assert.deepEqual(plain(native), { color: "warning", dimColor: true, underline: true, children: { children: "unchanged" } });
});

test("patcher rejects missing, ambiguous, or previously patched composer anchors", () => {
  assert.throws(() => patchComposer("console.log('different version')"), /Unsupported Claude composer layout/);
  assert.throws(() => patchComposer(composerFixture + composerFixture), /Unsupported Claude composer layout/);
  assert.throws(() => patchComposer(patchComposer(composerFixture)), /already contains PromptLang/);
});

function binaryFixture() {
  const header = Buffer.alloc(128, 0xa5);
  const data = Buffer.alloc(16384);
  let end = 64;
  const pointer = (content) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "latin1");
    const result = { offset: end, length: bytes.length };
    bytes.copy(data, end);
    end += bytes.length + 1;
    return result;
  };
  const records = [composerFixture, "console.log('untouched')"].map((source, index) => [
    pointer(`/$bunfs/root/chunk-${index}.js`), pointer(source), pointer("map"),
    pointer(Buffer.alloc(4000, 0x5a)), pointer("module info"), pointer("bytecode origin"),
  ]);
  const table = end;
  for (const fields of records) {
    for (const field of fields) {
      data.writeUInt32LE(field.offset, end);
      data.writeUInt32LE(field.length, end + 4);
      end += 8;
    }
    data.set([1, 1, 1, 0], end);
    end += 4;
  }
  data.writeUInt32LE(0x12345678, end);
  data.writeUInt32LE(0x87654321, end + 4);
  end += 8;
  const metadata = Buffer.alloc(32);
  metadata.writeBigUInt64LE(BigInt(end));
  metadata.writeUInt32LE(table, 8);
  metadata.writeUInt32LE(records.length * 52, 12);
  metadata.writeUInt32LE(16 | 32, 28);
  return Buffer.concat([header, data.subarray(0, end), metadata, Buffer.from("\n---- Bun! ----\n"), Buffer.from("signature trailer")]);
}

test("binary patch reuses only owned storage, clears stale caches, and preserves the other modules", () => {
  const binary = binaryFixture();
  const original = Buffer.from(binary);
  const graph = readBunGraph(binary);
  const module = graph.modules[0];
  const source = `${moduleSource(binary, module)}\n// changed\n`;
  const patched = replaceModule(binary, graph, module, source);
  const next = readBunGraph(patched);
  assert.equal(patched.length, binary.length);
  assert.equal(moduleSource(patched, next.modules[0]), source);
  assert.equal(moduleSource(patched, next.modules[1]), moduleSource(binary, graph.modules[1]));
  assert.equal(next.modules[0].contents.offset, module.bytecode.offset);
  assert.equal(next.modules[0].bytecode.length, 0);
  assert.equal(next.modules[0].moduleInfo.length, 0);
  assert.equal(next.flags & 16, 0);
  assert.equal(patched.readUInt32LE(next.table + next.tableLength), 0);
  assert.equal(patched.readUInt32LE(next.table + next.tableLength + 4), 0x87654321);
  const allowed = [[module.bytecode.offset, module.bytecode.offset + module.bytecode.length],
    [module.position + 8, module.position + 48], [graph.metadata + 28, graph.metadata + 32],
    [graph.table + graph.tableLength, graph.table + graph.tableLength + 4]];
  for (let i = 0; i < binary.length; i++) {
    if (!allowed.some(([start, end]) => i >= start && i < end)) assert.equal(patched[i], binary[i], `unexpected change at ${i}`);
  }
  assert.deepEqual(binary, original);
});

test("binary patch refuses unknown layouts, insufficient space, and overlapping storage", () => {
  const binary = binaryFixture();
  const graph = readBunGraph(binary);
  assert.throws(() => readBunGraph(Buffer.from("not a Bun binary")), /Unsupported Bun/);
  const future = Buffer.from(binary);
  future.writeUInt32LE(0x800, graph.metadata + 28);
  assert.throws(() => readBunGraph(future), /Unsupported Bun/);
  const corrupt = Buffer.from(binary);
  corrupt.writeUInt32LE(0xffffffff, graph.modules[0].position + 4);
  assert.throws(() => readBunGraph(corrupt), /Unsupported Bun/);
  assert.throws(() => replaceModule(binary, graph, graph.modules[0], "x".repeat(4000)), /Not enough/);
  graph.modules[1].contents.offset = graph.modules[0].bytecode.offset;
  assert.throws(() => replaceModule(binary, graph, graph.modules[0], "x"), /overlaps/);
});

test("native launcher uses the separate binary, forwards arguments, and disables its updater", (context) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "promptlang native ")));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  mkdirSync(bin);
  mkdirSync(join(directory, ".build/claude"), { recursive: true });
  const launcher = join(bin, "promptlang-claude");
  cpSync(new URL("../bin/promptlang-claude", import.meta.url), launcher);
  const missing = spawnSync(launcher, [], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /install.sh claude/);
  writeFileSync(join(directory, ".build/claude/claude"), '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),updater:process.env.DISABLE_AUTOUPDATER,updates:process.env.DISABLE_UPDATES,editor:process.env.EDITOR}));\n', { mode: 0o755 });
  const result = spawnSync(launcher, ["--model", "a model", "literal $HOME `x`"], { cwd: directory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args: ["--model", "a model", "literal $HOME `x`"], cwd: directory, updater: "1", updates: "1", editor: "promptlang-editor" });
});


test("setup rejects unsupported versions without replacing a working copy", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "promptlang version "));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const original = join(directory, "original");
  const destination = join(directory, "claude");
  writeFileSync(original, '#!/usr/bin/env bash\nprintf "2.1.999 (Claude Code)\\n"\n', { mode: 0o755 });
  writeFileSync(destination, "working copy");
  assert.throws(() => prepareClaude(original, destination), /supports Claude Code 2.1.267/);
  assert.equal(readFileSync(destination, "utf8"), "working copy");
  assert.throws(() => prepareClaude(original, realpathSync(original)), /original Claude installation/);
});
