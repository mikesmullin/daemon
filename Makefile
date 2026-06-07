# vim: noexpandtab tabstop=4

CLANG := clang @clang_options.rsp -std=c99 -O0 -gdwarf-4 -DDEBUG_SLOW
# musl requires libs to come last or it will optimize it out
LIBS := -lm -lcurl
SOURCES := $(shell find src -name '*.c')

.PHONY: all
all: build/main arch run

.PHONY: clean
clean:
	pkill -9 d4 2>/dev/null || true
	rm -rf build/* assets/agent/{sessions,sockets,worktrees}/* daemon.log

.PHONY: clean_cores
clean_cores:
	sudo rm -f /var/lib/systemd/coredump/core.main.*zst

.PHONY: rebuild
rebuild: clean
	$(MAKE) build/main

build/main: $(SOURCES)
	$(CLANG) src/main.c $(LIBS) -o build/main

.PHONY: arch
arch: Dockerfile
	podman build -t daemon:latest -f Dockerfile .

.PHONY: alpine
alpine: Dockerfile.alpine
	podman build --platform linux/amd64,linux/arm64 -t daemon:alpine -f Dockerfile.alpine .

# Build arm64-only image for armbian target
.PHONY: alpine-arm64
alpine-arm64: Dockerfile.alpine
	podman build --platform linux/arm64 -t daemon:alpine-arm64 -f Dockerfile.alpine .

# Export arm64 image as tar archive (for scp transfer)
ARMBIAN_HOST ?= 10.1.10.1
ARMBIAN_USER ?= user

.PHONY: export-arm64
export-arm64: alpine-arm64
	rm -f tmp/router/roles/daemon/files/daemon-alpine-arm64.tar
	podman save -o tmp/router/roles/daemon/files/daemon-alpine-arm64.tar localhost/daemon:alpine-arm64
	@echo "Image exported to tmp/router/roles/daemon/files/daemon-alpine-arm64.tar"

# Push arm64 image to armbian via scp (private transfer, no public registry)
.PHONY: push-arm64
push-arm64: export-arm64
	scp tmp/router/roles/daemon/files/daemon-alpine-arm64.tar $(ARMBIAN_USER)@$(ARMBIAN_HOST):~/containers/
	ssh $(ARMBIAN_USER)@$(ARMBIAN_HOST) "podman load -i ~/containers/daemon-alpine-arm64.tar"
	@echo "Image loaded on $(ARMBIAN_HOST)"

# Deploy daemon role to armbian using ansible
# Reads XAI_API_KEY from local .env file
.PHONY: deploy-daemon
deploy-daemon: export-arm64
	@XAI_KEY=$$(grep XAI_API_KEY .env | cut -d= -f2 | tr -d '"'); \
	cd tmp/router && ansible-playbook -i inventory/hosts daemon.yml -e "xai_api_key=$$XAI_KEY"

SESSION_ID ?= 1
WORKTREE := assets/agent/worktrees/$(SESSION_ID)

.PHONY: worktree
worktree:
#sudo rm -rf assets/agent/worktrees/$(SESSION_ID)
	git worktree remove --force $(WORKTREE)
	git worktree prune
	mkdir -p $(WORKTREE)
	git worktree add $(WORKTREE) HEAD
	mkdir -p $(WORKTREE)/build
#cp build/main $(WORKTREE)/build/
	mkdir -p $(WORKTREE)/assets/agent/{sessions,sockets}
	cp -Ra assets/agent/templates $(WORKTREE)/assets/agent/
	cp -Ra src $(WORKTREE)/

.PHONY: run
run:
#podman run -it --privileged daemon:latest
#podman run -d --init --userns=keep-id -v ./$(WORKTREE)/:/app daemon:latest
	podman run -it --init --userns=keep-id -v ./$(WORKTREE)/:/app daemon:latest build/main worker 1

TEST ?= Env

# Find test file in multiple possible locations
TEST_PATHS := test/unit/app/common test/unit/app/systems test/unit/app/plugins/agent/models test/unit/app/plugins/agent
TEST_FILE = $(shell for dir in $(TEST_PATHS); do [ -f "$$dir/$(TEST).c" ] && echo "$$dir/$(TEST).c" && break; done)

.PHONY: build_test
build_test:
	@if [ -z "$(TEST_FILE)" ]; then \
		echo "Error: Test file $(TEST).c not found in: $(TEST_PATHS)"; \
		exit 1; \
	fi
	$(CLANG) $(TEST_FILE) $(LIBS) -o build/$(TEST)

.PHONY: test
test: build_test
	build/$(TEST) && echo "Test passed." || echo "Test failed."