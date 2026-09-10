import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Editor, ProcessTerminal, Text, TuiMainScreen, matchesKey } from "@earendil-works/pi-tui";
import { withPromptLang } from "../lib/editor.js";

const PromptLangEditor = withPromptLang(Editor);
const plain = (text) => text;
const editorTheme = {
  borderColor: (text) => `\x1b[90m${text}\x1b[39m`,
  selectList: {
    selectedPrefix: plain, selectedText: plain, description: plain,
    scrollInfo: plain, noMatch: plain,
  },
};

/** Edit a file supplied by Claude's external-editor handoff, without submitting it. */
export async function editFile(file, terminal = new ProcessTerminal()) {
  const original = readFileSync(file, "utf8");
  const tui = new TuiMainScreen(terminal);
  const editor = new PromptLangEditor(tui, editorTheme, { paddingX: 1 });
  editor.setText(original);
  const initial = editor.getExpandedText();
  editor.disableSubmit = true;
  const status = new Text("Ctrl+S save and return | Ctrl+C cancel | Enter newline", 0, 0);
  tui.addChild(new Text("PromptLang", 0, 0));
  tui.addChild(editor);
  tui.addChild(status);
  tui.setFocus(editor);

  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  let closing = false;
  const cancel = () => { closing = true; finish(); };
  tui.addInputListener((data) => {
    if (closing) return { consume: true };
    if (matchesKey(data, "ctrl+c")) {
      cancel();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+s")) {
      try {
        const edited = editor.getExpandedText();
        // A no-op save preserves original tabs, line endings, and exact bytes.
        if (edited !== initial) {
          if (readFileSync(file, "utf8") !== original) {
            throw new Error("File changed outside this editor; cancel and reopen it.");
          }
          writeFileSync(file, edited, "utf8");
        }
        closing = true;
        finish();
      } catch (error) {
        status.setText(`Save failed: ${error.message} | Ctrl+S retry | Ctrl+C cancel`);
        tui.requestRender();
      }
      return { consume: true };
    }
    if (matchesKey(data, "enter")) {
      editor.insertTextAtCursor("\n");
      tui.requestRender();
      return { consume: true };
    }
  });
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  terminal.write("\x1b[?1049h");
  try {
    tui.start();
    await done;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    tui.stop();
    terminal.write("\x1b[?1049l");
    await terminal.drainInput();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] === "--help") {
    console.log("Usage: promptlang-editor FILE\nCtrl+S saves and returns; Ctrl+C cancels; Enter inserts a newline.");
    process.exitCode = process.argv[2] === "--help" ? 0 : 2;
  } else if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("PromptLang needs an interactive terminal. In Claude Code, press Ctrl+G.");
    process.exitCode = 1;
  } else {
    try {
      await editFile(process.argv[2]);
    } catch (error) {
      console.error(`PromptLang: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
