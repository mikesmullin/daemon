FROM archlinux:latest

RUN useradd -m app

WORKDIR /home/app

COPY build/ build/
COPY assets/ assets/

RUN chown -R root:root /home/app/build && \
    chmod -R 755 /home/app/build && \
    chown -R app:app /home/app/assets && \
    chmod -R u+rw /home/app/assets

USER app

CMD ["./build/main", "--role", "hub", "-b", "0.0.0.0:6543", "-vv"]