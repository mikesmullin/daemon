# d — Arch Linux bash command generator

`d [prompt]` → prints a single valid Arch Linux bash command to stdout and copies it to the clipboard.

```sh
d "list all node_modules folders recursively"
# → find . -type d -name "node_modules" -prune -print  (also copied to clipboard)

d "show disk usage sorted by size"
d "install ripgrep with pacman"
```

## Stack

- **Bun** + **CoffeeScript** (via `coffeescript` + custom `coffee-loader.mjs` Bun plugin)
- **agl-ai** (`file:../agl` / `bun link agl-ai`) — single microagent via `Agent.factory` + `output_tool`
- **Muse provider** (`src/providers/muse.mjs`) — Meta Muse API, OpenAI-compatible

## Microagent

One file — `src/d.coffee` — wraps the entire agent workflow per `agl/docs/MICROAGENT.md`:

- exactly **one** `Agent.factory` with `output_tool: { command: string }`
- zero extra tools, **one** `agent.run` with `<user-request>` XML tag
- typed output (`command`) consumed by deterministic CLI boundary

System prompt focuses the model on Arch Linux bash (pacman, systemctl, find/grep/awk, quoting, `&&` chaining, etc.) and forbids placeholders/markdown.

Deterministic code handles: arg parsing, stdout, and clipboard (`wl-copy` → `xclip -selection clipboard` → `xsel` → `pbcopy` → `clip.exe`) via `spawnSync`.

## Setup — Muse API

The default model is the **Muse 1.2 contributor model** via the `muse:` provider (`muse:muse-1.2-contributor`).

1. Copy the example env file and set your key:

```sh
cp /workspace/daemon-0/.env.example /workspace/daemon-0/.env
$EDITOR /workspace/daemon-0/.env   # set MUSE_API_KEY
```

`.env.example`:
```
MUSE_API_KEY=your-muse-api-key-here
# Optional overrides:
# MUSE_BASE_URL=https://api.muse.ai
# D_MODEL=muse:muse-1.2-contributor
```

2. `.env` is gitignored (see `.gitignore`). Do not commit it. Load it via:
   - `bun --env-file .env src/d.coffee "..."` (Bun loads .env automatically if present, or use `--env-file`)
   - or `export $(cat .env | xargs)` / `op run --env-file=.env -- ...`
   - or `MUSE_API_KEY=... bun src/d.coffee "..."`

3. Model resolution: `D_MODEL` > `MUSE_MODEL` > `FAV_LOCAL_LLM` > `AGL_MODEL` > `muse:muse-1.2-contributor`.
   Override with `D_MODEL=muse:muse-1.2 bun src/d.coffee "..."` or `D_MODEL=lm-studio:google/gemma-4-12b-qat`.

## Muse provider

`src/providers/muse.mjs` implements the agl-ai provider interface (`init`, `inference`, `models`, `contextWindowSize`, `smokeInference`) against an OpenAI-compatible Chat Completions endpoint. Default base URL is `https://api.muse.ai` (override via `MUSE_BASE_URL`/`MUSE_API_URL`).

Registration is done at runtime in `src/d.coffee` to avoid modifying the read-only upstream clone:

```coffee
import { providers } from "agl-ai"
import * as museProvider from "./providers/muse.mjs"
providers.muse = museProvider
```

This is functionally equivalent to adding `src/providers/muse.mjs` to `/workspace/agl` and exporting it via `package.json` (`agl/src/agent.mjs` `PROVIDERS` map, `exports` field), but keeps the upstream untouched in the sandbox.

If you have write access to the agl clone outside the sandbox, you can also copy the file:

```sh
cp src/providers/muse.mjs /workspace/agl/src/providers/muse.mjs
# then add to /workspace/agl/src/agent.mjs:
#   import * as muse from './providers/muse.mjs';
#   const PROVIDERS = { ..., muse };
# and to /workspace/agl/package.json exports:
#   "./providers/muse": "./src/providers/muse.mjs"
```

## Install as `d` in $PATH

```sh
# link agl-ai (already cloned at /workspace/agl)
npm --prefix /workspace/daemon-0 install --cache /tmp/npm-cache file:../agl
# or: bun link agl-ai   # (requires bun link setup; falls back to npm file: link in sandbox)

# link d globally (outside sandbox this works; in sandbox use /tmp/bin)
bun link              # or: npm link
# now `d` is available anywhere:
d "compress all pngs in ./images with optipng"

# Sandbox workaround (read-only /home):
mkdir -p /tmp/bin && ln -sf /workspace/daemon-0/bin/d /tmp/bin/d
export PATH="/tmp/bin:$PATH"
# or:
export PATH="/workspace/daemon-0/bin:$PATH"
d "list large files over 100M"
```

Local run without global link:

```sh
bun --preload ./coffee-loader.mjs src/d.coffee "list large files over 100M"
# or via preload auto (bunfig.toml):
bun src/d.coffee "show services that failed"
bun ./bin/d "find and replace foo with bar in all js files"
# with Muse key:
MUSE_API_KEY=... bun src/d.coffee "show failed systemd services"
bun --env-file=.env src/d.coffee "install bat with pacman"
```

## Clipboard

Copies to system clipboard automatically; prints command to stdout regardless. Tries `wl-copy` → `xclip -selection clipboard` → `xsel --clipboard --input` → `pbcopy` → `clip.exe`. Falls back gracefully with a warning if no tool is available. Under Bun, `xclip`'s daemon fork is handled correctly (parent exits quickly); under Node it would hang.

## Project layout

```
daemon-0/
  .env.example          # template for MUSE_API_KEY (copy to .env)
  .gitignore            # ignores .env, node_modules, tmp
  bunfig.toml           # preload = ["./coffee-loader.mjs"]
  coffee-loader.mjs     # Bun plugin to compile .coffee → JS (bare)
  bin/d                 # JS wrapper (imports loader + src/d.coffee)
  src/d.coffee          # ← the single microagent file (factory + output_tool + CLI)
  src/providers/muse.mjs # Muse provider (OpenAI-compatible, MUSE_API_KEY)
  package.json          # bin { d: "./bin/d" }, dependencies: agl-ai, coffeescript
```
