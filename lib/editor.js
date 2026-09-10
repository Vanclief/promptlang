import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { wordWrapLine } from "@earendil-works/pi-tui/dist/components/editor.js";
import { extractAnsiCode } from "@earendil-works/pi-tui/dist/utils.js";
import { instructionHighlights, styles } from "./highlight.js";

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const pasteMarker = /\[paste #\d+( (\+\d+ lines|\d+ chars))?\]/g;

// Use Pi's exported wrapper, keeping collapsed paste markers atomic as it does.
function layout(text, width, hasPastes) {
  let offset = 0;
  return text.split("\n").flatMap((line) => {
    const segments = [];
    let end = 0;
    const append = (part, start) => {
      for (const segment of graphemes.segment(part)) {
        segments.push({ ...segment, index: start + segment.index });
      }
    };
    if (hasPastes) {
      for (const match of line.matchAll(pasteMarker)) {
        append(line.slice(end, match.index), end);
        segments.push({ segment: match[0], index: match.index, input: line });
        end = match.index + match[0].length;
      }
    }
    append(line.slice(end), end);
    const chunks = wordWrapLine(line, width, segments)
      .map((chunk) => ({ text: chunk.text, start: offset + chunk.startIndex }));
    offset += line.length + 1;
    return chunks;
  });
}

/** Overlay styles while preserving Pi's cursor marker, inverse cursor, and SGR state. */
export function styleRenderedLine(line, ranges) {
  let result = "";
  let position = 0;
  let rangeIndex = 0;
  let active;
  let nativeStyle = "";
  for (let i = 0; i < line.length;) {
    const escape = extractAnsiCode(line, i);
    if (escape) {
      result += escape.code;
      if (/^\x1b\[[\d;]*m$/.test(escape.code)) {
        nativeStyle = /^\x1b\[(0)?m$/.test(escape.code) ? "" : nativeStyle + escape.code;
        if (active) result += styles[active];
      }
      i += escape.length;
      continue;
    }
    while (ranges[rangeIndex]?.end <= position) rangeIndex++;
    const range = ranges[rangeIndex];
    const category = range?.start <= position ? range.category : undefined;
    if (category !== active) {
      if (active) result += `\x1b[0m${nativeStyle}`;
      if (category) result += styles[category];
      active = category;
    }
    const character = String.fromCodePoint(line.codePointAt(i));
    result += character;
    i += character.length;
    position += character.length;
  }
  if (active) result += `\x1b[0m${nativeStyle}`;
  return result;
}

/** Add rendering to either Pi's CustomEditor or the standalone external Editor. */
export function withPromptLang(BaseEditor) {
  return class PromptLangEditor extends BaseEditor {
    hiddenAbove = 0;
    hiddenBelow = 0;

    renderTopBorder(width, hiddenLineCount) {
      this.hiddenAbove = hiddenLineCount;
      return super.renderTopBorder(width, hiddenLineCount);
    }

    renderBottomBorder(width, hiddenLineCount) {
      this.hiddenBelow = hiddenLineCount;
      return super.renderBottomBorder(width, hiddenLineCount);
    }

    render(width) {
      const rendered = super.render(width);
      const text = this.getText();
      if (!text || text.startsWith("!")) return rendered;
      // Native attachment/file tokens keep their presentation; don't color names.
      const protectedRanges = [...text.matchAll(/(?:[@#][\p{L}\p{N}_./\\:-]+|\[(?:paste|Image) #[^\]\n]+\])/gu)]
        .map((match) => ({ start: match.index, end: match.index + match[0].length }));
      const highlights = instructionHighlights(text).filter((range) =>
        !protectedRanges.some((item) => item.start < range.end && item.end > range.start));
      if (!highlights.length) return rendered;
      const padding = Math.min(this.getPaddingX(), Math.max(0, Math.floor((width - 1) / 2)));
      const contentWidth = Math.max(1, width - padding * 2);
      const layoutWidth = Math.max(1, contentWidth - (padding ? 0 : 1));
      const chunks = layout(text, layoutWidth, this.getExpandedText() !== text);
      const visible = chunks.slice(this.hiddenAbove, chunks.length - this.hiddenBelow);
      for (let i = 0; i < visible.length; i++) {
        const chunk = visible[i];
        const line = rendered[i + 1];
        if (line === undefined) break;
        const plain = stripTerminalSequences(line);
        const expected = " ".repeat(padding) + chunk.text;
        // grug: use the exported 0.85 editor layout, not private cursor state.
        // Leave a row native if a later Pi version renders it differently.
        if (!plain.startsWith(expected) || !/^ *$/.test(plain.slice(expected.length))) continue;
        const ranges = highlights
          .filter((range) => range.start < chunk.start + chunk.text.length && range.end > chunk.start)
          .map((range) => ({
            start: padding + Math.max(0, range.start - chunk.start),
            end: padding + Math.min(chunk.text.length, range.end - chunk.start),
            category: range.category,
          }));
        if (ranges.length) rendered[i + 1] = styleRenderedLine(line, ranges);
      }
      return rendered;
    }
  };
}
