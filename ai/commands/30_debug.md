- its currently tricky for you to test any changes to this code because it is so deep
  - deep (in terms of stack)
  - deep (in terms of ui (many steps required to invoke it (requires interacting with a running process, which is a challenge for you (and the stdout is not great information-wise, either (would be better if you used `DEBUG_TRACE` gratiutiously to help you understand the logic flow)))))

  - in these cases, if its all we've got to work with,
    - use the `ai/skills/tmux.md` skill

- better alternaties to that situation are:

  - if favorable to the human operator, recommend a refactor to break up the ui
    - into more of a client-server style of architecture
      - where one cli command launches a background service (ie. `project server start|stop|restart|status`)
        - where the server writes to a log
      - and another cli command interacts with it (ie. `project client <cmd>`)
        - where the cli writes to stdout and exits immediately

  - or create your own version of the app just temporarily to test with
    - create a `ai/test/` 
      - inside of it, create your own `Makefile` you can use to build and run the tests
        - you can copy the approach described in `ai/commands/20_test.md`
        - and then just populate it with some unit tests of your own making,
          - to prove out each module you are working with is working
            1. independently (isolated, stand-alone)
            2. intradependently (compose valid combinations)
            3. in the original app (as intended)
        - check many edge cases; e.g., relating to
          - sending/parsing malformed data
          - buffer overflows
          - invalid inputs
          - correct outputs

## trace strategy

when you find yourself guessing/(trying to imagine) the path the code is taking, and that is becoming too complex/difficult/time-consuming,
i recommend instead to use this strategy (particularly, as your understanding of critical path improves):
rather than logically deducing what might be happening...
add a bunch of (`LOG_TRACE;` or `LOG_DEBUGF()`) traces (which include useful information in string interpolations) all along the critical path, so its very clear where it breaks down.

## tips

use `coredumpctl` and `gdb` and `clang` and related tools to find and troubleshoot the core dump
ie. `gdb -q ./build/test_core -iex "set debuginfod enabled on" -ex "run" -ex "bt" -ex "quit"`
ie. `clang -fsanitize=address -g -std=c99 -O1 -Wall -Wextra -Iinclude -Ivendor src/ml_core.c src/ml_utils.c src/ml_tensor.c src/ml_graph.c src/ml_optimizer.c src/ops/ml_op_fill.c src/ops/ml_op_add.c src/ops/ml_op_matmul.c src/ops/ml_op_relu.c src/ops/ml_op_softmax.c src/ops/ml_op_embedding.c src/ops/ml_op_crossentropy.c src/test_core.c -o build/test_core_asan -lvulkan -lm && ./build/test_core_asan`
ie. `addr2line -e build/test_core_asan 0x1b7584 0x1bda51 0x1b777b`