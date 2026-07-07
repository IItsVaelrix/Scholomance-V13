import { useState, useCallback, useRef } from 'react';
import { ORACLE_ERRORS } from './useWordLookup.jsx';
import { queryOracle } from '../lib/oracle.adapter.js';

/**
 * useOracleQuery Hook
 * 
 * Pillar 4 (Oracle UI Fail-Safe): this hook NEVER throws for an Oracle/network
 * failure. All failures are caught and surfaced as a stable error payload,
 * allowing the UI to degrade gracefully to OracleSignalFallback without
 * triggering the global ErrorBoundary and losing editor state.
 */

export function useOracleQuery() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const requestIdCounterRef = useRef(0);
  const activeRequestIdRef = useRef(null);
  const lastQueryRef = useRef({ query: '', telemetry: null });

  const executeQuery = useCallback(async (query, telemetry = {}) => {
    const trimmedQuery = String(query || '').trim();
    if (!trimmedQuery) {
      activeRequestIdRef.current = null;
      setIsLoading(false);
      setData(null);
      setStatus('idle');
      setError('Empty query');
      return null;
    }

    const wordCount = trimmedQuery.split(/\s+/).length;
    if (wordCount > 200) {
      activeRequestIdRef.current = null;
      setIsLoading(false);
      setData(null);
      setStatus('error');
      setError({
        category: 'VALIDATION',
        code: 'TOO_LONG',
        severity: 'warn',
        message: 'The Oracle cannot focus on queries longer than 200 words.'
      });
      return null;
    }

    lastQueryRef.current = { query: trimmedQuery, telemetry };

    requestIdCounterRef.current += 1;
    const requestId = `query_${requestIdCounterRef.current}`;
    activeRequestIdRef.current = requestId;
    setIsLoading(true);
    setStatus('loading');
    setError(null);

    const applyStateIfCurrent = (result) => {
      if (activeRequestIdRef.current !== requestId) return;
      setIsLoading(false);
      setData(result.data ?? null);
      setStatus(result.status ?? 'idle');
      setError(result.error ?? null);
    };

    try {
      const json = await queryOracle(trimmedQuery, telemetry);
      
      applyStateIfCurrent({
        data: json.data,
        status: 'ready',
        error: null,
      });
      return json.data;
    } catch (unexpected) {
      // The hook must never throw - map any surprise into a stable state.
      applyStateIfCurrent({
        data: null,
        status: 'error',
        error: { ...ORACLE_ERRORS.FAULT, message: unexpected?.message || ORACLE_ERRORS.FAULT.message },
      });
      return null;
    }
  }, []);

  const retry = useCallback(() => {
    if (lastQueryRef.current.query) {
      return executeQuery(lastQueryRef.current.query, lastQueryRef.current.telemetry);
    }
    return Promise.resolve(null);
  }, [executeQuery]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setStatus('idle');
    activeRequestIdRef.current = null;
  }, []);

  return {
    query: executeQuery,
    retry,
    clearError,
    reset,
    data,
    isLoading,
    status,
    error,
  };
}
