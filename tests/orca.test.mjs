import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

/** Load the Client module in Node with a minimal `window` shim. */
function loadPlugin() {
  globalThis.window = {};
  new Function(source)();
  return globalThis.window.__DeepSeekOrca__;
}

const api = loadPlugin();

/* ---------------------------------------------------------------- i18n -- */

test('language normalisation keeps only English and Russian', () => {
  assert.equal(api.normalizeLanguage('ru'), 'ru');
  assert.equal(api.normalizeLanguage('ru-RU'), 'ru');
  assert.equal(api.normalizeLanguage('RU_ru'), 'ru');
  assert.equal(api.normalizeLanguage('en-US'), 'en');
  assert.equal(api.normalizeLanguage('zh-Hans'), 'en');
  assert.equal(api.normalizeLanguage(undefined), 'en');
});

test('translation falls back to English and fills placeholders', () => {
  assert.equal(api.translate('ru', 'state.waiting'), 'Нужна ваша помощь?');
  assert.equal(api.translate('de', 'state.waiting'), 'A little help?');
  assert.equal(api.translate('en', 'count.many', { count: 3 }), '3 sessions working.');
  assert.equal(api.translate('ru', 'count.many', { count: 3 }), 'Сессий в работе: 3.');
  assert.equal(api.translate('en', 'missing.key'), 'missing.key');
  for (const key of Object.keys(api.MESSAGES.en)) {
    assert.ok(Object.hasOwn(api.MESSAGES.ru, key), `ru is missing ${key}`);
  }
  for (const key of Object.keys(api.MESSAGES.ru)) {
    assert.ok(Object.hasOwn(api.MESSAGES.en, key), `en is missing ${key}`);
  }
});

/* --------------------------------------------------------- preferences -- */

test('preferences are clamped and defaulted', () => {
  const defaults = api.cleanPreferences(null);
  assert.equal(defaults.species, 'orca');
  assert.equal(defaults.scale, 1);
  assert.equal(defaults.scope, 'global');
  assert.equal(defaults.sleepAfterMs, 120000);
  assert.equal(defaults.sound, false);
  assert.equal(defaults.approvalSound, true);
  assert.equal(defaults.soundVolume, 0.4);
  assert.equal(defaults.rx, null);
  assert.equal(defaults.ry, null);
  assert.equal(defaults.seenHint, false);

  const wild = api.cleanPreferences({
    species: 'shark', scale: 9, hidden: 'yes', motion: false, scope: 'current',
    sleepAfterMs: 7, rx: 4, ry: -2, sound: 'yes', approvalSound: false, soundVolume: 9, seenHint: 1,
  });
  assert.equal(wild.species, 'orca');
  assert.equal(wild.scale, 1.6);
  assert.equal(wild.hidden, false);
  assert.equal(wild.motion, false);
  assert.equal(wild.scope, 'current');
  assert.equal(wild.sleepAfterMs, 120000);
  assert.equal(wild.rx, 1);
  assert.equal(wild.ry, 0);
  assert.equal(wild.sound, false);
  assert.equal(wild.approvalSound, false);
  assert.equal(wild.soundVolume, 1);
  assert.equal(wild.seenHint, false);
  assert.equal(api.cleanPreferences({ species: 'dolphin', sound: true }).species, 'dolphin');
});

test('position stays inside the viewport and below the chrome band', () => {
  assert.deepEqual(api.clampPosition(-50, -50, 100, 100, 800, 600, 56), { x: 12, y: 56 });
  assert.deepEqual(api.clampPosition(5000, 5000, 100, 100, 800, 600, 56), { x: 688, y: 488 });
  assert.deepEqual(api.clampPosition(100, 10, 100, 100, 800, 60, 56), { x: 100, y: 12 });
});

/* ---------------------------------------------------------------- mood -- */

const scope = 'global:all';
const restingSnapshot = (extra) => ({
  available: true, running: false, pending: false, workingCount: 0, scopeKey: scope, ...extra,
});

test('mood mirrors running, waiting and unavailable states', () => {
  let clock = 1000;
  const mood = new api.OrcaMood({ now: () => clock, sleepAfterMs: 120000, random: () => 0.3 });
  clock += 1;
  assert.equal(mood.update(restingSnapshot(), clock).state, 'resting');
  assert.equal(mood.update(restingSnapshot({ running: true, workingCount: 2 }), clock).state, 'working');
  assert.equal(mood.update(restingSnapshot({ running: true, workingCount: 2 }), clock).workingCount, 2);
  assert.equal(mood.update(restingSnapshot({ running: true, pending: true }), clock).state, 'waiting');
  const offline = mood.update({ available: false, running: false, pending: false, scopeKey: scope }, clock);
  assert.equal(offline.state, 'resting');
  assert.equal(offline.messageKey, 'state.unavailable');
});

test('a completed turn celebrates once and then settles', () => {
  let clock = 1000;
  const mood = new api.OrcaMood({ now: () => clock, sleepAfterMs: 60000, random: () => 0.5 });
  mood.update(restingSnapshot(), clock);
  clock += 1000;
  mood.update(restingSnapshot({ running: true, workingCount: 1 }), clock);
  clock += 1000;
  const celebrated = mood.update(restingSnapshot({ notice: { id: 'a', reason: 'completed' } }), clock);
  assert.equal(celebrated.state, 'celebrate');
  assert.ok(typeof celebrated.noticeKey === 'string');
  const repeat = mood.update(restingSnapshot({ notice: { id: 'a', reason: 'completed' } }), clock + 10);
  assert.equal(repeat.noticeKey, celebrated.noticeKey);
  assert.equal(mood.view(clock + 5000).state, 'resting');
});

test('a failed turn frowns and an idle orca naps', () => {
  let clock = 1000;
  const mood = new api.OrcaMood({ now: () => clock, sleepAfterMs: 30000, random: () => 0.5 });
  mood.update(restingSnapshot(), clock);
  clock += 1000;
  const failed = mood.update(restingSnapshot({ notice: { id: 'e', reason: 'error' } }), clock);
  assert.equal(failed.state, 'error');

  const idle = new api.OrcaMood({ now: () => clock, sleepAfterMs: 30000, random: () => 0.5 });
  idle.update(restingSnapshot(), clock);
  assert.equal(idle.view(clock + 1000).state, 'resting');
  assert.equal(idle.view(clock + 31000).state, 'sleeping');
  assert.equal(idle.touch(clock + 31000).state, 'resting');
});

test('a notice that already existed when the scope changed is not celebrated', () => {
  const clock = 5000;
  const mood = new api.OrcaMood({ now: () => clock, sleepAfterMs: 60000, random: () => 0.5 });
  const view = mood.update(restingSnapshot({ notice: { id: 'old', reason: 'completed' } }), clock);
  assert.equal(view.state, 'resting');
  assert.equal(view.noticeKey, undefined);
});

test('waiting distinguishes approvals from questions', () => {
  const clock = 1000;
  const mood = new api.OrcaMood({ now: () => clock, sleepAfterMs: 60000, random: () => 0.5 });
  mood.update(restingSnapshot(), clock);

  const approval = mood.update(restingSnapshot({ pending: true, pendingKind: 'approval' }), clock);
  assert.equal(approval.state, 'waiting');
  assert.equal(approval.pendingKind, 'approval');
  assert.equal(approval.messageKey, 'state.approval');

  const question = mood.update(restingSnapshot({ pending: true, pendingKind: 'question' }), clock);
  assert.equal(question.messageKey, 'state.question');

  const generic = mood.update(restingSnapshot({ pending: true }), clock);
  assert.equal(generic.messageKey, 'state.waiting');
});

/* ----------------------------------------------------------------- art -- */

test('every species draws every state', () => {
  assert.deepEqual(Object.keys(api.SPECIES_ART).sort(), ['dolphin', 'humpback', 'orca']);
  for (const species of Object.keys(api.SPECIES_ART)) {
    for (const state of ['resting', 'working', 'waiting', 'celebrate', 'sleeping', 'error']) {
      const markup = api.SPECIES_ART[species][state];
      assert.ok(markup.startsWith('<svg'), `${species}/${state} is SVG`);
      assert.ok(markup.includes('<path'), `${species}/${state} has paths`);
      assert.ok(!markup.includes('undefined'), `${species}/${state} has no broken values`);
    }
  }
  // The three animals must not be the same drawing.
  assert.ok(api.SPECIES_ART.orca.resting.includes(api.SPECIES.orca.colors.body));
  assert.ok(api.SPECIES_ART.dolphin.resting.includes(api.SPECIES.dolphin.colors.body));
  assert.ok(api.SPECIES_ART.humpback.resting.includes(api.SPECIES.humpback.colors.body));
  assert.notEqual(api.SPECIES_ART.orca.resting, api.SPECIES_ART.dolphin.resting);
});

test('waiting artwork follows the pending kind', () => {
  const approval = api.speciesArt('orca', api.faceFor('waiting', 'approval'));
  const question = api.speciesArt('orca', api.faceFor('waiting', 'question'));
  assert.ok(approval.includes('orca-alert--approval'));
  assert.ok(!approval.includes('orca-alert--question'));
  assert.ok(question.includes('orca-alert--question'));
  // Pupils are grouped so the view can aim them at the pointer.
  assert.ok(api.SPECIES_ART.orca.resting.includes('orca-pupil'));
});

/* --------------------------------------------------------------- chime -- */

test('the completion chime is silent without Web Audio and never throws', () => {
  const silent = new api.OrcaChime({});
  assert.equal(silent.supported, false);
  assert.equal(silent.play('complete', 0.5), false);

  const started = [];
  const gainCalls = [];
  class FakeContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 1;
      this.destination = {};
    }

    createGain() {
      return {
        gain: {
          setValueAtTime: (...args) => started.push(['setValueAtTime', ...args]),
          exponentialRampToValueAtTime: (...args) => gainCalls.push(args),
        },
        connect: () => {},
      };
    }

    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: (value) => started.push(['freq', value]) },
        connect: () => {},
        start: () => started.push(['start']),
        stop: () => started.push(['stop']),
      };
    }

    close() { return Promise.resolve(); }
  }
  const chime = new api.OrcaChime({ AudioContext: FakeContext });
  assert.equal(chime.supported, true);
  assert.equal(chime.play('complete', 0.4), true);
  assert.ok(started.some(entry => entry[0] === 'freq' && entry[1] > 700), 'rising notes');
  assert.equal(chime.play('complete', 0.4), false, 'a second chime within 400ms is skipped');
  chime.dispose();
  const again = new api.OrcaChime({ AudioContext: FakeContext });
  assert.equal(again.play('error', 0.4), true, 'a fresh chime plays the falling notes');
  again.dispose();
});

/* ---------------------------------------------------------------- feed -- */

class FakeEventSource {
  constructor() {
    this.snapshot = { entries: [], hasMore: false, revision: 0, change: { kind: 'replace', entries: [] } };
    this.listeners = new Set();
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  append(event) {
    const entry = { type: 'event', event };
    this.snapshot = {
      entries: [...this.snapshot.entries, entry],
      hasMore: false,
      revision: this.snapshot.revision + 1,
      change: { kind: 'append', entries: [entry] },
    };
    for (const listener of this.listeners) listener();
  }
}

/**
 * Fake services. `onRetain` runs inside `retain`, exactly where the real
 * controller publishes a new session list and notifies subscribers.
 */
function fakeContext(options = {}) {
  const rows = options.rows ?? {
    main: { id: 'main', running: true, retainedBy: { mainView: 1 } },
  };
  const statuses = new Map(Object.entries(options.statuses ?? { main: { running: true } }));
  const sources = new Map();
  const released = [];
  const retained = [];
  const listListeners = new Set();
  const statusListeners = new Set();

  const list = {
    getSnapshot: () => ({ ids: Object.keys(rows), byId: rows, phase: 'ready', projectionsBySession: {} }),
    subscribe: (listener) => { listListeners.add(listener); return () => listListeners.delete(listener); },
  };
  const sessionStatus = {
    getSnapshot: () => statuses,
    subscribe: (listener) => { statusListeners.add(listener); return () => statusListeners.delete(listener); },
  };
  const state = {
    getSnapshot: () => options.connection ?? 'connected',
    subscribe: () => () => {},
  };
  const sessions = {
    list,
    retain: (id) => {
      retained.push(id);
      if (typeof options.onRetain === 'function') options.onRetain(id);
      const eventSource = sources.get(id) ?? new FakeEventSource();
      sources.set(id, eventSource);
      return {
        sessionId: id,
        binding: { sessionId: id, session: { eventSource } },
        ready: Promise.resolve(),
        release: () => released.push(id),
      };
    },
  };
  const services = { sessions, uiSession: { sessionStatus }, connection: { state } };
  return {
    ctx: { get: (key) => services[key], ...services },
    sources,
    released,
    retained,
    setRunning(id, running) {
      statuses.set(id, { ...(statuses.get(id) || {}), running });
      for (const listener of statusListeners) listener();
    },
  };
}

test('feed turns turn boundaries into notices and ignores cancellations', () => {
  const fake = fakeContext();
  const snapshots = [];
  const feed = new api.OrcaFeed(fake.ctx, {
    getPreferences: () => api.DEFAULT_PREFERENCES,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  feed.start();

  const first = snapshots.at(-1);
  assert.equal(first.available, true);
  assert.equal(first.running, true);
  assert.equal(first.workingCount, 1);

  const source = fake.sources.get('main');
  assert.ok(source, 'a running session is retained');
  assert.deepEqual(fake.retained, ['main'], 'retained exactly once');

  source.append({ type: 'turn/start', seq: 1, data: { turn: 1 } });
  source.append({ type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } });
  assert.equal(snapshots.at(-1).notice.reason, 'completed');

  source.append({ type: 'turn/start', seq: 3, data: { turn: 2 } });
  source.append({ type: 'turn/end', seq: 4, data: { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } } });
  assert.equal(snapshots.at(-1).notice.reason, 'completed', 'a cancelled turn is not a notice');

  source.append({ type: 'turn/start', seq: 5, data: { turn: 3 } });
  source.append({ type: 'turn/end', seq: 6, data: { turn: 3, reason: { kind: 'error' } } });
  assert.equal(snapshots.at(-1).notice.reason, 'error');

  feed.dispose();
  assert.deepEqual(fake.released, ['main']);
});

test('retaining inside a publish does not recurse (regression)', () => {
  let feed;
  const fake = fakeContext({
    // Worst case: the store subscriber calls publish synchronously, exactly as
    // the real session list does when `retainedBy` changes.
    onRetain: () => feed.publish(),
  });
  const snapshots = [];
  feed = new api.OrcaFeed(fake.ctx, {
    getPreferences: () => api.DEFAULT_PREFERENCES,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  assert.doesNotThrow(() => feed.start());
  assert.deepEqual(fake.retained, ['main'], 'one retain per session despite the re-entrant publish');
  assert.ok(snapshots.length > 0);
  assert.equal(snapshots.at(-1).workingCount, 1);
  feed.dispose();
});

test('feed reports the pending kind, approval first', () => {  const fake = fakeContext({
    rows: {
      a: { id: 'a', running: true, retainedBy: { mainView: 1 } },
      b: { id: 'b', running: true, retainedBy: {} },
    },
    statuses: {
      a: { running: true, pendingInteraction: { kind: 'question' } },
      b: { running: true, pendingInteraction: { kind: 'approval' } },
    },
  });
  const snapshots = [];
  const feed = new api.OrcaFeed(fake.ctx, {
    getPreferences: () => api.DEFAULT_PREFERENCES,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  feed.start();
  const snapshot = snapshots.at(-1);
  assert.equal(snapshot.pending, true);
  assert.equal(snapshot.waitingCount, 2);
  assert.equal(snapshot.pendingKind, 'approval');
  feed.dispose();
});

test('feed lists other-session approvals with a decision handler', () => {
  const answered = [];
  const fake = fakeContext({
    rows: {
      a: { id: 'a', running: true, retainedBy: { mainView: 1 }, displayTitle: 'Main' },
      b: { id: 'b', running: true, retainedBy: {}, displayTitle: 'Other' },
    },
    statuses: {
      a: {
        running: true,
        pendingInteraction: {
          kind: 'approval', key: 'k1', answerable: true, toolName: 'bash',
          answer: (decision) => answered.push(['a', decision]),
        },
      },
      b: {
        running: true,
        pendingInteraction: {
          kind: 'approval', key: 'k2', answerable: true, toolName: 'edit',
          reason: 'Edit a file',
          answer: (decision) => answered.push(['b', decision]),
        },
      },
      c: {
        running: true,
        pendingInteraction: {
          kind: 'approval', key: 'k3', answerable: false, toolName: 'old',
          answer: (decision) => answered.push(['c', decision]),
        },
      },
      d: {
        running: true,
        pendingInteraction: {
          kind: 'question', key: 'q1', answerable: true,
        },
      },
    },
  });
  const snapshots = [];
  const feed = new api.OrcaFeed(fake.ctx, {
    getPreferences: () => api.DEFAULT_PREFERENCES,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  feed.start();
  const approvals = snapshots.at(-1).approvals;
  assert.equal(approvals.length, 1, 'only the answerable other-session approval is offered');
  assert.equal(approvals[0].key, 'k2');
  assert.equal(approvals[0].toolName, 'edit');
  assert.equal(approvals[0].reason, 'Edit a file');
  assert.equal(approvals[0].sessionTitle, 'Other');
  approvals[0].answer('allowed-once');
  assert.deepEqual(answered, [['b', 'allowed-once']], 'the decision reaches the pending request');
  feed.dispose();
});

test('feed releases sessions that stop running and honours scope', () => {
  const fake = fakeContext({
    rows: {
      main: { id: 'main', running: true, retainedBy: { mainView: 1 } },
      child: { id: 'child', running: true, origin: 'subagent' },
      other: { id: 'other', running: true, retainedBy: {} },
    },
    statuses: { main: { running: true }, child: { running: true }, other: { running: true } },
  });
  const snapshots = [];
  const feed = new api.OrcaFeed(fake.ctx, {
    getPreferences: () => ({ ...api.DEFAULT_PREFERENCES, scope: 'current' }),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  feed.start();
  assert.equal(snapshots.at(-1).workingCount, 1, 'only the current session counts in current scope');
  assert.deepEqual(fake.retained, ['main'], 'subagents and out-of-scope sessions are never retained');

  fake.setRunning('main', false);
  feed.dispose();
  assert.deepEqual(fake.released, ['main']);
});
