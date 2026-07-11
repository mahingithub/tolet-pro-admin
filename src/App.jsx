import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';

import { AdminAuthProvider } from './context/AdminAuthContext.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import AdminLayout from './components/AdminLayout.jsx';

import LoginPage from './pages/LoginPage.jsx';
import Overview from './pages/Overview.jsx';
import PropertyModeration from './pages/PropertyModeration.jsx';
import UserManagement from './pages/UserManagement.jsx';
import Reports from './pages/Reports.jsx';
import SupportAndAI from './pages/SupportAndAI.jsx';
import AdminTeam from './pages/AdminTeam.jsx';
import AccountSettings from './pages/AccountSettings.jsx';

/**
 * The admin console is served at the ROOT of its own subdomain
 * (e.g. https://admin.tolet-pro.com/), so routes are top-level — no `/admin`
 * prefix. Everything except `/login` is behind the RequireAdmin gate.
 */
function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: dedicated admin login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected admin shell + nested pages */}
          <Route
            path="/"
            element={(
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            )}
          >
            <Route index element={<Overview />} />
            <Route path="properties" element={<PropertyModeration />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="reports" element={<Reports />} />
            <Route path="support" element={<SupportAndAI />} />
            <Route path="team" element={<AdminTeam />} />
            <Route path="account" element={<AccountSettings />} />
          </Route>

          {/* Unknown paths → home (which itself gates to /login if needed) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AdminAuthProvider>
  );
}

export default App;
