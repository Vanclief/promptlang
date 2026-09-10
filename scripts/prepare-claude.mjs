#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isComposer, nativeVersion, patchComposer } from "../claude/native-patch.js";
import { moduleSource, readBunGraph, replaceModule } from "../claude/bun-module.js";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function prepareClaude(sourcePath, destination) {
  if (!["darwin", "linux"].includes(process.platform)) throw new Error("Native Claude setup supports macOS and Linux.");
  const source = realpathSync(sourcePath);
  if (source === destination || (existsSync(destination) && source === realpathSync(destination))) {
    throw new Error("Select your original Claude installation, not the PromptLang copy.");
  }
  const version = execFileSync(source, ["--version"], { encoding: "utf8", timeout: 15000 }).trim();
  if (version !== `${nativeVersion} (Claude Code)`) {
    throw new Error(`Native highlighting currently supports Claude Code ${nativeVersion}; found ${version}. Use ./install.sh claude-editor for other versions.`);
  }
  const binary = readFileSync(source);
  const magic = binary.readUInt32LE(0);
  if ((process.platform === "darwin" && magic !== 0xfeedfacf) || (process.platform === "linux" && magic !== 0x464c457f)) {
    throw new Error("Expected a native Claude binary for this platform.");
  }
  const graph = readBunGraph(binary);
  const candidates = graph.modules.filter((module) => module.encoding === 1 && isComposer(moduleSource(binary, module)));
  if (candidates.length !== 1) throw new Error("Could not uniquely identify Claude's composer module.");
  const module = candidates[0];
  const patchedSource = patchComposer(moduleSource(binary, module));
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: patchedSource, timeout: 15000 });
  const patched = replaceModule(binary, graph, module, patchedSource);
  const directory = join(destination, "..");
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(join(directory, ".prepare-"));
  try {
    const executable = join(temporary, "claude");
    writeFileSync(executable, patched, { mode: 0o755 });
    if (process.platform === "darwin") {
      execFileSync("codesign", ["--force", "--sign", "-", executable], { stdio: "pipe" });
      execFileSync("codesign", ["--verify", executable], { stdio: "pipe" });
    }
    chmodSync(executable, 0o755);
    const environment = { ...process.env, DISABLE_AUTOUPDATER: "1", DISABLE_UPDATES: "1" };
    const result = execFileSync(executable, ["--version"], { encoding: "utf8", env: environment, timeout: 15000 }).trim();
    if (result !== version) throw new Error("Patched Claude version check failed.");
    execFileSync(executable, ["--help"], { env: environment, stdio: "pipe", timeout: 15000 });
    const sourceHash = digest(binary);
    if (digest(readFileSync(source)) !== sourceHash) throw new Error("Claude changed during setup; rerun the installer.");
    const manifest = { version: nativeVersion, source, sourceHash, patchedHash: digest(readFileSync(executable)), module: module.name };
    writeFileSync(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(executable, destination);
    renameSync(join(temporary, "manifest.json"), `${destination}.json`);
    console.log(`Native Claude ${nativeVersion} ready: ${destination}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/prepare-claude.mjs /path/to/original/claude");
    prepareClaude(process.argv[2], fileURLToPath(new URL("../.build/claude/claude", import.meta.url)));
  } catch (error) {
    console.error(`PromptLang: ${error.message}`);
    process.exitCode = 1;
  }
}
