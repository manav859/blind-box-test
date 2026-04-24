import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    const hostParam = params.get('host') ?? '';
    const appKey =
      (import.meta.env.VITE_SHOPLINE_APP_KEY as string | undefined) ?? '';

    if (!appKey || !hostParam) {
      // Running standalone (dev / direct browser access) — skip App Bridge.
      // Signal immediately so API calls don't wait for the 1.5s fallback timeout.
      initAppBridge(null);
      return;
    }

    // SHOPLINE Admin sends ?host= as base64 (e.g. base64 of "testlive.myshopline.com/admin").
    // messageTransport.js feeds config.host directly into new URL('https://' + host).origin,
    // which breaks with raw base64 input → "Invalid Action Type". Decode to a plain hostname.
    let host = '';
    try {
      host = new URL('https://' + atob(hostParam)).hostname;
    } catch {
      // Not valid base64 / not a URL — omit host and let the library fall back
      // to document.referrer, which is correct inside the embedded iframe.
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

      // Pass decoded hostname only; omit if decoding failed so the library
      // uses document.referrer (which is the admin origin inside an iframe).
      const appConfig = host ? { appKey, host } : { appKey };
      const app = createApp(appConfig);
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
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/blind-boxes" element={<BlindBoxesPage />} />
            <Route path="/blind-boxes/:id" element={<BlindBoxDetailPage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  );
}
