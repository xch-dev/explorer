FROM rust:1.88.0 AS builder
WORKDIR /usr/src/xchdev-api
RUN apt-get update && apt-get install -y libclang-dev
COPY . .
RUN cargo install --path crates/api

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/cargo/bin/xchdev-api /usr/local/bin/xchdev-api
CMD ["xchdev-api"]
