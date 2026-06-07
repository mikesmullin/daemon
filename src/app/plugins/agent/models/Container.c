#pragma once

#include "../../../../unity.h"

void Container__create(u32 session_id) {
  char WORKTREE[64] = "";
  sprintf(WORKTREE, "./assets/agent/worktrees/%d:/app", session_id);

  char _session_id[16] = "";
  sprintf(_session_id, "%u", session_id);

  int r;
  r = Spawn__run(
      "podman",
      (char*[]){"podman",
                "run",
                "-d",
                "--init",
                "--userns=keep-id",
                "-v",
                WORKTREE,
                "daemon:latest",
                "worker",
                _session_id,
                NULL});
}