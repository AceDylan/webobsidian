import test from 'node:test';
import assert from 'node:assert/strict';
import { keyLabels, translate } from '../src/lib/i18n.ts';

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
