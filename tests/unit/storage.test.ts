import { beforeEach, expect, it, vi } from 'vitest';
import { createFormalPassage } from '../../src/types';
import { bootstrapStorageMigrations, migrateLearningData } from '../../src/storage/migrations';
import type { RootSchema } from '../../src/storage/schema';
import { readRoot, storageGet, storageSet, writeRoot } from '../../src/utils/storage';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

function doubleEncodedZustand(state: unknown, version: number): string {
  return JSON.stringify(JSON.stringify({ state, version }));
}

function seedLegacyPassageMigration() {
  const valid = createFormalPassage({
    id: 'online:valid',
    sourceId: 'online:valid',
    title: '有效篇目',
    author: '作者',
    dynasty: '朝代',
    segments: [{ index: 0, sentences: [{ text: '学而时习之。', meaning: '' }] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
  window.localStorage.setItem('wenyan:learning', doubleEncodedZustand({
    entries: [
      { id: 'online:valid', addedAt: '2026-08-04T00:00:00.000Z' },
      { id: 'online:broken', addedAt: '2026-08-04T00:00:00.000Z' },
    ],
    onlinePassages: { 'online:valid': valid, 'online:broken': { id: 'online:broken' } },
  }, 0));
  window.localStorage.setItem('wenyan:progress', doubleEncodedZustand({
    progress: {
      'online:valid': { cardBlindPassed: { keep: true } },
      'online:broken': { cardBlindPassed: { remove: true } },
    },
  }, 2));
  window.localStorage.setItem('wenyan:attempts', doubleEncodedZustand({
    attempts: {
      good: { id: 'good', passageId: 'online:valid' },
      bad: { id: 'bad', passageId: 'online:broken' },
    },
  }, 0));
}

it('removes only the corrupted namespace and returns its versioned fallback', () => {
  window.localStorage.setItem('wenyan:progress', '{broken');
  window.localStorage.setItem('wenyan:badges', '{"keep":true}');

  const root = readRoot('progress', 2, { progress: {} });

  expect(root).toEqual({ schemaVersion: 2, data: { progress: {} } });
  expect(window.localStorage.getItem('wenyan:progress')).toBeNull();
  expect(window.localStorage.getItem('wenyan:badges')).toBe('{"keep":true}');
});

it('reports quota failure without replacing the previous value', () => {
  window.localStorage.setItem('wenyan:learning', '{"original":true}');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });

  const result = writeRoot('learning', { schemaVersion: 2, data: { entries: [] } });

  expect(result).toMatchObject({ ok: false, reason: 'quota' });
  expect(window.localStorage.getItem('wenyan:learning')).toBe('{"original":true}');
});

it('returns safe fallbacks for future schemas and failed migrations', () => {
  window.localStorage.setItem('wenyan:future', JSON.stringify({ schemaVersion: 9, data: { value: 9 } }));
  expect(readRoot('future', 2, { value: 0 })).toEqual({ schemaVersion: 2, data: { value: 0 } });
  expect(window.localStorage.getItem('wenyan:future')).toBeNull();

  window.localStorage.setItem('wenyan:migrate-fail', JSON.stringify({ schemaVersion: 1, data: { value: 1 } }));
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  expect(readRoot('migrate-fail', {
    version: 2,
    migrate: () => { throw new Error('bad migration'); },
  }, { value: 0 })).toEqual({ schemaVersion: 2, data: { value: 0 } });
});

it('reports serialization and generic storage failures separately', () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  expect(writeRoot('circular', { schemaVersion: 1, data: circular })).toMatchObject({
    ok: false,
    reason: 'serialize',
  });

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage disabled');
  });
  expect(writeRoot('unavailable', { schemaVersion: 1, data: {} })).toMatchObject({
    ok: false,
    reason: 'unavailable',
  });
});

it('covers legacy storage helpers for missing, valid, corrupt, quota, and unavailable values', () => {
  expect(storageGet('legacy', { fallback: true })).toEqual({ fallback: true });
  expect(storageSet('legacy', { value: 1 })).toEqual({ ok: true });
  expect(storageGet('legacy', {})).toEqual({ value: 1 });

  window.localStorage.setItem('wenyan:legacy', '{bad');
  expect(storageGet('legacy', { fallback: true })).toEqual({ fallback: true });
  expect(window.localStorage.getItem('wenyan:legacy')).toBeNull();

  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('full', 'NS_ERROR_DOM_QUOTA_REACHED');
  });
  expect(storageSet('legacy', { value: 2 })).toMatchObject({ ok: false, reason: 'quota' });

  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  expect(storageSet('legacy', { value: 3 })).toMatchObject({ ok: false, reason: 'unavailable' });
});

it('rewrites a legacy Zustand envelope into the canonical persisted root', () => {
  window.localStorage.setItem(
    'wenyan:demo',
    JSON.stringify({ state: { value: 3 }, version: 1 })
  );
  const schema: RootSchema<{ value: number }> = {
    version: 2,
    migrate: (data) => ({ value: (data as { value: number }).value + 1 }),
  };

  expect(readRoot('demo', schema, { value: 0 })).toEqual({
    schemaVersion: 2,
    data: { value: 4 },
  });
  expect(JSON.parse(window.localStorage.getItem('wenyan:demo') ?? '{}')).toEqual({
    schemaVersion: 2,
    data: { value: 4 },
  });
});

it('round-trips a real Zustand store through one canonical root envelope', async () => {
  const { useProgressStore } = await import('../../src/stores/progressStore');
  useProgressStore.getState().passCardBlind('round-trip', 'card-1');

  const stored = JSON.parse(window.localStorage.getItem('wenyan:progress') ?? '{}');
  expect(stored).toMatchObject({
    schemaVersion: 4,
    data: { progress: { 'round-trip': { cardBlindPassed: { 'card-1': true } } } },
  });
  expect(stored).not.toHaveProperty('state');
  expect(stored.data).not.toHaveProperty('schemaVersion');

  vi.resetModules();
  const reloaded = await import('../../src/stores/progressStore');
  await reloaded.useProgressStore.persist.rehydrate();
  expect(reloaded.useProgressStore.getState().progress['round-trip'].cardBlindPassed['card-1']).toBe(true);
});

it('drops only an unmigratable online passage and its progress and attempts', () => {
  const valid = createFormalPassage({
    id: 'online:valid',
    sourceId: 'online:valid',
    title: '有效篇目',
    author: '作者',
    dynasty: '朝代',
    segments: [{ index: 0, sentences: [{ text: '学而时习之。', meaning: '' }] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
  window.localStorage.setItem(
    'wenyan:learning',
    JSON.stringify({
      state: {
        entries: [
          { id: 'online:valid', addedAt: '2026-08-04T00:00:00.000Z' },
          { id: 'online:broken', addedAt: '2026-08-04T00:00:00.000Z' },
        ],
        onlinePassages: { 'online:valid': valid, 'online:broken': { id: 'online:broken' } },
      },
      version: 0,
    })
  );
  window.localStorage.setItem(
    'wenyan:progress',
    JSON.stringify({ schemaVersion: 2, data: { progress: { 'online:valid': { keep: true }, 'online:broken': { remove: true } } } })
  );
  window.localStorage.setItem(
    'wenyan:attempts',
    JSON.stringify({
      schemaVersion: 1,
      data: {
        attempts: {
          good: { id: 'good', passageId: 'online:valid' },
          bad: { id: 'bad', passageId: 'online:broken' },
        },
      },
    })
  );

  const root = readRoot(
    'learning',
    { version: 2, migrate: migrateLearningData },
    { entries: [], onlinePassages: {}, migrationNotices: [] }
  );
  bootstrapStorageMigrations();

  expect(root.data.entries.map((entry) => entry.id)).toEqual(['online:valid']);
  expect(root.data.onlinePassages).toEqual({ 'online:valid': valid });
  expect(root.data.migrationNotices).toEqual([
    expect.objectContaining({ passageId: 'online:broken', kind: 'passage-reset' }),
  ]);
  const migratedProgress = JSON.parse(window.localStorage.getItem('wenyan:progress') ?? '{}');
  expect(migratedProgress.data.progress).toHaveProperty('online:valid');
  expect(migratedProgress.data.progress).not.toHaveProperty('online:broken');
  expect(JSON.parse(window.localStorage.getItem('wenyan:attempts') ?? '{}').data.attempts).toEqual({
    good: { id: 'good', passageId: 'online:valid' },
  });
});

it('cleans double-encoded associations when learning hydrates before dependent stores', async () => {
  seedLegacyPassageMigration();

  const { usePassageStore } = await import('../../src/stores/passageStore');
  const { useProgressStore } = await import('../../src/stores/progressStore');
  const { useAttemptStore } = await import('../../src/stores/attemptStore');

  expect(usePassageStore.getState().onlinePassages).not.toHaveProperty('online:broken');
  expect(useProgressStore.getState().progress).not.toHaveProperty('online:broken');
  expect(useAttemptStore.getState().attempts).not.toHaveProperty('bad');
  expect(JSON.parse(window.localStorage.getItem('wenyan:progress') ?? '{}')).toMatchObject({
    schemaVersion: 4,
    data: { progress: { 'online:valid': expect.any(Object) } },
  });
  expect(JSON.parse(window.localStorage.getItem('wenyan:attempts') ?? '{}')).toMatchObject({
    schemaVersion: 1,
    data: { attempts: { good: expect.any(Object) } },
  });
});

it('cleans live dependent stores when they hydrate before learning', async () => {
  seedLegacyPassageMigration();

  const { useProgressStore } = await import('../../src/stores/progressStore');
  const { useAttemptStore } = await import('../../src/stores/attemptStore');
  await import('../../src/stores/passageStore');

  expect(useProgressStore.getState().progress).not.toHaveProperty('online:broken');
  expect(useAttemptStore.getState().attempts).not.toHaveProperty('bad');
  useProgressStore.getState().passCardBlind('online:valid', 'after-migration');
  expect(JSON.parse(window.localStorage.getItem('wenyan:progress') ?? '{}').data.progress)
    .not.toHaveProperty('online:broken');
});

it('reapplies passage cleanup before repeated dependent hydration', async () => {
  seedLegacyPassageMigration();
  const { useProgressStore } = await import('../../src/stores/progressStore');
  await import('../../src/stores/passageStore');
  useProgressStore.setState((state) => ({
    progress: {
      ...state.progress,
      'online:broken': normalizeLegacyProgressForTest(),
    },
  }));

  await useProgressStore.persist.rehydrate();

  expect(useProgressStore.getState().progress).not.toHaveProperty('online:broken');
});

function normalizeLegacyProgressForTest() {
  return {
    cursor: null,
    currentSegment: 0,
    currentCardIndex: 0,
    cardMastery: {},
    sentenceStates: {},
    cardBlindPassed: {},
    linkSnowballPassed: {},
    segmentSnowballPassed: {},
    snowballPassed: [],
    fullTextCompleted: false,
    fullTextPassed: false,
    lastAttemptTime: null,
    bestPassedTime: null,
    bestTime: 0,
    updatedAt: '2026-08-04T00:00:00.000Z',
  };
}
