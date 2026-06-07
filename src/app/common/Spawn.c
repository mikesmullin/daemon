#pragma once

#include "../../unity.h"

// ---
// @class Spawn
// process spawning and execution utilities
//
// Function | Purpose
// --- | ---
// Spawn__detached(exe_path, argv) | spawn fully detached daemon process (double-fork POSIX, DETACHED_PROCESS Win)
// Spawn__run(path, argv) | run command synchronously and capture stdout

// spawn a fully detached daemon process
int Spawn__detached(const char* exe_path, char* const argv[]) {
#ifdef _WIN32
  // Windows: CreateProcess with DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP
  STARTUPINFOA si = {0};
  PROCESS_INFORMATION pi = {0};
  char cmdline[32768];  // Windows has a max command line length
  char* p = cmdline;

  si.cb = sizeof(si);

  // Build command line: "exe" "arg1" "arg2" ...
  for (int i = 0; argv[i]; ++i) {
    if (i > 0)
      *p++ = ' ';
    int quote = strchr(argv[i], ' ') != NULL;
    if (quote)
      *p++ = '"';
    strcpy(p, argv[i]);
    p += strlen(argv[i]);
    if (quote)
      *p++ = '"';
  }
  *p = '\0';

  // Copy because CreateProcess may modify it
  char* cmdline_copy = strdup(cmdline);

  BOOL ok = CreateProcessA(
      exe_path,  // lpApplicationName (NULL = use cmdline)
      cmdline_copy,  // lpCommandLine (mutable)
      NULL,
      NULL,  // lpProcessAttributes, lpThreadAttributes
      FALSE,  // bInheritHandles
      DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,  // dwCreationFlags
      NULL,  // lpEnvironment
      NULL,  // lpCurrentDirectory (NULL = inherit, or set it)
      &si,
      &pi);

  free(cmdline_copy);

  if (!ok) {
    perror("CreateProcess failed");
    return -1;
  }

  // No need to wait or close handles immediately — child is detached
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return 0;

#else
  // POSIX (Linux, macOS, BSD, etc.)
  pid_t pid = fork();
  if (pid < 0) {
    perror("fork");
    return -1;
  }

  if (pid > 0) {  // pid==0 is child proc
    // Parent: exit immediately
    return 0;
  }

  // Child continues here

  // Create new session and process group → fully detach from controlling terminal
  if (setsid() < 0) {
    perror("setsid");
    exit(EXIT_FAILURE);
  }

  // Optional: fork again (double-fork) for stricter POSIX daemon rules
  // (prevents acquiring a controlling terminal ever)
  pid = fork();
  if (pid < 0) {
    perror("second fork");
    exit(EXIT_FAILURE);
  }
  if (pid > 0) {  // pid==0 is child proc
    // Intermediate process exits
    exit(EXIT_SUCCESS);
  }

  // Grandchild (real daemon process)

  // Close stdio completely
  close(STDIN_FILENO);
  close(STDOUT_FILENO);
  close(STDERR_FILENO);

  // Optional: redirect to /dev/null
  int devnull = open("/dev/null", O_RDWR);
  if (devnull >= 0) {
    dup2(devnull, STDIN_FILENO);
    dup2(devnull, STDOUT_FILENO);
    dup2(devnull, STDERR_FILENO);
    if (devnull > 2)
      close(devnull);
  }

  // Execute the real program
  execvp(exe_path, argv);  // or execv, execlp, etc.

  // If exec fails
  perror("execvp");
  exit(EXIT_FAILURE);
#endif
}

//#include <fcntl.h>

// run command synchronously and capture stdout
// usage: int r = Spawn__run("podman", (char*[]){"podman", "ps", NULL});
int Spawn__run(char* path, char** argv) {
  // print cmd
  {
    char cmd[1024] = "";
    // sprintf(cmd, "%s", path);
    for (u8 i = 0; true; i++) {
      if (NULL == argv[i]) {
        break;
      }
      sprintf(cmd, "%s %s", cmd, argv[i]);
    }
    LOG_DEBUGF(COLOR__PURPLE "cmd: %s", cmd);
  }

  int pipefd[2];
  if (pipe(pipefd) == -1) {
    perror("pipe failed");
    return 1;
  }

  pid_t pid = fork();

  if (pid == -1) {
    perror("fork failed");
    return 1;
  }

  if (pid == 0) {
    /* Child: redirect stdout to pipe */
    close(pipefd[0]);  // Close read end
    dup2(pipefd[1], STDOUT_FILENO);  // stdout -> pipe write
    close(pipefd[1]);

    //char* argv[] = {"git", "log", "--oneline", NULL};
    execvp(path, argv);

    perror("execvp failed");
    exit(127);
  }

  /* Parent: read from pipe */
  close(pipefd[1]);  // Close write end

  char buffer[4096];
  ssize_t n;
  while ((n = read(pipefd[0], buffer, sizeof(buffer))) > 0) {
    // write(STDOUT_FILENO, buffer, n);  // Stream to our stdout
    LOG_DEBUGF(COLOR__GREY "%*s", n, buffer);
  }
  close(pipefd[0]);

  waitpid(pid, NULL, 0);
  return 0;
}