import assert from "node:assert/strict";
import test from "node:test";
import xterm from "@xterm/headless";
import { Editor, CURSOR_MARKER, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { createJiti } from "jiti/static";

// Pi's bundled CLI supplies virtual exports to extensions. Its unbundled SDK
// entrypoint has an unrelated missing pi-server dependency in release 0.85.0.
// Load the real editor and keybindings directly, through the same virtual mechanism.
const agentDist = new URL(".", import.meta.resolve("@earendil-works/pi-coding-agent"));
const { CustomEditor } = await import(new URL("modes/interactive/components/custom-editor.js", agentDist));
const { KeybindingsManager } = await import(new URL("core/keybindings.js", agentDist));
const jiti = createJiti(import.meta.url, {
  virtualModules: { "@earendil-works/pi-coding-agent": { CustomEditor } },
  tryNative: false,
});
const extension = await jiti.import("../pi/extension.js", { default: true });
import { styleRenderedLine, withPromptLang } from "../lib/editor.js";

const plain = (text) => text;
const theme = {
  borderColor: (text) => `\x1b[35m${text}\x1b[39m`,
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
};
function editors(text, paddingX = 0) {
  const tui = { terminal: { rows: 24 }, requestRender() {} };
  const options = { paddingX };
  const native = new Editor(tui, theme, options);
  const highlighted = new (withPromptLang(Editor))(tui, theme, options);
  for (const editor of [native, highlighted]) {
    editor.focused = true;
    editor.setText(text);
  }
  return { native, highlighted, tui };
}
async function screen(lines, cols) {
  const terminal = new xterm.Terminal({ cols, rows: 80, allowProposedApi: true });
  await new Promise((resolve) => terminal.write(lines.join("\r\n"), resolve));
  return terminal;
}
function coloredText(terminal, color) {
  let text = "";
  for (let y = 0; y < terminal.rows; y++) {
    const line = terminal.buffer.active.getLine(y);
    for (let x = 0; x < terminal.cols; x++) {
      const cell = line.getCell(x);
      if (cell.isFgPalette() && cell.getFgColor() === color) text += cell.getChars();
    }
  }
  return text;
}
function assertNativeLayout(native, highlighted, width) {
  const expected = native.render(width);
  const actual = highlighted.render(width);
  assert.deepEqual(actual.map(stripTerminalSequences), expected.map(stripTerminalSequences));
  assert.deepEqual(highlighted.getCursor(), native.getCursor());
  assert.equal(highlighted.getText(), native.getText());
  const cursorLocation = (lines) => lines.flatMap((line, row) => {
    const position = line.indexOf(CURSOR_MARKER);
    return position < 0 ? [] : [[row, visibleWidth(line.slice(0, position))]];
  });
  assert.deepEqual(cursorLocation(actual), cursorLocation(expected));
  return actual;
}

test("wrapped phrases retain whole-prompt meaning, text, and cursor at narrow widths", async () => {
  const { native, highlighted } = editors("México 🐋: do not have to edit. Only if asked, you must not delete.", 1);
  for (const width of [8, 18, 40, 80]) {
    const lines = assertNativeLayout(native, highlighted, width);
    const terminal = await screen(lines, width);
    assert.ok(coloredText(terminal, 1).replaceAll(" ", "").includes("mustnot"));
    assert.ok(!coloredText(terminal, 1).includes("haveto"));
    terminal.dispose();
  }
});

test("insertion and deletion reclassify a phrase without stale styles", async () => {
  const { highlighted } = editors("do not");
  highlighted.insertTextAtCursor(" have to");
  let terminal = await screen(highlighted.render(60), 60);
  assert.equal(coloredText(terminal, 2), "do not have to");
  assert.equal(coloredText(terminal, 1), "");
  terminal.dispose();
  for (let i = 0; i < 8; i++) highlighted.handleInput("\x7f");
  terminal = await screen(highlighted.render(60), 60);
  assert.equal(coloredText(terminal, 1), "do not");
  assert.equal(coloredText(terminal, 2), "");
  terminal.dispose();
});

test("cursor inversion and hardware marker survive inside a colored phrase", async () => {
  const { native, highlighted } = editors("must not edit");
  for (const editor of [native, highlighted]) {
    editor.handleInput("\x01");
    for (let i = 0; i < 2; i++) editor.handleInput("\x1b[C");
  }
  const terminal = await screen(assertNativeLayout(native, highlighted, 40), 40);
  const cell = terminal.buffer.active.getLine(1).getCell(2);
  assert.equal(cell.getChars(), "s");
  assert.ok(cell.isInverse());
  assert.ok(cell.isBold());
  assert.equal(cell.getFgColor(), 1);
  terminal.dispose();
});

test("scrolling repeated words uses logical source positions for categories", async () => {
  const text = "do not\nhave to\nedit\n".repeat(12) + "do not\ndelete";
  const { native, highlighted } = editors(text);
  const terminal = await screen(assertNativeLayout(native, highlighted, 25), 25);
  assert.equal(coloredText(terminal, 1), "do not");
  assert.ok(coloredText(terminal, 2).includes("do not"));
  terminal.dispose();
});

test("shell drafts, native mention names, and attachment labels retain their styling", async () => {
  let pair = editors("!if true; then echo must not; fi");
  assert.deepEqual(pair.highlighted.render(60), pair.native.render(60));
  pair = editors("Do not edit @never or #if or [Image #only]; otherwise wait.");
  const terminal = await screen(assertNativeLayout(pair.native, pair.highlighted, 80), 80);
  assert.equal(coloredText(terminal, 1), "Do not");
  assert.ok(!coloredText(terminal, 5).includes("only"));
  terminal.dispose();
});

test("collapsed pasted text preserves native wrapping and exact expanded submission", () => {
  const { native, highlighted } = editors("Only if ready: ");
  const paste = "Do not delete.\n".repeat(20);
  const submitted = [];
  for (const editor of [native, highlighted]) {
    editor.handleInput(`\x1b[200~${paste}\x1b[201~`);
    editor.insertTextAtCursor(" must not edit");
    editor.onSubmit = (text) => submitted.push(text);
  }
  assert.match(highlighted.getText(), /\[paste #/);
  for (const width of [8, 18, 40, 80]) assertNativeLayout(native, highlighted, width);
  for (const editor of [native, highlighted]) editor.handleInput("\r");
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0], submitted[1]);
  assert.ok(submitted[1].includes(paste));
  assert.ok(!submitted[1].includes("\x1b"));
});

test("existing background, color, and cursor attributes resume after overlays", async () => {
  const input = "\x1b[44;33mDo \x1b[7mnot\x1b[27m edit\x1b[0m";
  const output = styleRenderedLine(input, [{ start: 0, end: 6, category: "Prohibition" }]);
  const terminal = await screen([output], 40);
  const row = terminal.buffer.active.getLine(0);
  assert.ok(row.getCell(3).isInverse());
  assert.equal(row.getCell(3).getBgColor(), 4);
  assert.ok(row.getCell(3).isBold());
  assert.equal(row.getCell(7).getFgColor(), 3);
  assert.equal(row.getCell(7).getBgColor(), 4);
  assert.ok(!row.getCell(7).isBold());
  assert.ok(!row.getCell(7).isInverse());
  terminal.dispose();
});

test("Pi extension loads only in UI sessions and preserves CustomEditor app shortcuts", () => {
  let handler;
  extension({ on(event, callback) { assert.equal(event, "session_start"); handler = callback; } });
  handler({}, { hasUI: false });
  let factory;
  handler({}, { hasUI: true, ui: { setEditorComponent(value) { factory = value; } } });
  const tui = { terminal: { rows: 24 }, requestRender() {} };
  const editor = factory(tui, theme, new KeybindingsManager());
  assert.ok(editor instanceof CustomEditor);
  let exited = false;
  editor.onCtrlD = () => { exited = true; };
  editor.handleInput("\x04");
  assert.ok(exited);
  editor.setText("Do not edit");
  assert.ok(editor.render(40).some((line) => line.includes("\x1b[31;1m")));
});
