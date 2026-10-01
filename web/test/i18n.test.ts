import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSlots, keyLabels, translate } from '../src/lib/i18n.ts';

test('a translated string shows in Chinese, anything else stays English', () => {
  assert.equal(translate('zh', 'Recent notes'), '最近打开');
  assert.equal(translate('en', 'Recent notes'), 'Recent notes');
  assert.equal(translate('zh', 'Not translated yet'), 'Not translated yet');
});

test('placeholders are filled in either language', () => {
  assert.equal(translate('en', '{n} notes', { n: 3 }), '3 notes');
});

test('shortcut hints read ⌘ on Apple keyboards and Ctrl elsewhere', () => {
  assert.equal(keyLabels('按 ⌘O 查找笔记，⌘P 打开命令。', true), '按 ⌘O 查找笔记，⌘P 打开命令。');
  assert.equal(keyLabels('按 ⌘O 查找笔记，⌘P 打开命令。', false), '按 Ctrl+O 查找笔记，Ctrl+P 打开命令。');
  assert.equal(keyLabels('Search (⌘⇧F)', false), 'Search (Ctrl+Shift+F)');
  assert.equal(keyLabels('No shortcut here', false), 'No shortcut here');
});

test('markup slots are cut out of the translated sentence in place', () => {
  const zh = translate('zh', 'Create a public link so {anyone} can read this note without login.');
  assert.deepEqual(fillSlots(zh, { anyone: 'B' }), ['创建公开链接后，', 'B', '都能免登录阅读这篇笔记。']);
  assert.deepEqual(fillSlots('{a} and {b}', { a: 1 }), [1, ' and ', '{b}']);
});
