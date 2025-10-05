
## TODO

- [ ] A @executor-001 #infra #redis `Check if Redis container is running`
description: Verify Redis container status on local system
commands:
  - docker ps --filter name=redis --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  - docker stats --no-stream redis --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}"
  - docker logs redis --tail 20
approval_required: false
- [ ] B @executor-001 #infrastructure #status-check `Check Redis container status locally`
  description: Execute docker commands to check if Redis container is running
  actions:
    - Run 'docker ps' to check if Redis container is active
    - Get container uptime and health status
    - Check memory usage and resource consumption
  approval_required: false
