// Progressionslogik – reine Funktionen, ohne DOM. Regeln: siehe konzept.md
//
// Gefühl (feel): 1 = Leicht, 2 = Gut, 3 = Schwer, 4 = Am Limit
// Übung (ex): { min, max, step, warmup, startWeight }
// Verlaufseintrag (entry): { s1: { kg, reps, target }, s2: { kg, reps, target } | null, feel }
//   target === null bedeutet: erstes Training ("so viele wie sauber gehen").

export const FEEL = { LEICHT: 1, GUT: 2, SCHWER: 3, LIMIT: 4 };
export const DEFAULT_DROP = 2;
export const DELOAD_AFTER_FAILS = 3;
export const DELOAD_FACTOR = 0.9;
export const SET2_REDUCTION_PER_REP = 0.025;

export function roundToStep(value, step) {
  if (!step || step <= 0) return round2(value);
  return round2(Math.round(value / step) * step);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function failed(entry) {
  return entry.s1.target != null && entry.s1.reps < entry.s1.target;
}

/** Wie viele Trainings in Folge (neueste zuerst) Satz 1 beim selben Gewicht nicht geschafft wurde. */
export function failStreak(history) {
  if (!history.length) return 0;
  const kg = history[0].s1.kg;
  let n = 0;
  for (const e of history) {
    if (e.s1.kg !== kg || !failed(e)) break;
    n++;
  }
  return n;
}

/** Wdh.-Abfall von Satz 1 zu Satz 2 beim letzten Mal (nur wenn gleiches Gewicht). */
export function lastDrop(entry) {
  if (!entry || !entry.s2 || entry.s2.reps == null) return DEFAULT_DROP;
  if (entry.s2.kg !== entry.s1.kg) return DEFAULT_DROP;
  return Math.max(0, entry.s1.reps - entry.s2.reps);
}

/**
 * Vorgabe fürs nächste Training.
 * history: Verlaufseinträge dieser Übung, neueste zuerst.
 * Ergebnis: { kg, reps1, reps2, first, change, reason }
 *   reps1/reps2 === null → erstes Training, so viele Wdh. wie sauber gehen.
 *   change: 'first' | 'up' | 'reps' | 'hold' | 'repeat' | 'deload'
 */
export function nextTarget(ex, history) {
  const { min, max, step } = ex;
  if (!history || history.length === 0) {
    return {
      kg: roundToStep(ex.startWeight || 0, step),
      reps1: null,
      reps2: null,
      first: true,
      change: 'first',
      reason: `Erstes Training: so viele Wdh. wie sauber gehen (Bereich ${min}–${max}).`,
    };
  }

  const last = history[0];
  const kg = last.s1.kg;
  const done = last.s1.reps;
  const target = last.s1.target;
  const feel = last.feel || FEEL.GUT;
  const drop = lastDrop(last);
  const withSet2 = (r) => ({ reps1: r, reps2: Math.max(1, r - drop) });

  // Satz 1 nicht geschafft
  if (target != null && done < target) {
    const streak = failStreak(history);
    if (streak >= DELOAD_AFTER_FAILS) {
      return {
        kg: roundToStep(kg * DELOAD_FACTOR, step),
        ...withSet2(target),
        first: false,
        change: 'deload',
        reason: `${streak}× in Folge unter Ziel – Gewicht −10 %, dann wieder hocharbeiten.`,
      };
    }
    return {
      kg,
      ...withSet2(target),
      first: false,
      change: 'repeat',
      reason: `Letztes Mal ${done} von ${target} Wdh. – gleiches Gewicht, gleiches Ziel.`,
    };
  }

  // Erstes Training unter dem Bereich
  if (target == null && done < min) {
    return {
      kg,
      ...withSet2(min),
      first: false,
      change: 'repeat',
      reason: `Letztes Mal ${done} Wdh., unter dem Bereich – gleiches Gewicht, Ziel ${min}.`,
    };
  }

  // Oberes Ende erreicht
  if (done >= max) {
    if (feel === FEEL.LEICHT) {
      return { kg: roundToStep(kg + 2 * step, step), ...withSet2(max), first: false, change: 'up',
        reason: `Oberes Ende (${max}) erreicht und leicht – doppelter Schritt.` };
    }
    if (feel === FEEL.GUT) {
      return { kg: roundToStep(kg + step, step), ...withSet2(max), first: false, change: 'up',
        reason: `Oberes Ende (${max}) erreicht – ein Schritt mehr Gewicht, Wdh. halten.` };
    }
    if (feel === FEEL.SCHWER) {
      return { kg: roundToStep(kg + step, step), ...withSet2(min), first: false, change: 'up',
        reason: `Oberes Ende erreicht, aber schwer – mehr Gewicht, zurück auf ${min} Wdh.` };
    }
    return { kg, ...withSet2(max), first: false, change: 'hold',
      reason: 'Am Limit – gleiche Werte nochmal, bis es sich sauber anfühlt.' };
  }

  // Im Bereich
  if (feel === FEEL.LEICHT || feel === FEEL.GUT) {
    const r = Math.min(max, done + 1);
    return { kg, ...withSet2(r), first: false, change: 'reps',
      reason: `Letztes Mal ${done} Wdh. – heute eine mehr.` };
  }
  return { kg, ...withSet2(Math.max(done, min)), first: false, change: 'hold',
    reason: `Letztes Mal ${done} Wdh. und ${feel === FEEL.SCHWER ? 'schwer' : 'am Limit'} – Werte halten.` };
}

/**
 * Satz 2 live anpassen, nachdem Satz 1 eingetragen wurde.
 * Ergebnis: { kg, reps, adjusted, note }
 */
export function adjustSet2({ kg1, target1, done1, plannedKg2, plannedReps2, step, min }) {
  const baseKg = plannedKg2 ?? kg1;
  if (done1 == null) return { kg: baseKg, reps: plannedReps2, adjusted: false, note: '' };
  if (target1 == null) {
    // Erstes Training: Satz 2 orientiert sich an Satz 1
    const reps = Math.max(1, done1 - DEFAULT_DROP);
    return { kg: baseKg, reps, adjusted: false, note: `Satz 2: gleiches Gewicht, Ziel ${reps} Wdh.` };
  }
  if (done1 < target1) {
    const miss = target1 - done1;
    const kg = roundToStep(kg1 * (1 - SET2_REDUCTION_PER_REP * miss), step);
    return {
      kg,
      reps: plannedReps2,
      adjusted: kg !== kg1,
      note: `${miss} Wdh. unter Ziel – Satz 2 auf ${fmtKg(kg)} kg, damit du deine ${plannedReps2} schaffst.`,
    };
  }
  if (done1 > target1) {
    return { kg: baseKg, reps: plannedReps2 + 1, adjusted: false, note: 'Mehr als geplant – Satz 2 eine Wdh. mehr.' };
  }
  return { kg: baseKg, reps: plannedReps2, adjusted: false, note: 'Ziel erreicht.' };
}

const WARMUP_SCHEMES = {
  0: [],
  1: [[0.7, 6]],
  2: [[0.6, 8], [0.8, 3]],
  3: [[0.5, 10], [0.7, 5], [0.85, 2]],
};

/** Aufwärmsätze: [{ kg, reps, pct }] */
export function warmupSets(kg, count, step) {
  const scheme = WARMUP_SCHEMES[count] || [];
  return scheme.map(([p, reps]) => ({ kg: roundToStep(kg * p, step), reps, pct: Math.round(p * 100) }));
}

export function fmtKg(n) {
  if (n == null || isNaN(n)) return '–';
  return String(round2(n)).replace('.', ',');
}
