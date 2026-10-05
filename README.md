# opencode-sudo-plugin

Route [opencode](https://opencode.ai)'s `sudo` commands through a GUI polkit
authentication window, with a live **ask / on / off** policy toggle that can be
switched from the TUI without restarting opencode.

This is a v2 plugin (opencode ≥ 2.x), so it survives official opencode
updates — no fork to maintain. It replaces the sudo handling from the old v1
fork (`feat/sudo-pkexec-window`).

## Why

By default an agent's `sudo` either hangs on a TTY password prompt that can
never be answered, or silently reuses cached credentials. Neither is great:

- **ask** (default): every `sudo` in a shell command is rewritten to
  `pkexec --disable-internal-agent sudo -n`, so elevation pops the normal KDE /
  GNOME polkit window and *you* approve it.
- **on**: `sudo` runs non-interactively (`sudo -n`), succeeding only while
  credentials are cached — automation mode, for when you have already
  authenticated.
- **off**: all `sudo` commands are denied with a clear message.

The policy lives in a tiny state file, so it flips instantly for every open
session.

## Policies

| Policy | What happens to `sudo …`                    |
| ------ | ------------------------------------------- |
| `ask`  | rewritten to `pkexec … sudo -n` → GUI prompt |
| `on`   | rewritten to `sudo -n` → cached credentials  |
| `off`  | denied before it runs                        |

## Install

Clone into opencode's global plugin directory (auto-discovered, no config
changes needed), then install the plugin's dependencies:

```sh
git clone https://github.com/fitzypopper/opencode-sudo-plugin.git \
  ~/.config/opencode/plugins/opencode-sudo
cd ~/.config/opencode/plugins/opencode-sudo
bun install        # or: npm install
```

Or install it for a single project:

```sh
git clone https://github.com/fitzypopper/opencode-sudo-plugin.git \
  .opencode/plugins/opencode-sudo
cd .opencode/plugins/opencode-sudo && bun install
```

Alternatively register it explicitly in `opencode.json(c)`:

```jsonc
{
  "plugins": ["~/.config/opencode/plugins/opencode-sudo"]
}
```

The install step matters: local plugins resolve `@opencode/plugin` through
normal Node resolution, so the package must be present in the plugin's own
`node_modules`. Without it the plugin fails to load with
`Cannot find package '@opencode/plugin'` (check `opencode plugin list` — a
loaded plugin shows its ID, `opencode.sudo`).

There is no build step otherwise — opencode transpiles the TypeScript at load
time. The directory layout is the standard plugin-package layout: `index.ts` is
the server plugin (command rewriting + permission denial) and `tui.ts` is the
CLI plugin (picker dialog + toast).

## Usage

### In the TUI

- Type `/sudo` in the prompt (or open the command palette with `Ctrl+K` and
  pick **Switch sudo policy**) → a select dialog lists **Ask / On / Off** with
  the current policy preselected. Switching shows a toast confirmation.
- `/sudo on`, `/sudo off`, `/sudo ask` set the policy directly without opening
  the dialog.

### On the command line

Install the helper (optional):

```sh
ln -s "$PWD/bin/opencode-sudo" ~/.local/bin/opencode-sudo
opencode-sudo on      # or: ask | off | status
```

### From the environment

`OPENCODE_SUDO_POLICY=off opencode …` overrides everything else. Precedence is
`OPENCODE_SUDO_POLICY` env → state file → plugin option → default `ask`.

The state file is `~/.config/opencode/sudo-policy` (or
`$XDG_CONFIG_HOME/opencode/sudo-policy`) and contains a single word.

## Configuration

Set a default policy (used when no env var or state file is present) with the
object form of the plugin entry:

```jsonc
{
  "plugins": [
    { "package": "~/.config/opencode/plugins/opencode-sudo", "options": { "policy": "off" } }
  ]
}
```

## How it works

The server plugin registers two hooks:

- `ctx.shell.hook("create.before", …)` — before each shell command runs, it
  finds every `sudo` sitting in *command position* (start of the string, or
  after `&&`, `;`, `|`, `&`, `(`, backtick, `$(…)` , a shell keyword such as
  `if`/`then`/`while`/`do`, or an `VAR=… ` assignment, outside quotes) and
  replaces the `sudo` token with the policy wrapper.
- `ctx.permission.hook("evaluate", …)` — under the `off` policy, any shell
  command whose parsed resources contain a command-position `sudo` is set to
  `deny`, so the command fails before it spawns with
  `sudo.policy is "off"` as the reason.

The TUI plugin (`tui.ts`) registers a `Ctrl+K` palette entry and `/sudo` slash
command that opens `dialog.select` and writes the state file.

`which`-style absolute paths are resolved for `pkexec` and `sudo` once per
process; if polkit is not installed, `ask` falls back to `sudo -n` instead of
hanging.

## Notes

- The scanner is a small shell-word parser, not a full shell grammar. It
  matches the same positions the original tree-sitter-based fork matched in
  practice, but exotic constructs (e.g. `command sudo …`, sudo nested in
  single quotes passed to `sh -c`) are not rewritten — sudo there runs
  unmodified, exactly as in the v1 fork.
- The `on` policy needs cached credentials. Non-interactive shells have no TTY,
  so either run `sudo -v` first or add to `/etc/sudoers` (via
  `sudo visudo`): `Defaults timestamp_type=global` — this makes credentials
  cached by your own terminal usable by opencode too.
- `ask` requires `pkexec` (polkit) and a desktop authentication agent
  (e.g. `polkit-kde-authentication-agent-1`).
- Permissions granted for `sudo` in `opencode.json` (`permission.bash`)
  interact normally: the rewrite happens first, then opencode's own permission
  system evaluates the rewritten command.

## Development

```sh
bun install
bun test        # scanner + policy unit tests
bun run typecheck
```

## License

MIT — see [LICENSE](LICENSE).
