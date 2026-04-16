import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveShoplineAppConfig } from './shopline-app-config';

const SHOPLINE_ENV_KEYS = [
  'SHOPLINE_APP_KEY',
  'SHOPLINE_APP_SECRET',
  'SHOPLINE_APP_URL',
  'SCOPES',
] as const;

function snapshotShoplineEnv(): Record<(typeof SHOPLINE_ENV_KEYS)[number], string | undefined> {
  return SHOPLINE_ENV_KEYS.reduce(
    (snapshot, key) => {
      snapshot[key] = process.env[key];
      return snapshot;
    },
    {} as Record<(typeof SHOPLINE_ENV_KEYS)[number], string | undefined>,
  );
}

function clearShoplineEnv(): void {
  for (const key of SHOPLINE_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreShoplineEnv(
  snapshot: Record<(typeof SHOPLINE_ENV_KEYS)[number], string | undefined>,
): void {
  for (const key of SHOPLINE_ENV_KEYS) {
    const value = snapshot[key];
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

test('resolveShoplineAppConfig merges linked and primary TOML values for direct workspace runs', () => {
  const previousCwd = process.cwd();
  const envSnapshot = snapshotShoplineEnv();
  const tempDir = mkdtempSync(join(tmpdir(), 'shopline-app-config-'));
  const appDir = join(tempDir, 'app');

  mkdirSync(appDir);

  writeFileSync(
    join(tempDir, 'shopline.app.toml'),
    [
      'appName = "blindbox-test-01"',
      'appKey = "primary-key"',
      'appUrl = "primary.example.com"',
      'appSecret = "primary-secret"',
      '',
      '[access_scopes]',
      'scopes = "write_products"',
      '',
    ].join('\n'),
  );

  writeFileSync(
    join(tempDir, 'shopline.app.blindbox-test-01.toml'),
    [
      'appName = "blindbox-test-01"',
      'appKey = "linked-key"',
      'appUrl = "https://linked.example.com"',
      '',
      '[access_scopes]',
      'scopes = "read_products,read_inventory"',
      '',
    ].join('\n'),
  );

  clearShoplineEnv();
  process.chdir(appDir);

  try {
    assert.deepEqual(resolveShoplineAppConfig(), {
      appKey: 'linked-key',
      appSecret: 'primary-secret',
      appUrl: 'https://linked.example.com',
      scopes: ['read_products', 'read_inventory'],
    });
  } finally {
    process.chdir(previousCwd);
    restoreShoplineEnv(envSnapshot);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveShoplineAppConfig normalizes protocol-less TOML app URLs', () => {
  const previousCwd = process.cwd();
  const envSnapshot = snapshotShoplineEnv();
  const tempDir = mkdtempSync(join(tmpdir(), 'shopline-app-config-'));

  writeFileSync(
    join(tempDir, 'shopline.app.toml'),
    [
      'appName = "blindbox-test-01"',
      'appKey = "primary-key"',
      'appUrl = "protocol-less.example.com"',
      'appSecret = "primary-secret"',
      '',
      '[access_scopes]',
      'scopes = "write_products"',
      '',
    ].join('\n'),
  );

  clearShoplineEnv();
  process.chdir(tempDir);

  try {
    const config = resolveShoplineAppConfig();

    assert.equal(config.appUrl, 'https://protocol-less.example.com');
    assert.equal(config.appSecret, 'primary-secret');
  } finally {
    process.chdir(previousCwd);
    restoreShoplineEnv(envSnapshot);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
