#define ENGINE_TEST

#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe CRC
// @tag common
int main() {
  {
    const char* s1 = "a funny cat";
    u32 result = CRC32__checksum((u8*)s1, strlen(s1));
    // LOG_DEBUGF("s1 CRC: 0x%08X", result);
    ASSERT(result == 0xA2D172B6);
  }

  {
    const char* s2 = "ate a random fish";
    u32 result = CRC32__checksum((u8*)s2, strlen(s2));
    // LOG_DEBUGF("s2 CRC: 0x%08X", result);
    ASSERT(result == 0x0F7C2D55);
  }

  // Processed 1024 MB in 0.607 seconds (1687.19 MB/s)
  // {
  //   // benchmark
  //   LOG_DEBUGF("Benchmarking CRC32__checksum...");
  //   size_t size = 1024 * 1024 * 1024;  // 1GB
  //   u8* data = malloc(size);
  //   if (!data) {
  //     size = 256 * 1024 * 1024;  // Fallback to 256MB
  //     data = malloc(size);
  //   }

  //   if (data) {
  //     LOG_DEBUGF("Reading %zu MB from /dev/urandom...", size / (1024 * 1024));
  //     FILE* f = fopen("/dev/urandom", "rb");
  //     if (f) {
  //       fread(data, 1, size, f);
  //       fclose(f);

  //       LOG_DEBUGF("Calculating checksum...");
  //       struct timespec start, end;
  //       clock_gettime(CLOCK_MONOTONIC, &start);
  //       u32 result = CRC32__checksum(data, size);
  //       clock_gettime(CLOCK_MONOTONIC, &end);

  //       double elapsed =
  //           (double)(end.tv_sec - start.tv_sec) + (double)(end.tv_nsec - start.tv_nsec) / 1e9;
  //       double mb_per_sec = (size / (1024.0 * 1024.0)) / elapsed;

  //       LOG_DEBUGF(
  //           "Processed %zu MB in %.3f seconds (%.2f MB/s)",
  //           size / (1024 * 1024),
  //           elapsed,
  //           mb_per_sec);
  //       LOG_DEBUGF("CRC: 0x%08X", result);
  //     } else {
  //       LOG_DEBUGF("Failed to open /dev/urandom");
  //     }
  //     free(data);
  //   } else {
  //     LOG_DEBUGF("Failed to allocate memory for benchmark");
  //   }
  // }

  return 0;
}