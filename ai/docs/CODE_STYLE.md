# Code Style Guide

This document describes my set of code style guidelines to follow when editing the c99 code base.

## Table of Contents

| Section | Lines |
|---------|-------|
| 1. [My tools/environment](#my-toolsenvironment) | 32-36 |
| 2. [General goals](#general-goals) | 37-69 |
| 3. [General Safety Rules](#general-safety-rules) | 70-110 |
| 4. [Project Architecture Principles](#project-architecture-principles) | 111-118 |
| 4.1. [Language & Standards](#language-standards) | 119-125 |
| 4.2. [Naming Conventions](#naming-conventions) | 126-206 |
| 4.3. [Function Design Patterns](#function-design-patterns) | 207-243 |
| 4.4. [Memory Management Patterns](#memory-management-patterns) | 244-282 |
| 4.5. [ECS Architecture Patterns](#ecs-architecture-patterns) | 283-336 |
| 4.6. [Math & Vector Conventions](#math-vector-conventions) | 337-360 |
| 4.7. [Loop Safety & Bounds](#loop-safety-bounds) | 361-379 |
| 4.8. [Error Handling & Debugging](#error-handling-debugging) | 380-405 |
| 4.9. [Hot-Reload Compatibility](#hot-reload-compatibility) | 406-440 |
| 4.10. [Build System Integration](#build-system-integration) | 441-474 |
| 4.11. [Performance Optimization Patterns](#performance-optimization-patterns) | 475-511 |
| 4.12. [Cross-Platform Determinism](#cross-platform-determinism) | 512-540 |
| 4.13. [Testing & Validation](#testing-validation) | 541-565 |
| 4.14. [AI Agent Guidance Summary](#ai-agent-guidance-summary) | 566-582 |
| 4.15. [File Manifests](#file-manifests) | 583-593 |
| 4.15.1. [Template Pattern](#template-pattern) | 594-644 |
| 4.15.2. [Example](#example) | 645-689 |
| 4.15.3. [Benefits of This Documentation Style](#benefits-of-this-documentation-style) | 690-700 |

## My tools/environment
- we are on Arch Linux
- editing files with VSCode IDE
- (AI-first) making heavy use of coding Agents like Claude

## General goals
- minimalist
- modular
  - no code file longer than 500 lines
  - no function longer than 50 lines
- pure-C99
  - Functional Programming (FP), instead of OOP
    - my function names are namespaced like classes (ie. `Class__function`) and organized into modular files like `Class.c`,
      - but remain strictly C99 FP syntax
  - Data-Oriented Design (DOD) w/ SoA + SIMD
- simple code that is fast to read, write, and compile (high-performance)
  - use our `unity.h` unity build (single compilation unit)
- portable code 
  - cross-os (windows, macos, linux, emscripten) 
    - using `#ifdef` preprocessor macro blocks
  - cross-platform (desktop, mobile (Android, iOS), browser (chrome, firefox), microcontroller (raspberry pi, orange pi), and game console)
    - compiling with clang, use of clangd to format code (see: `.clang-format`)
  - cross-architecture (x86_64, arm64) compile targets
    - compiling into containers with `podman` `Dockerfile` across multiple `--platform` targets
  - avoiding use of std lib, instead using our own functions
    - extremely limited use of vendor/third-party code
      - also for security, to avoid supply chain attacks  
      - preferring instead to use AI to generate minimalist implementations of whatever dependencies are needed
        - to maximize adherence with my code style and goals
        - and take a first-principles approach
    - ie. instead of `malloc` (and similar), use our `Arena.c` allocator (a.k.a linear/bump allocator), with:
      - `_G->arena`: global heap that has process lifetime (only freed on process end (by the OS))
      - `_G->frameArena`: global heap that has frame lifetime (freed at the end of each iteration of the process main() loop)
      - where
        - `_G` is a global heap-allocated struct holding all program state
          - (Hot-Reload compatibility via .dll) particularly state which should survive in the event of a hot-reload
            - avoiding function pointers unless they are static to survive a dll reload

## General Safety Rules

These rules prioritize safety, simplicity, and testability, making code easier to statically analyze and robust.

- **Fixed Upper Bound for Loops**:
  - Recommended for All loops to have a hard upper limit defined as an integer
  - Prevents edge cases that could cause runaway code during iterations, such as linked list traversals.

- **Functions Perform One Task**:
  - Each function should execute a single, well-defined action, even if it requires multiple steps.
  - Recommended to limit functions to 60 lines or less (about the size of a piece of paper) for readability and testability.
  - Ensures functions are concise, testable as single units, and easy to audit.

- **Data Hiding**:
  - Declare variables at the lowest scope possible to minimize access and reduce potential errors.
  - Enhances code safety and simplifies debugging by limiting where variables can be modified.

- **Check All Return Values**:
  - Verify return values for all non-void functions to catch potential errors.
    - prefer to return an integer (signaling success/fail) and instead return any other data by mutating function parameters.
  - Explicitly cast ignored return values to `void` to indicate intentional omission during code reviews.
  - Prevents oversight of critical function behavior, even for seemingly reliable functions like `printf`.

- **Limit C Preprocessor Use**:
  - Restrict preprocessor to file inclusions and simple conditional macros.
    - mainly for generating structs, or log output
  - Avoid complex macros and conditional compilation (e.g., multiple compile-time flags), as they obscure code clarity and exponentially increase testing requirements.

- **Restrict Function Pointer Use**:
  - Avoid function pointers, as they complicate the control flow graph and hinder static analysis and testing.
    - mainly because of hot-reloading
    - exception: will allow it if function pointers are defined within static array (this allows lookup of fp like a handle, using array offset, and these won't change after compile time)

- **Compile with Strict Settings**:
  - Enable all compiler warnings and use pedantic mode to treat warnings as errors.
  - Ensures all potential issues are addressed during compilation.

- **Use Multiple Static Analyzers and Unit Testing**:
  - Analyze code with multiple static code analyzers using different rule sets to catch diverse issues.
  - Implement thorough unit testing to validate code functionality before deployment.

## Project Architecture Principles

- **Unity Build System**: All C files included into single compilation units (e.g., (`main` or `main.exe`) and (`gaame.so` or `game.dll`))
- **Hot-Reload Architecture**: Minimal runtime (`main.exe`) + hot-reloadable game logic (`game.dll`)
- **Cross-Platform Targeting**: Windows/MacOS/Linux/Web with identical behavior
- **AI-First Development**: Extreme minimal vendor dependencies, prefer AI-generated implementations following these conventions
- **Data-Oriented Design**: Favor Structure-of-Arrays over Array-of-Structures for cache efficiency

### Language & Standards

- **Strict C99**: No C++ features, no C11/C23 extensions
- **No Standard Library**: Avoid `<stdlib.h>`, implement custom alternatives (except platform-specific needs)
- **No malloc()**: Use arena allocators exclusively for predictable memory management
- **Fixed-Width Types**: Always use `u8`, `u16`, `u32`, `u64`, `s8`, `s16`, `s32`, `s64`, `f32`, `f64` from `<stdint.h>`, and `bool` from `<stdbool.h>`

### Naming Conventions

- class names
  - since this is c99, no Object-Oriented Programming (OOP) patterns like formal `class` syntax are supported
    - but we lightly implement a namespace that is similar to Classes, which looks like this:
      - long form (most common)
        - pattern: `<ClassName>__<functionName>()` example: `RingBuffer__exampleFunc()`
          - where `ClassName` is ProperCase and `functionName` is camelCase
      - shorthand form (less common, influenced by Quake1 codebase, for low-level (ie. data structures, sockets, network stack) code which has highest reuse throughout codebase)
        - pattern: `<CLS>_<fnName>()` example: `IO_example()`
          - where `CLS` is UPPERCASE (and an acronym) and `fnName` is camelCase
            - `CLS` is considered to be the class name
  - private functions should begin with `_`

examples:

**Module Functions** (Primary Pattern):
```c
// Long Pattern: ModuleName__functionName
Arena__Push(arena, size);
Math__randomf(min, max, seed);
ECS__field(entity, component);

// Short Pattern: ABBREV_functionName (for most frequently used functions)
// ABBREV can be ALL_CAPS
SZ_overflowRead(); // SZ is the short name for ByteBuffer class
// or can be named after a type like v3 (Vector3)
v3_lerp(t, a, b);
```

**Types**:
```c
// Structs: PascalCase
typedef struct {
  f32 x, y, z;
} CmpTransform3D;

// Enums: ALL_CAPS with prefix
typedef enum {
  CTRANSFORM3D,
  CRIGIDBODY3D,
  CSTATS
} CmpKind;

// Type aliases: snake_case
typedef u64 GID;
typedef struct Arena Arena;
```

**Variables**: 
- `snake_case` for local variables and struct members
- `_camelCase` with underscore prefix for globals
- Single letter for common math: `v` (vector), `m` (matrix), `t` (time), `f` (float)
- any reference to `count` should be abbreviated `ct`
- any reference to `size` should be abbreviated `sz`
- any reference to `length` should be abbreviated `len`

**Constants**:
```c
#define MAX_ENTITIES (2000)           // Screaming snake case
#define Math__PI32 (3.14159f)         // Module-scoped constants
static const f32 GRAVITY = 9.81f;     // File-scoped constants
```

**File Organization**:
```c
// Header guard always #pragma once
#pragma once
#include "../unity.h"  // IWYU pragma: keep

// Forward declarations first
typedef struct Arena Arena;

// Module functions grouped together
void Arena__Push(Arena* arena, u64 size);
void Arena__Reset(Arena* arena);
inline u32 Arena__used(Arena* arena) {
  return arena->pos - arena->buf;
}
```

### Function Design Patterns

**Return Value Strategy**:
```c
// Prefer returning status/error codes, output via parameters
bool Math__intersect(v3 ray_origin, v3 ray_dir, v3* hit_point);

// Simple getters can return directly
inline f32 v3_mag(v3 a) {
  return Math__sqrtf(v3_dot(a, a));
}

// Always check return values (cast to void if intentionally ignored)
if (!File__read(path, &buffer)) {
  LOG_ERRORF("Failed to read file: %s", path);
  return false;
}
(void)printf("Debug info\n");  // Intentionally ignored
```

**Function Size & Responsibility**:
- Maximum 50 lines per function (size of paper for readability)
- Single responsibility - one clear action per function  
- Use static helper functions to break down complex operations

**Parameter Patterns**:
```c
// Input parameters first, output parameters last
void Transform__rotate(CmpTransform3D* tf, f32 angle, v3 axis, v3* out_position);

// Const-correct inputs
f32 Math__distance(const v3* a, const v3* b);

// Size parameters immediately after array parameters  
void Math__distribute(u8 total, u8 num_stacks, u8 max_per_stack, Seed* seed, u8* dst);
```

### Memory Management Patterns

**Arena Allocation**:
```c
// Global arenas with clear lifetimes
Engine__State {
  Arena* arena;       // Persistent - lasts entire session
  Arena* frameArena;  // Frame-scoped - reset every frame
};

// Allocation from appropriate arena based on lifetime
String8* persistent_data = Arena__Push(_G->arena, size);
char* temp_buffer = Arena__Push(_G->frameArena, 256);

// Sub-arenas for complex operations
Arena* scratch = Arena__SubAlloc(_G->frameArena, 1024);
// ... use scratch arena ...
// Automatically cleaned up when frameArena resets
```

**Memory Safety**:
```c
// Always bounds-check arena allocation
void* Arena__Push(Arena* a, u64 sz) {
  ASSERT_CONTEXT(
    a->pos + sz < a->end,
    "Arena exhausted. requested %llu, available %llu", 
    sz, Arena__remain(a));
  // ... allocation logic
}

// Zero-initialization when needed
void* Arena__PushZero(Arena* a, u64 sz) {
  u8* p = Arena__Push(a, sz);
  memset(p, 0, sz);
  return p;
}
```

### ECS Architecture Patterns

**Component Design**:
```c
// Components are pure data, no methods
typedef struct {
  f32 x, y, z;           // Position
  f32 sx, sy, sz;        // Scale  
  f32 rx, ry, rz;        // Rotation
} CmpTransform3D;

// Favor many small components over few large ones
typedef struct {
  f32 mass;
  f32 vx, vy, vz;        // Velocity
  f32 restitution;
} CmpRigidbody3D;
```

**System Implementation**:
```c
// Systems process entities with specific component combinations
void Physics__updateSystem(void) {
  ArchIt it = {0};
  ECS__archq(&it, (CmpKind[]){CTRANSFORM3D, CRIGIDBODY3D}, 2);
  
  while (ECS__query(&it)) {
    CmpTransform3D* tf = (CmpTransform3D*)it.cpg[0];
    CmpRigidbody3D* rb = (CmpRigidbody3D*)it.cpg[1];
    
    // Apply physics to this entity
    tf->x += rb->vx * _G->deltaTime;
    tf->y += rb->vy * _G->deltaTime;
    tf->z += rb->vz * _G->deltaTime;
  }
}
```

**Entity Creation via Prefabs**:
```c
// Data-driven entity creation
GID player = Entity__prefab(EPLAYER, start_x, start_z);
GID enemy = Entity__prefab(ERABBIT, spawn_x, spawn_z);

// Prefabs defined in data tables, not code
[EPLAYER] = {
  &(CmpItem){.billboard=1, .sprite={.def="simon"}},
  &(CmpTransform3D){0},
  &(CmpRigidbody3D){.mass=80.0f},
  &(CmpCollider){.radius=0.25f},
  // ... more components
}
```

### Math & Vector Conventions

**Vector Operations**:
```c
// Consistent naming: v{N}_{operation}[S]
v3 position = v3_add(pos_a, pos_b);         // Vector + vector
v3 scaled = v3_mulS(velocity, deltaTime);   // Vector * scalar (S suffix)
f32 distance = v3_dist(target, current);    // Distance between points
v3 normalized = v3_norm(direction);         // Unit vector

// Matrix operations follow similar pattern
m4 transform = m4_mul(projection, view);
v4 result = m4_mul_v4(transform, position);
```

**Math Constants**:
```c
#define Math__PI32 (3.14159265f)
#define Math__TWOPI32 (6.28318531f)
#define Math__HALFPI32 (1.57079633f)
#define Math__DEG2RAD32 (0.01745329f)
#define Math__RAD2DEG32 (57.2957795f)
```

### Loop Safety & Bounds

**Fixed Upper Bounds**:
```c
// Always define hard limits to prevent runaway loops
#define MAX_ENTITIES (2000)
#define MAX_PARTICLES (1000)  
#define MAX_COMPONENTS_PER_ENTITY (16)

for (u32 i = 0; i < entity_count && i < MAX_ENTITIES; i++) {
  ProcessEntity(entities[i]);
}

// Use ring buffers for streaming data
#define MAX_AUDIO_VOICES (16)
Voice voices[MAX_AUDIO_VOICES];
RingBuf voice_queue;
```

### Error Handling & Debugging

**Assertion Strategy**:
```c
// Debug-only assertions for development
#ifdef DEBUG_SLOW
  ASSERT(arena->buf <= arena->pos);
  ASSERT(entity_count <= MAX_ENTITIES);
#endif

// Context-aware assertions with detailed info
ASSERT_CONTEXT(
  file_size > 0,
  "File empty or read failed: %s, size: %llu",
  filename, file_size);
```

**Logging Patterns**:
```c
// Structured logging with context
LOG_DEBUGF("Entity %llu spawned at (%.2f, %.2f)", entity_id, x, z);
LOG_WARNF("Arena usage high: %s/%s (%.1f%%)", 
  db_used(arena, true), db_cap(arena, true), usage_percent);
LOG_ERRORF("Failed to load asset: %s", asset_path);
```

### Hot-Reload Compatibility

**State Preservation**:
```c
// Mark data that survives hot-reload
Engine__State {
  Arena* arena;          // ✓ Preserved
  World world;           // ✓ Preserved (ECS state)
  NetMgr* net;          // ✓ Preserved (connections)
  
  Scene* current_scene;  // ✗ Rebuilt on reload
  Arena* frameArena;     // ✗ Reset on reload
};

// Reload callbacks for state reconstruction
DLL_EXPORT void onreload(Engine__State* state) {
  // Reinitialize systems that don't preserve state
  Scene__rebuild(state->current_level);
  Audio__reconnect_voices(state);
}
```

**Function Pointer Restrictions**:
```c
// Avoid function pointers (they break hot-reload)
// Exception: static arrays that act as lookup tables
typedef void (*SystemUpdateFn)(void);
static SystemUpdateFn SYSTEM_UPDATES[] = {
  Physics__updateSystem,
  AI__updateSystem,
  Render__updateSystem,
  NULL  // Sentinel
};
```

### Build System Integration

**Conditional Compilation**:
```c
// Platform detection
#ifdef _WIN32
  // Windows-specific code
#elif __linux__
  // Linux-specific code  
#elif __EMSCRIPTEN__
  // Web-specific code
#endif

// Build target detection
#ifdef ENGINE_MAIN
  // Only in main.exe runtime
  #define SOKOL_IMPL
#endif

#ifdef ENGINE_DLL
  // Only in hot-reloadable game.dll
  #include "game/systems/GameLogic.c"
#endif
```

**Unity Build Organization**:
```c
// Include order matters - dependencies first
#include "game/common/Math.c"         // No dependencies
#include "game/common/Arena.c"        // Depends on Math
#include "game/common/ECS.c"          // Depends on Arena
#include "game/systems/Physics.c"     // Depends on ECS
```

### Performance Optimization Patterns

**Data-Oriented Layout**:
```c
// Structure of Arrays for cache efficiency
typedef struct {
  f32* positions_x;  // [MAX_ENTITIES]
  f32* positions_y;  // [MAX_ENTITIES]  
  f32* positions_z;  // [MAX_ENTITIES]
  f32* velocities_x; // [MAX_ENTITIES]
  f32* velocities_y; // [MAX_ENTITIES]
  f32* velocities_z; // [MAX_ENTITIES]
} PhysicsData;

// Process arrays in batch for SIMD potential
for (u32 i = 0; i < entity_count; i++) {
  physics.positions_x[i] += physics.velocities_x[i] * dt;
  physics.positions_y[i] += physics.velocities_y[i] * dt;
  physics.positions_z[i] += physics.velocities_z[i] * dt;
}
```

**Inline Guidelines**:
```c
// Inline small, frequently-called functions
inline f32 Math__min(f32 a, f32 b) {
  return a < b ? a : b;
}

inline bool GI_alive(GID gid) {
  return /* quick validation check */;
}

// Don't inline large functions or those with loops
void ECS__defrag(void);  // Complex function, not inlined
```

### Cross-Platform Determinism

**Floating Point Consistency**:
```c
// Use lookup tables for trigonometry (same across all platforms)
static f32 SIN_T[FINE_ANGLES];  // Pre-computed sine table

inline f32 Math__sin(f32 radians) {
  return SIN_T[Math__RAD2FINE32(radians) & FINE_ANGLES_MASK];
}

// Custom implementations of math functions for consistency
f32 Math__sqrtf(f32 n);  // Same result on all platforms
f32 Math__expf(f32 x);   // Maclaurin series approximation
```

**Random Number Generation**:
```c
// Deterministic PRNG with multiple seeds for different subsystems
typedef struct {
  Seed gameplay;   // Game logic randomness
  Seed audio;      // Audio system randomness  
  Seed nosync;     // Non-critical randomness
} SeedBank;

// All systems must use appropriate seed for determinism
f32 damage = Math__randomf(min_dmg, max_dmg, &_G->seeds.gameplay);
```

### Testing & Validation

**Unit Test Structure**:
```c
// Tests can include specific modules in isolation
#define ENGINE_TEST
#include "src/unity.h"

void test_vector_normalize() {
  v3 input = {3.0f, 4.0f, 0.0f};
  v3 result = v3_norm(input);
  f32 length = v3_mag(result);
  ASSERT_FLOAT_EQ(length, 1.0f, 0.001f);
}
```

**Dependency Injection for Testing**:
```c
// Mock implementations can be injected
#include DEPINJ(MATH_IMPL, "game/common/Math.c")

// In tests: DEPINJ__MATH_IMPL points to mock
// In production: DEPINJ expands to actual file
```

### AI Agent Guidance Summary

When generating code for this project:

1. **Always use the `ModuleName__functionName` pattern** for public functions
2. **Prefer small, single-purpose functions** (≤60 lines)
3. **Use arena allocation exclusively** - no malloc/free
4. **Follow ECS patterns** - pure data components, behavior in systems
5. **Include bounds checking** and fixed upper limits on all loops
6. **Use fixed-width types** (`u32`, `f32`) instead of `int`, `float`
7. **Check all return values** or explicitly cast to `void`
8. **Design for hot-reload** - avoid function pointers, preserve critical state
9. **Optimize for cache efficiency** - prefer SoA over AoS layout
10. **Maintain cross-platform determinism** - use custom math implementations

This codebase prioritizes **performance, determinism, and maintainability** through disciplined engineering practices and AI-assisted development workflows.

### File Manifests

Each C source file begins with a `File Manifest` which is:
- a code comment block
- containing a markdown table syntax
- listing all (non-private) functions defined within the file

This serves as a quick reference, particularly handy for agents which may only choose to read the first 100 lines of any file, when browsing.

These are not expected to be added to third-party/vendored library code.

#### Template Pattern

```c
#pragma once

#include "../../unity.h"

// ---
// @class ModuleName [(ShortName)]
// short_description
// see: `documentation.md`
//
// Function | Purpose
// --- | ---
// function_name1(params) | descriptive_text
// function_name2(params) | descriptive_text
// function_name3(params) | descriptive_text

// @class AnotherModule
//
// Function | Purpose
// --- | ---
// function_name4(params) | descriptive_text
// function_name5(params) | descriptive_text
```
where:
- `ModuleName`: the (long-form) name of class (often, which the file is also named after)
  - in some cases a file may contain multiple classes (illustrated by `AnotherModule`)
- `ShortName`: optional (short-form) acronym name for the class (only given in specific cases; human to decide when)
- `short_description`: describes the class in a fewwest most-descriptive words (sacrificing grammar for concision)
  - Concise, actionable descriptions focusing on what the function accomplishes
  - Also verify these accurately reflect comments apeparing immediately aboe function definition (further down in code file), as those are authoritative
    - if no comment is already provided above the function definition, add one
      - in the form of a single-line comment 
        - (complex functions can have a series of line comments)
- `documentation.md`: optional link (path, relatie to workspace root) to any relevant documentation which describes how the file/class is intended to work. 
  - **NOTE:** intent may differ from actual implementation. intent is authored by the architect, while implementation is authored by assistants.
    - this is why it is important to include alongside the code
    - after code is finally accepted for commit, we should also update the documentation to reflect the latest intent expressed by the human operator (that was applied via code changes)
    - these document links are very helpful in orienting new assistants (especially AI Agents) who are new to the project
- (`function_name` 1..N): example function names
- `params`: placeholder for actual function param listing
  - **NOTE:** for concision, we drop the types and only keep the param names here
  - **NOTE:** for concision, we also omit the return type 
- `descriptive text`: short one-sentence description of what the function does (often taken verbatim from any code comments directly above the function definition). truncated to 80 chars (with ellipsis `...` if truncation was necessary)

additionally:
- **Markdown Table Format**: Always use `Function | Purpose` header with `--- | ---` separator
- **Logical Grouping**: Group related functions under their conceptual module/class
- **Order by Importance**: List core functions first, utilities and helpers later

#### Example

from `IO.c`:
```c
#pragma once

#include "../../unity.h"

// ---
// @class Input/Output (IO)
// encoding and serializing scalar values
// see: `ai/docs/NET_PROTO.md`
//
// Function | Purpose
// --- | ---
// IO_Begin(io) | save head/tail pointers for potential rollback
// IO_RollbackOrCommit(io) | rollback or commit based on error state
// IO_Write(io, r) | track write count or set error
// IO_Read(io, r) | track read count or set error
//
// IO_WriteBytes(io, src, len) | write raw bytes to buffer
// IO_ReadBytes(io, dst, len) | read raw bytes from buffer
// IO_WriteU8(io, byte) | write 8-bit unsigned int
// IO_ReadU8(io, dst) | read 8-bit unsigned int
// IO_WriteU16(io, val) | write 16-bit unsigned int
// IO_ReadU16(io, dst) | read 16-bit unsigned int
// IO_WriteU32(io, val) | write 32-bit unsigned int
// IO_ReadU32(io, dst) | read 32-bit unsigned int
// IO_WriteU64(io, val) | write 64-bit unsigned int
// IO_ReadU64(io, dst) | read 64-bit unsigned int
// IO_WriteF32(io, val) | write 32-bit float
// IO_ReadF32(io, dst) | read 32-bit float
// IO_WriteF64(io, val) | write 64-bit float
// IO_ReadF64(io, dst) | read 64-bit float
// IO_WriteVInt32(io, val, neg) | write variable-length encoded 32-bit int
// IO_ReadVInt32(io, v) | read variable-length encoded 32-bit int
// IO_WriteStr8(io, s) | write length-prefixed string
// IO_ReadStr8(arena, io, dst) | read length-prefixed string into arena
//
// IO_FlipEndian2(data) | convert Little-Endian to Big-Endian (16-bit)
// IO_FlipEndian4(data) | convert Little-Endian to Big-Endian (32-bit)
```

**NOTICE:** the blank `// ` lines inserted in the table, which help provide visual breaks (useful when grouping similar functions). use sparingly, but particularly when the table rows are numerous. if you encounter existing, try to maintain the grouping (likely was set by human).

#### Benefits of This Documentation Style

1. **Quick API Reference**: Developers can instantly see all available functions without reading implementation
2. **Architectural Clarity**: Shows how functions are logically grouped into cohesive modules
3. **Interface Contract**: Documents expected parameters and behavior before implementation details
4. **AI Agent Guidance**: Provides clear structure for AI tools to understand module boundaries and responsibilities
5. **Code Review Aid**: Reviewers can verify implementation matches documented intent
6. **Maintenance Efficiency**: Easy to spot missing functions or identify refactoring opportunities

This documentation pattern reinforces the modular, class-like organization of C99 code while maintaining the functional programming approach throughout the implementation.
