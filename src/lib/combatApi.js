import { buildAuthorityUrl } from "./apiUrl.js";

function buildCombatError(status, payload) {
  const message = payload?.message || payload?.error || `Combat scoring failed (${status})`;
  return new Error(message);
}

export async function scoreCombatScroll({ scrollText, weave, playerId, arenaSchool, opponentSchool } = {}) {
  const response = await fetch(buildAuthorityUrl('/api/combat/score'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scrollText: typeof scrollText === 'string' ? scrollText : String(scrollText || ''),
      weave: typeof weave === 'string' ? weave : String(weave || ''),
      ...(playerId ? { playerId } : {}),
      ...(arenaSchool ? { arenaSchool } : {}),
      ...(opponentSchool ? { opponentSchool } : {}),
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw buildCombatError(response.status, payload);
  }

  return payload;
}
