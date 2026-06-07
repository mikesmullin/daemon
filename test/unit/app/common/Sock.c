#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

typedef struct Scenario1 {
  Socket c1;
  u8 connect;
  u8 alloc;
  u8 accept;
  u8 send;
  u8 sendBytes;
  u8 recv;
  u8 recvBytes;
} Scenario1;

static Scenario1 _scene = {0};

void _Socket__connect(Socket* client) {
  _scene.connect++;
}
void _Socket__alloc(Socket** sock) {
  _scene.alloc++;
  *sock = &_scene.c1;
}
void _Socket__accept(Socket* listener, Socket* accepted) {
  _scene.accept++;
}
void _Socket__send(Socket* sock, u8* buf, u32 len) {
  _scene.send++;
  _scene.sendBytes += len;
}
void _Socket__recv(Socket* sock, u8* buf, u32 len) {
  _scene.recv++;
  _scene.recvBytes += len;
}

// @describe Sock
// @tag common
int main() {
  // arena
  _G->arena = Arena__Alloc(1024 * 10);

  // bindings
  _G->onsockconnect = _Socket__connect;
  _G->onsockalloc = _Socket__alloc;
  _G->onsockaccept = _Socket__accept;
  _G->onsocksend = _Socket__send;
  _G->onsockrecv = _Socket__recv;

  // init
  Sock__setup();
#define TEST_SOCK "unix://./assets/agent/sockets/cli.sock"

  // Scenario 1

  Socket server = {0};
  Sock__init(&server, TEST_SOCK, "", SERVER_SOCKET);
  Sock__listen(&server);

  Socket client = {0};
  Sock__init(&client, TEST_SOCK, "", CLIENT_SOCKET);
  Sock__connect(&client);

  Sock__accept(&server);

  ASSERT(_scene.connect == 1);
  ASSERT(_scene.alloc == 1);
  ASSERT(_scene.accept == 1);

  Sock__write(&client, (u8*)"hi", 3);

  Sock__read(&_scene.c1, 3);

  ASSERT(_scene.send == 1);
  ASSERT(_scene.recv == 1);
  ASSERT(_scene.sendBytes == 3);
  ASSERT(_scene.recvBytes == 3);

  Sock__close(&client);
  Sock__close(&server);

  // Sock__accept(&sock);
  Sock__free(&server);
  Sock__free(&client);
  Sock__destroy(&server);
  Sock__destroy(&client);
  Sock__shutdown(&server);
  Sock__shutdown(&client);

  // ASSERT(cstr__len(api_key) > 0);

  return 0;
}