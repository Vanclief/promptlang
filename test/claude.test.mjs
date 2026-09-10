import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { editFile } from "../claude/editor.js";

class Terminal {
  rows = 30;
  columns = 80;
  output = "";
  stopped = false;
  start(input) { this.input = input; }
  stop() { this.stopped = true; }
  async drainInput() {}
  write(text) { this.output += text; }
  hideCursor() {}
  showCursor() {}
  moveBy() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
}

async function editing(context, original, action) {
  const directory = mkdtempSync(join(tmpdir(), "promptlang-test-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "prompt with spaces.txt");
  writeFileSync(file, original);
  const terminal = new Terminal();
  const done = editFile(file, terminal);
  try {
    await action(terminal, file);
  } finally {
    if (!terminal.stopped) terminal.input("\x03");
    await done;
  }
  assert.ok(terminal.stopped);
  assert.ok(terminal.output.includes("\x1b[?1049h"));
  assert.ok(terminal.output.includes("\x1b[?1049l"));
  return readFileSync(file, "utf8");
}

test("Claude editor saves Unicode multiline drafts as plain text", async (context) => {
  const saved = await editing(context, "Do not edit", async (terminal) => {
    terminal.input("\r");
    for (const character of "Only if ready 🐋") terminal.input(character);
    terminal.input("\x13");
  });
  assert.equal(saved, "Do not edit\nOnly if ready 🐋");
});

test("cancel preserves original bytes despite unsaved editing", async (context) => {
  const original = "Do\tnot edit\r\n";
  const saved = await editing(context, original, async (terminal) => {
    terminal.input("x");
    terminal.input("\x03");
  });
  assert.equal(saved, original);
});

test("no-op save preserves tabs, CRLF, and trailing newlines exactly", async (context) => {
  const original = "Do\tnot edit\r\n\r\n";
  assert.equal(await editing(context, original, async (terminal) => terminal.input("\x13")), original);
});

test("save detects another writer and leaves that file intact", async (context) => {
  const saved = await editing(context, "original", async (terminal, file) => {
    terminal.input("x");
    writeFileSync(file, "changed elsewhere");
    terminal.input("\x13");
    assert.ok(!terminal.stopped);
    terminal.input("\x03");
  });
  assert.equal(saved, "changed elsewhere");
});

test("Claude launcher preserves cwd and arguments and handles spaces in its own path", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "promptlang launcher "));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, "repo with spaces", "bin");
  mkdirSync(bin, { recursive: true });
  cpSync(new URL("../bin/promptlang-claude", import.meta.url), join(bin, "promptlang-claude"));
  const mock = join(directory, "claude");
  writeFileSync(mock, `#!/usr/bin/env node\nconsole.log(JSON.stringify({cwd: process.cwd(), args: process.argv.slice(2), editor: process.env.EDITOR, visual: process.env.VISUAL, path: process.env.PATH}));\n`, { mode: 0o755 });
  const result = spawnSync(join(bin, "promptlang-claude"), ["--model", "a model", "literal $HOME `text`"], {
    cwd: directory, encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.equal(actual.cwd, realpathSync(directory));
  assert.deepEqual(actual.args, ["--model", "a model", "literal $HOME `text`"]);
  assert.equal(actual.editor, "promptlang-editor");
  assert.equal(actual.visual, "promptlang-editor");
  assert.equal(realpathSync(actual.path.split(":")[0]), realpathSync(bin));
});
