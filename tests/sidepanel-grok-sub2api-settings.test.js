const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

test('sidepanel exposes isolated Grok SUB2API policy controls while reusing shared credentials', () => {
  [
    'row-sub2api-url',
    'row-sub2api-email',
    'row-sub2api-password',
    'row-grok-sub2api-group',
    'input-grok-sub2api-group',
    'grok-sub2api-group-picker',
    'btn-add-grok-sub2api-group',
    'row-grok-sub2api-account-priority',
    'input-grok-sub2api-account-priority',
    'row-grok-sub2api-default-proxy',
    'input-grok-sub2api-default-proxy',
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));

  const priorityTag = html.match(/<input[^>]*id="input-grok-sub2api-account-priority"[^>]*>/)?.[0] || '';
  assert.match(priorityTag, /type="number"/);
  assert.match(priorityTag, /value="1"/);
  assert.match(priorityTag, /min="1"/);
  assert.match(priorityTag, /step="1"/);
  assert.ok(html.indexOf('id="row-grok-sub2api-group"') < html.indexOf('id="row-grok-sub2api-account-priority"'));
  assert.ok(html.indexOf('id="row-grok-sub2api-account-priority"') < html.indexOf('id="row-grok-sub2api-default-proxy"'));
});

test('sidepanel saves, restores, and auto-saves isolated Grok SUB2API policy', () => {
  assert.match(source, /const DEFAULT_GROK_SUB2API_GROUP_OPTIONS = \[\];/);
  assert.match(html, /id="input-grok-sub2api-group" value=""/);
  assert.match(source, /fallbackItems: DEFAULT_GROK_SUB2API_GROUP_OPTIONS,/);
  assert.match(source, /minItems: 0,/);
  assert.match(source, /grokSub2apiGroupName:\s*selectedGrokSub2ApiGroupName/);
  assert.match(source, /grokSub2apiGroupNames/);
  assert.match(source, /grokSub2apiAccountPriority:\s*sub2apiAccountPriorityNormalizer/);
  assert.match(source, /const grokSub2apiDefaultProxyName = typeof inputGrokSub2ApiDefaultProxy/);
  assert.match(source, /grokSub2apiDefaultProxyName,/);
  assert.match(source, /renderGrokSub2ApiGroupOptions\(state, state\?\.grokSub2apiGroupName \|\| ''\);/);
  assert.match(source, /inputGrokSub2ApiAccountPriority\.value = String\(normalizeSub2ApiAccountPriorityValue\(state\?\.grokSub2apiAccountPriority\)\);/);
  assert.match(source, /inputGrokSub2ApiDefaultProxy\.value = state\?\.grokSub2apiDefaultProxyName \|\| '';/);
  assert.match(source, /inputGrokSub2ApiAccountPriority\.addEventListener\('input'/);
  assert.match(source, /inputGrokSub2ApiDefaultProxy\.addEventListener\('input'/);
  assert.match(source, /btnAddGrokSub2ApiGroup\?\.addEventListener\('click'/);
});

test('README documents Grok SUB2API account naming contract', () => {
  assert.match(readme, /Grok/);
  assert.match(readme, /SUB2API/);
  assert.match(readme, /注册邮箱.*账号名称/);
});
