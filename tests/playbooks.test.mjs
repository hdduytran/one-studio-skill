import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'one-studio', 'skills', 'writers-room');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const lineCount = (text) => text.replace(/\n$/, '').split('\n').length;

const skill = read('SKILL.md');
const idsAfter = (label) => {
  const m = skill.match(new RegExp(`^${label}[^\\n]*?:\\s*(.+)$`, 'm'));
  assert.ok(m, `SKILL.md lists ${label}`);
  return [...m[1].matchAll(/`([a-z0-9-]+)`/g)].map((x) => x[1]);
};
const playbookIds = idsAfter('Playbook ids');
const formatIds = idsAfter('Format ids');
const modeIds = idsAfter('Mode ids');

const HEADINGS = ['Use when', "Viewer's question", 'Story core questions', 'Beat skeleton', 'Hook types', 'Visual modes', 'Research needed', 'Traps', 'Review checklist'];

test('SKILL.md lists 14 playbooks, 4 formats, 9 modes', () => {
  assert.equal(playbookIds.length, 14);
  assert.equal(formatIds.length, 4);
  assert.equal(modeIds.length, 9);
});

for (const id of playbookIds) {
  test(`playbook ${id}: file, 9 headings in order, <= 90 lines`, () => {
    const rel = `playbooks/${id}.md`;
    assert.ok(existsSync(join(root, rel)), `${rel} exists`);
    const text = read(rel);
    assert.ok(lineCount(text) <= 90, `${rel} has ${lineCount(text)} lines`);
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    assert.deepEqual(headings, HEADINGS);
  });

  test(`playbook ${id}: visual modes valid, hooks are 3, table present`, () => {
    const text = read(`playbooks/${id}.md`);
    const section = (name) => text.split(new RegExp(`^## ${name.replace(/[']/g, "'")}$`, 'm'))[1].split(/^## /m)[0];
    const modes = [...section('Visual modes').matchAll(/^- ([a-z0-9-]+)\b/gm)].map((m) => m[1]);
    assert.ok(modes.length >= 1, 'at least one mode');
    for (const m of modes) assert.ok(modeIds.includes(m), `unknown mode ${m} in ${id}`);
    const hooks = [...section('Hook types').matchAll(/^- .+/gm)];
    assert.equal(hooks.length, 3);
    assert.match(section('Beat skeleton'), /\|\s*Beat\s*\|\s*% of runtime\s*\|\s*Job\s*\|/);
  });
}

for (const id of formatIds) {
  test(`format ${id}: file exists, <= 40 lines`, () => {
    const rel = `formats/${id}.md`;
    assert.ok(existsSync(join(root, rel)), `${rel} exists`);
    assert.ok(lineCount(read(rel)) <= 40);
  });
}

test('tones.md: 5 tones, <= 90 lines, kebab-case ids, 3 vi and 3 en samples each', () => {
  const text = read('tones.md');
  assert.ok(lineCount(text) <= 90);
  const blocks = text.split(/^## /m).slice(1);
  assert.equal(blocks.length, 5);
  for (const b of blocks) {
    assert.match(b.split('\n')[0], /^[a-z]+(-[a-z]+)*$/);
    assert.equal((b.match(/^- vi:/gm) || []).length, 3);
    assert.equal((b.match(/^- en:/gm) || []).length, 3);
    assert.match(b, /^- Banned:/m);
  }
});

test('playbooks/index.md: <= 40 lines, lists every playbook and tone id', () => {
  const text = read('playbooks/index.md');
  assert.ok(lineCount(text) <= 40);
  for (const id of playbookIds) assert.ok(text.includes(`| ${id} |`), `index has ${id}`);
  const tones = [...read('tones.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const t of tones) assert.ok(text.includes(`\`${t}\``), `index lists tone ${t}`);
});
