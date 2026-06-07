// @describe CliParser
// @tag common
#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// Helper: reset global state to defaults
static void _ResetGlobal() {
  strcpy(_G->hub_host, "127.0.0.1");
  _G->hub_port = 6543;
  _G->session_id = 0;
  _G->mode = MODE_TERM;
  _G->cli_mode = CLI_ONESHOT;
  _G->oneshot_cmd[0] = '\0';
  _G->process_name[0] = '\0';
  strcpy(_G->default_template, "home");
}

int main() {
  // ---
  // Scenario: Default role is term
  {
    _ResetGlobal();
    const char* argv[] = {"d4"};
    ASSERT(0 == CliParser__parse(1, (char**)argv));
    ASSERT(_G->mode == MODE_TERM);
  }

  // ---
  // Scenario: Explicit role flag -r
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-r", "hub"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(_G->mode == MODE_HUB);
  }

  // ---
  // Scenario: Long role flag --role
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "--role", "worker"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(_G->mode == MODE_WORKER);
  }

  // ---
  // Scenario: Invalid role should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-r", "invalid"};
    ASSERT(1 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Hub address parsing with -h
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-h", "192.168.1.100:8080"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(cstr__eq(15, "192.168.1.100", _G->hub_host));
    ASSERT(_G->hub_port == 8080);
  }

  // ---
  // Scenario: Hub address parsing with --hub
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "--hub", "10.0.0.1:9999"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(cstr__eq(9, "10.0.0.1", _G->hub_host));
    ASSERT(_G->hub_port == 9999);
  }

  // ---
  // Scenario: Auto-detect role as term when -h specified without -r
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-h", "127.0.0.1:6543"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(_G->mode == MODE_TERM);  // Auto-detected
  }

  // ---
  // Scenario: Template file parsing with -t
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-t", "custom.yaml"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(cstr__eq(12, "custom.yaml", _G->default_template));
  }

  // ---
  // Scenario: Template file parsing with --template
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "--template", "agent.yaml"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(cstr__eq(11, "agent.yaml", _G->default_template));
  }

  // ---
  // Scenario: Interactive mode flag -i
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-i"};
    ASSERT(0 == CliParser__parse(2, (char**)argv));
    ASSERT(_G->cli_mode == CLI_INTERACTIVE);
  }

  // ---
  // Scenario: Listen address for hub mode with -l
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-l", "0.0.0.0:7777"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(cstr__eq(8, "0.0.0.0", _G->hub_host));
    ASSERT(_G->hub_port == 7777);
  }

  // ---
  // Scenario: Oneshot command collection
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "session.list"};
    ASSERT(0 == CliParser__parse(2, (char**)argv));
    ASSERT(cstr__eq(13, "session.list", _G->oneshot_cmd));
  }

  // ---
  // Scenario: Multi-word oneshot command
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "agent", "home", "hello"};
    ASSERT(0 == CliParser__parse(4, (char**)argv));
    ASSERT(cstr__eq(16, "agent home hello", _G->oneshot_cmd));
  }

  // ---
  // Scenario: Command with flags excluded
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-t", "test.yaml", "agent", "home"};
    ASSERT(0 == CliParser__parse(5, (char**)argv));
    ASSERT(cstr__eq(12, "agent home", _G->oneshot_cmd));
    ASSERT(cstr__eq(10, "test.yaml", _G->default_template));
  }

  // ---
  // Scenario: Complex CLI with role, hub, template, and command
  {
    _ResetGlobal();
    const char* argv[] =
        {"d4", "-r", "term", "-h", "192.168.1.1:6543", "-t", "solo.yaml", "agent", "test"};
    ASSERT(0 == CliParser__parse(9, (char**)argv));
    ASSERT(_G->mode == MODE_TERM);
    ASSERT(cstr__eq(13, "192.168.1.1", _G->hub_host));
    ASSERT(_G->hub_port == 6543);
    ASSERT(cstr__eq(10, "solo.yaml", _G->default_template));
    ASSERT(cstr__eq(11, "agent test", _G->oneshot_cmd));
  }

  // ---
  // Scenario: Help command doesn't get ignored
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "help"};
    ASSERT(0 == CliParser__parse(2, (char**)argv));
    ASSERT(cstr__eq(5, "help", _G->oneshot_cmd));
  }

  // ---
  // Scenario: Missing role argument should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-r"};
    ASSERT(1 == CliParser__parse(2, (char**)argv));
  }

  // ---
  // Scenario: Missing hub address argument should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-h"};
    ASSERT(1 == CliParser__parse(2, (char**)argv));
  }

  // ---
  // Scenario: Missing template argument should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-t"};
    ASSERT(1 == CliParser__parse(2, (char**)argv));
  }

  // ---
  // Scenario: Missing listen address argument should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-l"};
    ASSERT(1 == CliParser__parse(2, (char**)argv));
  }

  // ---
  // Scenario: Invalid hub address format should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-h", "invalid-address"};
    ASSERT(1 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Invalid listen address format should fail
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-l", "bad-format"};
    ASSERT(1 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Data flag -d is accepted
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-d", "key: value"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Session flag -s is accepted
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-s", "hub1:12345"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Long data flag --data is accepted
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "--data", "foo: bar"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Long session flag --session is accepted
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "--session", "worker1:99999"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
  }

  // ---
  // Scenario: Interactive mode doesn't collect command args (collected only in oneshot mode)
  {
    _ResetGlobal();
    const char* argv[] = {"d4", "-i", "session.list"};
    ASSERT(0 == CliParser__parse(3, (char**)argv));
    ASSERT(_G->cli_mode == CLI_INTERACTIVE);
    ASSERT(strlen(_G->oneshot_cmd) == 0);  // No oneshot command in interactive mode
  }

  // ---
  // Scenario: Full complex scenario with all flags (oneshot mode)
  {
    _ResetGlobal();
    const char* argv[] = {
        "d4",
        "-r",
        "term",
        "-h",
        "192.168.1.1:6543",
        "-t",
        "agent.yaml",
        "-d",
        "env: prod",
        "session.list"};
    ASSERT(0 == CliParser__parse(10, (char**)argv));
    ASSERT(_G->mode == MODE_TERM);
    ASSERT(cstr__eq(13, "192.168.1.1", _G->hub_host));
    ASSERT(_G->hub_port == 6543);
    ASSERT(cstr__eq(11, "agent.yaml", _G->default_template));
    ASSERT(_G->cli_mode == CLI_ONESHOT);
    ASSERT(cstr__eq(13, "session.list", _G->oneshot_cmd));
  }

  return 0;
}
