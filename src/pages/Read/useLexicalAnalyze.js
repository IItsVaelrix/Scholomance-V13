import { useCallback, useRef, useState } from 'react';

export function useLexicalAnalyze() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const submit = useCallback(async (context) => {
    if (!context || typeof context !== 'object' || Array.isArray(context)) return;
    if (typeof context.scope !== 'string' || typeof context.surface !== 'string' || !context.surface.trim()) {
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/lexical/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Leximancy failed (${res.status})`);
      if (abortRef.current === ac) setResult(await res.json());
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Leximancy failed');
    } finally {
      if (abortRef.current === ac) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { abortRef.current?.abort(); setResult(null); setError(null); }, []);
  return { result, loading, error, submit, clear };
}
