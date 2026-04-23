import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { DashboardPage } from './pages/DashboardPage';
import { BlindBoxesPage } from './pages/BlindBoxesPage';
import { BlindBoxDetailPage } from './pages/BlindBoxDetailPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { SettingsPage } from './pages/SettingsPage';

function AppBridgeInit() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const apiKey = (window as unknown as { SHOPLINE_API_KEY?: string }).SHOPLINE_API_KEY
        ?? params.get('apiKey')
        ?? '';
      const host = params.get('host') ?? '';

      if (!apiKey || !host) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      import('@shoplinedev/appbridge').then((mod: any) => {
        const createApp = mod.default ?? mod.createApp ?? mod;
        if (typeof createApp === 'function') {
          createApp({ apiKey, host });
        }
      }).catch(() => { /* not critical */ });
    } catch { /* standalone dev mode */ }
  }, []);

  return null;
}

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
