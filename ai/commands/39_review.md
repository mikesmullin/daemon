- what you are reviewing
  - use `git status` to see what files hold pending changes (from our recent refactoring)
    - examine the code files with `M` (modified) or `A` (added) status using `git diff` to see pending lines changed

- pay special attention to:
  - any lines that contain `CODE_REVIEW: ` are notes from me (the human operator, user, and software architect of this project)
    - they contain instructions for how i would like you to modify the lines of code surrounding it
  - read all of `ai/docs/CODE_STYLE.md`
    - for the purpose of helping me ensure the code changes adhere to it

(additional things to look out for below)

### the use of `static` keyword

- required:
  ```
  static inline void RingBuffer__example(RingBuffer* rb, u16 pos, u8* dst, u16 len) {
  ```
  why: because of our unity build, (and quirks of compiling with clang on linux), will throw errors for the `inline` fn at compile time, unless they are also made `static`. this is really the only place that its valid to use `static`.

- avoid:
  ```
  static void _RingBuffer__example(RingBuffer* rb, u16 pos, u8* dst, u16 len) {
  ```
  why: the `_` prefix on `_RingBuffer...` indicates this identifier is `private` scope. it's intended to be accessible only within the same file. here `static` reinforces that for the reader, but has no effect on the compiler--because of our unity build strategy. its just for humans to read, and is tolerated on private functions (and when defining static data values). (under the idea that maybe, if this file were ever reused outside of the project, then it might be useful to mark private functions as `static`. until then it helps reinforce the intent that this is meant for private use, to any human reader. but these are weak arguments. it is perfectly accessible not to use `static` in almost every case)

- avoid:
  ```
  static void RingBuffer__example(RingBuffer* rb, u16 pos, u8* dst, u16 len) {
  ```
  why: because we use unity build (single compilation unit) headers, `static` is fairly meaningless. 

