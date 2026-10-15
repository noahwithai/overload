import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTarget, adjustSet2, warmupSets, roundToStep, failStreak } from '../js/progression.js';

const bench = { min: 6, max: 8, step: 1, warmup: 3, startWeight: 60 };
const e = (kg, reps, target, feel, s2reps = reps - 2, s2kg = kg) => ({
  s1: { kg, reps, target }, s2: { kg: s2kg, reps: s2reps }, feel,
});

test('erstes Training: Startgewicht, keine Wdh.-Vorgabe', () => {
  const r = nextTarget(bench, []);
  assert.equal(r.kg, 60);
  assert.equal(r.reps1, null);
  assert.equal(r.first, true);
});

test('Satz 1 unter Ziel → gleiches Gewicht, gleiches Ziel', () => {
  const r = nextTarget(bench, [e(70, 6, 8, 2)]);
  assert.deepEqual([r.kg, r.reps1, r.change], [70, 8, 'repeat']);
});

test('im Bereich + gut → +1 Wdh.', () => {
  const r = nextTarget(bench, [e(70, 6, 6, 2, 5)]);
  assert.deepEqual([r.kg, r.reps1, r.reps2], [70, 7, 6]);
});

test('im Bereich + schwer → halten', () => {
  const r = nextTarget(bench, [e(70, 7, 7, 3)]);
  assert.deepEqual([r.kg, r.reps1, r.change], [70, 7, 'hold']);
});

test('oberes Ende + gut → +1 Schritt, Wdh. halten, Satz 2 mit Abfall', () => {
  const r = nextTarget(bench, [e(70, 8, 8, 2, 6)]);
  assert.deepEqual([r.kg, r.reps1, r.reps2], [71, 8, 6]);
});

test('oberes Ende + leicht → +2 Schritte', () => {
  assert.equal(nextTarget(bench, [e(70, 8, 8, 1)]).kg, 72);
});

test('oberes Ende + schwer → +1 Schritt, zurück auf min', () => {
  const r = nextTarget(bench, [e(70, 8, 8, 3, 6)]);
  assert.deepEqual([r.kg, r.reps1, r.reps2], [71, 6, 4]);
});

test('oberes Ende + am Limit → halten', () => {
  const r = nextTarget(bench, [e(70, 8, 8, 4)]);
  assert.deepEqual([r.kg, r.reps1], [70, 8]);
});

test('3× in Folge unter Ziel beim selben Gewicht → Deload −10 %', () => {
  const h = [e(70, 6, 8, 3), e(70, 7, 8, 3), e(70, 6, 8, 3)];
  assert.equal(failStreak(h), 3);
  const r = nextTarget(bench, h);
  assert.deepEqual([r.kg, r.change], [63, 'deload']);
});

test('Fehlschläge bei anderem Gewicht zählen nicht zur Serie', () => {
  const h = [e(70, 6, 8, 3), e(70, 7, 8, 3), e(69, 6, 8, 3)];
  assert.equal(failStreak(h), 2);
  assert.equal(nextTarget(bench, h).change, 'repeat');
});

test('erstes Training ausgewertet: 7 Wdh. gut → 8', () => {
  const r = nextTarget(bench, [e(60, 7, null, 2, 5)]);
  assert.deepEqual([r.kg, r.reps1, r.reps2], [60, 8, 6]);
});

test('erstes Training unter Bereich → Ziel min', () => {
  const r = nextTarget(bench, [e(60, 4, null, 4, 3)]);
  assert.deepEqual([r.kg, r.reps1], [60, 6]);
});

test('Satz 2 mit anderem Gewicht → Standard-Abfall 2', () => {
  const r = nextTarget(bench, [e(70, 8, 8, 2, 8, 67)]);
  assert.deepEqual([r.reps1, r.reps2], [8, 6]);
});

test('Satz 2 Anpassung: 2 Wdh. unter Ziel → −5 %', () => {
  const r = adjustSet2({ kg1: 71, target1: 8, done1: 6, plannedReps2: 6, step: 1 });
  assert.equal(r.kg, 67);
  assert.equal(r.reps, 6);
  assert.equal(r.adjusted, true);
});

test('Satz 2 Anpassung: über Ziel → +1 Wdh.', () => {
  const r = adjustSet2({ kg1: 71, target1: 8, done1: 9, plannedReps2: 6, step: 1 });
  assert.deepEqual([r.kg, r.reps], [71, 7]);
});

test('Aufwärmen gerundet auf Schritt', () => {
  assert.deepEqual(warmupSets(71, 3, 1).map((w) => [w.kg, w.reps]), [[36, 10], [50, 5], [60, 2]]);
  assert.deepEqual(warmupSets(60, 2, 2.5).map((w) => w.kg), [35, 47.5]);
});

test('Rundung ohne Float-Fehler', () => {
  assert.equal(roundToStep(41.3, 1.25), 41.25);
  assert.equal(roundToStep(0.1 + 0.2, 0.1), 0.3);
});
