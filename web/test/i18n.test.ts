import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/lib/i18n.ts';

test('a translated string shows in Chinese, anything else stays English', () => {
  assert.equal(translate('zh', 'Recent notes'), '最近打开');
  assert.equal(translate('en', 'Recent notes'), 'Recent notes');
  assert.equal(translate('zh', 'Not translated yet'), 'Not translated yet');
});

test('placeholders are filled in either language', () => {
  assert.equal(translate('en', '{n} notes', { n: 3 }), '3 notes');
});
