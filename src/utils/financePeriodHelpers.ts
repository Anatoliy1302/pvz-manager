import { toDateKey } from './dateHelpers';

export type FinancePeriodType = 'day' | 'week' | 'month' | 'year';

export function getFinancePeriodRange(
  period: FinancePeriodType,
  anchor: Date
): { periodStart: string; periodEnd: string } {
  const now = anchor;

  switch (period) {
    case 'day': {
      const day = toDateKey(now);
      return { periodStart: day, periodEnd: day };
    }
    case 'week': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(now);
      start.setDate(now.getDate() - diff);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { periodStart: toDateKey(start), periodEnd: toDateKey(end) };
    }
    case 'year':
      return {
        periodStart: toDateKey(new Date(now.getFullYear(), 0, 1)),
        periodEnd: toDateKey(new Date(now.getFullYear(), 11, 31)),
      };
    case 'month':
    default:
      return {
        periodStart: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        periodEnd: toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
  }
}
