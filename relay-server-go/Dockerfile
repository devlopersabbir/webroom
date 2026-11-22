# Build stage
FROM golang:1.24-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /webroom-relay .

# Minimal runtime image (~10 MB)
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /webroom-relay /webroom-relay

ENV PORT=8787
EXPOSE 8787

ENTRYPOINT ["/webroom-relay"]
