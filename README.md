# HedgeSight

HedgeSight is a self-hosted active infrastructure monitoring platform. Its control plane presents the web interface, schedules checks, records results, and manages incidents. Outbound-only workers execute probes close to the networks they monitor.

This initial build supports ICMP Ping and HTTP/HTTPS checks. SNMP and SSH are included in the data model and will be enabled as their secure probe implementations mature.

## Start locally

1. Copy `.env.example` to `.env` and replace both development secrets.
2. Start the stack:

   ```console
   docker compose up --build -d
   ```

3. Open <http://localhost:8080>.

The default stack contains the application, one local worker, and PostgreSQL. The application runs migrations automatically and adds a built-in health check.

## Use an external PostgreSQL database

Set `DATABASE_URL` to the external PostgreSQL connection string and apply the override:

```console
docker compose -f compose.yaml -f compose.external-db.yaml up -d
```

The target database must support PostgreSQL 14 or newer and permit the `pgcrypto` extension.

## Add remote workers

A worker only needs outbound HTTPS access to the application. Give it a unique `WORKER_NAME`, the shared enrollment token, and the application URL:

```console
docker run -d --restart unless-stopped --cap-add NET_RAW \
  -e HEDGESIGHT_API_URL=https://sight.example.net \
  -e WORKER_NAME=branch-london \
  -e WORKER_TOKEN=replace-with-your-secret \
  ghcr.io/releah/hedgesight-worker:stable
```

The initial shared token is intentionally simple for bootstrap. Per-worker enrollment tokens and renewable identities are planned before the first production release.

## Updates

Versioned application and worker images are published to GitHub Container Registry. The normal controlled update is:

```console
docker compose pull
docker compose up -d
```

Automatic image updates are opt-in:

```console
docker compose --profile auto-update up -d
```

The updater only replaces services bearing the explicit Watchtower label. PostgreSQL is excluded. For production, pin a version tag and take a database backup before upgrading.

## API examples

Create a Ping check for a device:

```http
POST /api/devices/{deviceId}/checks
Content-Type: application/json

{
  "name": "WAN reachability",
  "kind": "ping",
  "intervalSeconds": 30,
  "timeoutMs": 3000,
  "config": {}
}
```

Create an HTTPS check by setting `kind` to `http` and passing `config.url`, `config.expectedStatus`, and optionally `config.expectedContent`.

## Development

Requires Node.js 24 and pnpm 10:

```console
pnpm install
pnpm dev
```

Run PostgreSQL separately or start only the bundled database with `docker compose up postgres -d`. The Vite development server is at <http://localhost:5173> and proxies API calls to port 8080.

## Current security boundary

- Workers communicate only with the application API and never receive database credentials.
- Probe targets are passed to fixed protocol implementations; no shell is invoked for arbitrary commands.
- Ping arguments are passed directly to the executable without shell expansion.
- SNMP and SSH checks cannot currently be scheduled.
- User authentication, granular authorization, encrypted credential storage, and individual worker identities remain required before an internet-facing production deployment.

See [docs/architecture.md](docs/architecture.md) and [docs/roadmap.md](docs/roadmap.md) for the design and staged delivery plan.
