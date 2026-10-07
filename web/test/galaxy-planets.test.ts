import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANET_KINDS, planetFor, planetScale } from '../src/lib/galaxyPlanets.ts';

test('each folder keeps the same planet across loads', () => {
  assert.deepEqual(planetFor('系统', '#f4a27f', 40, 0), planetFor('系统', '#f4a27f', 40, 0));
  assert.ok(PLANET_KINDS.includes(planetFor('', '#d4d8e2', 2, 3).kind));
});

test('big folders wear rings and more moons; empty folders have none', () => {
  assert.equal(planetFor('a', '#9db7ff', 15, 0).ringed, true);
  assert.equal(planetFor('a', '#9db7ff', 0, 0).moons, 0);
  assert.equal(planetFor('a', '#9db7ff', 40, 0).moons, 3);
});

test('planet size grows with note count within bounds', () => {
  assert.equal(planetScale(0), 0.78);
  assert.ok(planetScale(5) < planetScale(30));
  assert.ok(Math.abs(planetScale(400) - 1.22) < 1e-9);
});
