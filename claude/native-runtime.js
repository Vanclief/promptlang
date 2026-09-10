import { instructionHighlights } from "../lib/highlight.js";

export const nativePalette = {
  Prohibition: ["red", true], Restriction: ["magenta", true],
  Condition: ["magenta"], Directive: ["cyan", true], Quantity: ["cyan"],
  Sequence: [null, true], Discretion: ["green"], Discouraged: ["red"],
};

/** Add logical ranges before Claude maps them into wrapped and scrolled rows. */
export function nativeHighlights(props) {
  const existing = props.highlights ?? [];
  if (props.mask || props.getInputMode?.() !== "prompt") return existing;
  const text = props.value ?? "";
  const protectedRanges = [...existing, ...[...text.matchAll(/(?:[@#][\p{L}\p{N}_./\\:-]+|\[(?:Pasted text|Image|paste)[^\]\n]*\])/gu)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))];
  const added = instructionHighlights(text)
    .filter((range) => !protectedRanges.some((native) => range.start < native.end && range.end > native.start))
    .map(({ start, end, category }) => ({ start, end, promptlang: category, priority: 0 }));
  return added.length ? [...existing, ...added] : existing;
}

/** Claude's own Chalk instance respects color support and balances nested ANSI. */
export function nativePaint(text, category, chalk) {
  const [color, bold] = nativePalette[category];
  let paint = color ? chalk[color] : chalk;
  if (bold) paint = paint.bold;
  return paint(text);
}
