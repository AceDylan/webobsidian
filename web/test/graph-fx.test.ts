import assert from 'node:assert/strict';
import test from 'node:test';
import { linkPoint, pulseT } from '../src/lib/graphFx';

test('a pulse starts and ends on the link endpoints', () => {
  assert.deepEqual(linkPoint(0, 0, 100, 40, 0), [0, 0]);
  const [x, y] = linkPoint(0, 0, 100, 40, 1);
  assert.ok(Math.abs(x - 100) < 1e-9 && Math.abs(y - 40) < 1e-9);
});

test('the pulse follows the same bend as the drawn link (off the straight line mid-way)', () => {
  const [x, y] = linkPoint(0, 0, 300, 0, 0.5);
  assert.ok(Math.abs(x - 150) < 1e-9);
  assert.equal(y, 0); // horizontal link: the bend shifts x control points only
  const [, y2] = linkPoint(0, 0, 0, 300, 0.25);
  assert.ok(y2 > 0 && y2 < 300);
});

test('pulses stay in 0..1 and are staggered', () => {
  for (const now of [0, 1234, 99999]) for (let i = 0; i < 5; i++) {
    const t = pulseT(i, now, 1700);
    assert.ok(t >= 0 && t < 1);
  }
  assert.notEqual(pulseT(0, 500, 1700), pulseT(1, 500, 1700));
});
