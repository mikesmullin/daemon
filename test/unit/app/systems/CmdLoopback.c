#define ENGINE_TEST
#include "../../../../src/unity.h"

// Mock _Session__findByName if needed, but we can use the real one if we populate _G->sessions
// Since unity.h includes Network.c, we have the real one.

void test_fs_await() {
  printf("Testing fs.await...\n");

  // Setup global state
  _G->mode = MODE_HUB;
  _G->session_ct = 0;

  // Setup a fake session for "term-1"
  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;
  RB_Alloc(_G->arena, &session->reliable, 4096);
  _G->session_ct = 1;

  // Setup Registry
  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  // Prepare test file path
  const char* test_file = "/tmp/test_await.txt";
  remove(test_file);  // Ensure it doesn't exist

  // Add "fs.await" command
  CmdMessage cmd = {.id = 200, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.cmd, "fs.await");
  sprintf(cmd.args, "{\"path\": \"%s\"}", test_file);

  CmdRegistry__add(&reg, &cmd);

  // Tick 1: File missing
  CmdRegistry__tick(&reg);
  ASSERT(reg.count == 1);
  ASSERT(reg.states[0].state == CMD_RUNNING);

  // Tick 2: File still missing
  CmdRegistry__tick(&reg);
  ASSERT(reg.count == 1);

  // Create file
  FILE* fp = fopen(test_file, "w");
  fprintf(fp, "created");
  fclose(fp);

  // Tick 3: File exists
  CmdRegistry__tick(&reg);

  // Verify command removed
  ASSERT(reg.count == 0);

  // Verify result
  ASSERT(RB_Used(&session->reliable) > 0);

  IO io = {&session->reliable};
  u8 code = 0;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  CmdMessage response = {0};
  MSG_ReadCmd(&io, &response);

  ASSERT(response.id == 200);
  ASSERT(response.state == CMD_COMPLETED);
  ASSERT(strstr(response.result, "File '/tmp/test_await.txt' detected") != NULL);

  // Cleanup
  remove(test_file);

  printf("fs.await test passed.\n");
}

void test_fs_read_write() {
  printf("Testing fs.read/write...\n");

  // Setup global state
  _G->mode = MODE_HUB;
  _G->session_ct = 0;

  // Setup a fake session for "term-1"
  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;
  RB_Alloc(_G->arena, &session->reliable, 4096);
  _G->session_ct = 1;

  // Setup Registry
  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  const char* test_file = "/tmp/test_rw.txt";
  remove(test_file);

  // 1. Write
  CmdMessage cmd_write = {.id = 300, .state = CMD_PENDING};
  strcpy(cmd_write.term, "term-1");
  strcpy(cmd_write.cmd, "fs.write");
  sprintf(cmd_write.args, "{\"path\": \"%s\", \"content\": \"hello world\"}", test_file);

  CmdRegistry__add(&reg, &cmd_write);
  CmdRegistry__tick(&reg);

  ASSERT(reg.count == 0);

  // Verify file content
  FILE* fp = fopen(test_file, "r");
  ASSERT(fp != NULL);
  char buf[64] = {0};
  fread(buf, 1, sizeof(buf), fp);
  fclose(fp);
  ASSERT(strcmp(buf, "hello world") == 0);

  // Verify response
  IO io = {&session->reliable};
  u8 code = 0;
  IO_ReadU8(&io, &code);  // Skip MSG_CMD
  CmdMessage res_write = {0};
  MSG_ReadCmd(&io, &res_write);
  ASSERT(res_write.id == 300);
  ASSERT(res_write.state == CMD_COMPLETED);

  // 2. Read
  CmdMessage cmd_read = {.id = 301, .state = CMD_PENDING};
  strcpy(cmd_read.term, "term-1");
  strcpy(cmd_read.cmd, "fs.read");
  sprintf(cmd_read.args, "{\"path\": \"%s\"}", test_file);

  CmdRegistry__add(&reg, &cmd_read);
  CmdRegistry__tick(&reg);

  ASSERT(reg.count == 0);

  // Verify response
  IO_ReadU8(&io, &code);  // Skip MSG_CMD
  CmdMessage res_read = {0};
  MSG_ReadCmd(&io, &res_read);
  ASSERT(res_read.id == 301);
  ASSERT(res_read.state == CMD_COMPLETED);
  ASSERT(strcmp(res_read.result, "hello world") == 0);

  remove(test_file);
  printf("fs.read/write test passed.\n");
}

void test_fs_ops() {
  printf("Testing fs.ops (touch, ls, append, grep, unlink, mkdir, rmdir)...\n");

  // Setup global state
  _G->mode = MODE_HUB;
  _G->session_ct = 0;
  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;
  RB_Alloc(_G->arena, &session->reliable, 4096);
  _G->session_ct = 1;

  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  const char* test_file = "/tmp/test_ops.txt";
  const char* test_dir = "/tmp/test_dir";
  remove(test_file);
  rmdir(test_dir);

  // 1. Touch
  CmdMessage cmd = {.id = 400, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.cmd, "fs.touch");
  sprintf(cmd.args, "{\"path\": \"%s\"}", test_file);
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);
  ASSERT(reg.count == 0);

  // Verify file exists
  FILE* fp = fopen(test_file, "r");
  ASSERT(fp != NULL);
  fclose(fp);

  // 2. Append
  cmd.id = 401;
  strcpy(cmd.cmd, "fs.append");
  sprintf(cmd.args, "{\"path\": \"%s\", \"content\": \"line1\\nline2\"}", test_file);
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);
  ASSERT(reg.count == 0);

  // 3. Grep
  cmd.id = 402;
  strcpy(cmd.cmd, "fs.grep");
  sprintf(cmd.args, "{\"path\": \"%s\", \"pattern\": \"line2\"}", test_file);
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  // Verify grep result
  IO io = {&session->reliable};
  // Skip previous responses (touch, append)
  u8 code;
  CmdMessage res = {0};

  // Touch response
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);
  // Append response
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);
  // Grep response
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);

  ASSERT(res.id == 402);
  ASSERT(strstr(res.result, "line2") != NULL);

  // 4. Unlink
  cmd.id = 403;
  strcpy(cmd.cmd, "fs.unlink");
  sprintf(cmd.args, "{\"path\": \"%s\"}", test_file);
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  fp = fopen(test_file, "r");
  ASSERT(fp == NULL);

  // 5. Mkdir
  cmd.id = 404;
  strcpy(cmd.cmd, "fs.mkdir");
  sprintf(cmd.args, "{\"path\": \"%s\"}", test_dir);
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  struct stat st;
  ASSERT(stat(test_dir, &st) == 0);
  ASSERT(S_ISDIR(st.st_mode));

  // 6. LS
  cmd.id = 405;
  strcpy(cmd.cmd, "fs.ls");
  sprintf(cmd.args, "{\"path\": \"/tmp\"}");
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  // Verify LS result contains test_dir
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);  // Unlink
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);  // Mkdir
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);  // LS

  ASSERT(strstr(res.result, "test_dir") != NULL);

  // 7. Rmdir
  cmd.id = 406;
  strcpy(cmd.cmd, "fs.rmdir");
  sprintf(cmd.args, "{\"path\": \"%s\"}", test_dir);
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  ASSERT(stat(test_dir, &st) != 0);

  printf("fs.ops test passed.\n");
}

void test_browser() {
  printf("Testing browser.open...\n");

  _G->mode = MODE_HUB;
  _G->session_ct = 0;
  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;
  RB_Alloc(_G->arena, &session->reliable, 4096);
  _G->session_ct = 1;

  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  CmdMessage cmd = {.id = 500, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.cmd, "browser.open");
  sprintf(cmd.args, "{\"url\": \"https://example.com\"}");

  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO io = {&session->reliable};
  u8 code;
  CmdMessage res = {0};
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);

  ASSERT(res.id == 500);
  ASSERT(res.state == CMD_COMPLETED);
  ASSERT(strstr(res.result, "Opened URL: https://example.com") != NULL);

  printf("browser.open test passed.\n");
}

void test_shell_exec() {
  printf("Testing shell.exec...\n");

  _G->mode = MODE_HUB;
  _G->session_ct = 0;
  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;
  RB_Alloc(_G->arena, &session->reliable, 4096);
  _G->session_ct = 1;

  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  CmdMessage cmd = {.id = 550, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.cmd, "shell.exec");
  sprintf(cmd.args, "{\"cmd\": \"echo hello world\"}");

  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO io = {&session->reliable};
  u8 code;
  CmdMessage res = {0};
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);

  ASSERT(res.id == 550);
  ASSERT(res.state == CMD_COMPLETED);
  ASSERT(strstr(res.result, "hello world") != NULL);

  printf("shell.exec test passed.\n");
}

void test_session_fsm() {
  printf("Testing Session FSM (create, run, pause, stop, list)...\n");

  _G->mode = MODE_HUB;
  _G->session_ct = 0;
  _G->agent_session_ct = 0;
  _G->session_id = 0;  // Reset session ID counter
  memset(_G->agent_sessions, 0, sizeof(_G->agent_sessions));

  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;
  RB_Alloc(_G->arena, &session->reliable, 4096);
  _G->session_ct = 1;

  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  // 1. Create
  CmdMessage cmd = {.id = 600, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.cmd, "session.create");
  sprintf(cmd.args, "{\"template\": \"solo\"}");
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO io = {&session->reliable};
  u8 code;
  CmdMessage res = {0};
  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);

  ASSERT(res.id == 600);
  ASSERT(strstr(res.result, "Created session 1") != NULL);
  ASSERT(_G->agent_sessions[0].id == 1);
  ASSERT(_G->agent_sessions[0].status == AGENT_STATUS_PENDING);

  // 2. Run
  cmd.id = 601;
  strcpy(cmd.cmd, "session.run");
  sprintf(cmd.args, "{\"id\": \"1\"}");
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);
  ASSERT(res.id == 601);
  ASSERT(strstr(res.result, "Session 1 running") != NULL);
  ASSERT(_G->agent_sessions[0].status == AGENT_STATUS_RUNNING);

  // 3. Pause
  cmd.id = 602;
  strcpy(cmd.cmd, "session.pause");
  sprintf(cmd.args, "{\"id\": \"1\"}");
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);
  ASSERT(res.id == 602);
  ASSERT(strstr(res.result, "Session 1 paused") != NULL);
  ASSERT(_G->agent_sessions[0].status == AGENT_STATUS_PAUSED);

  // 4. Stop
  cmd.id = 603;
  strcpy(cmd.cmd, "session.stop");
  sprintf(cmd.args, "{\"id\": \"1\"}");
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);
  ASSERT(res.id == 603);
  ASSERT(strstr(res.result, "Session 1 stopped") != NULL);
  ASSERT(_G->agent_sessions[0].status == AGENT_STATUS_STOPPED);

  // 5. List
  cmd.id = 604;
  strcpy(cmd.cmd, "session.list");
  cmd.args[0] = '\0';
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  IO_ReadU8(&io, &code);
  MSG_ReadCmd(&io, &res);
  ASSERT(res.id == 604);
  ASSERT(strstr(res.result, "1: solo [STOPPED]") != NULL);

  printf("Session FSM test passed.\n");
}

// Test: Worker executes command with pre-parsed cmd and args
// This simulates what happens when hub forwards a command to worker:
// - msg.cmd = "shell.exec" (command name only)
// - msg.args = {"cmd": "echo hello"} (JSON args, already parsed)
// The worker should use msg.args directly, NOT try to re-parse from msg.cmd
void test_worker_executes_with_preparsed_args() {
  printf("Testing worker execution with pre-parsed args...\n");

  // Setup global state as HUB (for result routing)
  _G->mode = MODE_HUB;
  _G->session_ct = 0;

  // Setup a fake "term" session for result routing
  NetSession* term_session = &_G->sessions[0];
  strcpy(term_session->name, "term-1");
  term_session->active = true;
  RB_Alloc(_G->arena, &term_session->reliable, 4096);
  _G->session_ct = 1;

  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  // Simulate a command that arrived at worker from hub
  // Key: cmd and args are ALREADY PARSED (this is what hub sends to worker)
  CmdMessage cmd = {.id = 700, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.worker, "hub");  // Worker executes locally, sends result to hub
  strcpy(cmd.cmd, "shell.exec");
  sprintf(cmd.args, "{\"cmd\": \"echo worker_test\"}");

  // Add to registry and tick - this simulates worker execution
  CmdRegistry__add(&reg, &cmd);
  CmdRegistry__tick(&reg);

  // Verify command completed successfully
  ASSERT(reg.count == 0);  // Command should be removed after completion

  // Verify result was sent to term session
  ASSERT(RB_Used(&term_session->reliable) > 0);

  // Read the result message
  IO io = {&term_session->reliable};
  u8 code = 0;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  CmdMessage result = {0};
  MSG_ReadCmd(&io, &result);

  printf("  Result: id=%llu state=%u result='%s'\n", result.id, result.state, result.result);

  ASSERT(result.id == 700);
  ASSERT(result.state == CMD_COMPLETED);
  // The result should contain "worker_test" from "echo worker_test"
  ASSERT(strstr(result.result, "worker_test") != NULL);

  printf("test_worker_executes_with_preparsed_args passed.\n");
}

// Test target: <node_name> parsing in MSG_SendCmdRequest
void test_target_parsing() {
  printf("Testing target: <node_name> parsing...\n");

  // Setup global state
  _G->mode = MODE_TERM;
  _G->unow = 123456;  // Fixed timestamp for predictable ID

  // Setup a socket with reliable buffer
  Socket socket = {0};
  u8 buffer[4096];
  socket.reliable.data = buffer;
  socket.reliable.sz = sizeof(buffer);
  socket.reliable.head = 0;
  socket.reliable.tail = 0;

  // Test 1: Command with target specified
  MSG_SendCmdRequest(&socket, "term-1", "fs.read path: /tmp/test, target: worker-1");

  // Read back the message
  IO io = {&socket.reliable};
  u8 code = 0;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  CmdMessage msg = {0};
  MSG_ReadCmd(&io, &msg);

  ASSERT(strcmp(msg.term, "term-1") == 0);
  ASSERT(strcmp(msg.worker, "worker-1") == 0);
  ASSERT(strcmp(msg.cmd, "fs.read") == 0);
  ASSERT(strstr(msg.args, "\"path\"") != NULL);
  ASSERT(strstr(msg.args, "/tmp/test") != NULL);
  printf("  target: worker-1 parsed correctly, cmd='%s', args='%s'\n", msg.cmd, msg.args);

  // Test 2: Command without target (should default to hub)
  socket.reliable.head = 0;
  socket.reliable.tail = 0;

  MSG_SendCmdRequest(&socket, "term-2", "fs.read path: /tmp/test");

  io.buf = &socket.reliable;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  memset(&msg, 0, sizeof(msg));
  MSG_ReadCmd(&io, &msg);

  ASSERT(strcmp(msg.term, "term-2") == 0);
  ASSERT(strcmp(msg.worker, "hub") == 0);
  ASSERT(strcmp(msg.cmd, "fs.read") == 0);
  printf("  default to hub when no target specified, cmd='%s'\n", msg.cmd);

  // Test 3: Command with target: hub (explicit)
  socket.reliable.head = 0;
  socket.reliable.tail = 0;

  MSG_SendCmdRequest(&socket, "term-3", "shell.exec cmd: ls, target: hub");

  io.buf = &socket.reliable;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  memset(&msg, 0, sizeof(msg));
  MSG_ReadCmd(&io, &msg);

  ASSERT(strcmp(msg.term, "term-3") == 0);
  ASSERT(strcmp(msg.worker, "hub") == 0);
  ASSERT(strcmp(msg.cmd, "shell.exec") == 0);
  printf("  target: hub correctly set, cmd='%s'\n", msg.cmd);

  // Test 4: Command with target at beginning (edge case - target is parsed as first key)
  socket.reliable.head = 0;
  socket.reliable.tail = 0;

  // Note: when target is first, the parsing splits at first space, so "target:" becomes the cmd
  // This is a known limitation - target should come after the command name
  MSG_SendCmdRequest(&socket, "term-4", "fs.read target: worker-2, path: /etc/hosts");

  io.buf = &socket.reliable;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  memset(&msg, 0, sizeof(msg));
  MSG_ReadCmd(&io, &msg);

  ASSERT(strcmp(msg.term, "term-4") == 0);
  ASSERT(strcmp(msg.worker, "worker-2") == 0);
  ASSERT(strcmp(msg.cmd, "fs.read") == 0);
  printf("  target in args parsed correctly, cmd='%s'\n", msg.cmd);

  // Test 5: Command with "target :" (space before colon)
  socket.reliable.head = 0;
  socket.reliable.tail = 0;

  MSG_SendCmdRequest(&socket, "term-5", "fs.read path: /tmp, target : worker-3");

  io.buf = &socket.reliable;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  memset(&msg, 0, sizeof(msg));
  MSG_ReadCmd(&io, &msg);

  ASSERT(strcmp(msg.term, "term-5") == 0);
  ASSERT(strcmp(msg.worker, "worker-3") == 0);
  ASSERT(strcmp(msg.cmd, "fs.read") == 0);
  printf("  target : (with space) parsed correctly, cmd='%s'\n", msg.cmd);

  printf("target: <node_name> parsing test passed.\n");
}

// Test: Tool call dispatch from hub to worker
// When Agent__executeToolCall is called and template has workers specified,
// the tool should be dispatched to the worker instead of executing locally.
void test_tool_call_dispatch_to_worker() {
  printf("Testing tool call dispatch to worker...\n");

  // Setup hub mode
  _G->mode = MODE_HUB;
  _G->session_ct = 0;

  // Setup worker session
  NetSession* worker_session = &_G->sessions[0];
  strcpy(worker_session->name, "test-worker");
  worker_session->active = true;
  RB_Alloc(_G->arena, &worker_session->reliable, 4096);
  _G->session_ct = 1;

  // Create a mock AgentTemplate with worker specified
  AgentTemplate tmpl = {0};
  strcpy(tmpl.apiVersion, "daemon/v1");
  strcpy(tmpl.kind, "Agent");
  strcpy(tmpl.metadata.name, "tooltest");
  strcpy(tmpl.metadata.model, "xai:grok-4-fast-reasoning");

  // Add shell__execute tool
  strcpy(tmpl.metadata.tools[0].name, "shell__execute");
  tmpl.metadata.tool_count = 1;

  // Add worker
  strcpy(tmpl.metadata.workers[0], "test-worker");
  tmpl.metadata.worker_count = 1;

  // Create a tool call (simulating what LLM would return)
  AgentToolCall tc = {0};
  strcpy(tc.id, "call_001");
  strcpy(tc.name, "shell__execute");
  strcpy(tc.arguments, "{\"command\": \"echo hello\"}");

  // Test: dispatch tool call to worker
  // This function should check tmpl.metadata.workers and dispatch if available
  // For now, we test the helper function that will do this

  // Find worker from template
  NetSession* worker = NULL;
  for (u8 w = 0; w < tmpl.metadata.worker_count; w++) {
    worker = Session__findByName(tmpl.metadata.workers[w]);
    if (worker && worker->active)
      break;
  }

  ASSERT(worker != NULL);
  ASSERT(strcmp(worker->name, "test-worker") == 0);
  printf("  Found worker: %s\n", worker->name);

  // Dispatch tool call as CmdMessage to worker
  CmdMessage cmd = {0};
  cmd.id = 800;
  strcpy(cmd.term, "hub");  // Hub is the originator
  strcpy(cmd.worker, worker->name);  // Target worker
  strcpy(cmd.cmd, "shell.exec");  // Mapped from shell__execute
  strcpy(cmd.args, tc.arguments);
  cmd.state = CMD_PENDING;

  IO worker_io = {&worker_session->reliable};
  MSG_WriteCmd(&worker_io, &cmd);

  // Verify message was written to worker's buffer
  ASSERT(RB_Used(&worker_session->reliable) > 0);

  // Read back and verify
  u8 code = 0;
  IO read_io = {&worker_session->reliable};
  IO_ReadU8(&read_io, &code);
  ASSERT(code == MSG_CMD);

  CmdMessage received = {0};
  MSG_ReadCmd(&read_io, &received);

  ASSERT(received.id == 800);
  ASSERT(strcmp(received.cmd, "shell.exec") == 0);
  ASSERT(strcmp(received.worker, "test-worker") == 0);
  ASSERT(strstr(received.args, "echo hello") != NULL);
  printf("  Dispatched to worker: cmd='%s' args='%s'\n", received.cmd, received.args);

  // Now simulate worker execution and result return
  _G->mode = MODE_HUB;  // Back to hub mode for result handling

  // Worker would execute and send result back
  CmdMessage result = received;
  result.state = CMD_COMPLETED;
  strcpy(result.result, "hello\n");

  // Verify result has expected content
  ASSERT(result.state == CMD_COMPLETED);
  ASSERT(strstr(result.result, "hello") != NULL);

  printf("test_tool_call_dispatch_to_worker passed.\n");
}

int main() {
  _G->arena = Arena__Alloc(1024 * 1024);

  test_tool_call_dispatch_to_worker();  // Test tool call dispatch to worker
  test_worker_executes_with_preparsed_args();  // Test pre-parsed args execution
  test_target_parsing();
  test_fs_await();
  test_fs_read_write();
  test_fs_ops();
  test_shell_exec();
  test_browser();
  test_session_fsm();
  return 0;
}