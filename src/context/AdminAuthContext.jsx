import React, {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  login as svcLogin,
  logout as svcLogout,
  fetchMe,
  updateMe as svcUpdateMe,
} from '../services/adminAuthService.js';
import { getAdmin, getToken, clearSession, onSessionCleared } from '../services/session.js';
import { isAdminSessionTerminated } from '../services/apiClient.js';

/**
 * AdminAuthContext
 * ──────────────────────────────────────────────────────────────────────────
 * The admin console's ONLY auth provider. It exposes the same surface the
 * migrated components already expect (`useAuth()` → user / isAdmin / login /
 * logout / refresh), but everything is backed by the dedicated admin auth flow
 * and the admin-namespaced token store.
 */

const AdminAuthContext = createContext(null);

const ADMIN_ROLES = ['support_agent', 'moderator', 'super_admin'];
const isAdminRole = (role) => ADMIN_ROLES.includes(role);

export const AdminAuthProvider = ({ children }) => {
  // Seed from the cached admin so a returning user doesn't flash the login
  // screen while /me is validating.
  const [user, setUser] = useState(() => getAdmin());
  // `booting` guards the first token validation so RequireAdmin can show a
  // spinner instead of bouncing a valid session to /login on a hard refresh.
  const [booting, setBooting] = useState(() => !!getToken());

  // On boot, validate the stored token against the server.
  //
  // This used to drop the admin to logged-out on ANY rejection, so a network
  // blip or a single 5xx bounced a perfectly valid session to /login. The
  // apiClient has already tried to refresh the access token by the time a
  // rejection lands here, so the only thing that ends the session now is the
  // server positively saying it is over.
  useEffect(() => {
    if (!getToken()) { setBooting(false); return undefined; }

    let cancelled = false;
    let retryTimer = null;
    let attempt = 0;

    const validate = () => {
      // apiClient may have ended the session out from under us (a terminal 403
      // on a parallel request). Without this the backoff loop would keep
      // probing /me with no token, logging 401s that mean nothing.
      if (!getToken()) { setBooting(false); return; }

      fetchMe()
        .then((admin) => {
          if (cancelled) return;
          setUser(admin);
          setBooting(false);
        })
        .catch((err) => {
          if (cancelled) return;

          if (err?.status === 401 && isAdminSessionTerminated()) {
            clearSession({ silent: true, reason: 'session_expired' });
            setUser(null);
            setBooting(false);
            return;
          }

          // A 403 here means the account still authenticates but has lost admin
          // access. apiClient has already cleared the session, so just reflect
          // it — no retry, the answer will not change.
          if (err?.status === 403) {
            setUser(null);
            setBooting(false);
            return;
          }

          // Transient. Keep the cached admin on screen and retry with backoff.
          setBooting(false);
          attempt += 1;
          if (attempt <= 5) {
            const delay = Math.min(30_000, 2_000 * (2 ** (attempt - 1)));
            retryTimer = window.setTimeout(validate, delay);
          }
        });
    };

    validate();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  // If any API call ends the session (role revoked, account banned, or a 401
  // whose refresh came back terminal), reflect it here so RequireAdmin
  // redirects to /login.
  //
  // This listener existed before but was dead: clearSession() was only ever
  // called with { silent: true }, so the event it keys on was never dispatched
  // and a revoked admin kept the console until they reloaded. apiClient fires
  // it now. `booting` is cleared too — otherwise a session that dies during the
  // boot probe leaves the guard spinning forever.
  useEffect(() => onSessionCleared(() => {
    setUser(null);
    setBooting(false);
  }), []);

  const value = useMemo(() => {
    const roles = Array.isArray(user?.roles) && user.roles.length
      ? user.roles
      : (user?.role ? [user.role] : []);

    return {
      user,
      booting,
      isAuthenticated: !!user,
      isAdmin: !!user && roles.some(isAdminRole),
      roles,
      activeRole: user?.role || roles[0] || null,
      hasRole: (r) => roles.includes(r),

      login: async ({ phone, password, tempToken, token, is2FAVerification }) => {
        const result = await svcLogin({ phone, password, tempToken, token, is2FAVerification });
        
        // If 2FA is required, return the response without setting user
        if (result?.requires2FA && result?.tempToken) {
          return result;
        }
        
        // Normal login or successful 2FA verification
        setUser(result);
        return result;
      },

      logout: async () => {
        await svcLogout();
        setUser(null);
      },

      refresh: async () => {
        const admin = await fetchMe();
        setUser(admin);
        return admin;
      },

      updateProfile: async (patch) => {
        const admin = await svcUpdateMe(patch);
        setUser(admin);
        return admin;
      },
    };
  }, [user, booting]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AdminAuthProvider>');
  return ctx;
};

// Alias for call sites that prefer the explicit name.
export const useAdminAuth = useAuth;
