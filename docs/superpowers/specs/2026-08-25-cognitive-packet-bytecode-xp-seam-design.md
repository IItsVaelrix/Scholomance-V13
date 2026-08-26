# Cognitive Packet to Bytecode XP Seam

## Goal

Turn an admitted Cognitive Bus packet plus a verified Bytecode diagnostic outcome into a deterministic, provenance-carrying Bytecode XP memory envelope.

## Boundary

`cognitive_packet.py` remains authoritative for Cognitive Bus packet shape, integrity, epistemic pricing, authority, lineage, and memory gates. The Bytecode XP layer remains authoritative for vaccine encoding and QBIT memory-envelope persistence. The seam may compose these authorities but must not create a parallel packet schema or promote unsupported claims.

## Data flow

```text
packet JSON + diagnostic outcome
  -> fixed server-side Python admission command
  -> verified-signature receipt
  -> XP vaccine with packet provenance
  -> checksummed QBIT memory envelope
  -> injected memory client
```

The server service invokes `cognitive_packet.py admit` itself. A caller cannot inject an admission function or submit a verification key alongside a packet; the validator reads `CBUS_PACKET_KEY` (or its configured key file at the CLI boundary) from deployment configuration. Packet HMACs bind the schema, algorithm, signer key ID, and content digest. JavaScript serializes the packet once, sends those exact bytes to Python, and derives XP only from the resulting plain snapshot. The admission receipt distinguishes claimed evidence IDs/lineages from validator-computed decisive evidence IDs/lineages and includes the decisive lineage count. QBIT records the packet basis as `declaredBasis`; it does not mistake that declaration for computed support. The diagnostic input is a canonical `DiagnosticReport`, an HMAC attestation, and an outcome index. The service verifies both the public report checksum and an HMAC over the full 256-bit canonical report digest against deployment-only `BYTECODE_DIAGNOSTIC_KEY`; recomputing a public checksum cannot authorize a fabricated lesson. Only report fields covered by the canonical digest may influence XP. The packet ID, task ID, proposition status, claimed and decisive evidence summaries, signature-verification result, diagnostic source, and diagnostic digest are retained as stable context/provenance. Volatile timestamps are excluded from vaccine and envelope identity.

## Integration status

This is a server service boundary, not yet an HTTP route or an automatic diagnostic-runner hook. No existing product request path imports it. Its tests prove that callers using this service cannot persist forged packet-derived XP; they do not prove that every legacy XP minting path is packet-gated. A production call site must be chosen explicitly rather than silently redirecting unrelated diagnostic memory writes.

## Failure behavior

- Invalid packets and signatures that cannot be verified are rejected before a vaccine is created.
- Missing, tampered, or unattested diagnostic reports are rejected; a packet alone is not an educational lesson.
- Existing Bytecode XP and memory-envelope verification remains mandatory.
- No direct write to generic memory is introduced.

## Verification

The integration test signs packets through the real Python module and exercises the JavaScript service against the real Python admission subprocess. It includes a participant-signed authority bypass and a signed packet with no available verification key. Python invariant tests cover the validator rules; JavaScript tests cover the seam. Their counts are reported separately because they exercise different surfaces.
