import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDateLocal, nowISO, todayISO, tomorrowISO, yesterdayISO } from '../../src/utils/time';

afterEach(() => vi.useRealTimers());

describe('local calendar helpers', () => {
  it('formats dates and crosses month/year boundaries in local time', () => {
    const date = new Date(2026, 0, 31, 23, 30, 0);
    expect(formatDateLocal(date)).toBe('2026-01-31');

    vi.useFakeTimers();
    vi.setSystemTime(date);
    expect(todayISO()).toBe('2026-01-31');
    expect(yesterdayISO()).toBe('2026-01-30');
    expect(tomorrowISO()).toBe('2026-02-01');

    vi.setSystemTime(new Date(2026, 11, 31, 23, 30, 0));
    expect(todayISO()).toBe('2026-12-31');
    expect(tomorrowISO()).toBe('2027-01-01');
  });

  it('uses UTC ISO timestamps for nowISO while calendar helpers stay local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:34:56.789Z'));
    expect(nowISO()).toBe('2026-08-10T12:34:56.789Z');
    expect(todayISO()).toMatch(/^2026-08-1[0-1]$/);
  });
});
