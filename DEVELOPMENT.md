# Development notes

Cross-session reference for this plugin: how it works, what was verified, and
the opencode v2 API details that were expensive to discover.

## Files

| File         | Role                                                               |
| ------------ | ------------------------------------------------------------------ |
| `index.ts`   | Server plugin: `shell.create.before` rewrite + `off` permission deny |
| `tui.ts`     | CLI/TUI plugin: `/sudo` slash command, Ctrl+P palette entry, select dialog, toast |
| `scanner.ts` | Command-position `sudo` finder (shell-word parser, no tree-sitter) |
| `policy.ts`  | Policy resolution (`ask`/`on`/`off`), state file I/O, wrappers, `which` |
| `bin/opencode-sudo` | CLI helper reading/writing the same state file               |

## Key opencode v2 plugin facts (verified against v2.0.23 source)

- Entry discovery: a plugin **directory** under `plugins/` resolves
  `<dir>/index.ts` (server) and `<dir>/tui.ts` (TUI) via
  `Host.resolve` (`packages/plugin/src/host.ts`). One directory can serve both
  runtimes. Top-level loose `.ts` files directly under `plugins/` also load as
  server plugins.
- Server entry: `export default Plugin.define({ id, async setup(ctx) })` from
  `@opencode/plugin`. TUI entry: same from `@opencode/plugin/tui`.
- **`@opencode/plugin` must resolve via normal Node resolution from the plugin
  file** — i.e. the plugin's own `node_modules` (or an ancestor's). Nothing
  injects it. Failure mode: `failed to load plugin … Cannot find package
  '@opencode/plugin'` in `--print-logs` output; `opencode plugin list` shows
  ID `-` instead of `opencode.sudo`.
- `ctx.shell.hook("create.before", cb)` mutates `{command, cwd, timeout,
  shell, env}`. Runs **before** the shell tool's `prepare`, which does
  `ShellParse.scan` + `permission.assert({action: "shell", resources})`
  (`packages/core/src/tool/plugin/shell.ts`). So permission sees the
  *rewritten* command.
- `ctx.permission.hook("evaluate", cb)` mutates `{effect, message}`; it always
  fires for non-config-denied inputs (`packages/core/src/permission.ts`
  `evaluateInput`). `effect: "deny"` → `BlockedError(reason: message)` →
  model-facing tool failure. This is the `off` path.
- Shell permission resources are full command text (`sudo apt install …`), one
  entry per parsed command.
- TUI: `context.keymap.layer(() => ({ mode: "global", commands: [...] }))` with
  `palette: true` (Ctrl+P) and `slash: { name: "sudo", arguments: true }`.
  With `arguments: true`, submit calls `clearPrompt()` then `run(rawInput)` —
  nothing leaks into the chat. Selecting the entry from autocomplete inserts
  `/sudo ` (needs a second Enter to submit).
- `context.ui.dialog.select({title, current, options})` supports type-to-search
  out of the box; `context.ui.toast.show({message, variant})`.
- Plugin options come from the object form:
  `{"plugins": [{"package": "<dir>", "options": {"policy": "ask"}}]}` →
  `ctx.options.policy` / `context.options.policy`.

## Policy mechanics

- State file: `$XDG_CONFIG_HOME|~/.config` + `/opencode/sudo-policy` (single
  word). Precedence: `OPENCODE_SUDO_POLICY` env → state file → plugin option →
  default `ask`. Shared by plugin, TUI picker, and `bin/opencode-sudo`.
- `ask` wrapper: `pkexec --disable-internal-agent <sudo-abs-path> -n`
  (falls back to `<sudo> -n` when pkexec is absent).
- `on` wrapper: `<sudo-abs-path> -n`.
- `off`: no rewrite (sudo token must stay intact so the permission resource
  still matches) — deny via permission hook instead.
- `sudo -n` under `on` only succeeds with cached credentials; add
  `Defaults timestamp_type=global` via `sudo visudo` and `sudo -v` in your own
  terminal to share the timestamp with opencode.

## Verified test results (v2.0.23, 2026-10-05)

- `bun test`: 18 pass (scanner site detection incl. quotes/separators/
  keywords/assignments, policy precedence, state-file roundtrip).
- `bun run typecheck`: clean against npm `@opencode/plugin@2.0.23` types.
- E2E with `opencode run --standalone --auto --print-logs --log-level debug`:
  - `off` → tool fails with `permission.rejected: sudo commands are denied:
    sudo.policy is "off". …` ✓
  - `on` → log line `spawning process … args=["-c","/usr/bin/sudo -n id"]` ✓
  - `ask` → log line `args=["-c","/usr/bin/pkexec --disable-internal-agent
    /usr/bin/sudo -n id"]` ✓
- `opencode plugin list` → `opencode.sudo  local  …/index.ts` ✓
- TUI via `script` + fifo: `/sudo` appears in slash autocomplete; dialog opens
  (Ask/On/Off, current preselected); type `off` + Enter → state file flipped +
  toast `sudo policy: off`; `/sudo ask` arg form → toast + file ✓.

## Testing recipes

Headless E2E (costs a model call — cheap flash models work):

```sh
echo off > ~/.config/opencode/sudo-policy
opencode run --standalone --auto --print-logs --log-level debug \
  --model google/gemini-3.5-flash-lite \
  "Use the shell tool to run exactly: sudo id . Then report the exact output."
```

Grep for `spawning process` to see the rewritten command, `failed to load
plugin` for activation errors.

Driving the TUI without tmux (tmux is not installed here):

```sh
mkfifo tui-in
script -qec "$HOME/.opencode/bin/opencode" tui-typescript < tui-in > /dev/null 2>&1 &
exec 3> tui-in          # keep ONE writer open for the whole sequence
sleep 10                # let the TUI initialize
printf '/sudo ask\r' >&3
# …poll tui-typescript (strip ANSI first)…
exec 3>&-
```

Gotchas: stdin EOF breaks input delivery — never close the fifo writer
between steps; `pkill -f "script -qec"` matches your *own* shell command line
(kill by PID instead).

## v1 fork → v2 plugin mapping

The v1 fork (`feat/sudo-pkexec-window` in `~/Projects/opencode`, 5 commits) did
this inside the codebase: `packages/opencode/src/tool/shell/elevation.ts`
(tree-sitter `sites()`), `DialogSudo` in `packages/tui/src/app.tsx`, config
keys `sudo.mode`/`sudo.policy`, release-channel build trick. All obsolete now —
the plugin covers the same behavior via public hooks. Dead v1 config keys were
removed from `~/.config/opencode/opencode.jsonc` (`sudo.*`,
`permission.bash["opencode-sudo*"]`).
