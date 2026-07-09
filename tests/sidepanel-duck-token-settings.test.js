const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('sidepanel exposes Duck token mode controls', () => {
  assert.match(html, /id="row-duck-email-generation-mode"/);
  assert.match(html, /id="select-duck-email-generation-mode"/);
  assert.match(html, /option value="page">打开页面<\/option>/);
  assert.match(html, /option value="token">Token 直连<\/option>/);
  assert.match(html, /id="row-duck-ddg-token"/);
  assert.match(html, /id="input-duck-ddg-token"/);
});

test('sidepanel persists and forwards Duck token mode settings', () => {
  assert.match(source, /const rowDuckEmailGenerationMode = document\.getElementById\('row-duck-email-generation-mode'\)/);
  assert.match(source, /const selectDuckEmailGenerationMode = document\.getElementById\('select-duck-email-generation-mode'\)/);
  assert.match(source, /const rowDuckDdgToken = document\.getElementById\('row-duck-ddg-token'\)/);
  assert.match(source, /const inputDuckDdgToken = document\.getElementById\('input-duck-ddg-token'\)/);
  assert.match(source, /duckEmailGenerationMode: getSelectedDuckEmailGenerationMode\(\)/);
  assert.match(source, /duckDdgToken: typeof inputDuckDdgToken/);
  assert.match(source, /selectDuckEmailGenerationMode\.value = normalizeDuckEmailGenerationMode\(state\?\.duckEmailGenerationMode\)/);
  assert.match(source, /inputDuckDdgToken\.value = String\(state\?\.duckDdgToken \|\| ''\)\.trim\(\)/);
  assert.match(source, /const showDuckGenerationSettings = useEmailGenerator && selectedGenerator === 'duck'/);
  assert.match(source, /const selectedDuckGenerationMode = typeof getSelectedDuckEmailGenerationMode === 'function'/);
  assert.match(source, /const showDuckDdgToken = showDuckGenerationSettings && selectedDuckGenerationMode === 'token'/);
  assert.match(source, /selectDuckEmailGenerationMode\?\.addEventListener\('change'/);
  assert.match(source, /inputDuckDdgToken\?\.addEventListener\('input'/);
  assert.match(source, /message\.payload\.duckDdgToken !== undefined/);
});
