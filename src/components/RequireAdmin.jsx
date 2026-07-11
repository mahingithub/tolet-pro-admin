import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AdminAuthContext.jsx';
import LoadingState from './common/LoadingState.jsx';

/**
 * Route guard for the whole admin shell.
 *   - While the stored token is being validated on boot → show a spinner
 *     (so a valid session doesn't flash the login screen on refresh).
 *   - Not an admin → bounce to /login carrying a `next` param.
 *   - Otherwise render the protected tree.
 *
 * This is defense-in-depth on the client; the backend independently enforces
 * admin access on every /api/admin request via requireAdminAuth.
 */
const RequireAdmin = ({ children }) => {
  const { isAdmin, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <LoadingState label="Verifying session" />
      </div>
    );
  }

  if (!isAdmin) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
};

export default RequireAdmin;
