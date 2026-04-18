import assert from 'node:assert/strict';
import test from 'node:test';

test('ShoplineSessionAccessTokenProvider prefers the most durable usable session for a shop', async () => {
  process.env.SHOPLINE_APP_KEY = 'test-key';
  process.env.SHOPLINE_APP_SECRET = 'test-secret';
  process.env.SHOPLINE_APP_URL = 'https://example.test';
  process.env.SCOPES = 'read_products';

  const [{ ShoplineSessionAccessTokenProvider }, { default: shopline }] = await Promise.all([
    import('./shop-admin-access-token'),
    import('../shopline'),
  ]);

  const originalSessionStorage = shopline.config.sessionStorage;
  const now = Date.now();

  shopline.config.sessionStorage = {
    findSessionsByHandle: async () =>
      [
        {
          id: 'online-soon',
          accessToken: 'token-soon',
          isOnline: true,
          expires: new Date(now + 60_000),
        },
        {
          id: 'online-later',
          accessToken: 'token-later',
          isOnline: true,
          expires: new Date(now + 3_600_000),
        },
      ] as any,
  } as any;

  try {
    const provider = new ShoplineSessionAccessTokenProvider();
    const accessToken = await provider.getAccessToken('blind-box');

    assert.equal(accessToken, 'token-later');
  } finally {
    shopline.config.sessionStorage = originalSessionStorage;
  }
});
