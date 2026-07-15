(function attachMultiPageGrokWorkflow(root, factory) {
  root.MultiPageGrokWorkflow = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMultiPageGrokWorkflow() {
  function freezeDeep(entry) {
    if (!entry || typeof entry !== 'object' || Object.isFrozen(entry)) {
      return entry;
    }
    Object.getOwnPropertyNames(entry).forEach((key) => {
      freezeDeep(entry[key]);
    });
    return Object.freeze(entry);
  }

  const TARGET_WEBCHAT2API = 'webchat2api';
  const TARGET_SUB2API = 'sub2api';

  const WEBCHAT2API_STEPS = [
    {
      id: 1,
      order: 10,
      key: 'grok-open-signup-page',
      title: '打开 Grok 注册页',
      sourceId: 'grok-register-page',
      driverId: 'flows/grok/background/register-runner',
      command: 'grok-open-signup-page',
      flowId: 'grok',
    },
    {
      id: 2,
      order: 20,
      key: 'grok-submit-email',
      title: '获取邮箱并继续',
      sourceId: 'grok-register-page',
      driverId: 'flows/grok/background/register-runner',
      command: 'grok-submit-email',
      flowId: 'grok',
    },
    {
      id: 3,
      order: 30,
      key: 'grok-submit-verification-code',
      title: '获取验证码并继续',
      sourceId: 'grok-register-page',
      driverId: 'flows/grok/background/register-runner',
      command: 'grok-submit-verification-code',
      mailRuleId: 'grok-submit-verification-code',
      flowId: 'grok',
    },
    {
      id: 4,
      order: 40,
      key: 'grok-submit-profile',
      title: '填写资料并继续',
      sourceId: 'grok-register-page',
      driverId: 'flows/grok/background/register-runner',
      command: 'grok-submit-profile',
      flowId: 'grok',
    },
    {
      id: 5,
      order: 50,
      key: 'grok-extract-sso-cookie',
      title: '提取 SSO Cookie',
      sourceId: 'grok-register-page',
      driverId: 'flows/grok/background/register-runner',
      command: 'grok-extract-sso-cookie',
      flowId: 'grok',
    },
    {
      id: 6,
      order: 60,
      key: 'grok-upload-sso-to-webchat2api',
      title: '上传 SSO 到 webchat2api',
      sourceId: 'grok-webchat2api',
      driverId: 'flows/grok/background/publisher-webchat2api',
      command: 'grok-upload-sso-to-webchat2api',
      flowId: 'grok',
    },
  ];

  const SUB2API_STEPS = [
    ...WEBCHAT2API_STEPS.slice(0, -1),
    {
      id: 6,
      order: 60,
      key: 'grok-import-sso-to-sub2api',
      title: '导入 SSO 到 SUB2API',
      sourceId: 'grok-sub2api',
      driverId: 'flows/grok/background/publisher-sub2api',
      command: 'grok-import-sso-to-sub2api',
      flowId: 'grok',
    },
  ];

  const STEP_VARIANTS = freezeDeep({
    default: WEBCHAT2API_STEPS,
    webchat2api: WEBCHAT2API_STEPS,
    sub2api: SUB2API_STEPS,
  });

  function getVariantStepDefinitions(variantKey = 'default') {
    return Array.isArray(STEP_VARIANTS[variantKey]) ? STEP_VARIANTS[variantKey] : STEP_VARIANTS.default;
  }

  function getModeStepDefinitions(options = {}) {
    const targetId = String(options?.targetId || '').trim().toLowerCase();
    return getVariantStepDefinitions(targetId === TARGET_SUB2API ? TARGET_SUB2API : TARGET_WEBCHAT2API);
  }

  function getAllSteps() {
    return [
      ...getVariantStepDefinitions(TARGET_WEBCHAT2API),
      getVariantStepDefinitions(TARGET_SUB2API).at(-1),
    ];
  }

  function getPlusPaymentStepTitle() {
    return '';
  }

  function resolveStepTitle(step = {}) {
    return step?.title || '';
  }

  return {
    flowId: 'grok',
    getAllSteps,
    getModeStepDefinitions,
    getPlusPaymentStepTitle,
    getVariantStepDefinitions,
    resolveStepTitle,
  };
});
