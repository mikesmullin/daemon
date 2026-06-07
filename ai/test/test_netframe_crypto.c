#include "../src/unity.h"

void test_netframe_crypto_roundtrip(void) {
  u8 key[32];
  memcpy(key, "01234567890123456789012345678901", 32);
  u8 nonce[8];
  memcpy(nonce, "01234567", 8);

  u8 buf[SOCKET_BUF_SIZE * 2] = {0};
  RingBuffer rb = {buf, sizeof(buf)};
  IO io = {&rb};

  NetFrame orig = {0};
  orig.flags = NFRAME_OK;
  orig.seq = 42;
  orig.ack = 24;
  orig.qport = 1;
  orig.len = 10;
  memcpy(orig.data, "hello12345", 10);

  MSG_WriteFrame(&io, &orig, key, nonce);
  ASSERT(!io.err);

  // Prepare for read
  RingBuffer read_rb = {buf, io.written};
  read_rb.head = io.written;
  read_rb.tail = 0;
  IO read_io = {&read_rb};
  read_io.written = io.written;

  NetFrame read_frame = {0};
  read_frame.data = buf;
  MSG_ReadFrame(&read_io, &read_frame, key, nonce);
  ASSERT(!read_io.err);
  ASSERT(read_frame.flags == orig.flags);
  ASSERT(read_frame.seq == orig.seq);
  ASSERT(read_frame.ack == orig.ack);
  ASSERT(read_frame.qport == orig.qport);
  ASSERT(read_frame.len == orig.len);
  ASSERT(memcmp(read_frame.data, orig.data, orig.len) == 0);

  LOG_DEBUGF("NetFrame crypto roundtrip OK");
}

void test_netframe_crypto_corrupt_crc(void) {
  u8 key[32];
  memcpy(key, "01234567890123456789012345678901", 32);
  u8 nonce[8];
  memcpy(nonce, "01234567", 8);

  u8 buf[SOCKET_BUF_SIZE * 2] = {0};
  RingBuffer rb = {buf, sizeof(buf)};
  IO io = {&rb};

  NetFrame orig = {0};
  orig.flags = NFRAME_OK;
  orig.seq = 42;
  orig.ack = 24;
  orig.qport = 1;
  orig.len = 10;
  memcpy(orig.data, "hello12345", 10);

  MSG_WriteFrame(&io, &orig, key, nonce);
  ASSERT(!io.err);

  // Corrupt a byte in encrypted data
  buf[10] ^= 0xFF;  // flip bit after len

  RingBuffer read_rb = {buf, io.written};
  read_rb.head = io.written;
  read_rb.tail = 0;
  IO read_io = {&read_rb};
  read_io.written = io.written;

  NetFrame read_frame = {0};
  read_frame.data = buf;
  MSG_ReadFrame(&read_io, &read_frame, key, nonce);
  ASSERT(read_io.err != 0);  // CRC fail

  LOG_DEBUGF("NetFrame corrupt CRC detected OK");
}

int main(void) {
  test_netframe_crypto_roundtrip();
  test_netframe_crypto_corrupt_crc();
  LOG_INFOF("All NetFrame crypto tests passed!");
  return 0;
}