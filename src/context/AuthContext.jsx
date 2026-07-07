import { createContext, useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { emitNetworkBytecodeError } from "../lib/bytecode-error.adapter.js";
import { buildAuthorityUrl } from "../lib/apiUrl.js";
import { clearCsrfToken, getCsrfToken } from "../lib/csrf.js";

const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
}).passthrough();

export const AuthContext = createContext(null);
const AUTH_SESSION_HINT_KEY = "scholomance.auth.session.v1";

function getAuthEndpoint(path) {
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return buildAuthorityUrl(`/auth/${normalizedPath}`);
}

function setSessionHint(isAuthenticated) {
  if (typeof window === "undefined") return;
  try {
    if (isAuthenticated) {
      window.localStorage.setItem(AUTH_SESSION_HINT_KEY, "1");
    } else {
      window.localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    }
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.).
  }
}

function hasSessionHint() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTH_SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfTokenState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCsrf = useCallback(async () => {
    const token = await getCsrfToken(true);
    setCsrfTokenState(token);
    return token;
  }, []);

  const checkMe = useCallback(async (options = {}) => {
    const force = Boolean(options?.force);
    if (!force && !hasSessionHint()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(getAuthEndpoint("me"), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const parsed = UserSchema.safeParse(data.user);
        if (parsed.success) {
          setUser(parsed.data);
          setSessionHint(true);
        } else {
          console.error("Invalid user data from /auth/me", parsed.error);
          setUser(null);
          setSessionHint(false);
        }
      } else {
        setUser(null);
        if (res.status === 401 || res.status === 403) {
          setSessionHint(false);
        }
      }
    } catch (e) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      try {
        // 1. Fetch CSRF first to ensure session is initialized on the server
        await getCsrfToken();
        if (!mounted) return;

        // 2. Small delay to allow cookie to be processed by browser
        await new Promise(resolve => setTimeout(resolve, 50));
        if (!mounted) return;

        // 3. Check authenticated state only when the client has evidence of a
        // prior login. Anonymous production visits should not emit a handled
        // but noisy 401 from /auth/me on every page load.
        await checkMe();
      } catch (e) {
        if (mounted) {
          const bytecode = emitNetworkBytecodeError('/auth/csrf-token', 0, { error: e.message });
          console.error("Auth initialization failed:", bytecode);
          setIsLoading(false);
        }
      }
    };
    initAuth();
    return () => { mounted = false; };
  }, [checkMe]);

  const login = async (username, password) => {
    try {
      const token = await getCsrfToken();
      const res = await fetch(getAuthEndpoint("login"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        setSessionHint(true);
        await checkMe({ force: true });
        return { success: true };
      } else {
        if (res.status === 403) clearCsrfToken();
        const err = await res.json().catch(() => ({}));
        return { success: false, message: err.message || 'Login failed' };
      }
    } catch (e) {
      return { 
        success: false, 
        message: 'Connection error',
        bytecode: emitNetworkBytecodeError('/auth/login', 0, { error: e.message })
      };
    }
  };

  const register = async (username, email, password, captchaId, captchaAnswer) => {
    try {
      const token = await getCsrfToken();
      const res = await fetch(getAuthEndpoint("register"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token
        },
        credentials: 'include',
        body: JSON.stringify({ username, email, password, captchaId, captchaAnswer })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return { success: true, ...data };
      } else {
        if (res.status === 403) clearCsrfToken();
        return { success: false, message: data.message || 'Registration failed' };
      }
    } catch (e) {
      return { 
        success: false, 
        message: 'Connection error',
        bytecode: emitNetworkBytecodeError('/auth/register', 0, { error: e.message })
      };
    }
  };

  const logout = async () => {
    try {
      const token = await getCsrfToken();
      await fetch(getAuthEndpoint("logout"), {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        credentials: 'include'
      });
    } catch (e) {
      console.error("Logout request failed", e);
    } finally {
      clearCsrfToken();
      setSessionHint(false);
      setUser(null);
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      register, 
      logout, 
      checkMe, 
      csrfToken, 
      getCsrfToken, 
      clearCsrfToken 
    }}>
      {children}
    </AuthContext.Provider>
  );
}
