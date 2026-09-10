import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { withPromptLang } from "../lib/editor.js";

const PromptLangEditor = withPromptLang(CustomEditor);

export default function promptlang(pi) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new PromptLangEditor(tui, theme, keybindings));
  });
}
