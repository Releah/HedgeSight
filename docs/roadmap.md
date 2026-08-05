# Initial roadmap

## Foundation — current

- Dockerized control plane, PostgreSQL, and worker
- Database migrations and database-backed job leasing
- Ping and HTTP/HTTPS probes
- Live dashboard, device creation, incidents, and worker presence
- Version endpoints, release images, and opt-in container updater

## Storage foundation — current

- Native PostgreSQL partitions for raw metric and interface samples
- Stable interface inventory and 64-bit-safe counter ingestion
- Derived traffic rates with reboot and counter-reset detection
- Five-minute, hourly, and daily interface rollups
- Global retention policy and per-device override API
- Deduplicated, encrypted configuration snapshots
- Storage status and maintenance controls in Settings

## Operational alpha

- Authentication, users, and role-based access
- Per-worker one-time enrollment and credential rotation
- Complete device and check management interface
- Result history, charts, and maintenance windows
- Retry policy and configurable state transition thresholds
- Alert delivery through email and signed webhooks

## Network monitoring beta

- SNMP v2c and v3 credential vault
- Standard system and interface discovery
- Interface counters, utilization, errors, discards, and inventory
- Allow-listed SSH command checks with encrypted credentials
- Worker groups, device affinity, and high-availability scheduling
- TLS certificate inspection and expiry alerting

## Production readiness

- Audit log, backups, restore validation, and upgrade preflight
- OpenTelemetry metrics, traces, and structured logs
- Partitioned probe history and automated retention
- API rate limiting and hardened deployment profiles
- Signed images, published SBOMs, compatibility policy, and rollback documentation
