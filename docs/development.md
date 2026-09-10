# Development

The Codex Rust vocabulary is the source of truth. `npm run sync-vocabulary`
generates `lib/vocabulary.json`; `npm test` verifies that it matches. Pi and
Claude share `lib/highlight.js` for matching and `lib/editor.js` for rendering.
After changing the Rust vocabulary, regenerate the JSON and test both languages.

The Pi extension installs only a custom editor. The Claude integration is a local
file editor built with the same Pi TUI library; it makes no model/API calls.
JavaScript dependencies are pinned in `package-lock.json`. No JavaScript build
step is required.

`codex/promptlang.rs` supplies render-only byte ranges using Codex's existing
`unicode-segmentation` dependency. `codex/conditions.patch` connects these ranges
to `TextArea::render_ref_styled_with_highlights` in the native composer. The Rust
source and tests are copied into the cached upstream source before each build or test.

Upstream is [OpenAI Codex 0.153.4](https://github.com/openai/codex/tree/rust-v0.153.4),
commit `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`. The source archive's SHA-256 is
pinned in `scripts/prepare.sh`. `codex/release-lock.patch` repairs the release
archive's stale workspace-package versions (`0.0.0` → `0.153.4`); all third-party
lock entries are unchanged, and builds still use `--locked`. No new Rust
dependency or model API is introduced.

Edit the files under `codex/`, then rerun the build. The cached upstream checkout
is disposable; it is not the source of truth. If the wiring patch changes, move
`.build/codex` aside before rebuilding. Compiled dependencies live separately in
`.build/target` and can be reused.

## Validation

```sh
npm ci --ignore-scripts
npm test
bash -n install.sh scripts/*.sh bin/promptlang-*
```

JavaScript tests exercise actual Pi editor components and xterm terminal cells.
They cover source ranges, cursor placement/inversion, wrapping, scrolling,
collapsed pastes, file save/cancel/conflicts, and installer ownership checks.
The bundled Pi CLI is also smoke-tested interactively without submitting prompts.

For Codex, install `just` and `cargo-nextest`, then run:

```sh
./scripts/test.sh -E 'test(promptlang_tests)'
./scripts/test.sh
```

The Rust overlay has 15 passing prototype tests. On macOS, the full Codex 0.153.4
TUI suite has 4,071 passes, 35 failures, and 6 skips. The exact same 35 failures
occur without PromptLang (4,056 passes): release-version snapshots and
terminal-dependent expectations. These upstream snapshots are left unchanged.

## Updating the pinned Codex build

The source archive SHA-256 is in `scripts/prepare.sh`. Runtime archive SHA-256
values are in `scripts/prepare-runtime.sh`, from the official release assets.
Update the source pin, runtime checksums, and overlay together. Verify each target
before adding it to the supported-platform list. Downloads are verified before
extraction. Runtime downloads support macOS/Linux on arm64 and x86_64; Windows
shell installation is not currently provided.

Cached source is disposable. If a wiring patch changes, move `.build/codex` aside;
`.build/target` retains compiled dependencies. `scripts/prepare.sh` applies the
patches and copies the authoritative `codex/*.rs` files before a build or test.

## Updating the preview

```sh
node scripts/render-preview.mjs
```

The README SVGs are generated from the same JavaScript matcher. Their light/dark
palettes illustrate the categories; a user's terminal controls actual ANSI colors.
Review both SVGs after changing the vocabulary or preview text. CI checks that
regenerating them produces no diff.
