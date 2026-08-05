# HedgeSight

HedgeSight is a self-hosted active infrastructure monitoring platform. Its control plane presents the web interface, schedules checks, records results, and manages incidents. Outbound-only workers execute probes close to the networks they monitor.

This initial build supports ICMP Ping and HTTP/HTTPS checks. SNMP and SSH are included in the data model and will be enabled as their secure probe implementations mature.

## Ping monitoring

Every device receives a Ping availability check when it is created. The interval is selected during device creation and can range from 10 seconds to 15 minutes in the web interface. Existing devices are backfilled automatically during migration.

Ping results record availability, response time, and packet loss. The **Monitoring** page shows current state, latest latency, polling interval, last check time, and the latest 30 response-time samples. Device profile fields are included now and display placeholders until SSH profiling is implemented.

Reachability can use either ICMP echo or a TCP connection to a configurable port (port 22 by default). Both methods use the same scheduling, latency history, state transitions, and incident handling.

Monitoring rows expand to show the latest interface traffic, utilization, errors, and discards, refreshing every 10 seconds. Until SNMP discovery has populated interface telemetry, the expanded view explains that no interface data is available. Device configuration and profile management remain on the separate **Devices** page.

## Incident workflow

A failed check raises an **Open** incident. An operator can claim a currently down incident, moving it to **Under investigation** and displaying their name on the Overview and incident pages. Successful polling records the recovery timestamp and moves the incident to **Pending investigation**; recovery does not automatically close it.

Incident detail records the outage, recovery, and closure timestamps alongside attributed, timestamped operator updates. An incident can only be marked **Resolved** after monitoring has recovered and at least one update has been added. Overview incident rows link directly to the corresponding incident detail.

## Device management and groups

The **Devices** and **Monitoring** pages share a management toolbar. Devices can be searched by name, address, description, OS, vendor, model, or group and filtered simultaneously by state, operating system, and custom group.

Custom groups are reusable and a device can belong to multiple groups. The device editor manages its identity, address, description, enabled state, Ping interval, profile metadata, and group memberships. Manually supplied profile values use the same fields that future SSH profiling will populate.

## Scalable monitoring storage

HedgeSight stores availability results, generic numeric metrics, interface counters, rollups, and configuration snapshots separately. Interface counters use PostgreSQL numeric values so 64-bit SNMP counters are not truncated by JavaScript. Daily PostgreSQL partitions are prepared automatically for raw interface and metric samples.

The default retention policy is configurable from **Settings**:

| Data | Default retention |
| --- | ---: |
| Raw samples | 30 days |
| 5-minute rollups | 90 days |
| Hourly rollups | 365 days |
| Daily rollups | 1,825 days |
| Incidents | 730 days |
| Configuration snapshots | 365 days |

Each device can override any of these values through `PUT /api/devices/{deviceId}/retention`; omitted values inherit the global setting. Maintenance creates rollups before deleting expired raw samples and normally runs hourly.

Configuration snapshots are compressed, AES-256 encrypted through PostgreSQL `pgcrypto`, and deduplicated by device, configuration type, and SHA-256 content hash. Set a strong, persistent `CONFIG_ENCRYPTION_KEY` before storing configurations. Losing this key makes existing snapshots unrecoverable.

## Start locally

1. Copy `.env.example` to `.env` and replace both development secrets.
2. Start the stack:

   ```console
   docker compose up --build -d
   ```

3. Open <http://localhost:8080>.

On first launch, HedgeSight asks you to create the initial local administrator. No default web credentials are included. The privacy-safe network-health view is available without authentication at <http://localhost:8080/status> and exposes only aggregate up, down, degraded, unknown, and incident counts.

Local accounts use scrypt password hashing and server-side sessions. Administrators can add, edit, disable, re-password, and delete accounts in **Settings → Account management**; the original bootstrap administrator is protected from modification and deletion.

Optional OAuth2-based login uses OpenID Connect Authorization Code flow with PKCE. Configure it directly in **Settings → Authentication** or use the `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI` environment variables as initial defaults. Settings saved through the interface take effect immediately and the client secret is encrypted with `CONFIG_ENCRYPTION_KEY`. For the default local deployment the callback is `http://localhost:8080/api/auth/oidc/callback`. Set `COOKIE_SECURE=true` and `TRUST_PROXY=true` when HTTPS terminates at a trusted reverse proxy.

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
- Configuration snapshots require a stable `CONFIG_ENCRYPTION_KEY`; changing it prevents older snapshots from being decrypted.
- Private application APIs require a local or OpenID Connect user session. Worker APIs retain their separate bearer-token boundary.
- Role records exist for future authorization policy, but granular role enforcement, encrypted probe credential storage, and individual worker identities remain required before an internet-facing production deployment.

See [docs/architecture.md](docs/architecture.md) and [docs/roadmap.md](docs/roadmap.md) for the design and staged delivery plan.
