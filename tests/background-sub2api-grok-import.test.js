const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadSub2ApiApiModule() {
  const source = fs.readFileSync('background/sub2api-api.js', 'utf8');
  return new Function('self', `${source}; return self.MultiPageBackgroundSub2ApiApi;`)({});
}

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function createImportState(overrides = {}) {
  return {
    sub2apiUrl: 'https://sub.example.com/admin/accounts',
    sub2apiEmail: 'owner@example.com',
    sub2apiPassword: 'admin-password-secret',
    sub2apiGroupName: 'grok-default',
    sub2apiGroupNames: ['grok-default'],
    sub2apiAccountPriority: 4,
    sub2apiDefaultProxyName: 'grok-egress',
    grokEmail: 'stale-flat@example.com',
    email: 'generic-fallback@example.com',
    grokSsoCookie: 'stale-flat-sso',
    runtimeState: {
      flowState: {
        grok: {
          register: {
            email: 'Round.Owner+Grok@Example.COM',
          },
          sso: {
            currentCookie: 'canonical-grok-sso-secret',
          },
        },
      },
    },
    ...overrides,
  };
}

test('sub2api api imports Grok SSO with platform groups, proxy, registered email name, and fixed payload', async () => {
  const apiModule = loadSub2ApiApiModule();
  const fetchCalls = [];
  const timeoutDelays = [];
  const logs = [];
  const api = apiModule.createSub2ApiApi({
    addLog: async (message, level) => logs.push({ message, level }),
    normalizeSub2ApiUrl: (value) => value,
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      const body = options.body ? JSON.parse(options.body) : null;
      fetchCalls.push({
        url,
        path: parsed.pathname,
        search: parsed.search,
        method: options.method || 'GET',
        authorization: options.headers?.Authorization || '',
        body,
      });

      if (parsed.pathname === '/api/v1/auth/login') {
        return createJsonResponse({ code: 0, data: { access_token: 'admin-jwt-secret' } });
      }
      if (parsed.pathname === '/api/v1/admin/groups/all') {
        return createJsonResponse({
          code: 0,
          data: [
            { id: 10, name: 'grok-default', platform: 'openai' },
            { id: 11, name: 'grok-default', platform: 'grok' },
          ],
        });
      }
      if (parsed.pathname === '/api/v1/admin/proxies/all') {
        return createJsonResponse({
          code: 0,
          data: [
            { id: 7, name: 'grok-egress', protocol: 'http', host: '127.0.0.1', port: 7890, status: 'active' },
          ],
        });
      }
      if (parsed.pathname === '/api/v1/admin/grok/sso-to-oauth') {
        return createJsonResponse({
          code: 0,
          data: {
            created: [{ index: 1, name: 'Round.Owner+Grok@Example.COM', account: { id: 99 } }],
            failed: [],
          },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    },
    setTimeoutImpl: (_callback, delay) => {
      timeoutDelays.push(delay);
      return { delay };
    },
    clearTimeoutImpl: () => {},
  });

  assert.equal(typeof api.importGrokSso, 'function');
  const result = await api.importGrokSso(createImportState());

  assert.deepEqual(fetchCalls.map(({ path, search, method }) => ({ path, search, method })), [
    { path: '/api/v1/auth/login', search: '', method: 'POST' },
    { path: '/api/v1/admin/groups/all', search: '?platform=grok', method: 'GET' },
    { path: '/api/v1/admin/proxies/all', search: '?with_count=true', method: 'GET' },
    { path: '/api/v1/admin/grok/sso-to-oauth', search: '', method: 'POST' },
  ]);
  assert.equal(fetchCalls[1].authorization, 'Bearer admin-jwt-secret');
  assert.deepEqual(fetchCalls[3].body, {
    sso_tokens: ['canonical-grok-sso-secret'],
    name: 'Round.Owner+Grok@Example.COM',
    proxy_id: 7,
    group_ids: [11],
    concurrency: 10,
    priority: 4,
    rate_multiplier: 1,
    auto_pause_on_expired: true,
  });
  assert.ok(timeoutDelays.includes(180000));
  assert.equal(result.created.length, 1);
  assert.equal(result.failed.length, 0);
  assert.equal(result.targetUrl, 'https://sub.example.com/api/v1/admin/grok/sso-to-oauth');
  assert.equal(
    logs.some(({ message }) => message.includes('canonical-grok-sso-secret') || message.includes('admin-password-secret') || message.includes('admin-jwt-secret')),
    false
  );
});

test('sub2api api rejects a partial Grok import and preserves every server failure detail', async () => {
  const apiModule = loadSub2ApiApiModule();
  const api = apiModule.createSub2ApiApi({
    normalizeSub2ApiUrl: (value) => value,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/v1/auth/login') {
        return createJsonResponse({ code: 0, data: { access_token: 'admin-token' } });
      }
      if (parsed.pathname === '/api/v1/admin/groups/all') {
        return createJsonResponse({ code: 0, data: [{ id: 11, name: 'grok-default', platform: 'grok' }] });
      }
      if (parsed.pathname === '/api/v1/admin/grok/sso-to-oauth') {
        return createJsonResponse({
          code: 0,
          data: {
            created: [{ index: 1, name: 'round@example.com', account: { id: 99 } }],
            failed: [
              { index: 2, error: 'invalid sso grant from xAI' },
              { index: 3, error: 'account already exists in target group' },
            ],
          },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  const state = createImportState({
    sub2apiDefaultProxyName: '',
    runtimeState: {
      flowState: {
        grok: {
          register: { email: 'round@example.com' },
          sso: { currentCookie: 'grok-sso' },
        },
      },
    },
  });

  await assert.rejects(
    () => api.importGrokSso(state),
    (error) => {
      assert.match(error.message, /invalid sso grant from xAI/);
      assert.match(error.message, /account already exists in target group/);
      return true;
    }
  );
});

test('sub2api api falls back to grokEmail before generic email for the account name', async () => {
  const apiModule = loadSub2ApiApiModule();
  let importPayload = null;
  const api = apiModule.createSub2ApiApi({
    normalizeSub2ApiUrl: (value) => value,
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/v1/auth/login') {
        return createJsonResponse({ code: 0, data: { access_token: 'admin-token' } });
      }
      if (parsed.pathname === '/api/v1/admin/groups/all') {
        return createJsonResponse({ code: 0, data: [{ id: 11, name: 'grok-default', platform: 'grok' }] });
      }
      if (parsed.pathname === '/api/v1/admin/grok/sso-to-oauth') {
        importPayload = JSON.parse(options.body);
        return createJsonResponse({
          code: 0,
          data: { created: [{ index: 1, account: { id: 100 } }], failed: [] },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  await api.importGrokSso(createImportState({
    sub2apiDefaultProxyName: '',
    runtimeState: {},
    grokEmail: 'flat-grok@example.com',
    email: 'generic@example.com',
    grokSsoCookie: 'flat-grok-sso',
  }));

  assert.equal(importPayload.name, 'flat-grok@example.com');

  await api.importGrokSso(createImportState({
    sub2apiDefaultProxyName: '',
    runtimeState: {},
    grokEmail: '',
    email: 'generic@example.com',
    grokSsoCookie: 'flat-grok-sso',
  }));

  assert.equal(importPayload.name, 'generic@example.com');
});

test('sub2api api refuses Grok import before any request when registration email or SSO is missing', async () => {
  const apiModule = loadSub2ApiApiModule();
  let fetchCount = 0;
  const api = apiModule.createSub2ApiApi({
    normalizeSub2ApiUrl: (value) => value,
    fetchImpl: async () => {
      fetchCount += 1;
      return createJsonResponse({});
    },
  });

  await assert.rejects(
    () => api.importGrokSso(createImportState({
      runtimeState: {
        flowState: {
          grok: {
            register: { email: '' },
            sso: { currentCookie: 'grok-sso' },
          },
        },
      },
      grokEmail: '',
      email: '',
    })),
    /缺少本轮 Grok 注册邮箱/
  );
  await assert.rejects(
    () => api.importGrokSso(createImportState({
      runtimeState: {
        flowState: {
          grok: {
            register: { email: 'round@example.com' },
            sso: { currentCookie: '' },
          },
        },
      },
      grokSsoCookie: '',
    })),
    /缺少 Grok SSO Cookie/
  );
  assert.equal(fetchCount, 0);
});

test('sub2api api refuses Grok import before any request when no group is configured', async () => {
  const apiModule = loadSub2ApiApiModule();
  let fetchCount = 0;
  const api = apiModule.createSub2ApiApi({
    normalizeSub2ApiUrl: (value) => value,
    fetchImpl: async () => {
      fetchCount += 1;
      return createJsonResponse({});
    },
  });

  await assert.rejects(
    () => api.importGrokSso(createImportState({
      sub2apiGroupName: '',
      sub2apiGroupNames: [],
    })),
    /请先添加 Grok SUB2API 分组/
  );
  assert.equal(fetchCount, 0);
});
