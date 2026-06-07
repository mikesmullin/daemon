#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Windows (Win)
// Windows platform-specific utilities and debugging support
//
// Function | Purpose
// --- | ---
// _WinFormatMessage(errorCode) | format Windows error code to human-readable message
// Win__isValidPointer(ptr) | check if pointer is valid and accessible (deprecated, DEBUG_SLOW)
//
// @class DbgHelp
// Windows debug symbol and stack trace support
//
// Function | Purpose
// --- | ---
// DbgHelp__init() | initialize debug symbol handler for current process
// LoadDllSymbols(dllHandle, dllPath) | load symbols for a dynamically loaded DLL
// DbgHelp__trace(buffer, bufferSize, chopPath, frameDepth) | capture and format call stack trace

#ifndef ENGINE_DLL
#ifdef _WIN32
// expect ASCII char* strings instead of WCHAR* strings
#undef UNICODE
// reduce the size of the Windows header files by excluding less commonly used APIs and definitions
#define WIN32_LEAN_AND_MEAN
// NOTE: Sokol will also try to include this later
#include <windows.h>

// unfortunately required to work with some fns that still return wide chars
static const char* _WinFormatMessage(DWORD errorCode) {
  LPVOID errorMessage;
  FormatMessage(
      FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
      NULL,
      errorCode,
      MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
      (LPTSTR)&errorMessage,
      0,
      NULL);
  return errorMessage;
  // defer:
  //   LocalFree(errorMessage);
}

#ifdef DEBUG_SLOW

// @deprecated use Arena__ptr()
// check if a pointer is valid and accessible
bool Win__isValidPointer(void* ptr) {
  SIZE_T size = sizeof(int);  // compiler-dependent
  DWORD expectedProtection = PAGE_READWRITE;  // convenience assumption
  MEMORY_BASIC_INFORMATION mbi;
  SIZE_T result = VirtualQuery(ptr, &mbi, sizeof(mbi));

  // check if VirtualQuery failed (invalid pointer or access issue)
  if (result == 0) {
    return FALSE;
  }

  // Check if the pointer is within a committed region
  if (mbi.State != MEM_COMMIT) {
    return FALSE;
  }
  // Check if the region has the expected protection (e.g., readable, writable)
  if ((mbi.Protect & expectedProtection) == 0) {
    return FALSE;
  }
  // Ensure the entire requested size fits within the region
  if ((char*)ptr + size > (char*)mbi.BaseAddress + mbi.RegionSize) {
    return FALSE;
  }
  return TRUE;
}

#endif
#endif
#endif

#ifndef ENGINE_DLL

#ifdef _WIN32
// CAUTION: slow, and platform-locked
#include <dbghelp.h>
#endif

// Ensure DbgHelp is initialized
DLL_EXPORT void DbgHelp__init() {
#ifdef _WIN32
#ifdef DEBUG_SLOW
  SymInitialize(GetCurrentProcess(), NULL, TRUE);
#endif
#endif
}

// Load symbols for a dynamically loaded DLL
#ifdef _WIN32
DLL_EXPORT BOOL LoadDllSymbols(HMODULE dllHandle, const char* dllPath) {
#ifdef DEBUG_SLOW
  HANDLE process = GetCurrentProcess();
  DWORD64 baseAddress = (DWORD64)dllHandle;
  DWORD result = SymLoadModuleEx(process, NULL, dllPath, NULL, baseAddress, 0, NULL, 0);
  if (result == 0) {
    DWORD error = GetLastError();
    if (error == ERROR_SUCCESS) {
      // SymLoadModuleEx returns 0 if the module is already loaded, which is fine
      return TRUE;
    }
    printf("SymLoadModuleEx failed for %s: %lu\n", dllPath, error);
    return FALSE;
  }
#endif
  return TRUE;
}
#else
DLL_EXPORT bool LoadDllSymbols(int dllHandle, const char* dllPath) {
  return true;
}
#endif

// Function to capture and format the call stack
DLL_EXPORT void DbgHelp__trace(char* buffer, u16 bufferSize, u8 chopPath, u8 frameDepth) {
#ifdef _WIN32
#ifdef DEBUG_SLOW
  HANDLE process = GetCurrentProcess();
  HANDLE thread = GetCurrentThread();

  // Initialize stack frame and context
  CONTEXT context;
  RtlZeroMemory(&context, sizeof(CONTEXT));
  context.ContextFlags = CONTEXT_FULL;
  RtlCaptureContext(&context);

  STACKFRAME64 stackFrame;
  RtlZeroMemory(&stackFrame, sizeof(STACKFRAME64));
  DWORD machineType =
      IMAGE_FILE_MACHINE_AMD64;  // Adjust for your architecture (x86: IMAGE_FILE_MACHINE_I386)
  stackFrame.AddrPC.Offset = context.Rip;  // Program counter (for x64)
  stackFrame.AddrPC.Mode = AddrModeFlat;
  stackFrame.AddrFrame.Offset = context.Rsp;  // Stack pointer (for x64)
  stackFrame.AddrFrame.Mode = AddrModeFlat;
  stackFrame.AddrStack.Offset = context.Rsp;  // Stack pointer (for x64)
  stackFrame.AddrStack.Mode = AddrModeFlat;

  char* currentPos = buffer;
  size_t remainingSize = bufferSize;
  int frameNumber = 0;
  bool nomore = false;

  // Walk the stack
  while (StackWalk64(
      machineType,
      process,
      thread,
      &stackFrame,
      &context,
      NULL,
      SymFunctionTableAccess64,
      SymGetModuleBase64,
      NULL)) {
    if (stackFrame.AddrPC.Offset == 0) {
      break;  // End of stack
    }
    if (frameNumber > frameDepth + 1) {
      break;  // End of requested stack depth
    }
    if (!nomore && frameNumber > 1) {  // skip the DbgHelp__trace() frame and its immediate caller
      // Get function name
      char symbolBuffer[sizeof(SYMBOL_INFO) + MAX_SYM_NAME];
      PSYMBOL_INFO symbol = (PSYMBOL_INFO)symbolBuffer;
      symbol->SizeOfStruct = sizeof(SYMBOL_INFO);
      symbol->MaxNameLen = MAX_SYM_NAME;
      DWORD64 displacement = 0;
      BOOL gotSymbol = SymFromAddr(process, stackFrame.AddrPC.Offset, &displacement, symbol);

      // Get file name and line number
      IMAGEHLP_LINE64 line;
      line.SizeOfStruct = sizeof(IMAGEHLP_LINE64);
      DWORD lineDisplacement = 0;
      BOOL gotLine =
          SymGetLineFromAddr64(process, stackFrame.AddrPC.Offset, &lineDisplacement, &line);

      // Format the stack frame info
      char frameInfo[256];
      if (gotSymbol && 0 == strncmp(symbol->Name, "main", 5)) {
        nomore = true;
      }
      if (gotSymbol && gotLine) {
        sprintf(
            frameInfo,
            "\n  %d) %s:%ld %s",
            frameNumber,
            line.FileName + chopPath,
            line.LineNumber,
            symbol->Name  //
        );
      } else if (gotSymbol) {
        sprintf(frameInfo, "\n  %d) %s (no file info)", frameNumber, symbol->Name);
      } else {
        sprintf(
            frameInfo,
            "\n  %d) 0x%llx (no symbol info)",
            frameNumber,
            stackFrame.AddrPC.Offset);
      }

      // Append to buffer, ensuring we don't overflow
      size_t frameLen = strlen(frameInfo);
      if (frameLen + 1 < remainingSize) {
        strcat(currentPos, frameInfo);
        currentPos += frameLen;
        remainingSize -= frameLen;
      } else {
        strcat(currentPos, "... (truncated)");
        break;
      }
    }

    frameNumber++;
  }
#endif
#endif
}
#endif