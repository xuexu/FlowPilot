(function attachMultiPageFlowCapabilities(root, factory) {
  root.MultiPageFlowCapabilities = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createFlowCapabilitiesModule() {
  const rootScope = typeof self !== 'undefined' ? self : globalThis;
  const flowRegistryApi = rootScope.MultiPageFlowRegistry || {};
  const settingsSchemaApi = rootScope.MultiPageSettingsSchema || {};
  const DEFAULT_FLOW_ID = flowRegistryApi.DEFAULT_FLOW_ID || 'openai';
  const DEFAULT_OPENAI_INTEGRATION_TARGET_ID = flowRegistryApi.DEFAULT_OPENAI_INTEGRATION_TARGET_ID || 'cpa';
  const SIGNUP_METHOD_EMAIL = 'email';
  const SIGNUP_METHOD_PHONE = 'phone';
  const VALID_OPENAI_INTEGRATION_TARGET_IDS = Array.isArray(flowRegistryApi.OPENAI_INTEGRATION_TARGET_IDS)
    ? flowRegistryApi.OPENAI_INTEGRATION_TARGET_IDS.slice()
    : ['cpa', 'sub2api', 'codex2api'];
  const REGISTERED_FLOW_IDS = Array.isArray(flowRegistryApi.getRegisteredFlowIds?.())
    ? flowRegistryApi.getRegisteredFlowIds().map((flowId) => String(flowId || '').trim().toLowerCase()).filter(Boolean)
    : [DEFAULT_FLOW_ID];
  const REGISTERED_FLOW_ID_SET = new Set(REGISTERED_FLOW_IDS);

  const DEFAULT_FLOW_CAPABILITIES = Object.freeze({
    supportsEmailSignup: true,
    supportsPhoneSignup: false,
    supportsPhoneVerificationSettings: false,
    supportsPlusMode: false,
    supportsContributionMode: false,
    supportedIntegrationTargets: [],
    supportsLuckmail: false,
    supportsOauthTimeoutBudget: false,
    canSwitchFlow: true,
    stepDefinitionMode: 'default',
    sourceSelectorLabel: '来源',
  });

  const FLOW_CAPABILITIES = Object.freeze(
    Object.fromEntries(
      (typeof flowRegistryApi.getRegisteredFlowIds === 'function'
        ? flowRegistryApi.getRegisteredFlowIds()
        : [DEFAULT_FLOW_ID]
      ).map((flowId) => [
        flowId,
        Object.freeze({
          ...DEFAULT_FLOW_CAPABILITIES,
          ...(typeof flowRegistryApi.getFlowCapabilities === 'function'
            ? flowRegistryApi.getFlowCapabilities(flowId)
            : {}),
        }),
      ])
    )
  );

  const DEFAULT_INTEGRATION_TARGET_CAPABILITIES = Object.freeze({
    supportsPhoneSignup: true,
    requiresPhoneSignupWarning: false,
  });

  const MODE_SWITCH_RELEVANT_KEYS = Object.freeze([
    'activeFlowId',
    'contributionMode',
    'panelMode',
    'phoneVerificationEnabled',
    'plusModeEnabled',
    'signupMethod',
    'kiroSourceId',
    'openaiIntegrationTargetId',
    'kiroIntegrationTargetId',
  ]);

  const OPENAI_INTEGRATION_TARGET_CAPABILITIES = Object.freeze({
    cpa: Object.freeze({
      supportsPhoneSignup: true,
      requiresPhoneSignupWarning: true,
    }),
    sub2api: Object.freeze({
      supportsPhoneSignup: true,
      requiresPhoneSignupWarning: false,
    }),
    codex2api: Object.freeze({
      supportsPhoneSignup: true,
      requiresPhoneSignupWarning: false,
    }),
  });

  function normalizeFlowId(value = '', fallback = DEFAULT_FLOW_ID) {
    if (typeof flowRegistryApi.normalizeFlowId === 'function') {
      return flowRegistryApi.normalizeFlowId(value, fallback);
    }
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || String(fallback || '').trim().toLowerCase() || DEFAULT_FLOW_ID;
  }

  function normalizeCapabilityFlowId(value = '', fallback = DEFAULT_FLOW_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) {
      return normalized;
    }
    return normalizeFlowId(fallback, DEFAULT_FLOW_ID);
  }

  function isRegisteredFlowId(flowId = '') {
    const normalized = String(flowId || '').trim().toLowerCase();
    return Boolean(normalized) && REGISTERED_FLOW_ID_SET.has(normalized);
  }

  function normalizeOpenAiIntegrationTargetId(value = '', fallback = DEFAULT_OPENAI_INTEGRATION_TARGET_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (VALID_OPENAI_INTEGRATION_TARGET_IDS.includes(normalized)) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    return VALID_OPENAI_INTEGRATION_TARGET_IDS.includes(fallbackValue)
      ? fallbackValue
      : DEFAULT_OPENAI_INTEGRATION_TARGET_ID;
  }

  function normalizeSignupMethod(value = '') {
    return String(value || '').trim().toLowerCase() === SIGNUP_METHOD_PHONE
      ? SIGNUP_METHOD_PHONE
      : SIGNUP_METHOD_EMAIL;
  }

  function normalizeOpenAiIntegrationTargetList(values = []) {
    if (!Array.isArray(values)) {
      return [];
    }
    const seen = new Set();
    const normalized = [];
    values.forEach((value) => {
      const integrationTargetId = normalizeOpenAiIntegrationTargetId(value, '');
      if (!integrationTargetId || seen.has(integrationTargetId)) {
        return;
      }
      seen.add(integrationTargetId);
      normalized.push(integrationTargetId);
    });
    return normalized;
  }

  function getIntegrationTargetLabel(flowId = DEFAULT_FLOW_ID, integrationTargetId = '') {
    if (
      isRegisteredFlowId(flowId)
      && typeof flowRegistryApi.getIntegrationTargetLabel === 'function'
    ) {
      return flowRegistryApi.getIntegrationTargetLabel(flowId, integrationTargetId);
    }
    const normalized = String(integrationTargetId || '').trim().toLowerCase();
    if (normalized === 'sub2api') {
      return 'SUB2API';
    }
    if (normalized === 'codex2api') {
      return 'Codex2API';
    }
    if (normalized === 'cpa') {
      return 'CPA';
    }
    return normalized || String(integrationTargetId || '').trim();
  }

  function createFlowCapabilityRegistry(deps = {}) {
    const {
      defaultFlowCapabilities = DEFAULT_FLOW_CAPABILITIES,
      defaultFlowId = DEFAULT_FLOW_ID,
      defaultIntegrationTargetCapabilities = DEFAULT_INTEGRATION_TARGET_CAPABILITIES,
      flowCapabilities = FLOW_CAPABILITIES,
      integrationTargetCapabilities = OPENAI_INTEGRATION_TARGET_CAPABILITIES,
    } = deps;
    const settingsSchema = settingsSchemaApi.createSettingsSchema
      ? settingsSchemaApi.createSettingsSchema({
        defaultFlowId,
      })
      : null;

    function getFlowCapabilities(flowId) {
      const normalizedFlowId = normalizeCapabilityFlowId(flowId, defaultFlowId);
      const entry = flowCapabilities[normalizedFlowId] || null;
      const supportedIntegrationTargets = normalizedFlowId === 'openai'
        ? normalizeOpenAiIntegrationTargetList(
          entry?.supportedIntegrationTargets || defaultFlowCapabilities.supportedIntegrationTargets
        )
        : (Array.isArray(entry?.supportedIntegrationTargets)
          ? entry.supportedIntegrationTargets.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
          : []);
      return {
        ...defaultFlowCapabilities,
        ...(entry || {}),
        supportedIntegrationTargets,
      };
    }

    function getOpenAiIntegrationTargetCapabilities(integrationTargetId) {
      const normalizedIntegrationTargetId = normalizeOpenAiIntegrationTargetId(integrationTargetId);
      return {
        ...defaultIntegrationTargetCapabilities,
        ...(integrationTargetCapabilities[normalizedIntegrationTargetId] || {}),
      };
    }

    function normalizeRequestedIntegrationTargetId(activeFlowId, state = {}, options = {}) {
      if (activeFlowId === 'openai') {
        return normalizeOpenAiIntegrationTargetId(
          options?.integrationTargetId
          ?? options?.panelMode
          ?? state?.openaiIntegrationTargetId
          ?? state?.panelMode,
          DEFAULT_OPENAI_INTEGRATION_TARGET_ID
        );
      }

      const rawIntegrationTargetId = activeFlowId === 'kiro'
        ? (
          options?.integrationTargetId
          ?? state?.kiroIntegrationTargetId
          ?? state?.kiroSourceId
          ?? flowRegistryApi.getDefaultIntegrationTargetId?.(activeFlowId)
          ?? ''
        )
        : (
          options?.integrationTargetId
          ?? state?.integrationTargetId
          ?? state?.openaiIntegrationTargetId
          ?? state?.panelMode
          ?? state?.kiroIntegrationTargetId
          ?? state?.kiroSourceId
          ?? flowRegistryApi.getDefaultIntegrationTargetId?.(activeFlowId)
          ?? ''
        );

      if (
        isRegisteredFlowId(activeFlowId)
        && typeof flowRegistryApi.normalizeIntegrationTargetId === 'function'
      ) {
        return flowRegistryApi.normalizeIntegrationTargetId(
          activeFlowId,
          rawIntegrationTargetId,
          flowRegistryApi.getDefaultIntegrationTargetId?.(activeFlowId)
        );
      }

      return String(rawIntegrationTargetId || '').trim().toLowerCase();
    }

    function normalizeChangedKeys(values = []) {
      const list = Array.isArray(values) ? values : [];
      const seen = new Set();
      const normalized = [];
      list.forEach((value) => {
        const key = String(value || '').trim();
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        normalized.push(key);
      });
      return normalized;
    }

    function resolveEffectiveIntegrationTargetId(activeFlowId, state = {}, requestedIntegrationTargetId = DEFAULT_OPENAI_INTEGRATION_TARGET_ID) {
      if (!isRegisteredFlowId(activeFlowId)) {
        return normalizeRequestedIntegrationTargetId(activeFlowId, state, {
          integrationTargetId: requestedIntegrationTargetId,
        });
      }
      if (settingsSchema?.getSelectedIntegrationTargetId) {
        const integrationTargetId = settingsSchema.getSelectedIntegrationTargetId({
          ...state,
          activeFlowId,
        }, activeFlowId);
        if (integrationTargetId) {
          return integrationTargetId;
        }
      }
      if (typeof flowRegistryApi.normalizeIntegrationTargetId === 'function') {
        return flowRegistryApi.normalizeIntegrationTargetId(
          activeFlowId,
          activeFlowId === 'openai'
            ? (state?.openaiIntegrationTargetId || state?.panelMode || requestedIntegrationTargetId)
            : (state?.kiroIntegrationTargetId || state?.kiroSourceId || requestedIntegrationTargetId),
          flowRegistryApi.getDefaultIntegrationTargetId?.(activeFlowId)
        );
      }
      return activeFlowId === 'openai'
        ? normalizeOpenAiIntegrationTargetId(requestedIntegrationTargetId)
        : String(requestedIntegrationTargetId || '').trim().toLowerCase();
    }

    function resolveSidepanelCapabilities(options = {}) {
      const state = options?.state || {};
      const activeFlowId = normalizeCapabilityFlowId(
        options?.activeFlowId ?? state?.activeFlowId,
        defaultFlowId
      );
      const flowState = getFlowCapabilities(activeFlowId);
      const requestedIntegrationTargetId = normalizeRequestedIntegrationTargetId(
        activeFlowId,
        state,
        options
      );
      const supportedIntegrationTargets = activeFlowId === 'openai'
        ? normalizeOpenAiIntegrationTargetList(flowState.supportedIntegrationTargets)
        : (Array.isArray(flowState.supportedIntegrationTargets)
          ? flowState.supportedIntegrationTargets.slice()
          : []);
      const integrationTargetSupported = supportedIntegrationTargets.length === 0
        ? true
        : supportedIntegrationTargets.includes(requestedIntegrationTargetId);
      const effectiveIntegrationTargetId = integrationTargetSupported
        ? requestedIntegrationTargetId
        : (supportedIntegrationTargets[0] || requestedIntegrationTargetId);
      const integrationTargetState = activeFlowId === 'openai'
        ? getOpenAiIntegrationTargetCapabilities(effectiveIntegrationTargetId)
        : defaultIntegrationTargetCapabilities;
      const runtimeLocks = {
        autoRunLocked: Boolean(options?.autoRunLocked ?? state?.autoRunLocked),
        contributionMode: activeFlowId === 'openai' && flowState.supportsContributionMode && Boolean(state?.contributionMode),
        phoneVerificationEnabled: activeFlowId === 'openai' && flowState.supportsPhoneVerificationSettings && Boolean(state?.phoneVerificationEnabled),
        plusModeEnabled: activeFlowId === 'openai' && flowState.supportsPlusMode && Boolean(state?.plusModeEnabled),
        settingsMenuLocked: Boolean(options?.settingsMenuLocked ?? state?.settingsMenuLocked),
      };
      const effectiveSignupMethods = [];
      if (flowState.supportsEmailSignup !== false) {
        effectiveSignupMethods.push(SIGNUP_METHOD_EMAIL);
      }
      const canSelectPhoneSignup = activeFlowId === 'openai'
        && Boolean(flowState.supportsPhoneSignup)
        && Boolean(integrationTargetState.supportsPhoneSignup)
        && runtimeLocks.phoneVerificationEnabled
        && !runtimeLocks.plusModeEnabled
        && !runtimeLocks.contributionMode;
      if (canSelectPhoneSignup) {
        effectiveSignupMethods.push(SIGNUP_METHOD_PHONE);
      }
      if (!effectiveSignupMethods.length) {
        effectiveSignupMethods.push(SIGNUP_METHOD_EMAIL);
      }
      const requestedSignupMethod = normalizeSignupMethod(
        options?.signupMethod ?? state?.signupMethod
      );
      const effectiveSignupMethod = requestedSignupMethod === SIGNUP_METHOD_PHONE && canSelectPhoneSignup
        ? SIGNUP_METHOD_PHONE
        : (effectiveSignupMethods.includes(SIGNUP_METHOD_EMAIL)
          ? SIGNUP_METHOD_EMAIL
          : effectiveSignupMethods[0]);
      const visibleGroupIds = typeof flowRegistryApi.getVisibleGroupIds === 'function'
        && isRegisteredFlowId(activeFlowId)
        ? flowRegistryApi.getVisibleGroupIds(activeFlowId, effectiveIntegrationTargetId)
        : [];

      return {
        activeFlowId,
        canShowContributionMode: activeFlowId === 'openai' && Boolean(flowState.supportsContributionMode),
        canShowLuckmail: activeFlowId === 'openai' && Boolean(flowState.supportsLuckmail),
        canShowPhoneSettings: activeFlowId === 'openai' && Boolean(flowState.supportsPhoneVerificationSettings),
        canShowPlusSettings: activeFlowId === 'openai' && Boolean(flowState.supportsPlusMode),
        canSwitchFlow: Boolean(flowState.canSwitchFlow),
        canUsePhoneSignup: canSelectPhoneSignup,
        canUseSelectedPanelMode: integrationTargetSupported,
        effectiveIntegrationTargetId,
        effectivePanelMode: effectiveIntegrationTargetId,
        effectiveSignupMethod,
        effectiveSignupMethods,
        effectiveSourceId: effectiveIntegrationTargetId,
        flowCapabilities: flowState,
        integrationTargetCapabilities: integrationTargetState,
        panelCapabilities: integrationTargetState,
        panelMode: effectiveIntegrationTargetId,
        requestedIntegrationTargetId,
        requestedPanelMode: requestedIntegrationTargetId,
        requestedSignupMethod,
        runtimeLocks,
        shouldWarnCpaPhoneSignup: effectiveSignupMethod === SIGNUP_METHOD_PHONE
          && Boolean(integrationTargetState.requiresPhoneSignupWarning),
        stepDefinitionOptions: {
          activeFlowId,
          integrationTargetId: effectiveIntegrationTargetId,
          panelMode: effectiveIntegrationTargetId,
          plusModeEnabled: runtimeLocks.plusModeEnabled,
          signupMethod: effectiveSignupMethod,
        },
        supportedIntegrationTargets,
        supportedPanelModes: supportedIntegrationTargets,
        visibleGroupIds,
      };
    }

    function buildPhoneSignupValidationError(capabilityState = {}) {
      const flowState = capabilityState.flowCapabilities || {};
      const integrationTargetState = capabilityState.integrationTargetCapabilities || {};
      const runtimeLocks = capabilityState.runtimeLocks || {};

      if (!flowState.supportsPhoneSignup) {
        return {
          code: 'phone_signup_flow_unsupported',
          message: '当前 flow 不支持手机号注册。',
        };
      }
      if (!integrationTargetState.supportsPhoneSignup) {
        return {
          code: 'phone_signup_panel_unsupported',
          message: `当前来源 ${getIntegrationTargetLabel(capabilityState.activeFlowId, capabilityState.requestedIntegrationTargetId)} 不支持手机号注册。`,
        };
      }
      if (!runtimeLocks.phoneVerificationEnabled) {
        return {
          code: 'phone_signup_phone_verification_disabled',
          message: '请先开启接码设置后再使用手机号注册。',
        };
      }
      if (runtimeLocks.plusModeEnabled) {
        return {
          code: 'phone_signup_plus_mode_locked',
          message: 'Plus 模式开启时不能使用手机号注册。',
        };
      }
      if (runtimeLocks.contributionMode) {
        return {
          code: 'phone_signup_contribution_mode_locked',
          message: '贡献模式开启时不能使用手机号注册。',
        };
      }
      return {
        code: 'phone_signup_unavailable',
        message: '当前设置暂不支持手机号注册。',
      };
    }

    function validateAutoRunStart(options = {}) {
      const state = options?.state || {};
      const capabilityState = resolveSidepanelCapabilities(options);
      const errors = [];

      if (
        Array.isArray(capabilityState.supportedIntegrationTargets)
        && capabilityState.supportedIntegrationTargets.length > 0
        && capabilityState.canUseSelectedPanelMode === false
      ) {
        errors.push({
          code: 'panel_mode_unsupported',
          message: `当前 flow 不支持 ${getIntegrationTargetLabel(capabilityState.activeFlowId, capabilityState.requestedIntegrationTargetId)} 来源。`,
        });
      }

      if (Boolean(state?.plusModeEnabled) && !capabilityState.flowCapabilities?.supportsPlusMode) {
        errors.push({
          code: 'plus_mode_unsupported',
          message: '当前 flow 不支持 Plus 模式。',
        });
      }

      if (Boolean(state?.contributionMode) && !capabilityState.flowCapabilities?.supportsContributionMode) {
        errors.push({
          code: 'contribution_mode_unsupported',
          message: '当前 flow 不支持贡献模式。',
        });
      }

      if (
        capabilityState.requestedSignupMethod === SIGNUP_METHOD_PHONE
        && capabilityState.effectiveSignupMethod !== SIGNUP_METHOD_PHONE
      ) {
        errors.push(buildPhoneSignupValidationError(capabilityState));
      }

      return {
        ok: errors.length === 0,
        errors,
        capabilityState,
      };
    }

    function validateModeSwitch(options = {}) {
      const state = options?.state || {};
      const changedKeys = normalizeChangedKeys(
        options?.changedKeys !== undefined
          ? options.changedKeys
          : Object.keys(state || {})
      );
      const changedKeySet = new Set(changedKeys);
      const capabilityState = resolveSidepanelCapabilities(options);
      const errors = [];
      const normalizedUpdates = {};
      const flowState = capabilityState.flowCapabilities || {};
      const requestedPhoneSignup = capabilityState.requestedSignupMethod === SIGNUP_METHOD_PHONE;
      const shouldReconcileSignupMethod = MODE_SWITCH_RELEVANT_KEYS.some((key) => changedKeySet.has(key));

      if (
        (changedKeySet.has('panelMode') || changedKeySet.has('openaiIntegrationTargetId') || changedKeySet.has('kiroIntegrationTargetId'))
        && Array.isArray(capabilityState.supportedIntegrationTargets)
        && capabilityState.supportedIntegrationTargets.length > 0
        && capabilityState.canUseSelectedPanelMode === false
      ) {
        normalizedUpdates.panelMode = capabilityState.effectiveIntegrationTargetId;
        normalizedUpdates.openaiIntegrationTargetId = capabilityState.effectiveIntegrationTargetId;
        normalizedUpdates.kiroIntegrationTargetId = capabilityState.effectiveIntegrationTargetId;
        normalizedUpdates.kiroSourceId = capabilityState.effectiveIntegrationTargetId;
        errors.push({
          code: 'panel_mode_unsupported',
          message: `当前 flow 不支持 ${getIntegrationTargetLabel(capabilityState.activeFlowId, capabilityState.requestedIntegrationTargetId)} 来源。`,
        });
      }

      if (changedKeySet.has('plusModeEnabled') && Boolean(state?.plusModeEnabled) && !flowState.supportsPlusMode) {
        normalizedUpdates.plusModeEnabled = false;
        errors.push({
          code: 'plus_mode_unsupported',
          message: '当前 flow 不支持 Plus 模式。',
        });
      }

      if (changedKeySet.has('contributionMode') && Boolean(state?.contributionMode) && !flowState.supportsContributionMode) {
        normalizedUpdates.contributionMode = false;
        errors.push({
          code: 'contribution_mode_unsupported',
          message: '当前 flow 不支持贡献模式。',
        });
      }

      if (
        changedKeySet.has('phoneVerificationEnabled')
        && Boolean(state?.phoneVerificationEnabled)
        && !flowState.supportsPhoneVerificationSettings
      ) {
        normalizedUpdates.phoneVerificationEnabled = false;
        errors.push({
          code: 'phone_verification_unsupported',
          message: '当前 flow 不支持接码设置。',
        });
      }

      if (
        shouldReconcileSignupMethod
        && requestedPhoneSignup
        && capabilityState.effectiveSignupMethod !== SIGNUP_METHOD_PHONE
      ) {
        normalizedUpdates.signupMethod = capabilityState.effectiveSignupMethod;
        errors.push(buildPhoneSignupValidationError(capabilityState));
      }

      return {
        ok: errors.length === 0,
        changedKeys,
        capabilityState,
        errors,
        normalizedUpdates,
      };
    }

    function canUsePhoneSignup(state = {}) {
      return resolveSidepanelCapabilities({ state }).canUsePhoneSignup;
    }

    function resolveSignupMethod(state = {}, signupMethod = undefined) {
      return resolveSidepanelCapabilities({
        signupMethod,
        state,
      }).effectiveSignupMethod;
    }

    return {
      canUsePhoneSignup,
      getFlowCapabilities,
      getOpenAiIntegrationTargetCapabilities,
      normalizeFlowId,
      normalizeOpenAiIntegrationTargetId,
      normalizeSignupMethod,
      resolveSidepanelCapabilities,
      resolveSignupMethod,
      validateAutoRunStart,
      validateModeSwitch,
    };
  }

  return {
    createFlowCapabilityRegistry,
    DEFAULT_FLOW_CAPABILITIES,
    DEFAULT_FLOW_ID,
    DEFAULT_INTEGRATION_TARGET_CAPABILITIES,
    DEFAULT_OPENAI_INTEGRATION_TARGET_ID,
    FLOW_CAPABILITIES,
    OPENAI_INTEGRATION_TARGET_CAPABILITIES,
    SIGNUP_METHOD_EMAIL,
    SIGNUP_METHOD_PHONE,
    VALID_OPENAI_INTEGRATION_TARGET_IDS,
    normalizeFlowId,
    normalizeOpenAiIntegrationTargetId,
    normalizeSignupMethod,
  };
});
