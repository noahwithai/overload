import { nextTarget, adjustSet2, warmupSets, roundToStep, fmtKg } from './progression.js';
import { loadState, saveState, requestPersistence } from './db.js';

const APP_VERSION = '1.0.0';
const $view = document.getElementById('view');
const $tabbar = document.getElementById('tabbar');
const $toast = document.getElementById('toast');

const FEELS = [
  { v: 1, t: 'Leicht', h: 'Hätte noch 3+ Wdh. geschafft' },
  { v: 2, t: 'Gut', h: 'Noch 1–2 Wdh. drin' },
  { v: 3, t: 'Schwer', h: 'Keine Wdh. mehr drin' },
  { v: 4, t: 'Am Limit', h: 'Technik hat gelitten' },
];
const FEEL_LABEL = { 1: 'Leicht', 2: 'Gut', 3: 'Schwer', 4: 'Am Limit' };
const STEP_SIZES = [0.5, 1, 1.25, 2, 2.5, 5];
const NO_TABBAR = new Set(['train', 'planEdit', 'exEdit']);

let state = emptyState();
let route = { name: 'home' };
const ui = { homeDay: null, planSel: null, daySel: null, draft: null, exDraft: null };

// ---------- Hilfsfunktionen ----------
function emptyState() {
  return { v: 1, plans: [], activePlanId: null, sessions: [], current: null, lastBackup: null };
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (sec) => {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function persist() { saveState(state); }

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 2400);
}

function daysAgo(iso) {
  const d = new Date(iso); const now = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((b - a) / 86400000);
  if (n <= 0) return 'heute';
  if (n === 1) return 'gestern';
  return `vor ${n} Tagen`;
}
const shortDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
  plans: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

// ---------- Daten-Zugriff ----------
function activePlan() {
  return state.plans.find((p) => p.id === state.activePlanId) || state.plans[0] || null;
}
function getPlan(id) { return state.plans.find((p) => p.id === id) || null; }
function getDay(plan, dayId) { return plan ? plan.days.find((d) => d.id === dayId) || null : null; }

/** Verlauf einer Übung, neueste zuerst. */
function history(exId) {
  const out = [];
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    for (const e of s.entries) {
      if (e.exId === exId && e.s1 && e.s1.reps != null) out.push({ ...e, date: s.date });
    }
  }
  return out;
}

function nextDayId(plan) {
  if (!plan || !plan.days.length) return null;
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.planId !== plan.id) continue;
    const idx = plan.days.findIndex((d) => d.id === s.dayId);
    if (idx >= 0) return plan.days[(idx + 1) % plan.days.length].id;
  }
  return plan.days[0].id;
}

function targetFor(ex) { return nextTarget(ex, history(ex.id)); }

function fmtTarget(t, ex) {
  if (t.first) return `${fmtKg(t.kg)} kg × ${ex.min}–${ex.max}`;
  return `${fmtKg(t.kg)} kg × ${t.reps1} / ${t.reps2}`;
}

function changeChip(t, hist) {
  switch (t.change) {
    case 'first': return '<span class="chip">neu</span>';
    case 'up': return `<span class="chip up">+${fmtKg(roundToStep(t.kg - hist[0].s1.kg, 0.01))} kg</span>`;
    case 'reps': return '<span class="chip up">+1 Wdh.</span>';
    case 'repeat': return '<span class="chip warn">nochmal</span>';
    case 'deload': return '<span class="chip warn">−10 %</span>';
    default: return '<span class="chip">halten</span>';
  }
}

function lastLine(hist) {
  if (!hist.length) return 'Noch kein Training';
  const h = hist[0];
  const s2 = h.s2 && h.s2.reps != null ? ` / ${h.s2.reps}` : '';
  const feel = h.feel ? ` · ${FEEL_LABEL[h.feel]}` : '';
  return `Zuletzt ${fmtKg(h.s1.kg)} kg · ${h.s1.reps}${s2}${feel}`;
}

// ---------- Navigation ----------
function go(name, params = {}) {
  route = { name, ...params };
  render();
  window.scrollTo(0, 0);
}

function render() {
  const fn = SCREENS[route.name] || SCREENS.home;
  $view.innerHTML = fn();
  document.body.classList.toggle('no-tabbar', NO_TABBAR.has(route.name));
  renderTabbar();
  tick();
}

function renderTabbar() {
  const tabs = [
    ['home', 'Heute', ICON.today],
    ['plans', 'Pläne', ICON.plans],
    ['history', 'Verlauf', ICON.history],
    ['settings', 'Einstellungen', ICON.settings],
  ];
  const cur = route.name === 'exHistory' ? 'history' : route.name;
  $tabbar.innerHTML = tabs.map(([r, label, icon]) =>
    `<button type="button" data-r="${r}" ${cur === r ? 'aria-current="page"' : ''}>${icon}${label}</button>`
  ).join('');
}

// ---------- Screens ----------
const SCREENS = {};

SCREENS.home = () => {
  const plan = activePlan();
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  if (!plan) {
    return `
      <div class="eyebrow">${esc(dateStr)}</div>
      <h1>Overload</h1>
      <div class="empty">
        <p>Leg deinen Trainingsplan an: Trainingstage und Übungen mit Wiederholungsbereich und Startgewicht. Danach sagt dir die App jedes Mal, was dran ist.</p>
      </div>
      <button type="button" class="btn" data-a="newPlan">Ersten Plan anlegen</button>`;
  }

  const cur = state.current;
  let resume = '';
  if (cur) {
    const p = getPlan(cur.planId); const d = getDay(p, cur.planId ? cur.dayId : null);
    if (d) {
      resume = `
        <div class="card accent section" style="margin-top:16px">
          <div class="between"><strong>Training läuft: ${esc(d.name)}</strong><span class="small">Übung ${Math.min(cur.idx + 1, d.exercises.length)} von ${d.exercises.length}</span></div>
          <button type="button" class="btn" data-a="resume">Training fortsetzen</button>
        </div>`;
    }
  }

  if (!plan.days.length) {
    return `
      <div class="eyebrow">${esc(dateStr)}</div>
      <h1>${esc(plan.name)}</h1>
      <div class="empty"><p>Dein Plan hat noch keine Trainingstage.</p></div>
      <button type="button" class="btn" data-a="editPlan" data-id="${plan.id}">Trainingstage anlegen</button>`;
  }

  const suggested = nextDayId(plan);
  let dayId = ui.homeDay && getDay(plan, ui.homeDay) ? ui.homeDay : suggested;
  const day = getDay(plan, dayId);

  const lastOfDay = [...state.sessions].reverse().find((s) => s.planId === plan.id && s.dayId === day.id);
  const meta = [`${day.exercises.length} Übung${day.exercises.length === 1 ? '' : 'en'}`];
  if (lastOfDay) meta.push(`zuletzt ${daysAgo(lastOfDay.date)}`);

  const pills = plan.days.length > 1 ? `
    <div class="pills" style="margin-top:14px" role="group" aria-label="Trainingstag wählen">
      ${plan.days.map((d) => `<button type="button" class="pill" data-a="homeDay" data-id="${d.id}" aria-pressed="${d.id === day.id}">${esc(d.name)}</button>`).join('')}
    </div>` : '';

  const exCards = day.exercises.map((ex) => {
    const hist = history(ex.id);
    const t = nextTarget(ex, hist);
    return `
      <div class="card ex-row">
        <div class="grow">
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-sub">${esc(lastLine(hist))}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="ex-target num">${esc(fmtTarget(t, ex))}</div>
          ${changeChip(t, hist)}
        </div>
      </div>`;
  }).join('');

  const backupNag = backupReminder();

  const cta = cur
    ? ''
    : day.exercises.length
      ? `<div class="sticky-cta"><button type="button" class="btn" data-a="start" data-id="${day.id}">Training starten</button></div>`
      : `<div class="card" style="margin-top:16px"><p class="muted" style="margin:0 0 12px">An diesem Tag sind noch keine Übungen.</p><button type="button" class="btn secondary" data-a="goPlans" data-day="${day.id}">Übungen hinzufügen</button></div>`;

  return `
    <div class="eyebrow">${esc(dateStr)}</div>
    <div class="between" style="align-items:flex-end"><h1>${esc(day.name)}</h1></div>
    <div class="eyebrow" style="margin-top:4px">${esc(meta.join(' · '))}</div>
    ${pills}
    ${resume}
    ${backupNag}
    <div class="section">
      <div class="between"><h2>Vorgabe für heute</h2><span class="small muted">Satz 1 / Satz 2</span></div>
      ${exCards}
    </div>
    ${cta}`;
};

function backupReminder() {
  if (!state.sessions.length) return '';
  const lastSession = state.sessions[state.sessions.length - 1].date;
  if (state.lastBackup && state.lastBackup >= lastSession) return '';
  const ref = state.lastBackup || state.sessions[0].date;
  const days = (Date.now() - new Date(ref).getTime()) / 86400000;
  if (state.lastBackup && days < 14) return '';
  if (!state.lastBackup && state.sessions.length < 3) return '';
  return `
    <div class="card dashed row" style="margin-top:16px">
      <div class="grow small">${state.lastBackup ? `Letztes Backup ${daysAgo(state.lastBackup)}.` : 'Noch kein Backup gemacht.'} Deine Daten liegen nur auf diesem iPhone.</div>
      <button type="button" class="pill" data-a="go" data-r="settings">Sichern</button>
    </div>`;
}

// ----- Training -----
function curContext() {
  const cur = state.current;
  if (!cur) return null;
  const plan = getPlan(cur.planId);
  const day = getDay(plan, cur.dayId);
  if (!day || !day.exercises.length) return null;
  cur.idx = clamp(cur.idx, 0, day.exercises.length - 1);
  const ex = day.exercises[cur.idx];
  return { cur, plan, day, ex, en: ensureEntry(ex) };
}

function ensureEntry(ex) {
  const cur = state.current;
  if (!cur.entries[ex.id]) {
    const t = targetFor(ex);
    cur.entries[ex.id] = {
      s1: { kg: t.kg, reps: null, target: t.reps1 },
      s2: { kg: t.kg, reps: null, target: t.reps2, manual: false },
      feel: null,
      skipped: false,
      note1: '',
      noteWarn: false,
      plan: { kg: t.kg, reps2: t.reps2, reason: t.reason, change: t.change, first: t.first },
    };
  }
  return cur.entries[ex.id];
}

function recomputeSet2(ex, en) {
  if (en.s2.manual) return;
  if (en.s1.reps == null) {
    en.s2.kg = en.s1.kg;
    en.s2.target = en.plan.reps2;
    en.note1 = '';
    en.noteWarn = false;
    return;
  }
  const adj = adjustSet2({
    kg1: en.s1.kg, target1: en.s1.target, done1: en.s1.reps,
    plannedKg2: en.s1.kg, plannedReps2: en.plan.reps2, step: ex.step, min: ex.min,
  });
  en.s2.kg = adj.kg;
  en.s2.target = adj.reps;
  en.note1 = adj.note;
  en.noteWarn = adj.adjusted;
}

function chipValues(target, ex) {
  if (target == null) {
    const lo = Math.max(1, ex.min - 2);
    const hi = ex.max + 1;
    const vals = [];
    for (let v = lo; v <= hi && vals.length < 7; v++) vals.push(v);
    return vals;
  }
  const vals = [];
  for (let v = target - 3; v <= target + 2; v++) if (v >= 1) vals.push(v);
  return vals;
}

function setCard({ n, set, ex, kg1, tag, tagColor, last, note, noteClass }) {
  const vals = chipValues(set.target, ex);
  if (set.reps != null && !vals.includes(set.reps)) vals.push(set.reps);
  vals.sort((a, b) => a - b);
  const targetTxt = set.target == null ? `${ex.min}–${ex.max}` : set.target;
  const done = set.reps != null;
  return `
    <div class="card setcard ${done ? 'done' : ''}">
      <div class="head">
        <div><span class="small muted" style="font-weight:600">Satz ${n}</span><span class="tag" style="color:${tagColor}">${esc(tag)}</span></div>
        <span class="small muted">${esc(last)}</span>
      </div>
      <div class="row" style="justify-content:space-between">
        <div class="kgctrl">
          <button type="button" class="stepbtn" data-a="kg" data-set="${n}" data-d="-1" aria-label="Satz ${n}: Gewicht verringern">−</button>
          <span class="big num" style="${n === 2 && set.kg !== kg1 ? 'color:var(--warn)' : ''}">${fmtKg(set.kg)} kg</span>
          <button type="button" class="stepbtn" data-a="kg" data-set="${n}" data-d="1" aria-label="Satz ${n}: Gewicht erhöhen">+</button>
        </div>
        <span class="big num">× ${targetTxt}</span>
      </div>
      <div class="stack" style="gap:6px">
        <span class="small muted">Geschafft:</span>
        <div class="grid" style="grid-template-columns:repeat(${vals.length + 1},minmax(0,1fr))" role="group" aria-label="Satz ${n}: geschaffte Wiederholungen">
          ${vals.map((v) => `<button type="button" class="choice ${v === set.target ? 'target' : ''}" data-a="reps" data-set="${n}" data-v="${v}" aria-pressed="${set.reps === v}">${v}</button>`).join('')}
          <button type="button" class="choice" data-a="repsOther" data-set="${n}" aria-label="Andere Anzahl" style="font-size:15px">…</button>
        </div>
      </div>
      ${note ? `<div class="note ${noteClass || ''}">${esc(note)}</div>` : ''}
    </div>`;
}

SCREENS.train = () => {
  const c = curContext();
  if (!c) { state.current = null; persist(); return SCREENS.home(); }
  const { cur, day, ex, en } = c;
  if (cur.phase === 'feel') return renderFeel(c);

  const hist = history(ex.id);
  const last = hist[0];

  const dots = day.exercises.map((e, i) => {
    const ent = cur.entries[e.id];
    const cls = i === cur.idx ? 'current' : ent && (ent.feel || ent.skipped) ? 'done' : '';
    return `<button type="button" class="${cls}" data-a="jump" data-i="${i}" aria-label="Übung ${i + 1}: ${esc(e.name)}"><span></span></button>`;
  }).join('');

  const warm = ex.warmup > 0
    ? `<div class="card dashed between" style="margin-top:12px;align-items:center">
         <h2>Aufwärmen</h2>
         <span class="num" style="font-size:18px">${warmupSets(en.s1.kg, ex.warmup, ex.step).map((w) => `${fmtKg(w.kg)}×${w.reps}`).join(' · ')}</span>
       </div>`
    : '';

  let note2 = '', note2Class = '';
  if (en.s2.reps != null && en.s2.target != null) {
    if (en.s2.reps < en.s2.target) { note2 = 'Unter Ziel – wird gespeichert, zählt aber nicht für die Steigerung.'; }
    else { note2 = 'Satz 2 geschafft.'; note2Class = 'ok'; }
  }

  const set1 = setCard({
    n: 1, set: en.s1, ex, kg1: en.s1.kg, tag: 'zählt', tagColor: 'var(--accent)',
    last: last ? `zuletzt ${fmtKg(last.s1.kg)} × ${last.s1.reps}` : 'erstes Mal',
    note: en.note1, noteClass: en.noteWarn ? 'warn' : 'ok',
  });
  const set2 = setCard({
    n: 2, set: en.s2, ex, kg1: en.s1.kg,
    tag: en.s2.kg !== en.s1.kg ? (en.s2.manual ? 'manuell' : 'angepasst') : 'Back-off',
    tagColor: en.s2.kg !== en.s1.kg ? 'var(--warn)' : 'var(--muted)',
    last: last && last.s2 && last.s2.reps != null ? `zuletzt ${fmtKg(last.s2.kg)} × ${last.s2.reps}` : '',
    note: note2, noteClass: note2Class,
  });

  const rest = cur.restUntil ? `
    <div class="card rest" id="rest" style="margin-top:12px">
      <div class="row"><h2>Pause</h2><span class="time num" id="rest-time">–</span></div>
      <div class="row">
        <button type="button" class="pill" data-a="restAdd">+30 s</button>
        <button type="button" class="pill" data-a="restStop">Stopp</button>
      </div>
    </div>` : '';

  const isLast = cur.idx === day.exercises.length - 1;
  return `
    <div class="topbar">
      <button type="button" class="iconbtn plain" data-a="go" data-r="home" aria-label="Zur Übersicht">${ICON.back}</button>
      <span class="small muted">Übung ${cur.idx + 1} von ${day.exercises.length} · <span id="elapsed">0:00</span></span>
      <button type="button" class="textbtn" data-a="finish">Beenden</button>
    </div>
    <div class="progress">${dots}</div>
    <h1 style="margin-top:10px">${esc(ex.name)}</h1>
    <div class="eyebrow" style="margin-top:4px">Bereich ${ex.min}–${ex.max} · Schritt ${fmtKg(ex.step)} kg · Pause ${mmss(ex.rest)}</div>
    <div class="card accent row" style="margin-top:12px;align-items:flex-start">
      <span style="width:20px;height:20px;flex-shrink:0;color:var(--accent)">${ICON.arrowUp}</span>
      <span class="small" style="line-height:1.4">${esc(en.plan.reason)}</span>
    </div>
    ${warm}
    <div class="stack" style="gap:10px;margin-top:12px">${set1}${set2}</div>
    ${rest}
    <div class="sticky-cta stack">
      <button type="button" class="btn" data-a="toFeel">Übung abschließen</button>
    </div>
    <button type="button" class="btn ghost" data-a="skip">${isLast ? 'Übung auslassen' : 'Übung auslassen und weiter'}</button>`;
};

function renderFeel({ cur, day, ex, en }) {
  const hist = history(ex.id);
  let preview = '';
  if (en.feel) {
    const hyp = { s1: { kg: en.s1.kg, reps: en.s1.reps, target: en.s1.target }, s2: en.s2.reps != null ? { kg: en.s2.kg, reps: en.s2.reps } : null, feel: en.feel };
    const t = nextTarget(ex, [hyp, ...hist]);
    preview = `
      <div class="card section">
        <h2>Nächstes Mal</h2>
        <div class="num" style="font-size:36px;color:var(--accent)">${esc(fmtTarget(t, ex))}</div>
        <div class="small" style="line-height:1.45;color:#D5D7DB">${esc(t.reason)}</div>
      </div>`;
  }
  const nextEx = day.exercises[cur.idx + 1];
  const s2txt = en.s2.reps != null ? ` / ${en.s2.reps}` : '';
  return `
    <div class="topbar">
      <button type="button" class="iconbtn plain" data-a="backSets" aria-label="Zurück zu den Sätzen">${ICON.back}</button>
      <span class="small muted">Übung ${cur.idx + 1} von ${day.exercises.length}</span>
      <span style="width:44px"></span>
    </div>
    <div class="eyebrow" style="margin-top:8px">${esc(ex.name)} · ${fmtKg(en.s1.kg)} kg · ${en.s1.reps}${s2txt}</div>
    <h1>Wie schwer war Satz 1?</h1>
    <div class="eyebrow" style="margin-top:4px">Der erste Satz entscheidet über die Steigerung.</div>
    <div class="stack" style="gap:10px;margin-top:18px" role="group" aria-label="Gefühl">
      ${FEELS.map((f) => `
        <button type="button" class="feel" data-a="feel" data-v="${f.v}" aria-pressed="${en.feel === f.v}">
          <span class="n num">${f.v}</span>
          <span><span class="t">${f.t}</span><span class="h">${f.h}</span></span>
        </button>`).join('')}
    </div>
    ${preview}
    <div class="sticky-cta">
      <button type="button" class="btn" data-a="next" ${en.feel ? '' : 'disabled'}>${nextEx ? `Weiter: ${esc(nextEx.name)}` : 'Training beenden'}</button>
    </div>`;
}

// ----- Pläne -----
SCREENS.plans = () => {
  if (!state.plans.length) {
    return `
      <h1>Pläne</h1>
      <div class="empty"><p>Noch kein Plan angelegt.</p></div>
      <button type="button" class="btn" data-a="newPlan">Plan anlegen</button>`;
  }
  let plan = getPlan(ui.planSel) || activePlan();
  ui.planSel = plan.id;
  const isActive = plan.id === (activePlan() && activePlan().id);
  let day = getDay(plan, ui.daySel) || plan.days[0] || null;
  ui.daySel = day ? day.id : null;

  const planPills = state.plans.length > 1 ? `
    <div class="pills" style="margin-top:14px" role="group" aria-label="Plan wählen">
      ${state.plans.map((p) => `<button type="button" class="pill" data-a="selPlan" data-id="${p.id}" aria-pressed="${p.id === plan.id}">${esc(p.name)}</button>`).join('')}
    </div>` : '';

  const dayPills = plan.days.length ? `
    <div class="pills" role="group" aria-label="Trainingstag wählen">
      ${plan.days.map((d) => `<button type="button" class="pill" data-a="selDay" data-id="${d.id}" aria-pressed="${day && d.id === day.id}">${esc(d.name)}</button>`).join('')}
    </div>` : '';

  const exList = day ? day.exercises.map((ex, i) => `
    <div class="card">
      <div class="list-item">
        <div class="ex-name grow">${esc(ex.name)}</div>
        <button type="button" class="iconbtn plain" data-a="moveEx" data-i="${i}" data-d="-1" aria-label="${esc(ex.name)} nach oben" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.up}</button>
        <button type="button" class="iconbtn plain" data-a="moveEx" data-i="${i}" data-d="1" aria-label="${esc(ex.name)} nach unten" ${i === day.exercises.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ICON.down}</button>
        <button type="button" class="iconbtn plain" data-a="editEx" data-id="${ex.id}" aria-label="${esc(ex.name)} bearbeiten">${ICON.edit}</button>
      </div>
      <div class="mini-grid">
        <div class="mini"><span class="l">Wdh.</span><span class="v num">${ex.min}–${ex.max}</span></div>
        <div class="mini"><span class="l">Schritt</span><span class="v num">${fmtKg(ex.step)} kg</span></div>
        <div class="mini"><span class="l">Warm-up</span><span class="v num">${ex.warmup}</span></div>
        <div class="mini"><span class="l">Pause</span><span class="v num">${mmss(ex.rest)}</span></div>
      </div>
    </div>`).join('') : '';

  return `
    <div class="between" style="align-items:center">
      <h1>Pläne</h1>
      <button type="button" class="iconbtn" data-a="newPlan" aria-label="Neuen Plan anlegen">${ICON.plus}</button>
    </div>
    ${planPills}
    <div class="card row" style="margin-top:14px">
      <div class="grow">
        <div class="ex-name">${esc(plan.name)}</div>
        <div class="ex-sub">${plan.days.length} Trainingstag${plan.days.length === 1 ? '' : 'e'}${isActive ? ' · aktiv' : ''}</div>
      </div>
      ${isActive ? '' : `<button type="button" class="pill" data-a="activate" data-id="${plan.id}">Aktivieren</button>`}
      <button type="button" class="pill" data-a="editPlan" data-id="${plan.id}">Bearbeiten</button>
    </div>
    <div class="section">
      ${day ? `${dayPills}${exList}
        <button type="button" class="btn dashed" data-a="newEx">${ICON.plus}Übung zu ${esc(day.name)} hinzufügen</button>`
        : `<div class="card"><p class="muted" style="margin:0 0 12px">Dieser Plan hat noch keine Trainingstage.</p><button type="button" class="btn secondary" data-a="editPlan" data-id="${plan.id}">Trainingstage anlegen</button></div>`}
    </div>`;
};

SCREENS.planEdit = () => {
  const d = ui.draft;
  return `
    <div class="topbar">
      <button type="button" class="textbtn" data-a="cancelPlan">Abbrechen</button>
      <span class="title">${d.isNew ? 'Neuer Plan' : 'Plan bearbeiten'}</span>
      <button type="button" class="textbtn primary" data-a="savePlan">Sichern</button>
    </div>
    <label class="field" style="margin-top:12px">
      <h2>Name des Plans</h2>
      <input class="input" type="text" data-f="planName" value="${esc(d.name)}" placeholder="z. B. Push / Pull / Beine" autocomplete="off">
    </label>
    <div class="section">
      <div class="between"><h2>Trainingstage</h2><span class="small muted">Reihenfolge = Rotation</span></div>
      ${d.days.map((day, i) => `
        <div class="card tight list-item">
          <label class="sr-only" for="day-${i}">Name Trainingstag ${i + 1}</label>
          <input id="day-${i}" class="input grow" style="height:44px;background:var(--surface-2)" type="text" data-f="dayName" data-i="${i}" value="${esc(day.name)}" placeholder="z. B. Push A" autocomplete="off">
          <button type="button" class="iconbtn plain" data-a="moveDay" data-i="${i}" data-d="-1" aria-label="Nach oben" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.up}</button>
          <button type="button" class="iconbtn plain" data-a="moveDay" data-i="${i}" data-d="1" aria-label="Nach unten" ${i === d.days.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ICON.down}</button>
          <button type="button" class="iconbtn plain" data-a="delDay" data-i="${i}" aria-label="Trainingstag löschen">${ICON.trash}</button>
        </div>
        ${day.exercises.length ? `<div class="small muted" style="margin:-4px 0 0 4px">${day.exercises.length} Übung${day.exercises.length === 1 ? '' : 'en'}</div>` : ''}`).join('')}
      <button type="button" class="btn dashed" data-a="addDay">${ICON.plus}Trainingstag hinzufügen</button>
    </div>
    <div class="card section small" style="line-height:1.45">„Heute“ schlägt immer den nächsten Tag der Rotation vor. Übungen fügst du nach dem Sichern im Tab „Pläne“ hinzu.</div>
    <div class="sticky-cta stack">
      <button type="button" class="btn" data-a="savePlan">Plan sichern</button>
    </div>
    ${d.isNew ? '' : '<button type="button" class="btn danger" style="margin-top:12px" data-a="delPlan">Plan löschen</button>'}`;
};

SCREENS.exEdit = () => {
  const d = ui.exDraft;
  const ex = d.ex;
  const plan = getPlan(d.planId); const day = getDay(plan, d.dayId);
  const hist = d.isNew ? [] : history(ex.id);
  const stepper = (label, key, value, extra = '') => `
    <div class="stepper">
      <span class="small muted">${label}</span>
      <div class="ctrl">
        <button type="button" class="stepbtn" data-a="exStep" data-k="${key}" data-d="-1" aria-label="${label} verringern">−</button>
        <button type="button" class="val num" style="background:none;border:none;padding:0 4px;min-height:44px" data-a="exPrompt" data-k="${key}" aria-label="${label} eingeben">${value}</button>
        <button type="button" class="stepbtn" data-a="exStep" data-k="${key}" data-d="1" aria-label="${label} erhöhen">+</button>
      </div>${extra}
    </div>`;

  const wu = warmupSets(ex.startWeight, ex.warmup, ex.step);
  let preview;
  if (hist.length) {
    const t = nextTarget(ex, hist);
    preview = `
      <h2 style="color:var(--accent)">Nächstes Training</h2>
      <span class="num" style="font-size:24px">${esc(fmtTarget(t, ex))}</span>
      <span class="small">${esc(t.reason)}</span>
      <span class="small muted">Diese Übung hat schon Verlauf – das Startgewicht wird nicht mehr verwendet.</span>`;
  } else {
    preview = `
      <h2 style="color:var(--accent)">Erstes Training</h2>
      <span class="num" style="font-size:24px">${fmtKg(ex.startWeight)} kg × ${ex.min}–${ex.max} (2 Sätze)</span>
      <span class="small">${wu.length ? 'Aufwärmen: ' + wu.map((w) => `${fmtKg(w.kg)}×${w.reps}`).join(' · ') : 'Kein Aufwärmen'}</span>
      <span class="small" style="color:#D5D7DB">So viele Wdh. wie sauber gehen. Ab dem zweiten Mal rechnet die App.</span>`;
  }

  return `
    <div class="topbar">
      <button type="button" class="textbtn" data-a="cancelEx">Abbrechen</button>
      <span class="title">${d.isNew ? 'Übung zu ' + esc(day ? day.name : '') : 'Übung bearbeiten'}</span>
      <button type="button" class="textbtn primary" data-a="saveEx">Sichern</button>
    </div>
    <label class="field" style="margin-top:12px">
      <h2>Name</h2>
      <input class="input" type="text" data-f="exName" value="${esc(ex.name)}" placeholder="z. B. Bankdrücken" autocomplete="off">
    </label>
    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px">
      ${stepper('Wdh. von', 'min', ex.min)}
      ${stepper('Wdh. bis', 'max', ex.max)}
      ${stepper('Startgewicht', 'startWeight', fmtKg(ex.startWeight) + ' kg')}
      ${stepper('Pause', 'rest', mmss(ex.rest))}
    </div>
    <div class="section" style="gap:6px">
      <h2>Kleinster Gewichtsschritt (kg)</h2>
      <div class="grid" style="grid-template-columns:repeat(6,minmax(0,1fr))" role="group" aria-label="Kleinster Gewichtsschritt">
        ${STEP_SIZES.map((s) => `<button type="button" class="choice" data-a="exStepSize" data-v="${s}" aria-pressed="${ex.step === s}">${fmtKg(s)}</button>`).join('')}
      </div>
      ${STEP_SIZES.includes(ex.step) ? '' : `<span class="small muted">Eigener Schritt: ${fmtKg(ex.step)} kg</span>`}
      <button type="button" class="textbtn" style="align-self:flex-start;padding:0;font-size:14px" data-a="exPrompt" data-k="step">Anderen Schritt eingeben</button>
    </div>
    <div class="section" style="gap:6px">
      <h2>Aufwärmsätze</h2>
      <div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr))" role="group" aria-label="Aufwärmsätze">
        ${[0, 1, 2, 3].map((v) => `<button type="button" class="choice" data-a="exWarm" data-v="${v}" aria-pressed="${ex.warmup === v}">${v}</button>`).join('')}
      </div>
    </div>
    <div class="card accent stack" style="margin-top:18px;gap:6px">${preview}</div>
    <div class="sticky-cta"><button type="button" class="btn" data-a="saveEx">Übung sichern</button></div>
    ${d.isNew ? '' : '<button type="button" class="btn danger" style="margin-top:12px" data-a="delEx">Übung löschen</button>'}`;
};

// ----- Verlauf -----
SCREENS.history = () => {
  if (!state.sessions.length) {
    return `<h1>Verlauf</h1><div class="empty"><p>Noch keine Trainings gespeichert. Nach deinem ersten Training siehst du hier deinen Fortschritt pro Übung.</p></div>`;
  }
  const exs = [];
  const seen = new Set();
  const addEx = (ex) => { if (!seen.has(ex.id)) { seen.add(ex.id); exs.push(ex); } };
  const ap = activePlan();
  if (ap) ap.days.forEach((d) => d.exercises.forEach(addEx));
  state.plans.forEach((p) => p.days.forEach((d) => d.exercises.forEach(addEx)));
  const withHist = exs.map((ex) => ({ ex, hist: history(ex.id) })).filter((x) => x.hist.length);

  const recent = [...state.sessions].reverse().slice(0, 15);
  return `
    <h1>Verlauf</h1>
    <div class="section">
      <h2>Übungen</h2>
      ${withHist.length ? withHist.map(({ ex, hist }) => `
        <button type="button" class="card ex-row" style="width:100%;border:none;text-align:left" data-a="exHist" data-id="${ex.id}">
          <div class="grow">
            <div class="ex-name">${esc(ex.name)}</div>
            <div class="ex-sub">${esc(lastLine(hist))} · ${hist.length}×</div>
          </div>
          <span style="width:20px;height:20px;color:var(--muted)">${ICON.chevron}</span>
        </button>`).join('') : '<p class="muted small">Keine Übungen mit Verlauf.</p>'}
    </div>
    <div class="section">
      <h2>Letzte Trainings</h2>
      ${recent.map((s) => `
        <div class="card tight list-item">
          <span class="small muted" style="width:52px">${shortDate(s.date)}</span>
          <div class="grow">
            <div style="font-weight:600">${esc(s.dayName || 'Training')}</div>
            <div class="small muted">${s.entries.length} Übung${s.entries.length === 1 ? '' : 'en'}</div>
          </div>
          <button type="button" class="iconbtn plain" data-a="delSession" data-id="${s.id}" aria-label="Training vom ${shortDate(s.date)} löschen">${ICON.trash}</button>
        </div>`).join('')}
    </div>`;
};

SCREENS.exHistory = () => {
  let ex = null;
  for (const p of state.plans) for (const d of p.days) for (const e of d.exercises) if (e.id === route.id) ex = e;
  const hist = history(route.id);
  if (!hist.length) return SCREENS.history();
  const name = ex ? ex.name : hist[0].name;
  const chrono = [...hist].reverse();
  let chart = '';
  if (chrono.length >= 2) {
    const pts = chrono.slice(-20);
    const kgs = pts.map((h) => h.s1.kg);
    const lo = Math.min(...kgs), hi = Math.max(...kgs);
    const W = 320, H = 100, pad = 8;
    const xy = pts.map((h, i) => {
      const x = pad + (i * (W - 2 * pad)) / (pts.length - 1);
      const y = hi === lo ? H / 2 : H - pad - ((h.s1.kg - lo) * (H - 2 * pad)) / (hi - lo);
      return [x.toFixed(1), y.toFixed(1)];
    });
    chart = `
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Arbeitsgewicht Satz 1: ${kgs.map(fmtKg).join(', ')} kg">
        <polyline points="${xy.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#C8F24A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      </svg>`;
  }
  const delta = roundToStep(hist[0].s1.kg - chrono[0].s1.kg, 0.01);
  const next = ex ? nextTarget(ex, hist) : null;
  return `
    <div class="topbar">
      <button type="button" class="iconbtn plain" data-a="go" data-r="history" aria-label="Zurück">${ICON.back}</button>
      <span></span><span style="width:44px"></span>
    </div>
    <div class="eyebrow">Verlauf</div>
    <h1>${esc(name)}</h1>
    <div class="card section">
      <div class="between">
        <div><h2>Arbeitsgewicht</h2><div class="num" style="font-size:34px">${fmtKg(hist[0].s1.kg)} kg</div></div>
        <span class="small" style="font-weight:600;color:${delta > 0 ? 'var(--accent)' : 'var(--muted)'}">${delta > 0 ? '+' : ''}${fmtKg(delta)} kg seit Beginn</span>
      </div>
      ${chart}
    </div>
    ${next ? `<div class="card accent section" style="gap:4px"><h2 style="color:var(--accent)">Nächstes Mal</h2><span class="num" style="font-size:22px">${esc(fmtTarget(next, ex))}</span><span class="small">${esc(next.reason)}</span></div>` : ''}
    <div class="section">
      <h2>Einheiten</h2>
      ${hist.map((h) => {
        const s2 = h.s2 && h.s2.reps != null ? ` / ${h.s2.reps}` : '';
        const s2kg = h.s2 && h.s2.reps != null && h.s2.kg !== h.s1.kg ? ` · Satz 2: ${fmtKg(h.s2.kg)} kg` : '';
        const tgt = h.s1.target != null ? `Ziel ${h.s1.target}${h.s1.reps < h.s1.target ? ' – nicht geschafft' : ''}` : 'erstes Training';
        return `
        <div class="card tight histrow">
          <span class="small muted">${shortDate(h.date)}</span>
          <span><span class="num" style="font-size:19px">${fmtKg(h.s1.kg)} kg · ${h.s1.reps}${s2}</span><span class="small muted" style="display:block">${esc(tgt + s2kg)}</span></span>
          <span class="chip">${h.feel ? FEEL_LABEL[h.feel] : '–'}</span>
        </div>`;
      }).join('')}
    </div>`;
};

// ----- Einstellungen -----
SCREENS.settings = () => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return `
    <h1>Einstellungen</h1>
    <div class="section">
      <h2>Backup</h2>
      <div class="card stack" style="gap:12px">
        <span class="small" style="line-height:1.45">Deine Daten liegen nur auf diesem iPhone. Sichere sie regelmäßig als Datei, z. B. in iCloud Drive – wenn du die App vom Home-Bildschirm löschst, sind sie sonst weg.</span>
        <span class="small muted">${state.lastBackup ? 'Letztes Backup: ' + daysAgo(state.lastBackup) + ' (' + shortDate(state.lastBackup) + ')' : 'Noch kein Backup gemacht.'}</span>
        <button type="button" class="btn" data-a="export">Backup exportieren</button>
        <label class="btn secondary" style="cursor:pointer">Backup importieren<input type="file" accept="application/json,.json" data-f="import" class="sr-only"></label>
      </div>
    </div>
    ${standalone ? '' : `
    <div class="section">
      <h2>Auf den Home-Bildschirm</h2>
      <div class="card small" style="line-height:1.5">In Safari unten auf <strong>Teilen</strong> tippen → <strong>Zum Home-Bildschirm</strong>. Danach startet Overload wie eine App, im Vollbild und offline.</div>
    </div>`}
    <div class="section">
      <h2>Daten</h2>
      <div class="card small muted">${state.plans.length} Plan${state.plans.length === 1 ? '' : 'e'} · ${state.sessions.length} Training${state.sessions.length === 1 ? '' : 's'} gespeichert</div>
      <button type="button" class="btn danger" data-a="wipe">Alle Daten löschen</button>
    </div>
    <p class="small muted" style="text-align:center;margin-top:28px">Overload ${APP_VERSION}</p>`;
};

// ---------- Aktionen ----------
const A = {};

A.go = (d) => go(d.r);
A.homeDay = (d) => { ui.homeDay = d.id; render(); };
A.goPlans = (d) => { ui.planSel = activePlan().id; ui.daySel = d.day; go('plans'); };

A.start = (d) => {
  const plan = activePlan();
  state.current = {
    planId: plan.id, dayId: d.id, startedAt: Date.now(), idx: 0, phase: 'sets',
    entries: {}, restUntil: null,
  };
  ui.homeDay = null;
  persist();
  go('train');
};
A.resume = () => go('train');

function currentEx() {
  const c = curContext();
  return c ? c : null;
}

A.reps = (d) => {
  const c = currentEx(); if (!c) return;
  const { ex, en, cur } = c;
  const set = d.set === '1' ? en.s1 : en.s2;
  const v = Number(d.v);
  set.reps = set.reps === v ? null : v;
  if (d.set === '1') recomputeSet2(ex, en);
  if (set.reps != null) cur.restUntil = Date.now() + ex.rest * 1000;
  persist(); render();
};

A.repsOther = (d) => {
  const c = currentEx(); if (!c) return;
  const raw = window.prompt(`Satz ${d.set}: Wie viele Wiederholungen hast du geschafft?`);
  if (raw == null) return;
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 0 || v > 100) { toast('Bitte eine Zahl eingeben.'); return; }
  const { ex, en, cur } = c;
  const set = d.set === '1' ? en.s1 : en.s2;
  set.reps = v;
  if (d.set === '1') recomputeSet2(ex, en);
  cur.restUntil = Date.now() + ex.rest * 1000;
  persist(); render();
};

A.kg = (d) => {
  const c = currentEx(); if (!c) return;
  const { ex, en } = c;
  const delta = Number(d.d) * ex.step;
  if (d.set === '1') {
    en.s1.kg = Math.max(0, roundToStep(en.s1.kg + delta, ex.step));
    recomputeSet2(ex, en);
  } else {
    en.s2.kg = Math.max(0, roundToStep(en.s2.kg + delta, ex.step));
    en.s2.manual = true;
  }
  persist(); render();
};

A.restAdd = () => {
  const cur = state.current; if (!cur || !cur.restUntil) return;
  cur.restUntil = Math.max(cur.restUntil, Date.now()) + 30000;
  persist(); tick();
};
A.restStop = () => { if (state.current) { state.current.restUntil = null; persist(); render(); } };

A.jump = (d) => { const cur = state.current; cur.idx = Number(d.i); cur.phase = 'sets'; persist(); go('train'); };

A.toFeel = () => {
  const c = currentEx(); if (!c) return;
  if (c.en.s1.reps == null) { toast('Trag erst ein, wie viele Wdh. du in Satz 1 geschafft hast.'); return; }
  c.en.skipped = false;
  c.cur.phase = 'feel';
  persist(); go('train');
};
A.backSets = () => { state.current.phase = 'sets'; persist(); go('train'); };

A.feel = (d) => {
  const c = currentEx(); if (!c) return;
  c.en.feel = Number(d.v);
  persist(); render();
};

function advance() {
  const c = currentEx(); if (!c) return;
  if (c.cur.idx >= c.day.exercises.length - 1) { finishTraining(); return; }
  c.cur.idx += 1;
  c.cur.phase = 'sets';
  persist(); go('train');
}
A.next = () => advance();
A.skip = () => {
  const c = currentEx(); if (!c) return;
  c.en.skipped = true;
  c.en.feel = null;
  persist();
  advance();
};

function finishTraining() {
  const cur = state.current; if (!cur) return;
  const plan = getPlan(cur.planId); const day = getDay(plan, cur.dayId);
  const entries = [];
  if (day) {
    for (const ex of day.exercises) {
      const en = cur.entries[ex.id];
      if (!en || en.skipped || en.s1.reps == null) continue;
      entries.push({
        exId: ex.id,
        name: ex.name,
        s1: { kg: en.s1.kg, reps: en.s1.reps, target: en.s1.target },
        s2: en.s2.reps != null ? { kg: en.s2.kg, reps: en.s2.reps, target: en.s2.target } : null,
        feel: en.feel || 2,
      });
    }
  }
  if (!entries.length) {
    if (!window.confirm('Es ist noch keine Übung eingetragen. Training verwerfen?')) return;
    state.current = null; persist(); go('home'); return;
  }
  state.sessions.push({ id: uid(), date: new Date().toISOString(), planId: cur.planId, dayId: cur.dayId, dayName: day ? day.name : '', entries });
  state.current = null;
  persist();
  go('home');
  toast(`Training gespeichert – ${entries.length} Übung${entries.length === 1 ? '' : 'en'}`);
}

A.finish = () => {
  const c = currentEx(); if (!c) { state.current = null; go('home'); return; }
  const open = c.day.exercises.filter((ex) => { const en = c.cur.entries[ex.id]; return !en || (!en.feel && !en.skipped); }).length;
  const msg = open ? `Training jetzt beenden? ${open} Übung${open === 1 ? ' ist' : 'en sind'} noch offen. Eingetragene Übungen werden gespeichert.` : 'Training beenden und speichern?';
  if (window.confirm(msg)) finishTraining();
};

// Pläne
function cloneDays(days) { return days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) })); }

A.newPlan = () => {
  ui.draft = { isNew: true, id: uid(), name: '', days: [{ id: uid(), name: '', exercises: [] }] };
  go('planEdit');
};
A.editPlan = (d) => {
  const p = getPlan(d.id);
  ui.draft = { isNew: false, id: p.id, name: p.name, days: cloneDays(p.days) };
  go('planEdit');
};
A.cancelPlan = () => go(state.plans.length ? 'plans' : 'home');
A.addDay = () => { ui.draft.days.push({ id: uid(), name: '', exercises: [] }); render(); focusLast('[data-f="dayName"]'); };
A.moveDay = (d) => { moveIn(ui.draft.days, Number(d.i), Number(d.d)); render(); };
A.delDay = (d) => {
  const day = ui.draft.days[Number(d.i)];
  if (day.exercises.length && !window.confirm(`„${day.name || 'Trainingstag'}“ mit ${day.exercises.length} Übung(en) löschen?`)) return;
  ui.draft.days.splice(Number(d.i), 1); render();
};
A.savePlan = () => {
  const d = ui.draft;
  const name = d.name.trim() || 'Mein Plan';
  const days = d.days.map((day, i) => ({ ...day, name: day.name.trim() || `Tag ${i + 1}` }));
  if (!days.length) { toast('Leg mindestens einen Trainingstag an.'); return; }
  if (d.isNew) {
    state.plans.push({ id: d.id, name, days });
    state.activePlanId = d.id;
  } else {
    const p = getPlan(d.id); p.name = name; p.days = days;
  }
  ui.planSel = d.id; ui.daySel = days[0].id; ui.draft = null;
  persist();
  go('plans');
  toast('Plan gesichert');
};
A.delPlan = () => {
  const d = ui.draft;
  if (!window.confirm(`Plan „${d.name || 'ohne Namen'}“ löschen? Dein Trainingsverlauf bleibt erhalten.`)) return;
  state.plans = state.plans.filter((p) => p.id !== d.id);
  if (state.activePlanId === d.id) state.activePlanId = state.plans[0] ? state.plans[0].id : null;
  if (state.current && state.current.planId === d.id) state.current = null;
  ui.draft = null; ui.planSel = null; ui.daySel = null;
  persist(); go('plans');
};
A.selPlan = (d) => { ui.planSel = d.id; ui.daySel = null; render(); };
A.selDay = (d) => { ui.daySel = d.id; render(); };
A.activate = (d) => { state.activePlanId = d.id; ui.homeDay = null; persist(); render(); toast('Aktiver Plan geändert'); };
A.moveEx = (d) => {
  const day = getDay(getPlan(ui.planSel), ui.daySel);
  moveIn(day.exercises, Number(d.i), Number(d.d));
  persist(); render();
};

function moveIn(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
function focusLast(sel) {
  const els = $view.querySelectorAll(sel);
  if (els.length) els[els.length - 1].focus();
}

// Übungen
A.newEx = () => {
  ui.exDraft = {
    isNew: true, planId: ui.planSel, dayId: ui.daySel,
    ex: { id: uid(), name: '', min: 6, max: 8, step: 1, warmup: 2, rest: 120, startWeight: 20 },
  };
  go('exEdit');
};
A.editEx = (d) => {
  const day = getDay(getPlan(ui.planSel), ui.daySel);
  const ex = day.exercises.find((e) => e.id === d.id);
  ui.exDraft = { isNew: false, planId: ui.planSel, dayId: ui.daySel, ex: { ...ex } };
  go('exEdit');
};
A.cancelEx = () => { ui.exDraft = null; go('plans'); };

const EX_LIMITS = {
  min: { lo: 1, hi: 50 },
  max: { lo: 1, hi: 50 },
  rest: { lo: 15, hi: 900 },
  startWeight: { lo: 0, hi: 1000 },
};
A.exStep = (d) => {
  const ex = ui.exDraft.ex; const dir = Number(d.d);
  if (d.k === 'min') ex.min = clamp(ex.min + dir, 1, ex.max);
  if (d.k === 'max') ex.max = clamp(ex.max + dir, ex.min, 50);
  if (d.k === 'rest') ex.rest = clamp(ex.rest + dir * 15, 15, 900);
  if (d.k === 'startWeight') ex.startWeight = clamp(roundToStep(ex.startWeight + dir * ex.step, ex.step), 0, 1000);
  render();
};
A.exPrompt = (d) => {
  const ex = ui.exDraft.ex;
  const labels = { min: 'Wiederholungen von', max: 'Wiederholungen bis', startWeight: 'Startgewicht in kg', rest: 'Pause in Sekunden', step: 'Kleinster Schritt in kg' };
  const cur = d.k === 'step' ? ex.step : ex[d.k];
  const raw = window.prompt(labels[d.k], String(cur).replace('.', ','));
  if (raw == null) return;
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) { toast('Bitte eine Zahl eingeben.'); return; }
  if (d.k === 'step') { if (v <= 0 || v > 50) { toast('Schritt zwischen 0,1 und 50 kg.'); return; } ex.step = Math.round(v * 100) / 100; }
  else if (d.k === 'min') ex.min = clamp(Math.round(v), 1, ex.max);
  else if (d.k === 'max') ex.max = clamp(Math.round(v), ex.min, 50);
  else if (d.k === 'rest') ex.rest = clamp(Math.round(v), EX_LIMITS.rest.lo, EX_LIMITS.rest.hi);
  else if (d.k === 'startWeight') ex.startWeight = clamp(Math.round(v * 100) / 100, 0, 1000);
  render();
};
A.exStepSize = (d) => { ui.exDraft.ex.step = Number(d.v); render(); };
A.exWarm = (d) => { ui.exDraft.ex.warmup = Number(d.v); render(); };
A.saveEx = () => {
  const d = ui.exDraft; const ex = d.ex;
  ex.name = ex.name.trim();
  if (!ex.name) { toast('Gib der Übung einen Namen.'); $view.querySelector('[data-f="exName"]')?.focus(); return; }
  const day = getDay(getPlan(d.planId), d.dayId);
  if (!day) { toast('Trainingstag nicht gefunden.'); return; }
  if (d.isNew) day.exercises.push({ ...ex });
  else {
    const i = day.exercises.findIndex((e) => e.id === ex.id);
    if (i >= 0) day.exercises[i] = { ...ex };
  }
  // Laufendes Training: Vorgabe für diese Übung neu berechnen, falls noch nichts eingetragen
  if (state.current && state.current.entries[ex.id] && state.current.entries[ex.id].s1.reps == null) delete state.current.entries[ex.id];
  ui.exDraft = null;
  persist(); go('plans');
  toast('Übung gesichert');
};
A.delEx = () => {
  const d = ui.exDraft;
  if (!window.confirm(`„${d.ex.name || 'Übung'}“ aus dem Plan löschen? Der Verlauf bleibt erhalten.`)) return;
  const day = getDay(getPlan(d.planId), d.dayId);
  day.exercises = day.exercises.filter((e) => e.id !== d.ex.id);
  ui.exDraft = null;
  persist(); go('plans');
};

// Verlauf
A.exHist = (d) => go('exHistory', { id: d.id });
A.delSession = (d) => {
  const s = state.sessions.find((x) => x.id === d.id);
  if (!s || !window.confirm(`Training „${s.dayName}“ vom ${shortDate(s.date)} löschen? Das ändert auch die nächsten Vorgaben.`)) return;
  state.sessions = state.sessions.filter((x) => x.id !== d.id);
  persist(); render();
};

// Backup
A.export = async () => {
  const now = new Date();
  const payload = JSON.stringify({ app: 'overload', version: 1, exportedAt: now.toISOString(), state: { ...state, current: null } }, null, 2);
  const fname = `overload-backup-${now.toISOString().slice(0, 10)}.json`;
  const blob = new Blob([payload], { type: 'application/json' });
  let done = false;
  try {
    const file = new File([blob], fname, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Overload Backup' });
      done = true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  if (!done) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  state.lastBackup = now.toISOString();
  persist(); render();
  toast('Backup erstellt');
};

async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const s = data && data.state;
    if (!data || data.app !== 'overload' || !s || !Array.isArray(s.plans) || !Array.isArray(s.sessions)) throw new Error('format');
    const when = data.exportedAt ? ` vom ${new Date(data.exportedAt).toLocaleDateString('de-DE')}` : '';
    if (!window.confirm(`Backup${when} importieren (${s.plans.length} Pläne, ${s.sessions.length} Trainings)? Deine aktuellen Daten werden ersetzt.`)) return;
    state = normalize(s);
    persist();
    go('home');
    toast('Backup importiert');
  } catch (e) {
    toast('Das ist keine gültige Overload-Backup-Datei.');
  }
}

A.wipe = () => {
  if (!window.confirm('Wirklich alle Pläne und Trainings löschen?')) return;
  if (!window.confirm('Sicher? Das lässt sich nicht rückgängig machen.')) return;
  state = emptyState();
  persist(); go('home');
  toast('Alle Daten gelöscht');
};

function normalize(s) {
  const base = emptyState();
  const out = { ...base, ...s };
  out.plans = (out.plans || []).map((p) => ({
    id: p.id || uid(), name: p.name || 'Plan',
    days: (p.days || []).map((d) => ({
      id: d.id || uid(), name: d.name || 'Tag',
      exercises: (d.exercises || []).map((e) => ({
        id: e.id || uid(), name: e.name || 'Übung',
        min: Number(e.min) || 6, max: Number(e.max) || 8, step: Number(e.step) || 1,
        warmup: Number.isFinite(Number(e.warmup)) ? Number(e.warmup) : 2,
        rest: Number(e.rest) || 120, startWeight: Number(e.startWeight) || 0,
      })),
    })),
  }));
  out.sessions = Array.isArray(out.sessions) ? out.sessions : [];
  if (out.activePlanId && !out.plans.some((p) => p.id === out.activePlanId)) out.activePlanId = out.plans[0] ? out.plans[0].id : null;
  if (!out.activePlanId && out.plans.length) out.activePlanId = out.plans[0].id;
  return out;
}

// ---------- Events ----------
$view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

$view.addEventListener('input', (e) => {
  const t = e.target; const f = t.dataset.f;
  if (f === 'planName' && ui.draft) ui.draft.name = t.value;
  if (f === 'dayName' && ui.draft) ui.draft.days[Number(t.dataset.i)].name = t.value;
  if (f === 'exName' && ui.exDraft) ui.exDraft.ex.name = t.value;
});

$view.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.f === 'import' && t.files && t.files[0]) { importFile(t.files[0]); t.value = ''; }
});

$view.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[type="text"]')) e.target.blur();
});

$tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]');
  if (!b) return;
  if (b.dataset.r === 'home') ui.homeDay = null;
  go(b.dataset.r);
});

// Timer
function tick() {
  if (route.name !== 'train' || !state.current) return;
  const cur = state.current;
  const el = document.getElementById('elapsed');
  if (el) el.textContent = mmss((Date.now() - cur.startedAt) / 1000);
  const rt = document.getElementById('rest-time');
  const box = document.getElementById('rest');
  if (rt && cur.restUntil) {
    const left = (cur.restUntil - Date.now()) / 1000;
    if (left > 0) { rt.textContent = mmss(left); box.classList.remove('over'); }
    else { rt.textContent = 'Los!'; box.classList.add('over'); }
  }
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

// ---------- Start ----------
async function init() {
  const loaded = await loadState();
  state = loaded ? normalize(loaded) : emptyState();
  render();
  requestPersistence();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();

// Für Tests
window.__overload = { get state() { return state; } };
