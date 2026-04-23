import React from 'react';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', padding: '.875rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid rgba(239,68,68,.2)', margin: '2rem' }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '.25rem' }}>Unexpected error</div>
            <div style={{ fontSize: '.875rem' }}>{this.state.error.message}</div>
          </div>
          <button
            style={{ padding: '.375rem .75rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,.3)', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: '.8rem', flexShrink: 0 }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
