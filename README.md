> 📦 **Part of the [Daemon multi-version archive](https://github.com/mikesmullin/daemon).** This is **v4** — a C99 rewrite (built from Game9 engine pieces): a fast, cross-platform, distributed hub/worker harness. The most performant line.
>
> **Versions:** [v1](https://github.com/mikesmullin/daemon/tree/v1) · [v2](https://github.com/mikesmullin/daemon/tree/v2) · [v3](https://github.com/mikesmullin/daemon/tree/v3) · [v4](https://github.com/mikesmullin/daemon/tree/v4) · [v2-web-ui](https://github.com/mikesmullin/daemon/tree/v2-web-ui) · [overview](https://github.com/mikesmullin/daemon)

---

# 👺 Daemon v4

Agentic AI Platform

## Goals

- network multiple machines together 
  - machines are composed of roles:
    - hub: routes command requests to workers
      - runs from inside container as a systemd unit
    - term: issues command requests from user. various kinds of terminals:
      - cli interface
      - Android RAG interface
    - worker: capable of running separate inference requests
      - may run bare-metal, or container, and on various hardware
        - may use local GPU, or remote LLM API, or both
        - tool_call fns availabie varies by worker instance
