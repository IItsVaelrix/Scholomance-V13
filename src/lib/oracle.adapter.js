/**
 * ORACLE ADAPTER
 *
 * Bridge between UI hooks and the Oracle NLP backend.
 * Ensures UI components do not call external APIs directly.
 */

export async function queryOracle(query, telemetry) {
  const response = await fetch('/api/oracle/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, telemetry }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}
