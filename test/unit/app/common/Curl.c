#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe Curl
// @tag common
int main() {
  CURL* curl;
  CURLcode res;

  curl_global_init(CURL_GLOBAL_DEFAULT);
  curl = curl_easy_init();
  if (!curl) {
    fprintf(stderr, "curl_easy_init() failed\n");
    return EXIT_FAILURE;
  }

  struct memory chunk = {0};

  curl_easy_setopt(curl, CURLOPT_URL, "https://example.org");
  // Follow redirects (common for real-world use)
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  // Write received data to our callback
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, _Curl__write_callback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void*)&chunk);

  res = curl_easy_perform(curl);
  if (res != CURLE_OK) {
    fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
  } else {
    // printf("Received %zu bytes:\n%.*s\n", chunk.size, (int)chunk.size, chunk.data);
  }

  curl_easy_cleanup(curl);
  curl_global_cleanup();

  free(chunk.data);

  ASSERT(chunk.data != NULL);
#define EXPECT1 "This domain is for use in documentation examples without needing permission."
  ASSERT(strstr(chunk.data, EXPECT1) != NULL);

  return res == CURLE_OK ? EXIT_SUCCESS : EXIT_FAILURE;
  // return 0;
}