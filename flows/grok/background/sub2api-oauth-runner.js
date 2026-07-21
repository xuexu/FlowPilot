(function attachBackgroundGrokSub2ApiOAuthRunner(root, factory) {
  root.MultiPageBackgroundGrokSub2ApiOAuthRunner = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundGrokSub2ApiOAuthRunnerModule(root) {
  const grokStateApi = root?.MultiPageBackgroundGrokState || null;
  const SOURCE_ID = 'grok-sub2api-oauth-page';
  const AUTHORIZATION_TIMEOUT_MS = 180000;
  const AUTHORIZATION_PAGE_READY_TIMEOUT_MS = 30000;
  const AUTHORIZATION_PAGE_READY_POLL_INTERVAL_MS = 500;
  const SESSION_FRESHNESS_MS = 25 * 60 * 1000;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function getErrorMessage(error) {
    return error instanceof Error ? error.message : cleanString(error) || '未知错误';
  }

  function readRuntime(state = {}) {
    return grokStateApi?.ensureRuntimeState
      ? grokStateApi.ensureRuntimeState(state)
      : (isPlainObject(state?.runtimeState?.flowState?.grok)
        ? state.runtimeState.flowState.grok
        : {});
  }

  function buildRuntimePatch(currentState = {}, patch = {}) {
    if (typeof grokStateApi?.buildRuntimeStatePatch === 'function') {
      return grokStateApi.buildRuntimeStatePatch(currentState, patch);
    }
    return {};
  }

  function readConfiguredValue(config = {}, key = '', fallback) {
    return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : fallback;
  }

  function resolveConfig(state = {}) {
    const canonical = isPlainObject(state?.settingsState?.flows?.grok?.targets?.sub2api)
      ? state.settingsState.flows.grok.targets.sub2api
      : {};
    const groupNames = readConfiguredValue(canonical, 'sub2apiGroupNames', state.grokSub2apiGroupNames);
    return {
      sub2apiUrl: cleanString(readConfiguredValue(canonical, 'sub2apiUrl', state.sub2apiUrl)),
      sub2apiEmail: cleanString(readConfiguredValue(canonical, 'sub2apiEmail', state.sub2apiEmail)),
      sub2apiPassword: String(readConfiguredValue(canonical, 'sub2apiPassword', state.sub2apiPassword) ?? ''),
      sub2apiGroupName: cleanString(readConfiguredValue(canonical, 'sub2apiGroupName', state.grokSub2apiGroupName)),
      sub2apiGroupNames: Array.isArray(groupNames)
        ? groupNames.map(cleanString).filter(Boolean)
        : [],
      sub2apiAccountPriority: Math.max(1, Math.floor(Number(
        readConfiguredValue(canonical, 'sub2apiAccountPriority', state.grokSub2apiAccountPriority)
      ) || 1)),
      sub2apiDefaultProxyName: cleanString(readConfiguredValue(
        canonical,
        'sub2apiDefaultProxyName',
        state.grokSub2apiDefaultProxyName
      )),
    };
  }

  function sanitizeSensitiveMessage(message = '', secrets = []) {
    let sanitized = cleanString(message) || '未知错误';
    Array.from(new Set(secrets.map((value) => String(value || '')).filter(Boolean)))
      .sort((left, right) => right.length - left.length)
      .forEach((secret) => {
        sanitized = sanitized.split(secret).join('[REDACTED]');
      });
    return sanitized.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
  }

  function createGrokSub2ApiOAuthRunner(deps = {}) {
    const {
      addLog = async () => {},
      chrome = typeof globalThis !== 'undefined' ? globalThis.chrome : null,
      completeNodeFromBackground,
      ensureContentScriptReadyOnTab = null,
      getState = async () => ({}),
      getTabId = async () => null,
      isTabAlive = async () => false,
      normalizeSub2ApiUrl = (value) => value,
      registerTab = async () => {},
      reuseOrCreateTab = async () => null,
      sendToContentScriptResilient,
      setState = async () => {},
      sleepWithStop = async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      throwIfStopped = () => {},
      unregisterTab = async () => false,
      waitForTabStableComplete = null,
      GROK_SUB2API_OAUTH_INJECT_FILES = null,
      now = () => Date.now(),
    } = deps;

    if (typeof completeNodeFromBackground !== 'function') {
      throw new Error('Grok SUB2API OAuth runner requires completeNodeFromBackground.');
    }
    if (typeof sendToContentScriptResilient !== 'function') {
      throw new Error('Grok SUB2API OAuth runner requires sendToContentScriptResilient.');
    }

    let sub2Api = null;

    function getSub2Api() {
      if (sub2Api) return sub2Api;
      const factory = deps.createSub2ApiApi || root?.MultiPageBackgroundSub2ApiApi?.createSub2ApiApi;
      if (typeof factory !== 'function') {
        throw new Error('SUB2API 接口模块未加载，无法执行 Grok OAuth。');
      }
      sub2Api = factory({ addLog, normalizeSub2ApiUrl });
      return sub2Api;
    }

    async function log(message, level = 'info', nodeId = '') {
      await addLog(message, level, nodeId ? { nodeId } : {});
    }

    async function applyRuntimeState(currentState = {}, patch = {}) {
      const statePatch = buildRuntimePatch(currentState, patch);
      await setState(statePatch);
      return statePatch;
    }

    async function closeAuthorizationTab(tabId) {
      if (!Number.isInteger(tabId) || !chrome?.tabs?.remove) return;
      await chrome.tabs.remove(tabId).catch(() => {});
    }

    async function cleanupAuthorizationTab() {
      const currentState = await getState();
      const runtime = readRuntime(currentState);
      const registeredTabId = await getTabId(SOURCE_ID).catch(() => null);
      const tabId = Number.isInteger(runtime.oauth?.authTabId)
        ? runtime.oauth.authTabId
        : registeredTabId;
      await closeAuthorizationTab(tabId);
      try {
        await unregisterTab(SOURCE_ID, tabId);
      } catch {}
      if (runtime.oauth?.authTabId !== null) {
        try {
          await applyRuntimeState(currentState, {
            oauth: { authTabId: null },
          });
        } catch {}
      }
    }

    function isContextFresh(oauth = {}) {
      const startedAt = Number(oauth?.startedAt) || 0;
      return cleanString(oauth?.status) !== 'error'
        && cleanString(oauth?.sessionId)
        && cleanString(oauth?.state)
        && cleanString(oauth?.authUrl)
        && Array.isArray(oauth?.groupIds)
        && oauth.groupIds.length > 0
        && startedAt > 0
        && now() - startedAt < SESSION_FRESHNESS_MS;
    }

    async function openAuthorizationTab(authUrl, previousTabId = null) {
      await closeAuthorizationTab(previousTabId);
      const tabId = await reuseOrCreateTab(SOURCE_ID, authUrl);
      if (!Number.isInteger(tabId)) {
        throw new Error('无法打开 Grok OAuth 授权页。');
      }
      await registerTab(SOURCE_ID, tabId);
      if (chrome?.tabs?.update) {
        await chrome.tabs.update(tabId, { active: true }).catch(() => {});
      }
      return tabId;
    }

    async function startFreshSession(currentState = {}, nodeId = '', options = {}) {
      const runtime = readRuntime(currentState);
      const config = resolveConfig(currentState);
      const context = await getSub2Api().prepareGrokOAuth({
        ...currentState,
        ...config,
      }, {
        logLabel: options.logLabel || 'SUB2API OAuth',
        logOptions: nodeId ? { nodeId } : {},
      });
      const tabId = await openAuthorizationTab(context.authUrl, runtime.oauth?.authTabId);
      const startedAt = now();
      const payload = await applyRuntimeState(currentState, {
        session: { lastError: '' },
        oauth: {
          sessionId: context.sessionId,
          state: context.state,
          authUrl: context.authUrl,
          authTabId: tabId,
          proxyId: context.proxyId,
          groupIds: context.groupIds,
          status: 'awaiting_authorization',
          startedAt,
          completedAt: 0,
          lastError: '',
        },
        upload: {
          targetId: 'sub2api',
          status: 'waiting_authorization',
          uploadedAt: 0,
          message: '',
          targetUrl: context.targetUrl,
        },
      });
      await waitForAuthorizationPageReady(tabId);
      await log('SUB2API OAuth 授权页已加载完成。', 'ok', nodeId);
      if (options.completeNode !== false) {
        await completeNodeFromBackground(nodeId, payload);
      }
      return { context, payload, tabId };
    }

    async function prepareAuthorizationTab(tabId) {
      if (typeof waitForTabStableComplete === 'function') {
        await waitForTabStableComplete(tabId, {
          timeoutMs: 30000,
          retryDelayMs: 300,
          stableMs: 800,
          initialDelayMs: 100,
        });
      }
      if (typeof ensureContentScriptReadyOnTab === 'function') {
        await ensureContentScriptReadyOnTab(SOURCE_ID, tabId, {
          inject: Array.isArray(GROK_SUB2API_OAUTH_INJECT_FILES) ? GROK_SUB2API_OAUTH_INJECT_FILES : null,
          injectSource: SOURCE_ID,
          timeoutMs: 30000,
          retryDelayMs: 500,
          logMessage: '正在连接 Grok OAuth 授权页...',
        });
      }
    }

    async function ensureAuthorizationTab(currentState = {}) {
      const runtime = readRuntime(currentState);
      let tabId = Number.isInteger(runtime.oauth?.authTabId)
        ? runtime.oauth.authTabId
        : await getTabId(SOURCE_ID);
      if (!Number.isInteger(tabId) || !await isTabAlive(SOURCE_ID)) {
        tabId = await openAuthorizationTab(runtime.oauth?.authUrl, tabId);
        await applyRuntimeState(currentState, {
          oauth: { authTabId: tabId },
        });
      }
      await prepareAuthorizationTab(tabId);
      return tabId;
    }

    async function readPageState() {
      const result = await sendToContentScriptResilient(SOURCE_ID, {
        type: 'GET_GROK_SUB2API_OAUTH_STATE',
        source: 'background',
      }, {
        timeoutMs: 15000,
        retryDelayMs: 500,
        responseTimeoutMs: 10000,
        logMessage: '正在读取 Grok OAuth 授权页状态...',
      });
      if (result?.error) throw new Error(result.error);
      return result || { state: 'loading' };
    }

    async function waitForAuthorizationPageReady(tabId) {
      await prepareAuthorizationTab(tabId);
      const maxAttempts = Math.max(
        1,
        Math.ceil(AUTHORIZATION_PAGE_READY_TIMEOUT_MS / AUTHORIZATION_PAGE_READY_POLL_INTERVAL_MS)
      );
      let lastState = 'loading';

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        throwIfStopped();
        const pageState = await readPageState();
        lastState = cleanString(pageState?.state) || 'loading';
        if (lastState === 'consent_page' || lastState === 'code_page') {
          return pageState;
        }
        if (lastState === 'error_page') {
          throw new Error(pageState?.error || 'Grok OAuth 授权页加载失败。');
        }
        if (attempt + 1 < maxAttempts) {
          await sleepWithStop(AUTHORIZATION_PAGE_READY_POLL_INTERVAL_MS);
        }
      }

      throw new Error(`Grok OAuth 授权页加载超时，当前页面状态：${lastState}。`);
    }

    async function confirmConsent() {
      const result = await sendToContentScriptResilient(SOURCE_ID, {
        type: 'EXECUTE_GROK_SUB2API_OAUTH_ACTION',
        source: 'background',
        payload: { action: 'confirm-consent' },
      }, {
        timeoutMs: 15000,
        retryDelayMs: 500,
        responseTimeoutMs: 10000,
        logMessage: '正在确认 Grok OAuth 授权...',
      });
      if (result?.error) throw new Error(result.error);
      return result;
    }

    async function confirmConsentDirectly(tabId) {
      if (!Number.isInteger(tabId) || !chrome?.scripting?.executeScript) return false;
      try {
        const executions = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
            const isVisible = (element) => {
              const style = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
            };
            const pageText = cleanText(`${document.title || ''} ${document.body?.textContent || ''}`);
            if (!/授权\s*Grok Build|Authorize\s+Grok Build/i.test(pageText)) {
              return { clicked: false };
            }
            const action = Array.from(document.querySelectorAll(
              'button, [role="button"], input[type="button"], input[type="submit"]'
            )).find((element) => {
              const text = cleanText([
                element.textContent,
                element.value,
                element.getAttribute('aria-label'),
                element.getAttribute('title'),
              ].filter(Boolean).join(' '));
              return !element.disabled
                && element.getAttribute('aria-disabled') !== 'true'
                && isVisible(element)
                && /^(?:允许|Allow|Authorize|Continue)$/i.test(text);
            });
            if (!action) return { clicked: false };
            action.click();
            return { clicked: true };
          },
        });
        return Boolean(executions?.some((entry) => entry?.result?.clicked));
      } catch {
        return false;
      }
    }

    async function persistFailure(currentState = {}, message = '', targetUrl = '') {
      return applyRuntimeState(currentState, {
        session: { lastError: message },
        oauth: {
          sessionId: '',
          state: '',
          authUrl: '',
          authTabId: null,
          proxyId: null,
          groupIds: [],
          status: 'error',
          startedAt: 0,
          completedAt: 0,
          lastError: message,
        },
        upload: {
          targetId: 'sub2api',
          status: 'error',
          uploadedAt: 0,
          message,
          targetUrl: cleanString(targetUrl),
        },
      });
    }

    async function executeGrokStartSub2ApiOAuth(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'grok-start-sub2api-oauth';
      const currentState = await getState();
      const config = resolveConfig(currentState);
      try {
        await log('正在向 SUB2API 获取 Grok OAuth 授权地址...', 'info', nodeId);
        await startFreshSession(currentState, nodeId);
      } catch (error) {
        const runtime = readRuntime(currentState);
        const message = sanitizeSensitiveMessage(getErrorMessage(error), [
          config.sub2apiPassword,
          runtime.oauth?.sessionId,
          runtime.oauth?.state,
          runtime.oauth?.authUrl,
        ]);
        await cleanupAuthorizationTab();
        await persistFailure(currentState, message);
        await log(message, 'error', nodeId);
        throw new Error(message);
      }
    }

    async function executeGrokCompleteSub2ApiOAuth(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'grok-complete-sub2api-oauth';
      let currentState = await getState();
      let runtime = readRuntime(currentState);
      let authorizationCode = '';
      let targetUrl = runtime.upload?.targetUrl || '';
      const config = resolveConfig(currentState);
      try {
        if (!isContextFresh(runtime.oauth)) {
          await log('OAuth 上下文已失效，正在重新获取授权地址...', 'warn', nodeId);
          await startFreshSession(currentState, nodeId, { completeNode: false });
          currentState = await getState();
          runtime = readRuntime(currentState);
        }

        const tabId = await ensureAuthorizationTab(currentState);
        currentState = await getState();
        runtime = readRuntime(currentState);
        targetUrl = runtime.upload?.targetUrl || targetUrl;
        await applyRuntimeState(currentState, {
          oauth: { status: 'authorizing', lastError: '' },
          upload: {
            targetId: 'sub2api',
            status: 'authorizing',
            uploadedAt: 0,
            message: '',
            targetUrl,
          },
        });
        const deadline = now() + AUTHORIZATION_TIMEOUT_MS;
        let consentSubmitted = false;
        while (now() < deadline) {
          throwIfStopped();
          if (!consentSubmitted) {
            if (await confirmConsentDirectly(tabId)) {
              await log('正在自动确认 Grok OAuth 授权...', 'info', nodeId);
              consentSubmitted = true;
              await sleepWithStop(800);
              await ensureAuthorizationTab(await getState());
              continue;
            }
          }
          const pageState = await readPageState();
          if (pageState.state === 'consent_page') {
            if (!consentSubmitted) {
              await log('正在自动确认 Grok OAuth 授权...', 'info', nodeId);
              await confirmConsent();
              consentSubmitted = true;
            }
            await sleepWithStop(800);
            await ensureAuthorizationTab(await getState());
            continue;
          }
          if (pageState.state === 'error_page') {
            throw new Error(pageState.error || 'Grok OAuth 授权失败。');
          }
          if (pageState.state === 'code_page') {
            authorizationCode = cleanString(pageState.code);
            if (!authorizationCode) {
              throw new Error('Grok OAuth 授权页未返回有效 code。');
            }
            await applyRuntimeState(currentState, {
              oauth: { status: 'creating_account', lastError: '' },
              upload: {
                targetId: 'sub2api',
                status: 'creating',
                uploadedAt: 0,
                message: '',
                targetUrl,
              },
            });
            const result = await getSub2Api().createGrokAccountFromOAuth({
              ...currentState,
              ...config,
            }, runtime.oauth, authorizationCode, {
              logLabel: 'SUB2API OAuth',
              logOptions: { nodeId },
            });
            targetUrl = result.targetUrl || targetUrl;
            await cleanupAuthorizationTab();
            const completedAt = now();
            const payload = await applyRuntimeState(currentState, {
              session: { lastError: '' },
              oauth: {
                sessionId: '',
                state: '',
                authUrl: '',
                authTabId: null,
                proxyId: null,
                groupIds: [],
                status: 'completed',
                startedAt: 0,
                completedAt,
                lastError: '',
              },
              upload: {
                targetId: 'sub2api',
                status: 'uploaded',
                uploadedAt: completedAt,
                message: result.verifiedStatus || 'SUB2API Grok OAuth 账号创建成功。',
                targetUrl,
              },
            });
            await log(result.verifiedStatus || 'SUB2API Grok OAuth 账号创建成功。', 'ok', nodeId);
            await completeNodeFromBackground(nodeId, payload);
            return;
          }
          await sleepWithStop(800);
        }
        throw new Error('等待 Grok OAuth 授权完成超时。');
      } catch (error) {
        runtime = readRuntime(await getState().catch(() => currentState));
        const message = sanitizeSensitiveMessage(getErrorMessage(error), [
          authorizationCode,
          config.sub2apiPassword,
          runtime.oauth?.sessionId,
          runtime.oauth?.state,
          runtime.oauth?.authUrl,
        ]);
        await cleanupAuthorizationTab();
        await persistFailure(currentState, message, targetUrl);
        await log(message, 'error', nodeId);
        throw new Error(message);
      }
    }

    return {
      cleanupAuthorizationTab,
      executeGrokCompleteSub2ApiOAuth,
      executeGrokStartSub2ApiOAuth,
    };
  }

  return {
    AUTHORIZATION_TIMEOUT_MS,
    SESSION_FRESHNESS_MS,
    createGrokSub2ApiOAuthRunner,
    resolveConfig,
    sanitizeSensitiveMessage,
  };
});
