import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { DashboardPage } from './pages/DashboardPage';
import { BlindBoxesPage } from './pages/BlindBoxesPage';
import { BlindBoxDetailPage } from './pages/BlindBoxDetailPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { initAppBridge } from './lib/api';

// ── App Bridge initializer ────────────────────────────────────────────────────
// Must run once at the top of the React tree before any API calls are made.
function AppBridgeInit() {
  useEffect(() => {
    // The SHOPLINE Admin passes ?host=<base64> and ?shop=<handle> when loading
    // the embedded iframe. The app key is the public SHOPLINE_APP_KEY.
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host') ?? '';
    const appKey =
      (import.meta.env.VITE_SHOPLINE_APP_KEY as string | undefined) ?? '';

    if (!appKey || !host) {
      // Running standalone (dev / direct browser access) — skip App Bridge.
      // Signal immediately so API calls don't wait for the 1.5s fallback timeout.
      initAppBridge(null);
      return;
    }

    // @shoplinedev/appbridge v1 — the config field is `appKey`, NOT `apiKey`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import('@shoplinedev/appbridge').then((mod: any) => {
      // The default export is the Client namespace; createApp lives on it.
      const Client = mod.default ?? mod;
      const createApp = Client?.createApp ?? mod.createApp;
      if (typeof createApp !== 'function') {
        initAppBridge(null);
        return;
      }

      const app = createApp({ appKey, host });
      // Expose getSessionToken so the API client can attach Bearer tokens.
      const getToken = mod.shareUtil?.getSessionToken
        ? () => mod.shareUtil.getSessionToken(app) as Promise<string>
        : null;

      initAppBridge(getToken);
    }).catch(() => {
      // App Bridge unavailable — signal so API calls don't wait.
      initAppBridge(null);
    });
  }, []);

  return null;
}

// ── Root component ────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppBridgeInit />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/blind-boxes" element={<BlindBoxesPage />} />
          <Route path="/blind-boxes/:id" element={<BlindBoxDetailPage />} />
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
