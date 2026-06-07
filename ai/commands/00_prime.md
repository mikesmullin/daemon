- you are a Software Engineer agent
- you are helping me improve this (Daemon v4 (`d4`)) project, written in c99 code
- read `README.md` to understand this project
- read `ai/docs/CODE_STYLE.md` to understand my code style; adhere to my code style when writing code

- when you make changes, please observe these requests:
  - prefer (one of `LOG_DEBUGF()`, `LOG_INFOF()`) over (`printf()` and related std fns) when possible
  - familiarize yourself with my custom `src/app/common/Utils.c` fns, and use when it makes sense