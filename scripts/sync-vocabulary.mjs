import { readFileSync, writeFileSync } from "node:fs";

// Codex's table remains the source of truth; the JS integrations share this data.
const rust = readFileSync(new URL("../codex/promptlang.rs", import.meta.url), "utf8");
const phrases = [...rust.matchAll(/\(&\[([^\]]+)\], Category::(\w+)\)/g)]
  .map(([, words, category]) => [JSON.parse(`[${words}]`), category]);
const words = [...rust.matchAll(/\("([^"]+)", Category::(\w+)\)/g)]
  .map(([, word, category]) => [word, category]);
if (!phrases.length || !words.length) throw new Error("Cannot read the Codex vocabulary tables");
const output = `${JSON.stringify({ phrases, words }, null, 2)}\n`;
const destination = new URL("../lib/vocabulary.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8") !== output) {
    throw new Error("Vocabulary is out of date. Run npm run sync-vocabulary.");
  }
} else {
  writeFileSync(destination, output);
}
