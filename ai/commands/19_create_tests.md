### Unit Testing Architecture

The codebase implements a comprehensive unit testing system that integrates with the unity build architecture and hot-reload capabilities. 
Tests are designed for isolated module verification and can be executed individually or in batches.

**Test File Structure**:
```c
#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe ModuleName
// @tag category
int main() {
  // Test scenarios organized by functionality
  
  // ---
  // Scenario: Feature Description
  {
    // Setup
    Type* instance = Module__create();
    
    // Execute & Verify
    ASSERT(expected_value == Module__getValue(instance));
    ASSERT_CONTEXT(
      condition, 
      "Detailed failure message with context: %d", 
      actual_value);
  }
  
  // Additional scenarios...
  
  return 0;
}
```

**Test Metadata Annotations**:
Tests use comment-based metadata to control execution and organization:

```c
// @describe Math          // Human-readable test description
// @tag common            // Category for filtering (common, net, ux, etc.)
// @skip                  // Skip this test during execution
// @noinject              // Disable dependency injection
// @inject SYMBOL path    // Override specific dependency 
// @run args              // Custom command line arguments
// @stagger 500           // Delay between multi-process tests (ms)
```

**Assertion Patterns**:
```c
// Basic assertions
ASSERT(condition);                    // Simple boolean check
ASSERT(expected == actual);           // Equality check

// Context-aware assertions with detailed error messages
ASSERT_CONTEXT(
  file_size > 0,
  "File read failed: %s, expected size > 0, got %llu",
  filename, file_size);

// Floating point comparisons
ASSERT(Math__aeq(expected, actual, Math__EPSILON));

// Approximate equality for cross-platform determinism
ASSERT(APPROXEQF(0.0f, Math__sin(Math__PI32)));
```

**Test Organization Patterns**:

1. **Scenario-Based Structure**: Tests group related functionality under descriptive scenario comments:
   ```c
   // ---
   // Scenario: Ring Buffer Operations
   {
     RingBuf rb = {0};
     // Test empty buffer
     ASSERT(Ring__empty(&rb));
     // Test push operations
     // Test full buffer handling
   }
   
   // ---
   // Scenario: Entity Component System
   {
     // Test entity creation
     // Test component addition
     // Test query iteration
   }
   ```

2. **Isolated Setup**: Each test scenario creates its own isolated environment:
   ```c
   // Arena allocation for test isolation
   _G->arena = Arena__Alloc(50 * 1024 * 1024);  // 50MB test arena
   
   // Initialize ECS for entity tests
   GI_init();  // Reset generational index
   ```

3. **Progressive Complexity**: Tests start with basic operations and build to complex scenarios:
   ```c
   // Basic creation
   GID entity = GI_next(archetype);
   
   // Component addition
   ECS__add(entity, "test_name", CTRANSFORM3D, &transform_data);
   
   // System interaction
   ArchIt it = {0};
   ECS__archq(&it, (CmpKind[]){CTRANSFORM3D}, 1);
   while (ECS__query(&it)) {
     // Verify system behavior
   }
   ```

**Test Output Format**:
```
--tests--

1) Math
   Compilation took 245.67 ms
   process succeeded. code: 0

2) ECS  
   process succeeded. code: 0

3) List
   process succeeded. code: 0

Finished in 1247.89 ms, compiled in 1121.34 ms, execed in 126.55 ms.
12 run, 0 failures, 2 skips. (14 found)
```

**Integration vs Unit Tests**:

- **Unit Tests**: Located in `test/unit/**/*.c`, test individual modules in isolation
- **Integration Tests**: Located in `test/integration/**/app.c`, test system interactions with full game context

**Test Compilation Process**:

1. **Dependency Analysis**: Build system scans `#include` statements to determine required translation units
2. **Selective Compilation**: Only compiles necessary source files for each test
3. **Dependency Injection**: Uses `DEPINJ` macros to substitute test implementations:
   ```c
   // In production: includes actual file
   #include DEPINJ(GAME_H, "src/game/game.c")
   
   // In tests: can inject mock implementation
   // -DDEPINJ__GAME_H="test/mocks/game.c"
   ```
4. **Isolated Executables**: Each test compiles to its own executable for isolation

**Testing Best Practices**:

- **Single Responsibility**: Each test file focuses on one module or related functionality
- **Descriptive Scenarios**: Use meaningful scenario names that describe what's being tested  
- **Assertion Context**: Provide detailed error messages for failed assertions
- **Test Isolation**: Each test should be able to run independently
- **Cross-Platform Consistency**: Use deterministic algorithms and avoid platform-specific behavior
- **Performance Validation**: Include timing assertions for performance-critical code
- **Memory Safety**: Verify arena bounds and memory usage patterns
- **Hot-Reload Compatibility**: Test state preservation and reconstruction scenarios

This testing architecture ensures code reliability while supporting the rapid iteration enabled by hot-reloading and the unity build system.

