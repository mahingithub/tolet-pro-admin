import React, {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  login as svcLogin,
  logout as svcLogout,
  fetchMe,
  updateMe as svcUpdateMe,
} from '../services/adminAuthService.js';
import { getAdmin, getToken, onSessionCleared } from '../services/session.js';

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

  // On boot, validate the stored token against the server. If it's dead, the
  // apiClient clears the session and we fall back to logged-out.
  useEffect(() => {
    if (!getToken()) { setBooting(false); return undefined; }
    let cancelled = false;
    fetchMe()
      .then((admin) => { if (!cancelled) setUser(admin); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setBooting(false); });
    return () => { cancelled = true; };
  }, []);

  // If any API call nukes the session (e.g. a 401 mid-use), reflect it here so
  // the guard redirects to /login.
  useEffect(() => onSessionCleared(() => setUser(null)), []);

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

      login: async ({ phone, password }) => {
        const admin = await svcLogin({ phone, password });
        setUser(admin);
        return admin;
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
