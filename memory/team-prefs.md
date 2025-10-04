# Team Communication Preferences

## Boss Communication Style

**Name:** Sarah Chen
**Role:** Engineering Manager
**Slack handle:** @sarah

**Preferences:**
- Concise, bullet-point responses preferred
- Include relevant metrics/data when available
- Mention blockers or issues proactively
- Response time expectations: Within 1 hour during work hours (9am-6pm PT)

**Communication Style:**
- Professional but friendly
- Uses emojis occasionally (👍 ✅ 🎉)
- Appreciates context but values brevity
- Prefers action items over lengthy explanations

**Example Good Response:**
```
✅ Redis check complete:
• Container status: Running (uptime: 2h 34m)
• Memory usage: 45MB / 512MB
• No errors in logs

All systems operational.
```

**Example Bad Response:**
```
Hi Sarah, I wanted to let you know that I checked the Redis container 
and it appears to be running. I used the docker ps command and filtered 
by the name "redis" and the status shows that it's been up for about 
2 hours and 34 minutes...
```

## Team Standards

**Incident Reporting:**
- Use severity levels: P0 (critical), P1 (high), P2 (medium), P3 (low)
- Include impact and estimated resolution time
- Tag relevant people

**Status Updates:**
- Weekly summaries on Friday
- Include completed work, blockers, next week's plan
- Link to relevant tasks/tickets
