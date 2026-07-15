(function attachBackgroundGrokPublisherSub2Api(root, factory) {
  root.MultiPageBackgroundGrokPublisherSub2Api = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundGrokPublisherSub2ApiModule(root) {
  const grokStateApi = root?.MultiPageBackgroundGrokState || null;
  const GROK_SSO_IMPORT_PATH = '/api/v1/admin/grok/sso-to-oauth';

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => cloneValue(entry));
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)])
      );
    }
    return value;
  }

  function deepMerge(baseValue, patchValue) {
    if (Array.isArray(patchValue)) {
      return patchValue.map((entry) => cloneValue(entry));
    }
    if (!isPlainObject(patchValue)) {
      return patchValue === undefined ? cloneValue(baseValue) : patchValue;
    }

    const baseObject = isPlainObject(baseValue) ? baseValue : {};
    const next = {
      ...cloneValue(baseObject),
    };
    Object.entries(patchValue).forEach(([key, value]) => {
      next[key] = deepMerge(baseObject[key], value);
    });
    return next;
  }

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function readCanonicalGrokRuntime(state = {}) {
    const canonical = state?.runtimeState?.flowState?.grok;
    if (isPlainObject(canonical)) {
      return canonical;
    }
    return isPlainObject(state?.flowState?.grok) ? state.flowState.grok : {};
  }

  function readGrokRuntimeForPatch(state = {}) {
    return grokStateApi?.ensureRuntimeState
      ? grokStateApi.ensureRuntimeState(state)
      : readCanonicalGrokRuntime(state);
  }

  function buildCanonicalRuntimePatch(currentState = {}, nextRuntimeState = {}) {
    if (typeof grokStateApi?.buildRuntimeStatePatch === 'function') {
      return grokStateApi.buildRuntimeStatePatch(currentState, nextRuntimeState);
    }
    const baseRuntimeState = isPlainObject(currentState?.runtimeState)
      ? cloneValue(currentState.runtimeState)
      : {};
    const baseFlowState = isPlainObject(baseRuntimeState.flowState)
      ? cloneValue(baseRuntimeState.flowState)
      : {};
    return {
      runtimeState: {
        ...baseRuntimeState,
        flowState: {
          ...baseFlowState,
          grok: deepMerge(readGrokRuntimeForPatch(currentState), nextRuntimeState),
        },
      },
    };
  }

  function mergeRuntimePatch(currentState = {}, patch = {}) {
    return buildCanonicalRuntimePatch(
      currentState,
      deepMerge(readGrokRuntimeForPatch(currentState), patch)
    );
  }

  function readConfiguredValue(config = {}, key = '', fallback) {
    return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : fallback;
  }

  function resolveGrokSub2ApiConfig(state = {}) {
    const nestedConfig = state?.settingsState?.flows?.grok?.targets?.sub2api;
    const canonicalConfig = isPlainObject(nestedConfig) ? nestedConfig : {};
    const groupNames = readConfiguredValue(canonicalConfig, 'sub2apiGroupNames', state.grokSub2apiGroupNames);
    return {
      sub2apiUrl: cleanString(readConfiguredValue(canonicalConfig, 'sub2apiUrl', state.sub2apiUrl)),
      sub2apiEmail: cleanString(readConfiguredValue(canonicalConfig, 'sub2apiEmail', state.sub2apiEmail)),
      sub2apiPassword: String(readConfiguredValue(canonicalConfig, 'sub2apiPassword', state.sub2apiPassword) ?? ''),
      sub2apiGroupName: cleanString(readConfiguredValue(canonicalConfig, 'sub2apiGroupName', state.grokSub2apiGroupName)),
      sub2apiGroupNames: Array.isArray(groupNames) && groupNames.length
        ? groupNames.map((entry) => cleanString(entry)).filter(Boolean)
        : [],
      sub2apiAccountPriority: Math.max(1, Math.floor(Number(
        readConfiguredValue(canonicalConfig, 'sub2apiAccountPriority', state.grokSub2apiAccountPriority)
      ) || 1)),
      sub2apiDefaultProxyName: cleanString(readConfiguredValue(
        canonicalConfig,
        'sub2apiDefaultProxyName',
        state.grokSub2apiDefaultProxyName
      )),
    };
  }

  function resolveGrokRegistrationEmail(state = {}) {
    const runtimeState = readCanonicalGrokRuntime(state);
    return cleanString(runtimeState?.register?.email)
      || cleanString(state.grokEmail)
      || cleanString(state.email);
  }

  function resolveGrokSsoCookie(state = {}) {
    const runtimeState = readCanonicalGrokRuntime(state);
    return cleanString(runtimeState?.sso?.currentCookie)
      || cleanString(state.grokSsoCookie);
  }

  function buildGrokSub2ApiImportUrl(rawUrl = '') {
    const value = cleanString(rawUrl);
    if (!value) {
      return '';
    }
    const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
    try {
      return `${new URL(withProtocol).origin}${GROK_SSO_IMPORT_PATH}`;
    } catch {
      return '';
    }
  }

  function redactValue(message = '', value = '') {
    const secret = String(value || '');
    return secret ? message.split(secret).join('[REDACTED]') : message;
  }

  function sanitizeSensitiveMessage(message = '', secrets = []) {
    let sanitized = cleanString(message) || '未知错误';
    const uniqueSecrets = Array.from(new Set(
      secrets.map((value) => String(value || '')).filter(Boolean)
    )).sort((left, right) => right.length - left.length);
    uniqueSecrets.forEach((secret) => {
      sanitized = redactValue(sanitized, secret);
    });
    return sanitized.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
  }

  function getErrorMessage(error) {
    return error instanceof Error ? error.message : cleanString(error) || '未知错误';
  }

  function createGrokSub2ApiPublisher(deps = {}) {
    const {
      addLog = async () => {},
      completeNodeFromBackground,
      getState = async () => ({}),
      normalizeSub2ApiUrl = (value) => value,
      setState = async () => {},
    } = deps;

    if (typeof completeNodeFromBackground !== 'function') {
      throw new Error('Grok SUB2API publisher requires completeNodeFromBackground.');
    }

    let sub2Api = null;

    function getSub2Api() {
      if (sub2Api) {
        return sub2Api;
      }
      const factory = deps.createSub2ApiApi
        || root?.MultiPageBackgroundSub2ApiApi?.createSub2ApiApi;
      if (typeof factory !== 'function') {
        throw new Error('SUB2API 接口模块未加载，无法导入 Grok SSO。');
      }
      sub2Api = factory({
        addLog,
        normalizeSub2ApiUrl,
      });
      return sub2Api;
    }

    async function log(message, level = 'info', nodeId = '') {
      await addLog(message, level, nodeId ? { nodeId } : {});
    }

    async function applyRuntimeState(currentState = {}, patch = {}) {
      const nextPatch = mergeRuntimePatch(currentState, patch);
      await setState(nextPatch);
      return nextPatch;
    }

    async function persistFailure(currentState = {}, message = '', targetUrl = '') {
      await setState(mergeRuntimePatch(currentState, {
        session: {
          lastError: message,
        },
        upload: {
          targetId: 'sub2api',
          status: 'error',
          uploadedAt: 0,
          message,
          targetUrl: cleanString(targetUrl),
        },
      }));
    }

    async function executeGrokImportSsoToSub2Api(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'grok-import-sso-to-sub2api';
      const currentState = await getState();
      const targetConfig = resolveGrokSub2ApiConfig(currentState);
      const registrationEmail = resolveGrokRegistrationEmail(currentState);
      const ssoCookie = resolveGrokSsoCookie(currentState);
      const targetUrl = buildGrokSub2ApiImportUrl(targetConfig.sub2apiUrl);
      const secrets = [
        ssoCookie,
        targetConfig.sub2apiPassword,
        state?.grokSsoCookie,
        state?.sub2apiPassword,
      ];

      try {
        if (!registrationEmail) {
          throw new Error('缺少本轮 Grok 注册邮箱，无法将账号导入 SUB2API。');
        }
        if (!ssoCookie) {
          throw new Error('缺少 Grok SSO Cookie，请先完成步骤 5。');
        }

        await applyRuntimeState(currentState, {
          session: {
            lastError: '',
          },
          upload: {
            targetId: 'sub2api',
            status: 'uploading',
            uploadedAt: 0,
            message: '',
            targetUrl,
          },
        });
        await log('步骤 6：正在将 Grok SSO 导入 SUB2API...', 'info', nodeId);

        const result = await getSub2Api().importGrokSso({
          ...currentState,
          ...targetConfig,
          runtimeState: currentState.runtimeState,
        }, {
          logLabel: '步骤 6',
          logOptions: { nodeId },
        });
        const message = sanitizeSensitiveMessage(
          result?.verifiedStatus || 'SUB2API Grok SSO 导入成功。',
          secrets
        );
        const uploadedAt = Date.now();
        const payload = await applyRuntimeState(currentState, {
          session: {
            lastError: '',
          },
          upload: {
            targetId: 'sub2api',
            status: 'uploaded',
            uploadedAt,
            message,
            targetUrl: cleanString(result?.targetUrl) || targetUrl,
          },
        });
        await log(`步骤 6：${message}`, 'ok', nodeId);
        await completeNodeFromBackground(nodeId, payload);
      } catch (error) {
        const message = sanitizeSensitiveMessage(getErrorMessage(error), secrets);
        await persistFailure(currentState, message, targetUrl);
        await log(`步骤 6：${message}`, 'error', nodeId);
        throw new Error(message);
      }
    }

    return {
      executeGrokImportSsoToSub2Api,
    };
  }

  return {
    buildGrokSub2ApiImportUrl,
    createGrokSub2ApiPublisher,
    resolveGrokRegistrationEmail,
    resolveGrokSsoCookie,
    resolveGrokSub2ApiConfig,
    sanitizeSensitiveMessage,
  };
});
