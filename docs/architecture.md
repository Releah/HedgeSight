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

## Version compatibility

Application and worker versions are reported independently. Stable releases use semantic versions. The worker lease contract should remain backward compatible across at least one minor application release; explicit protocol negotiation will be introduced before `1.0`.
