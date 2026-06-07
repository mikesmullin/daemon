# Logical Network Architecture

In an example cluster:

```mermaid
graph LR
    Hub["🔀 Hub<br/>(pcl2)<br/>Podman on Armbian Linux<br/>━━━<br/>LLM API calls"]
    
    Term1["📱 Term<br/>(pixel)<br/>User Interface"]
    Term2["📱 Term<br/>(kindle)<br/>User Interface"]
    
    Worker1["⚙️ Worker<br/>(pbl1)<br/>Bare-metal Arch Linux<br/>━━━<br/>LED devices"]
    Worker2["⚙️ Worker<br/>(pcl1)<br/>Podman on Arch Linux<br/>━━━<br/>Stock market data"]
    Worker3["⚙️ Worker<br/>(wbm1)<br/>Bare-metal macOS<br/>━━━<br/>Local GPU"]
    Worker4["⚙️ Worker<br/>(wcm1)<br/>Podman on macOS<br/>━━━<br/>O365 Outlook"]
    Worker5["⚙️ Worker<br/>(wbw1)<br/>Bare-metal Windows<br/>━━━<br/>Video game app"]
    
    Term1 -->|commands| Hub
    Term2 -->|commands| Hub
    Hub -->|dispatch| Worker1
    Hub -->|dispatch| Worker2
    Hub -->|dispatch| Worker3
    Hub -->|dispatch| Worker4
    Hub -->|dispatch| Worker5
    Worker1 -->|responses| Hub
    Worker2 -->|responses| Hub
    Worker3 -->|responses| Hub
    Worker4 -->|responses| Hub
    Worker5 -->|responses| Hub
    Hub -->|responses| Term1
    Hub -->|responses| Term2
```

Where:

- `pcl2` connects to AI APIs (e.g., xAI) to execute LLM prompt commands and return responses to the requester (hub, worker, or term may each request llm responses. but only hub and worker can execute tool_call fns.)
- `pbl1` connects to LED light devices (on desk, and in PC chassis)
- human operators are using (`pixel`, `kindle`) (one session per-device)
- `pcl1` runs tool_call fns for controlling
  - gathering stock market data
- `wbm1` runs tool_call fns for controlling
  - local gpu
- `wcm1` runs tool_call fns for controlling
  - o365 outlook mail and calendar
- `wbw1` runs tool_call fns for controlling
  - a video game application (for testing game changes)

## References

- read `ai/docs/ROLES.md`
- read `ai/docs/AGENT_TEMPLATES.md`
- read `ai/docs/TOOL_CALLS.md`
- read `ai/docs/MODES.md`
- read `ai/docs/NET_PROTO.md`
- read `ai/docs/NET_MSGS.md`