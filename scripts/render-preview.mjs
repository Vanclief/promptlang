import { writeFileSync } from "node:fs";
import { instructionHighlights } from "../lib/highlight.js";

const lines = [
  "Do not edit generated files.",
  "Only if needed, update the tests.",
  "If checks fail, you must fix every failure.",
  "You may use at most 3 attempts; otherwise stop.",
  "Run checks before finishing. Avoid unrelated changes.",
];
const palettes = {
  dark: { bg: "#11151c", panel: "#1a202b", border: "#303949", fg: "#d9e1ed", muted: "#9aa9bd", red: "#ff8991", magenta: "#dfb0ff", cyan: "#80d7ef", green: "#9bd6a2" },
  light: { bg: "#f4f6fa", panel: "#ffffff", border: "#d0d8e3", fg: "#253449", muted: "#52647b", red: "#b52139", magenta: "#7734a1", cyan: "#086d87", green: "#256d35" },
};
const categories = {
  Prohibition: ["red", 700], Restriction: ["magenta", 700], Condition: ["magenta", 400],
  Directive: ["cyan", 700], Quantity: ["cyan", 400], Sequence: ["fg", 700],
  Discretion: ["green", 400], Discouraged: ["red", 400],
};
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
for (const [name, palette] of Object.entries(palettes)) {
  const rows = lines.map((line, index) => {
    let cursor = 0;
    let content = "";
    for (const range of instructionHighlights(line)) {
      content += escape(line.slice(cursor, range.start));
      const [color, weight] = categories[range.category];
      content += `<tspan fill="${palette[color]}" font-weight="${weight}">${escape(line.slice(range.start, range.end))}</tspan>`;
      cursor = range.end;
    }
    content += escape(line.slice(cursor));
    return `<text x="58" y="${166 + index * 36}" xml:space="preserve">${content}</text>`;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="414" viewBox="0 0 1040 414" role="img" aria-labelledby="title description">
<title id="title">PromptLang: see the instructions in your prompts</title>
<desc id="description">A terminal illustration with red prohibitions, magenta conditions, cyan instructions and limits, green permissions, and bold sequencing words.</desc>
<rect width="1040" height="414" rx="20" fill="${palette.bg}"/>
<text x="38" y="53" font-family="system-ui, sans-serif" font-size="27" font-weight="750" fill="${palette.fg}">Prompt<tspan fill="${palette.magenta}">Lang</tspan></text>
<text x="1002" y="51" text-anchor="end" font-family="system-ui, sans-serif" font-size="16" fill="${palette.muted}">See the instructions in your prompts.</text>
<rect x="28" y="79" width="984" height="279" rx="12" fill="${palette.panel}" stroke="${palette.border}"/>
<path d="M28 120H1012" stroke="${palette.border}"/>
<circle cx="48" cy="100" r="4" fill="${palette.red}"/><circle cx="64" cy="100" r="4" fill="${palette.magenta}"/><circle cx="80" cy="100" r="4" fill="${palette.green}"/>
<text x="982" y="105" text-anchor="end" font-family="system-ui, sans-serif" font-size="13" fill="${palette.muted}">prompt.txt</text>
<g font-family="Menlo, Consolas, monospace" font-size="21" fill="${palette.fg}">${rows}</g>
<text x="38" y="389" font-family="system-ui, sans-serif" font-size="15" fill="${palette.muted}">Codex CLI · Pi extension · Claude Code via Ctrl+G</text>
<text x="1002" y="389" text-anchor="end" font-family="system-ui, sans-serif" font-size="15" fill="${palette.muted}">Plain text in. Clear instructions.</text>
</svg>\n`;
  writeFileSync(new URL(`../docs/assets/preview-${name}.svg`, import.meta.url), svg);
}
