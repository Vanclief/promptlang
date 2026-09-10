import vocabulary from "./vocabulary.json" with { type: "json" };

const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" });
const phrases = [...vocabulary.phrases].sort((a, b) => b[0].length - a[0].length);
const words = new Map(vocabulary.words);
export const styles = {
  Prohibition: "\x1b[31;1m",
  Restriction: "\x1b[35;1m",
  Condition: "\x1b[35m",
  Directive: "\x1b[36;1m",
  Quantity: "\x1b[36m",
  Sequence: "\x1b[1m",
  Discretion: "\x1b[32m",
  Discouraged: "\x1b[31m",
};

/** Logical UTF-16 ranges, never ANSI sequences in the prompt itself. */
export function instructionHighlights(text) {
  const tokens = [...wordSegmenter.segment(text)].filter((token) => token.isWordLike);
  const result = [];
  for (let i = 0; i < tokens.length;) {
    const phrase = phrases.find(([parts]) => parts.every((part, offset) => {
      const token = tokens[i + offset];
      if (!token || token.segment.toLowerCase() !== part) return false;
      if (!offset) return true;
      const previous = tokens[i + offset - 1];
      return /^\s+$/u.test(text.slice(previous.index + previous.segment.length, token.index));
    }));
    const count = phrase?.[0].length ?? 1;
    const category = phrase?.[1] ?? words.get(tokens[i].segment.toLowerCase());
    if (styles[category]) {
      const last = tokens[i + count - 1];
      result.push({ start: tokens[i].index, end: last.index + last.segment.length, category });
    }
    i += count;
  }
  return result;
}
