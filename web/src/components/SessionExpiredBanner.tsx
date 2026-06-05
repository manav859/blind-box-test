import React from 'react';

interface Props {
  authUrl?: string;
}

// Rendered when an API call throws SessionExpiredError. The api.ts layer
// already attempts an auto-redirect — this banner is the visible fallback for
// the (rare) case where top-frame navigation is blocked or authUrl is missing.
export function SessionExpiredBanner({ authUrl }: Props) {
  function reauthenticate() {
    if (!authUrl) {
      // No URL available — best we can do is force a reload of the iframe so
      // the SHOPLINE Admin re-issues the install/auth flow on next mount.
      window.location.reload();
      return;
    }
    try {
      (window.top ?? window).location.href = authUrl;
    } catch {
      window.location.href = authUrl;
    }
  }

  return (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <p style={{ marginBottom: '1rem' }}>Your session has expired.</p>
      <button className="btn btn-primary" onClick={reauthenticate}>
        Re-authenticate
      </button>
    </div>
  );
}
