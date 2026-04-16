import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BACKEND_PORT, resolveBackendPort } from './backend-port';

test('resolveBackendPort prefers BACKEND_PORT when it is valid', () => {
  const resolvedPort = resolveBackendPort({
    BACKEND_PORT: '4010',
    PORT: '3001',
  });

  assert.deepEqual(resolvedPort, {
    port: 4010,
    source: 'BACKEND_PORT',
    invalidSources: [],
  });
});

test('resolveBackendPort falls back to PORT when BACKEND_PORT is invalid', () => {
  const resolvedPort = resolveBackendPort({
    BACKEND_PORT: 'NaN',
    PORT: '4020',
  });

  assert.deepEqual(resolvedPort, {
    port: 4020,
    source: 'PORT',
    invalidSources: [
      {
        name: 'BACKEND_PORT',
        value: 'NaN',
      },
    ],
  });
});

test('resolveBackendPort falls back to the default port when no env value is usable', () => {
  const resolvedPort = resolveBackendPort({
    BACKEND_PORT: '',
    PORT: '99999',
  });

  assert.deepEqual(resolvedPort, {
    port: DEFAULT_BACKEND_PORT,
    source: 'default',
    invalidSources: [
      {
        name: 'BACKEND_PORT',
        value: '',
      },
      {
        name: 'PORT',
        value: '99999',
      },
    ],
  });
});
