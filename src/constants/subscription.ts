/** Лимиты и цены тарифов Freemium (Free + Pro) */

export const FREE_PVZ_LIMIT = 1;
export const FREE_EMPLOYEE_LIMIT = 5;

export const PRO_PVZ_LIMIT = 999;
export const PRO_EMPLOYEE_LIMIT = 999;
export const ENTERPRISE_PVZ_LIMIT = 9999;
export const ENTERPRISE_EMPLOYEE_LIMIT = 9999;

export const TRIAL_DAYS = 14;
export const SUBSCRIPTION_GRACE_DAYS = 3;
export const EARLY_ADOPTER_PRICE_RUB = 990;
export const EARLY_ADOPTER_LIMIT = 100;

export type BillingPeriod = 'month' | 'year';

export const SUBSCRIPTION_LIMITS = {
  free: { pvz: FREE_PVZ_LIMIT, employees: FREE_EMPLOYEE_LIMIT },
  pro: { pvz: PRO_PVZ_LIMIT, employees: PRO_EMPLOYEE_LIMIT },
  enterprise: { pvz: ENTERPRISE_PVZ_LIMIT, employees: ENTERPRISE_EMPLOYEE_LIMIT },
} as const;

/** Цены для UI; фактическая оплата — через ЮKassa */
export const PLAN_PRICING = {
  free: { amountRub: 0, perPvz: false },
  pro: {
    monthlyRub: 399,
    yearlyRub: 3990,
    yearlySavingsPercent: 17,
    perPvz: false,
  },
  enterprise: {
    minMonthlyRub: 3950,
    perPvz: false,
  },
} as const;

export function getProAmountRub(
  period: BillingPeriod = 'month',
  isEarlyAdopter = false
): number {
  if (isEarlyAdopter) return EARLY_ADOPTER_PRICE_RUB;
  return period === 'year' ? PLAN_PRICING.pro.yearlyRub : PLAN_PRICING.pro.monthlyRub;
}
