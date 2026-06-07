# 👺 Daemon

**Daemon** is an early agentic-AI harness — a personal exploration of how to orchestrate
multiple AI agents from the command line, delegate work between them, and let them safely run
tools and shell commands on real machines.

It grew out of a simple idea: rather than one monolithic chatbot, treat AI agents like Unix
processes — small, composable, pipeable, and auditable — and give them a runtime that can spawn,
supervise, and coordinate them. The project favors **Unix-philosophy over TUI**: deterministic,
testable, scriptable, and friendly to stdin/stdout composition. Over successive rewrites it
explored multi-provider model support, YAML-defined agent templates, security allowlists for tool
use, parallel "watch" workers, container-sandboxed sessions, a browser observability UI, and
finally a performance-focused distributed C harness.

This repository is an **archive of every major version**. Each version lived as its own codebase
during development; here each is preserved as a branch so the evolution of the design is visible in
one place. Branches are independent snapshots (history was intentionally not carried over), and
secrets / personal data were scrubbed before publishing.

## Versions

| Version | Branch | Stack | What makes it distinct |
|---|---|---|---|
| **v1** | [`v1`](https://github.com/mikesmullin/daemon/tree/v1) | Bun · `.mjs` | The original Multi-Agent Delegation (MAD) CLI: multi-provider agents, YAML templates, security allowlist, watch-mode workers. |
| **v2** | [`v2`](https://github.com/mikesmullin/daemon/tree/v2) | Bun · `.mjs` | The most mature `.mjs` line — v1 plus PTY interaction, parallel watch workers, and API-call cancellation. |
| **v2-web-ui** | [`v2-web-ui`](https://github.com/mikesmullin/daemon/tree/v2-web-ui) | Bun · `.mjs` | v2 plus a browser observability UI (live chat, resizable panels, pty viewer) and a full Playwright + unit test suite. An abandoned "v3" direction explored before the v3 rewrite. |
| **v3** | [`v3`](https://github.com/mikesmullin/daemon/tree/v3) | Bun · `.mjs` | A ground-up rewrite: Podman-sandboxed agents, containerized sessions, a plugin architecture, and a persistent db. |
| **v4** | [`v4`](https://github.com/mikesmullin/daemon/tree/v4) | C99 | A from-scratch rewrite built from game-engine pieces: fast, cross-platform, and a distributed hub/worker harness. The most performant line. |

> **Lineage note:** v1 → v2 are the same codebase at two points in time; `v2-web-ui` is a topic
> branch off v2. v3 and v4 are independent rewrites that share no history with the `.mjs` line.

## Related / spun-off projects

A few companion utilities were built alongside Daemon (especially around v4) and are mentioned here
for context only — they are not part of this repository:

- **mintty** — an Android app providing a tappable chat/RAG UI to a Daemon instance running on a PC.
- **router** — a home-router utility for routing traffic between the mobile app and the PC (WAN → LAN).
- **tap** — a CLI utility for sending keystrokes to / remote-controlling a phone.
- **Game9** — a game engine experiment that embedded an LLM for real-time NPC and item generation;
  its performance-tuned, cross-platform pieces seeded the v4 rewrite.

The v4 line later evolved, outside this repo, into `subd` → `wasm1` → `agl-ai` (a minimalist,
Pydantic-AI-inspired approach using a staged-ECS agent pipeline and microagents).

## License

Each version branch carries its own `LICENSE` file (MIT).
