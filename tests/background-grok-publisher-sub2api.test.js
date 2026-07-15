const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadPublisherApi() {
  const publisherPath = 'flows/grok/background/publisher-sub2api.js';
  if (!fs.existsSync(publisherPath)) {
    return null;
  }
  const stateSource = fs.readFileSync('flows/grok/background/state.js', 'utf8');
  const publisherSource = fs.readFileSync(publisherPath, 'utf8');
  const globalScope = {};
  new Function('self', `${stateSource}; ${publisherSource}; return self;`)(globalScope);
  return globalScope.MultiPageBackgroundGrokPublisherSub2Api;
}

function mergeState(currentState = {}, updates = {}) {
  return {
    ...currentState,
    ...updates,
    runtimeState: {
      ...(currentState.runtimeState || {}),
      ...(updates.runtimeState || {}),
      flowState: {
        ...(currentState.runtimeState?.flowState || {}),
        ...(updates.runtimeState?.flowState || {}),
      },
    },
  };
}

function getGrokRuntime(state = {}) {
  return state?.runtimeState?.flowState?.grok || {};
}

function createLiveState(overrides = {}) {
  return {
    sub2apiUrl: 'https://stale-sub.example.com',
    sub2apiEmail: 'stale-owner@example.com',
    sub2apiPassword: 'stale-password',
    grokSub2apiGroupName: 'stale-group',
    grokSsoCookie: 'stale-sso',
    grokEmail: 'stale-register@example.com',
    settingsState: {
      flows: {
        grok: {
          targetId: 'sub2api',
          targets: {
            sub2api: {
              sub2apiUrl: 'https://sub.example.com/admin/accounts',
              sub2apiEmail: 'live-owner@example.com',
              sub2apiPassword: 'live-password-secret',
              sub2apiGroupName: 'grok-pool',
              sub2apiGroupNames: ['grok-default', 'grok-pool'],
              sub2apiAccountPriority: 5,
              sub2apiDefaultProxyName: 'grok-egress',
            },
          },
        },
      },
    },
    runtimeState: {
      flowState: {
        grok: {
          register: {
            email: 'round-owner@example.com',
          },
          sso: {
            currentCookie: 'live-canonical-sso-secret',
          },
        },
      },
    },
    ...overrides,
  };
}

test('grok sub2api publisher module exposes its factory', () => {
  const api = loadPublisherApi();
  assert.equal(typeof api?.createGrokSub2ApiPublisher, 'function');
});

test('grok sub2api publisher reads latest canonical state and completes with imported status', async () => {
  const api = loadPublisherApi();
  assert.equal(typeof api?.createGrokSub2ApiPublisher, 'function');

  const importCalls = [];
  const logs = [];
  const completed = [];
  const stateWrites = [];
  let liveState = createLiveState();
  const publisher = api.createGrokSub2ApiPublisher({
    addLog: async (message, level) => logs.push({ message, level }),
    completeNodeFromBackground: async (nodeId, payload) => completed.push({ nodeId, payload }),
    createSub2ApiApi: () => ({
      importGrokSso: async (state, options) => {
        importCalls.push({ state, options });
        return {
          created: [{ index: 1, account: { id: 91 } }],
          failed: [],
          targetUrl: 'https://sub.example.com/api/v1/admin/grok/sso-to-oauth',
          verifiedStatus: 'SUB2API 已导入 1 个 Grok OAuth 账号。',
        };
      },
    }),
    getState: async () => liveState,
    setState: async (updates) => {
      stateWrites.push(updates);
      liveState = mergeState(liveState, updates);
    },
  });

  await publisher.executeGrokImportSsoToSub2Api({
    nodeId: 'grok-import-sso-to-sub2api',
    sub2apiPassword: 'stale-executor-password',
    grokSsoCookie: 'stale-executor-sso',
  });

  assert.equal(importCalls.length, 1);
  assert.equal(importCalls[0].state.sub2apiUrl, 'https://sub.example.com/admin/accounts');
  assert.equal(importCalls[0].state.sub2apiEmail, 'live-owner@example.com');
  assert.equal(importCalls[0].state.sub2apiPassword, 'live-password-secret');
  assert.equal(importCalls[0].state.sub2apiGroupName, 'grok-pool');
  assert.deepEqual(importCalls[0].state.sub2apiGroupNames, ['grok-default', 'grok-pool']);
  assert.equal(importCalls[0].state.sub2apiAccountPriority, 5);
  assert.equal(importCalls[0].state.sub2apiDefaultProxyName, 'grok-egress');
  assert.equal(importCalls[0].state.runtimeState.flowState.grok.register.email, 'round-owner@example.com');
  assert.equal(importCalls[0].state.runtimeState.flowState.grok.sso.currentCookie, 'live-canonical-sso-secret');
  assert.deepEqual(stateWrites.map((write) => getGrokRuntime(write).upload.status), ['uploading', 'uploaded']);
  assert.deepEqual(stateWrites.map((write) => getGrokRuntime(write).upload.targetId), ['sub2api', 'sub2api']);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].nodeId, 'grok-import-sso-to-sub2api');
  assert.equal(getGrokRuntime(completed[0].payload).upload.status, 'uploaded');
  assert.equal(getGrokRuntime(completed[0].payload).upload.targetId, 'sub2api');
  assert.equal(getGrokRuntime(completed[0].payload).upload.message, 'SUB2API 已导入 1 个 Grok OAuth 账号。');
  assert.equal(getGrokRuntime(completed[0].payload).upload.targetUrl, 'https://sub.example.com/api/v1/admin/grok/sso-to-oauth');
  assert.equal(
    logs.some(({ message }) => message.includes('live-canonical-sso-secret') || message.includes('live-password-secret')),
    false
  );
});

test('grok sub2api publisher rejects missing canonical email or SSO before invoking the API', async () => {
  const api = loadPublisherApi();
  assert.equal(typeof api?.createGrokSub2ApiPublisher, 'function');

  let importCount = 0;
  let liveState = createLiveState();
  const publisher = api.createGrokSub2ApiPublisher({
    addLog: async () => {},
    completeNodeFromBackground: async () => {},
    createSub2ApiApi: () => ({
      importGrokSso: async () => {
        importCount += 1;
        return {};
      },
    }),
    getState: async () => liveState,
    setState: async (updates) => {
      liveState = mergeState(liveState, updates);
    },
  });

  liveState = createLiveState({
    grokEmail: '',
    email: '',
    runtimeState: {
      flowState: {
        grok: {
          register: { email: '' },
          sso: { currentCookie: 'live-sso' },
        },
      },
    },
  });
  await assert.rejects(
    () => publisher.executeGrokImportSsoToSub2Api({ nodeId: 'grok-import-sso-to-sub2api' }),
    /缺少本轮 Grok 注册邮箱/
  );

  liveState = createLiveState({
    grokSsoCookie: '',
    runtimeState: {
      flowState: {
        grok: {
          register: { email: 'round-owner@example.com' },
          sso: { currentCookie: '' },
        },
      },
    },
  });
  await assert.rejects(
    () => publisher.executeGrokImportSsoToSub2Api({ nodeId: 'grok-import-sso-to-sub2api' }),
    /缺少 Grok SSO Cookie/
  );
  assert.equal(importCount, 0);
});

test('grok sub2api publisher persists detailed failures without completing or leaking secrets', async () => {
  const api = loadPublisherApi();
  assert.equal(typeof api?.createGrokSub2ApiPublisher, 'function');

  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
  const logs = [];
  const completed = [];
  let liveState = createLiveState();
  const publisher = api.createGrokSub2ApiPublisher({
    addLog: async (message, level) => logs.push({ message, level }),
    completeNodeFromBackground: async (nodeId, payload) => completed.push({ nodeId, payload }),
    createSub2ApiApi: () => ({
      importGrokSso: async () => {
        throw new Error(`invalid_grant: live-canonical-sso-secret / live-password-secret / ${jwt}`);
      },
    }),
    getState: async () => liveState,
    setState: async (updates) => {
      liveState = mergeState(liveState, updates);
    },
  });

  await assert.rejects(
    () => publisher.executeGrokImportSsoToSub2Api({ nodeId: 'grok-import-sso-to-sub2api' }),
    (error) => {
      assert.match(error.message, /invalid_grant/);
      assert.doesNotMatch(error.message, /live-canonical-sso-secret|live-password-secret|eyJhbGci/);
      return true;
    }
  );

  const persistedMessage = getGrokRuntime(liveState).upload.message;
  const serializedLogs = JSON.stringify(logs);
  assert.equal(completed.length, 0);
  assert.equal(getGrokRuntime(liveState).upload.status, 'error');
  assert.equal(getGrokRuntime(liveState).upload.targetId, 'sub2api');
  assert.match(persistedMessage, /invalid_grant/);
  assert.doesNotMatch(persistedMessage, /live-canonical-sso-secret|live-password-secret|eyJhbGci/);
  assert.doesNotMatch(serializedLogs, /live-canonical-sso-secret|live-password-secret|eyJhbGci/);
});
