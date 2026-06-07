# AI Test Makefile - Unit tests for Network Stack Layers
# Build: make
# Run: make run
# Clean: make clean

CC = clang
CFLAGS = -std=c99 -g -O0 -DDEBUG_SLOW -Wall -Wextra -Wpedantic \
         -Wno-unused-parameter -Wno-unused-variable -Wno-unused-function \
         -Wno-missing-field-initializers -Wno-gnu-zero-variadic-macro-arguments \
         -Wno-strict-prototypes -Wno-gnu-empty-struct -Wno-comment \
         -Wno-sometimes-uninitialized -Wno-unused-but-set-variable \
         -Wno-sign-compare
LDFLAGS = -lm -lcurl

# Source files
SRC = test_main.c
OUT = test_runner

.PHONY: all run clean

all: $(OUT)

$(OUT): $(SRC) ../src/unity.h test_ringbuffer.c test_io.c test_message.c test_network.c test_encryption.c
	$(CC) $(CFLAGS) -I../src -o $(OUT) $(SRC) $(LDFLAGS)

run: $(OUT)
	./$(OUT)

clean:
	rm -f $(OUT)
