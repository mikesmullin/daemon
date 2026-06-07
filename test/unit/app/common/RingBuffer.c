#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe RingBuffer
// @tag common
int main() {
  _G->arena = Arena__Alloc(1024 * 10);
  RingBuffer rb1 = {0};
  RB_Alloc(_G->arena, &rb1, 10);
  u8 buffer[20] = {0};

  // ===== RB_Alloc, RB_Reset, RB_Zero =====

  // scenario: basic allocation
  ASSERT(rb1.head == 0);
  ASSERT(rb1.tail == 0);
  ASSERT(rb1.sz == 10);
  ASSERT(rb1.data != NULL);

  // scenario: RB_Reset
  rb1.head = 5;
  rb1.tail = 3;
  RB_Reset(&rb1);
  ASSERT(rb1.head == 0);
  ASSERT(rb1.tail == 0);

  // scenario: RB_Zero clears data and resets
  memset(rb1.data, 0xFF, rb1.sz);
  rb1.head = 7;
  rb1.tail = 2;
  RB_Zero(&rb1);
  ASSERT(rb1.head == 0);
  ASSERT(rb1.tail == 0);
  for (u16 i = 0; i < rb1.sz; i++) {
    ASSERT(rb1.data[i] == 0);
  }

  // ===== RB_Empty, RB_Full, RB_Used =====

  // scenario: empty state
  RB_Reset(&rb1);
  ASSERT(RB_Empty(&rb1) == true);
  ASSERT(RB_Full(&rb1) == false);
  ASSERT(RB_Used(&rb1) == 0);
  ASSERT(RB_Unused(&rb1) == 9);  // sz - 1

  // scenario: partially filled
  RB_Reset(&rb1);
  u8 data3[3] = {1, 2, 3};
  IO io = {&rb1};
  IO io2 = {0};
  RB_Push(&io, data3, 3);
  ASSERT(io.err == 0);
  ASSERT(io.written == 3);
  ASSERT(RB_Empty(&rb1) == false);
  ASSERT(RB_Full(&rb1) == false);
  ASSERT(RB_Used(&rb1) == 3);
  ASSERT(RB_Unused(&rb1) == 6);

  // scenario: full capacity (sz - 1)
  u8 data6[6] = {4, 5, 6, 7, 8, 9};
  RB_Push(&io, data6, 6);
  ASSERT(io.err == 0);
  ASSERT(RB_Empty(&rb1) == false);
  ASSERT(RB_Full(&rb1) == true);
  ASSERT(RB_Used(&rb1) == 9);
  ASSERT(RB_Unused(&rb1) == 0);

  // ===== RB_Push =====

  // scenario: push basic data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 push1[5] = {0x10, 0x20, 0x30, 0x40, 0x50};
  RB_Push(&io, push1, 5);
  ASSERT(io.err == 0);
  ASSERT(io.written == 5);
  ASSERT(rb1.head == 5);
  ASSERT(rb1.tail == 0);
  ASSERT(RB_Used(&rb1) == 5);

  // scenario: push with wrap-around
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 push8[8] = {0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7};
  RB_Push(&io, push8, 8);
  ASSERT(io.err == 0);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 5);
  ASSERT(io.err == 0);
  u8 push4[4] = {0xB0, 0xB1, 0xB2, 0xB3};
  RB_Push(&io, push4, 4);
  ASSERT(io.err == 0);
  ASSERT(rb1.head == 2);  // 8 + 4 = 12, 12 % 10 = 2

  // scenario: push when full fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 push9[9] = {1, 2, 3, 4, 5, 6, 7, 8, 9};
  RB_Push(&io, push9, 9);
  ASSERT(io.err == 0);
  u8 extra[1] = {10};
  RB_Push(&io, extra, 1);
  ASSERT(io.err == -1);

  // scenario: push with null/zero length is no-op
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, NULL, 5);
  ASSERT(io.err == 0);  // no-op, no error
  ASSERT(RB_Used(&rb1) == 0);
  RB_Push(&io, push1, 0);
  ASSERT(io.err == 0);  // no-op, no error
  ASSERT(RB_Used(&rb1) == 0);

  // ===== RB_Pop =====

  // scenario: pop basic data
  RB_Reset(&rb1);
  s32 r = 0;
  u8 pop_data[5] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE};
  io = (IO){&rb1};
  RB_Push(&io, pop_data, 5);
  ASSERT(io.err == 0);
  memset(buffer, 0, sizeof(buffer));
  RB_Pop(&rb1, buffer, sizeof(buffer), 2, &r);
  ASSERT(r == 2);
  ASSERT(buffer[0] == 0xDD);  // popped from end
  ASSERT(buffer[1] == 0xEE);
  ASSERT(rb1.head == 3);
  ASSERT(RB_Used(&rb1) == 3);

  // scenario: pop with wrap-around
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 wrap1[7] = {1, 2, 3, 4, 5, 6, 7};
  RB_Push(&io, wrap1, 7);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 5);  // remove from front
  u8 wrap2[5] = {8, 9, 10, 11, 12};
  RB_Push(&io, wrap2, 5);  // now wrapped
  ASSERT(rb1.head == 2);  // wrapped around
  memset(buffer, 0, sizeof(buffer));
  RB_Pop(&rb1, buffer, sizeof(buffer), 3, &r);
  ASSERT(r == 3);
  ASSERT(buffer[0] == 10);
  ASSERT(buffer[1] == 11);
  ASSERT(buffer[2] == 12);

  // scenario: pop when empty fails
  RB_Reset(&rb1);
  RB_Pop(&rb1, buffer, sizeof(buffer), 1, &r);
  ASSERT(r == -1);

  // scenario: pop more than available fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, pop_data, 5);
  RB_Pop(&rb1, buffer, sizeof(buffer), 6, &r);
  ASSERT(r == -1);

  // scenario: pop with null/zero length
  RB_Pop(&rb1, NULL, sizeof(buffer), 1, &r);
  ASSERT(r == 0);
  RB_Pop(&rb1, buffer, sizeof(buffer), 0, &r);
  ASSERT(r == 0);

  // scenario: pop dst buffer too small
  u8 small[2];
  RB_Pop(&rb1, small, 2, 3, &r);
  ASSERT(r == -1);

  // ===== RB_Shift =====

  // scenario: shift basic data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 shift_data[5] = {0x11, 0x22, 0x33, 0x44, 0x55};
  RB_Push(&io, shift_data, 5);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 2);
  ASSERT(io.err == 0);
  ASSERT(buffer[0] == 0x11);  // shifted from beginning
  ASSERT(buffer[1] == 0x22);
  ASSERT(rb1.tail == 2);
  ASSERT(RB_Used(&rb1) == 3);

  // scenario: shift with wrap-around
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 s1[6] = {1, 2, 3, 4, 5, 6};
  RB_Push(&io, s1, 6);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 6);
  u8 s2[7] = {7, 8, 9, 10, 11, 12, 13};
  RB_Push(&io, s2, 7);  // wraps
  ASSERT(rb1.head == 3);
  ASSERT(rb1.tail == 6);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 5);
  ASSERT(io.err == 0);
  ASSERT(buffer[0] == 7);
  ASSERT(buffer[4] == 11);

  // scenario: shift when empty fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Shift(&io, buffer, 1);
  ASSERT(io.err == -1);

  // scenario: shift more than available fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, shift_data, 5);
  io = (IO){&rb1};  // reset IO
  RB_Shift(&io, buffer, 6);
  ASSERT(io.err == -1);

  // ===== RB_Unshift =====

  // scenario: unshift basic data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 base[3] = {0x30, 0x31, 0x32};
  RB_Push(&io, base, 3);
  u8 prepend[2] = {0x10, 0x11};
  RB_Unshift(&io, prepend, 2);
  ASSERT(io.err == 0);
  ASSERT(rb1.tail == 8);  // moved backward
  ASSERT(RB_Used(&rb1) == 5);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 5);
  ASSERT(buffer[0] == 0x10);
  ASSERT(buffer[1] == 0x11);
  ASSERT(buffer[2] == 0x30);
  ASSERT(buffer[3] == 0x31);
  ASSERT(buffer[4] == 0x32);

  // scenario: unshift with wrap-around
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 u1[5] = {50, 51, 52, 53, 54};
  RB_Push(&io, u1, 5);
  u8 u2[4] = {40, 41, 42, 43};
  RB_Unshift(&io, u2, 4);
  ASSERT(io.err == 0);
  ASSERT(rb1.tail == 6);  // 0 - 4 + 10 = 6
  ASSERT(RB_Used(&rb1) == 9);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 9);
  ASSERT(buffer[0] == 40);
  ASSERT(buffer[3] == 43);
  ASSERT(buffer[4] == 50);
  ASSERT(buffer[8] == 54);

  // scenario: unshift when full fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 full[9] = {1, 2, 3, 4, 5, 6, 7, 8, 9};
  RB_Push(&io, full, 9);
  RB_Unshift(&io, prepend, 1);
  ASSERT(io.err == -1);

  // scenario: unshift with null/zero length is no-op
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Unshift(&io, NULL, 5);
  ASSERT(io.err == 0);
  RB_Unshift(&io, prepend, 0);
  ASSERT(io.err == 0);

  // ===== RB_Peek =====

  // scenario: peek basic data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 peek_data[5] = {0xF0, 0xF1, 0xF2, 0xF3, 0xF4};
  RB_Push(&io, peek_data, 5);
  memset(buffer, 0, sizeof(buffer));
  io = (IO){&rb1};  // reset IO
  RB_Peek(&io, buffer, 3);
  ASSERT(io.err == 0);
  ASSERT(buffer[0] == 0xF0);
  ASSERT(buffer[1] == 0xF1);
  ASSERT(buffer[2] == 0xF2);
  ASSERT(RB_Used(&rb1) == 5);  // tail didn't move
  ASSERT(rb1.tail == 0);

  // scenario: peek with wrap-around
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 p1[6] = {1, 2, 3, 4, 5, 6};
  RB_Push(&io, p1, 6);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 6);
  u8 p2[7] = {7, 8, 9, 10, 11, 12, 13};
  RB_Push(&io, p2, 7);  // wraps
  ASSERT(rb1.head == 3);
  ASSERT(rb1.tail == 6);
  memset(buffer, 0, sizeof(buffer));
  io = (IO){&rb1};  // reset IO
  RB_Peek(&io, buffer, 5);
  ASSERT(io.err == 0);
  ASSERT(buffer[0] == 7);
  ASSERT(buffer[4] == 11);
  ASSERT(rb1.tail == 6);  // didn't move

  // scenario: peek when empty fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Peek(&io, buffer, 1);
  ASSERT(io.err == -1);

  // scenario: peek more than available fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, peek_data, 5);
  io = (IO){&rb1};  // reset IO
  RB_Peek(&io, buffer, 6);
  ASSERT(io.err == -1);

  // scenario: peek with null/zero length is no-op
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, peek_data, 5);
  io = (IO){&rb1};  // reset IO
  RB_Peek(&io, NULL, 1);
  ASSERT(io.err == 0);
  RB_Peek(&io, buffer, 0);
  ASSERT(io.err == 0);

  // ===== RB_Seek =====

  // scenario: seek basic offset
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 seek_data[8] = {10, 20, 30, 40, 50, 60, 70, 80};
  RB_Push(&io, seek_data, 8);
  ASSERT(rb1.tail == 0);
  io = (IO){&rb1};  // reset IO
  RB_Seek(&io, 3);
  ASSERT(io.err == 0);
  ASSERT(rb1.tail == 3);
  ASSERT(RB_Used(&rb1) == 5);
  // verify remaining data is correct
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 5);
  ASSERT(buffer[0] == 40);
  ASSERT(buffer[4] == 80);

  // scenario: seek with wrap-around
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, seek_data, 6);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 6);
  RB_Push(&io, seek_data, 7);  // wraps
  ASSERT(rb1.tail == 6);
  ASSERT(rb1.head == 3);
  io = (IO){&rb1};  // reset IO
  RB_Seek(&io, 5);  // advances across wrap boundary
  ASSERT(io.err == 0);
  ASSERT(rb1.tail == 1);
  ASSERT(RB_Used(&rb1) == 2);

  // scenario: seek entire buffer
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, seek_data, 8);
  io = (IO){&rb1};  // reset IO
  RB_Seek(&io, 8);
  ASSERT(io.err == 0);
  ASSERT(RB_Empty(&rb1) == true);

  // scenario: seek when empty fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Seek(&io, 1);
  ASSERT(io.err == -1);

  // scenario: seek more than available fails
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, seek_data, 5);
  io = (IO){&rb1};  // reset IO
  RB_Seek(&io, 6);
  ASSERT(io.err == -1);

  // scenario: seek zero offset is no-op
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, seek_data, 5);
  u16 old_tail = rb1.tail;
  io = (IO){&rb1};  // reset IO
  RB_Seek(&io, 0);
  ASSERT(io.err == 0);
  ASSERT(rb1.tail == old_tail);

  // ===== RB_Index, RB_Ptr =====

  // scenario: index and pointer calculation
  RB_Reset(&rb1);
  ASSERT(RB_Index(&rb1, 0) == 0);
  ASSERT(RB_Index(&rb1, 5) == 5);
  ASSERT(RB_Ptr(&rb1, 0) == rb1.data);
  ASSERT(RB_Ptr(&rb1, 5) == rb1.data + 5);

  // scenario: index with tail offset
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, p1, 6);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 4);
  ASSERT(rb1.tail == 4);
  ASSERT(RB_Index(&rb1, 0) == 4);
  ASSERT(RB_Index(&rb1, 1) == 5);
  ASSERT(RB_Index(&rb1, 2) == 6);

  // scenario: index with wrap-around
  rb1.tail = 8;
  ASSERT(RB_Index(&rb1, 0) == 8);
  ASSERT(RB_Index(&rb1, 1) == 9);
  ASSERT(RB_Index(&rb1, 2) == 0);  // wrapped
  ASSERT(RB_Index(&rb1, 5) == 3);

  // ===== RB_Equal =====

  // scenario: equal with matching data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, (u8*)"Hello", 5);
  ASSERT(RB_Equal(&rb1, "Hello", 5) == true);

  // scenario: equal with partial match
  ASSERT(RB_Equal(&rb1, "Hell", 4) == true);
  ASSERT(RB_Equal(&rb1, "Hel", 3) == true);

  // scenario: equal with non-matching data
  ASSERT(RB_Equal(&rb1, "World", 5) == false);
  ASSERT(RB_Equal(&rb1, "Jello", 5) == false);

  // scenario: equal with insufficient data
  ASSERT(RB_Equal(&rb1, "HelloWorld", 10) == false);

  // scenario: equal with wrapped data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 tmp[8] = {0, 0, 0, 0, 0, 0, 0, 0};
  RB_Push(&io, tmp, 8);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 8);
  RB_Push(&io, (u8*)"ABCDE", 5);
  ASSERT(rb1.head == 3);
  ASSERT(rb1.tail == 8);
  ASSERT(RB_Equal(&rb1, "ABCDE", 5) == true);
  ASSERT(RB_Equal(&rb1, "ABCD", 4) == true);
  ASSERT(RB_Equal(&rb1, "BCDE", 4) == false);

  // scenario: equal with empty buffer
  RB_Reset(&rb1);
  ASSERT(RB_Equal(&rb1, "test", 4) == false);

  // ===== RB_Clone, RB_Copy =====

  // scenario: RB_Clone basic
  RingBuffer rb2 = {0};
  RB_Alloc(_G->arena, &rb2, 10);
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 clone_data[5] = {1, 2, 3, 4, 5};
  RB_Push(&io, clone_data, 5);
  io2 = (IO){&rb2};
  RB_Clone(&io2, &rb1);
  ASSERT(io2.err == 0);
  ASSERT(io2.written == 5);
  ASSERT(RB_Used(&rb2) == 5);
  ASSERT(RB_Equal(&rb2, (char*)clone_data, 5) == true);
  ASSERT(rb2.sz == 10);

  // scenario: RB_Clone empty src
  RB_Reset(&rb1);
  RB_Reset(&rb2);
  io2 = (IO){&rb2};
  RB_Clone(&io2, &rb1);
  ASSERT(io2.err == 0);
  ASSERT(io2.written == 0);

  // scenario: RB_Clone src too large
  RingBuffer rb_small = {0};
  RB_Alloc(_G->arena, &rb_small, 5);
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, clone_data, 5);
  IO io_small = {&rb_small};
  RB_Clone(&io_small, &rb1);
  ASSERT(io_small.err == -1);

  // scenario: RB_Copy basic
  RB_Reset(&rb1);
  RB_Reset(&rb2);
  io = (IO){&rb1};
  u8 copy_data[3] = {10, 20, 30};
  RB_Push(&io, copy_data, 3);
  io2 = (IO){&rb2};
  RB_Copy(&io2, &rb1);
  ASSERT(io2.err == 0);
  ASSERT(io2.written == 3);
  ASSERT(RB_Used(&rb2) == 3);
  ASSERT(RB_Equal(&rb2, (char*)copy_data, 3) == true);

  // scenario: RB_Copy with wrap-around src
  RB_Reset(&rb1);
  RB_Reset(&rb2);
  io = (IO){&rb1};
  u8 dummy[8] = {0};
  RB_Push(&io, dummy, 8);
  RB_Shift(&io, buffer, 8);
  RB_Push(&io, copy_data, 3);  // wrapped in rb1
  ASSERT(rb1.head == 1);
  ASSERT(rb1.tail == 8);
  io2 = (IO){&rb2};
  RB_Copy(&io2, &rb1);
  ASSERT(io2.err == 0);
  ASSERT(io2.written == 3);
  ASSERT(RB_Used(&rb2) == 3);
  ASSERT(RB_Equal(&rb2, (char*)copy_data, 3) == true);

  // scenario: RB_Copy with wrap-around dst
  RB_Reset(&rb1);
  RB_Reset(&rb2);
  io2 = (IO){&rb2};
  RB_Push(&io2, dummy, 8);
  RB_Shift(&io2, buffer, 8);  // rb2 tail/head at 8
  io = (IO){&rb1};
  RB_Push(&io, copy_data, 3);
  io2 = (IO){&rb2};
  RB_Copy(&io2, &rb1);  // rb2 head wraps
  ASSERT(io2.err == 0);
  ASSERT(io2.written == 3);
  ASSERT(rb2.head == 1);
  ASSERT(rb2.tail == 8);
  ASSERT(RB_Used(&rb2) == 3);
  ASSERT(RB_Equal(&rb2, (char*)copy_data, 3) == true);

  // scenario: RB_Copy no room
  RB_Reset(&rb1);
  RB_Reset(&rb2);
  io = (IO){&rb1};
  io2 = (IO){&rb2};
  u8 large_data[9] = {1, 2, 3, 4, 5, 6, 7, 8, 9};
  RB_Push(&io, large_data, 9);
  u8 existing[5] = {0};
  RB_Push(&io2, existing, 5);
  io2 = (IO){&rb2};
  RB_Copy(&io2, &rb1);
  ASSERT(io2.err == -1);

  // scenario: RB_Copy empty src
  RB_Reset(&rb1);
  RB_Reset(&rb2);
  io2 = (IO){&rb2};
  RB_Copy(&io2, &rb1);
  ASSERT(io2.err == 0);
  ASSERT(io2.written == 0);

  // ===== RB_Print =====

  // scenario: print non-wrapped data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  u8 print1[5] = {0xAB, 0xCD, 0xEF, 0x12, 0x34};
  RB_Push(&io, print1, 5);
  RB_Print(&rb1, "Test non-wrapped", 0);

  // scenario: print wrapped data
  RB_Reset(&rb1);
  io = (IO){&rb1};
  RB_Push(&io, tmp, 7);
  memset(buffer, 0, sizeof(buffer));
  RB_Shift(&io, buffer, 7);
  u8 print2[5] = {0xDE, 0xAD, 0xBE, 0xEF, 0xCA};
  RB_Push(&io, print2, 5);
  RB_Print(&rb1, "Test wrapped", 5);

  // scenario: print empty buffer
  RB_Reset(&rb1);
  RB_Print(&rb1, "Test empty", 0);

  return 0;
}
