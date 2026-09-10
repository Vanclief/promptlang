import { readFileSync } from "node:fs";
import { nativeHighlights, nativePaint, nativePalette } from "./native-runtime.js";

export const nativeVersion = "2.1.267";
export const patchMarker = "/* PromptLang native composer */";

// Unique structural anchors, independent of this build's minified variable names.
const composer = /const ([$\w]+)=Boolean\(([$\w]+)\.focus&&\2\.showCursor\),/g;
const renderer = /color:([$\w]+)\.highlight\?\.color,dimColor:\1\.highlight\?\.dimColor,underline:\1\.highlight\?\.underline,children:([$\w]+)\(([$\w]+),\{children:\1\.text\}\)/g;
const chalk = /else if\(([$\w]+)=([$\w]+)\.dim\(([$\w]+)\),/g;

export function isComposer(source) {
  return [...source.matchAll(composer)].length > 0 && [...source.matchAll(renderer)].length > 0;
}

export function runtimeSource() {
  // Small local bundle: embed the same matcher used by Pi and the external editor.
  const matcher = readFileSync(new URL("../lib/highlight.js", import.meta.url), "utf8")
    .replace(/^import vocabulary[^\n]+\n/m, "").replace(/^export /gm, "");
  const vocabulary = readFileSync(new URL("../lib/vocabulary.json", import.meta.url), "utf8");
  return `const __promptlang = (() => {\nconst vocabulary = ${vocabulary};\n${matcher}\nconst nativePalette = ${JSON.stringify(nativePalette)};\n${nativeHighlights}\n${nativePaint}\nreturn { highlights: nativeHighlights, paint: nativePaint };\n})();`;
}

export function patchComposer(source) {
  if (source.includes(patchMarker)) throw new Error("This Claude copy already contains PromptLang; start from the original installation.");
  const matches = [composer, renderer, chalk].map((pattern) => [...source.matchAll(pattern)]);
  if (matches.some((items) => items.length !== 1)) {
    throw new Error("Unsupported Claude composer layout; expected one input, renderer, and styling helper.");
  }
  const props = matches[0][0][2];
  const [, segment, jsx, textComponent] = matches[1][0];
  const chalkName = matches[2][0][2];
  const painted = `__promptlang.paint(${segment}.text,${segment}.highlight.promptlang,${chalkName})`;
  const result = source
    .replace(composer, (match) => `${props}={...${props},highlights:__promptlang.highlights(${props})};${match}`)
    .replace(renderer, (match) => match.replace(`${jsx}(${textComponent},{children:${segment}.text})`,
      `${jsx}(${textComponent},{children:${segment}.highlight?.promptlang?${painted}:${segment}.text})`));
  // Bun stores this module as Latin-1; escape new Unicode while preserving its original bytes.
  const runtime = runtimeSource().replace(/[^\x00-\x7f]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `${result}\n${patchMarker}\n${runtime}\n`;
}
