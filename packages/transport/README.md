# Transport Core

This package contains the transport-core foundation that wraps the authoritative
engine without reimplementing game logic.

Current contents:

- an engine-backed `CommandGateway`
- shared in-memory persistence for event logs and snapshots
- an authority runtime that serves scoped sync envelopes
- a reference in-memory transport adapter for tests and local harnesses

Network-specific adapters for Supabase and LAN host-authoritative play remain
intentionally deferred.
