# Architecture

## Control plane

The application is the only component allowed to access PostgreSQL. It serves the web client and API, schedules due checks, leases them to capable workers, records normalized results, derives device health, and opens or resolves incidents.

The database-backed queue uses short leases and `FOR UPDATE SKIP LOCKED`, allowing multiple workers to request work safely. A timed-out lease returns to the queue. This deliberately avoids a second stateful dependency at the initial scale.

## Worker data flow

1. A worker authenticates and advertises its name, version, and capabilities.
2. The application leases one compatible queued check.
3. The worker runs the fixed probe implementation within the timeout.
4. It posts a normalized result to the application.
5. The application completes the job and updates check, incident, and device state transactionally.

Workers initiate all traffic toward the control plane. A remote site therefore requires no inbound firewall rule for HedgeSight.

## Storage

PostgreSQL is the only supported database. Docker Compose supplies it for simple installations; production operators can point `DATABASE_URL` at an external service. Probe results are append-only and indexed by check and time, leaving a clear migration path toward partitioning and retention jobs.

### Interface time series

Interface inventory uses a stable key scoped to the device rather than relying only on SNMP `ifIndex`, which may change. Workers submit raw counters as decimal strings, and the control plane stores them as `numeric(20,0)`. Rates are derived against the previous sample only when counters and device uptime remain monotonic. Reboots and counter resets are flagged instead of producing false traffic spikes.

Raw interface and generic metric samples use daily native PostgreSQL partitions. Interface samples are stored as a wide row—one row per interface poll—rather than one row per metric. Five-minute, hourly, and daily rollups preserve averages, maxima, error deltas, discard deltas, and sample counts.

### Retention and configuration snapshots

The effective retention policy is the per-device value when present, otherwise the global default. The maintenance process prepares future partitions, refreshes rollups, and removes expired raw, rolled-up, and configuration data. Maintenance history is retained for operational visibility.

Configuration bodies are compressed and symmetrically encrypted before storage. Only snapshot metadata and SHA-256 hashes remain queryable without decryption. Identical configurations are deduplicated, while `previous_snapshot_id` provides the basis for later configuration diffs.

## Version compatibility

Application and worker versions are reported independently. Stable releases use semantic versions. The worker lease contract should remain backward compatible across at least one minor application release; explicit protocol negotiation will be introduced before `1.0`.
