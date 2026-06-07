#pragma once

#include "../../../../unity.h"

void Worktree__create(u32 session_id) {
  char WORKTREE[64] = "";
  sprintf(WORKTREE, "assets/agent/worktrees/%d", session_id);

  int r;
  r = Spawn__run("git", (char*[]){"git", "worktree", "remove", "--force", WORKTREE, NULL});
  r = Spawn__run("git", (char*[]){"git", "worktree", "prune", NULL});
  r = Spawn__run("mkdir", (char*[]){"mkdir", "-p", WORKTREE, NULL});
  r = Spawn__run("git", (char*[]){"git", "worktree", "add", WORKTREE, "HEAD", NULL});
  char WORKTREE2[64] = "";
  sprintf(WORKTREE2, "assets/agent/worktrees/%d/build", session_id);
  r = Spawn__run("mkdir", (char*[]){"mkdir", "-p", WORKTREE2, NULL});
  sprintf(WORKTREE2, "assets/agent/worktrees/%d/assets/agent/sessions", session_id);
  r = Spawn__run("mkdir", (char*[]){"mkdir", "-p", WORKTREE2, NULL});
  sprintf(WORKTREE2, "assets/agent/worktrees/%d/assets/agent/sockets", session_id);
  r = Spawn__run("mkdir", (char*[]){"mkdir", "-p", WORKTREE2, NULL});
  sprintf(WORKTREE2, "assets/agent/worktrees/%d/assets/agent/", session_id);
  r = Spawn__run("cp", (char*[]){"cp", "-Ra", "assets/agent/templates", WORKTREE2, NULL});
  sprintf(WORKTREE2, "assets/agent/worktrees/%d/", session_id);
  r = Spawn__run("cp", (char*[]){"cp", "-Ra", "src", WORKTREE2, NULL});
}