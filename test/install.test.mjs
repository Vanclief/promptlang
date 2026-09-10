import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function fixture(context) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "promptlang install ")));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = join(directory, "repository with spaces");
  const bin = join(directory, "local bin");
  mkdirSync(join(repository, "scripts"), { recursive: true });
  mkdirSync(join(repository, "bin"));
  mkdirSync(bin);
  cpSync(new URL("../install.sh", import.meta.url), join(repository, "install.sh"));
  writeFileSync(join(repository, "scripts/build.sh"), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(repository, "bin/codex-pl"), '#!/usr/bin/env node\nconsole.log(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));\n', { mode: 0o755 });
  const run = (...args) => spawnSync(join(repository, "install.sh"), ["codex", "--bin-dir", bin, ...args], { cwd: directory, encoding: "utf8" });
  return { directory, repository, bin, run };
}

test("installer creates reusable launchers, forwards arguments, and can be rerun", (context) => {
  const { directory, bin, run } = fixture(context);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  }
  const output = spawnSync(join(bin, "codex-pl"), ["--model", "a model", "literal $x `x`"], { cwd: directory, encoding: "utf8" });
  assert.equal(output.status, 0, output.stderr);
  assert.deepEqual(JSON.parse(output.stdout), { args: ["--model", "a model", "literal $x `x`"], cwd: directory });
});

test("installer and uninstaller refuse to overwrite an unrelated command", (context) => {
  const { bin, run } = fixture(context);
  const file = join(bin, "codex-pl");
  writeFileSync(file, "my command");
  for (const args of [[], ["--uninstall"]]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unmanaged file/);
    assert.equal(readFileSync(file, "utf8"), "my command");
  }
});

test("uninstall removes only managed launchers and keeps the repository", (context) => {
  const { repository, bin, run } = fixture(context);
  assert.equal(run().status, 0);
  writeFileSync(join(bin, "another-command"), "keep");
  assert.equal(run("--uninstall").status, 0);
  assert.ok(!existsSync(join(bin, "codex-pl")));
  assert.equal(readFileSync(join(bin, "another-command"), "utf8"), "keep");
  assert.ok(existsSync(join(repository, "bin/codex-pl")));
  assert.equal(run("--uninstall").status, 0);
});

test("installer and uninstaller remove managed legacy names", (context) => {
  for (const args of [[], ["--uninstall"]]) {
    const { bin, run } = fixture(context);
    const legacy = join(bin, "promptlang-codex");
    writeFileSync(legacy, '#!/usr/bin/env bash\n# Managed by PromptLang installer\nexit 0\n');
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(legacy));
    assert.equal(existsSync(join(bin, "codex-pl")), args.length === 0);
  }
});

test("migration leaves unrelated legacy files and symlinks intact", (context) => {
  for (const symlink of [false, true]) {
    const { directory, bin, run } = fixture(context);
    const legacy = join(bin, "promptlang-codex");
    const target = join(directory, "unrelated");
    writeFileSync(target, '#!/usr/bin/env bash\n# Managed by PromptLang installer\nkeep\n');
    if (symlink) symlinkSync(target, legacy);
    else writeFileSync(legacy, "unrelated command");
    const original = readFileSync(legacy, "utf8");
    for (const args of [[], ["--uninstall"]]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(legacy, "utf8"), original);
      assert.ok(existsSync(target));
    }
  }
});

test("failed setup keeps the previous launcher usable", (context) => {
  const { repository, bin, run } = fixture(context);
  const legacy = join(bin, "promptlang-codex");
  const original = '#!/usr/bin/env bash\n# Managed by PromptLang installer\nexit 0\n';
  writeFileSync(legacy, original);
  writeFileSync(join(repository, "scripts/build.sh"), '#!/usr/bin/env bash\nexit 1\n');
  assert.equal(run().status, 1);
  assert.equal(readFileSync(legacy, "utf8"), original);
  assert.ok(!existsSync(join(bin, "codex-pl")));
});
