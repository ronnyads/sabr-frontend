import { brazilianDayBoundary } from './client-dashboard-period';

describe('brazilianDayBoundary', () => {
  it('converts the first selected day to midnight in Sao Paulo', () => {
    expect(brazilianDayBoundary('2026-09-01').toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('converts the visible final day to the exclusive next-day boundary', () => {
    expect(brazilianDayBoundary('2026-09-23', true).toISOString()).toBe('2026-09-24T03:00:00.000Z');
  });
});
