# Use Arch Linux for consistency with host
FROM archlinux:latest

# Install dependencies (including build tools for native modules like sharp)
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm unzip curl base-devel python && \
    pacman -Scc --noconfirm

# Create non-root user (named 'user' to match host bun cache paths)
RUN useradd -m -s /bin/bash user

# Switch to non-root user and install bun
USER user
RUN curl -fsSL https://bun.sh/install | bash

# Add bun to PATH
ENV PATH="/home/user/.bun/bin:${PATH}"

# Pre-warm bun cache by installing deps in a temp location
# This compiles native modules (like sharp) for the container environment
WORKDIR /tmp/cache-warm
COPY --chown=user:user package.json ./
COPY --chown=user:user scripts ./scripts/
COPY --chown=user:user plugins ./plugins/
RUN bun install --force
RUN cp bun.lock /home/user/bun.lock.baked
# RUN rm -rf /tmp/cache-warm

WORKDIR /app

# Entrypoint: install deps (fast - cache is warm) then run
COPY --chown=user:user docker-entrypoint.sh /home/user/
RUN chmod +x /home/user/docker-entrypoint.sh
ENTRYPOINT ["/home/user/docker-entrypoint.sh"]
