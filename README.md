# HedgeSight

HedgeSight is a self-hosted active infrastructure monitoring platform. Its control plane presents the web interface, schedules checks, records results, and manages incidents. Outbound-only workers execute probes close to the networks they monitor.

This initial build supports ICMP Ping and HTTP/HTTPS checks. SNMP and SSH are included in the data model and will be enabled as their secure probe implementations mature.

## Ping monitoring

Every device receives a Ping availability check when it is created. The interval is selected during device creation and can range from 10 seconds to 15 minutes in the web interface. Existing devices are backfilled automatically during migration.

Ping results record availability, response time, and packet loss. The **Monitoring** page shows current state, latest latency, polling interval, last check time, and the latest 30 response-time samples. Device profile fields are included now and display placeholders until SSH profiling is implemented.

Reachability can use either ICMP echo or a TCP connection to a configurable port (port 22 by default). Both methods use the same scheduling, latency history, state transitions, and incident handling.

Monitoring rows expand to show 30-day uptime, accountable downtime, downtime under maintenance, availability percentage, and the latest interface traffic, utilization, errors, and discards, refreshing every 10 seconds. Availability is calculated from recorded UP and DOWN probe durations with unknown time and complete maintenance windows excluded; DOWN time overlapping maintenance remains visible as a separate statistic. Until SNMP discovery has populated interface telemetry, the expanded view explains that no interface data is available. Each monitoring row also links directly to the incident History tab filtered to that device. Device configuration and profile management remain on the separate **Devices** page.

## Change management and maintenance

Operators can select one or more nodes on the **Monitoring** page and place them under a scheduled change record. Each change requires a reference, short public description, start time, estimated end time, and an assigned operator or administrator. The dedicated **Maintenance** page lists current and historical windows and allows an open window's details, manager, start, or estimated end to be edited.

Polling and metric collection continue during maintenance, but down results do not raise new incidents and maintained nodes are excluded from outage counts only between the configured start and estimated end. Once that boundary passes, an unavailable node counts as downtime and raises an incident; HedgeSight adds one system update naming the expired change and assigned manager. The overdue change remains visible until the manager or an administrator returns it to service. The unauthenticated status page publishes the change reference, public description, prominently labelled start and estimated end, state, and affected node count without exposing node or manager identities.

## Linux SSH profiling and credentials

Operators can create write-only SSH password credentials under **Settings → Credentials**, then assign one to a device from its edit screen. Passwords are encrypted in PostgreSQL with `CONFIG_ENCRYPTION_KEY`, are never returned to the browser, and are decrypted only into the job leased by an authenticated worker. Use a long, unique production value for `CONFIG_ENCRYPTION_KEY`; changing it later requires re-entering stored secrets.

SSH profiling uses a new short-lived connection for each run and executes a fixed read-only Linux inventory. It collects hostname, OS and kernel, logical CPU count, total memory, uptime, filesystems and usage, plus network interface state, MAC address, MTU, and advertised speed where available. The server host key is trusted on the first successful connection and then pinned; a later mismatch fails the profile rather than silently trusting a replacement. Device inventory is shown behind **More information**, while monitorable capacity and uptime values appear in the expanded Monitoring row. A dedicated least-privilege Linux account without sudo access is recommended.

The device editor's **Advanced Linux monitoring** section lists discovered CPUs, memory, mounted filesystems, and network adapters. Per-device thresholds cover CPU utilisation, memory utilisation, disk fullness, interface utilisation, and interface error/discard deltas. Each SSH snapshot records CPU and memory use, filesystem percentages, and cumulative Linux interface counters. Consecutive counter samples are converted into inbound/outbound bit rates and link utilisation by the time-series store. Resource threshold breaches mark the Linux resource check degraded and enter the normal incident workflow; breached interface metrics are highlighted in the expanded Monitoring view.

Every discovered component is individually selectable. Unselected components remain in inventory for later re-enablement but stop contributing new samples and alerts. Selected CPU, RAM, disk and interface cards in Monitoring are interactive: clicking a card opens its historical graph with 1-hour, 6-hour, 24-hour, 7-day and 30-day windows. Interface graphs plot inbound and outbound throughput on a shared scale.

## Configuration portability and external PostgreSQL

Administrators can export a portable configuration package from **Settings → System**. It contains nodes, groups, checks, component selections, thresholds and retention settings. Imports support merge or replace mode. Packages intentionally exclude metric history, incidents, users and all secret values; SSH assignments reference a credential by name and are restored only when that credential already exists on the destination.

During first-run setup, **Use remote PostgreSQL** accepts a `postgresql://` connection URL before the administrator is created. Existing installations can switch under **Settings → System** after exporting configuration. HedgeSight tests the target, applies all schema migrations, writes the URL to a permission-restricted file in the persistent `app-data` volume, then restarts. A database switch does not copy data: import the configuration package after creating or signing into the administrator on the target database. For hosted PostgreSQL, use the provider's TLS connection URL, normally with `sslmode=require` or `sslmode=verify-full`.

## Incident workflow

A failed check raises an **Open** incident. An operator can claim a currently down incident, moving it to **Under investigation** and displaying their name on the Overview and incident pages. Successful polling records the recovery timestamp and moves the incident to **Pending investigation**; recovery does not automatically close it.

Incident detail records the outage, recovery, and closure timestamps alongside attributed, timestamped operator updates. An incident can only be marked **Resolved** after monitoring has recovered and at least one update has been added. Overview incident rows link directly to the corresponding incident detail.

Incidents may be resolved with a linked follow-up task when service restoration must happen before root-cause work. The **Tasks** area provides a draggable Kanban board with Backlog, In progress, Testing, and Completed stages. Tasks support assignment, editable details, timestamped updates, and links to multiple incidents. Their priority marker escalates automatically as more incidents are linked, making recurring problems more visible.

The Overview keeps active incidents visible and places resolved history in a collapsed section. Resolved incidents remain in the operational queue until an operator archives them. Archiving removes the incident from operational views without deleting it or excluding it from metrics.

Failures are correlated at device level. Multiple failed checks become signals within the same device incident, and a recurrence shortly after closure reopens that incident. The default correlation window is five minutes and can be changed with `INCIDENT_CORRELATION_SECONDS`.

Related device incidents can be coordinated through a **Major Incident** with an `MI-YYYY-NNNN` reference, impact statement, severity, owner, linked incidents, and a shared timestamped update stream.

The incident list groups linked incidents beneath an expandable MI workflow bar. Operators can post shared updates, open the full MI, or resolve every linked incident together. Bulk resolution requires all child incidents to have recovered and at least one shared MI update; HedgeSight adds an attributed audit update to each child before closing the children and MI transactionally.

The Incidents screen is divided into **Operational incidents**, **Major incidents**, **History**, and **Metrics** tabs. History contains archived incidents and the scrollable 30-day activity timeline; selecting a count marker filters history to that day. Existing resolved incidents are archived automatically when this schema change is first applied. Major Incident creation is launched from a compact button and completed in a modal, keeping the operational queue focused while leaving room for future incident analytics.

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

The default stack contains the application, one local worker, and PostgreSQL. The application runs migrations automatically and adds a built-in health check.

## OpenID Connect, Authentik and reverse proxies

Optional single sign-on uses the OpenID Connect Authorization Code flow with PKCE. Configure it under **Settings → Authentication** or provide `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI` as initial environment defaults. Settings saved in the interface take effect immediately and the client secret is encrypted using `CONFIG_ENCRYPTION_KEY`.

The quick-setup callback is generated in the browser from the current public origin; no deployment hostname is embedded in the source or container image. If HedgeSight is opened at `https://monitoring.example.net`, its callback is:

```text
https://monitoring.example.net/api/auth/oidc/callback
```

Register that exact value as a **Strict** redirect URI in the identity provider. Scheme, hostname, port when non-standard, path, and trailing slash behaviour must match exactly.

### Authentik configuration

Create an Authentik application with an **OAuth2/OpenID Provider** using a confidential client and a signing key. HedgeSight uses provider discovery, so it asks for an issuer instead of separate authorization, token, and UserInfo endpoints. With an Authentik application slug of `hedgesight`, the values normally map as follows:

| Authentik / generic OAuth value | HedgeSight setting |
| --- | --- |
| Provider-specific issuer, for example `https://auth.example.net/application/o/hedgesight/` | Issuer URL |
| Client ID | Client ID |
| Client secret | Client secret |
| HedgeSight public callback | Callback URL and Authentik Strict redirect URI |
| `openid email profile` plus an optional group scope | Requested scopes |
| User identifier | HedgeSight uses the `email` claim |

Do not enter Authentik's `/application/o/authorize/` URL as the issuer. It is an authorization endpoint. HedgeSight obtains it, along with the token, UserInfo, and signing-key endpoints, from:

```text
https://auth.example.net/application/o/hedgesight/.well-known/openid-configuration
```

Copy the `issuer` value returned by that document into HedgeSight. **Test current settings** validates values presently entered in the form; **Save and validate** tests discovery before committing them.

### Account provisioning and group roles

Automatic provisioning creates a HedgeSight account after a previously unknown user authenticates successfully and supplies an email address. The safe fallback role is **Viewer**, but it can be changed to Operator or Administrator.

Optional group mapping accepts a configurable claim, normally `groups`, containing an array of group names. Configure comma-separated Viewer, Operator, and Administrator group names in HedgeSight. Matching is case-insensitive and precedence is Administrator, Operator, Viewer, then the fallback provisioning role. Group mapping selects the role only when a new account is provisioned. Once an account exists, its role is managed in HedgeSight and is not overwritten by subsequent OIDC logins.

For Authentik, add or select a scope/property mapping that emits group names, add that mapping's scope name to HedgeSight's requested scopes, and set the corresponding group claim name. A typical configuration is:

```text
Requested scopes: openid email profile groups
Group claim name: groups
Viewer groups: HedgeSight Viewers
Operator groups: HedgeSight Operators
Administrator groups: HedgeSight Administrators
```

### Traefik

When using HedgeSight's built-in OIDC, do not attach an Authentik forward-auth middleware to the main HedgeSight router. Doing so authenticates the request before HedgeSight can present its own login and creates two independent authentication layers. HedgeSight protects its private APIs with its own session. The status page and its read-only API can retain higher-priority explicit public routes:

```yaml
http:
  routers:
    hedgesight-status:
      rule: "Host(`monitoring.example.net`) && Path(`/status`)"
      priority: 300
      entryPoints: [websecure]
      tls: { certResolver: le }
      service: hedgesight-svc

    hedgesight-public-api:
      rule: "Host(`monitoring.example.net`) && Path(`/api/public/status`)"
      priority: 300
      entryPoints: [websecure]
      tls: { certResolver: le }
      service: hedgesight-svc
      middlewares: [hedgesight-public-ratelimit]

    hedgesight-assets:
      rule: "Host(`monitoring.example.net`) && PathPrefix(`/assets/`)"
      priority: 300
      entryPoints: [websecure]
      tls: { certResolver: le }
      service: hedgesight-svc

    hedgesight-app:
      rule: "Host(`monitoring.example.net`)"
      priority: 10
      entryPoints: [websecure]
      tls: { certResolver: le }
      service: hedgesight-svc

  middlewares:
    hedgesight-public-ratelimit:
      rateLimit:
        average: 30
        period: 1m
        burst: 10

  services:
    hedgesight-svc:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: "http://HEDGESIGHT_HOST:8080"
```

Set these application environment values when Traefik terminates HTTPS:

```text
TRUST_PROXY=true
COOKIE_SECURE=true
```

### Lockout prevention and recovery

Keep local authentication enabled until an administrator has completed a successful OIDC login. HedgeSight refuses to disable local sign-in before an enabled OIDC-linked administrator exists and automatically exposes local login if an older configuration disabled it without such an administrator.

If the identity provider later becomes unavailable, temporarily add this environment variable and redeploy only the application service:

```text
LOCAL_AUTH_RECOVERY=true
```

Sign in locally, repair and test OIDC, then remove the override and redeploy. The equivalent direct PostgreSQL recovery is:

```sql
UPDATE oidc_settings
SET local_accounts_enabled = true
WHERE singleton = true;
```

## Use an external PostgreSQL database

Set `DATABASE_URL` to the external PostgreSQL connection string and apply the override:

```console
docker compose -f compose.yaml -f compose.external-db.yaml up -d
```

The target database must support PostgreSQL 14 or newer and permit the `pgcrypto` extension.

For bind-mounted application data, set `PUID` and `PGID` to the numeric owner of the host or NFS-mounted directory. The application image changes to that identity at startup and verifies that `/data` is writable before launching.

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
