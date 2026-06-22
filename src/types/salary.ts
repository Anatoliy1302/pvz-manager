// src/types/salary.ts

export type PayType = 'fixed_shift' | 'hourly' | 'mixed';
export type HoursCalculationType = 'planned' | 'factual';
export type AppliesTo = 'all_employees' | 'managers_only' | 'assistants_only';

/**
 * Премия за товары (выданные или принятые)
 */
export interface GoodsBonus {
  enabled: boolean;
  perItem?: number;      // ₽ за штуку
  percent?: number;      // % от стоимости
  threshold: number;     // порог (первые N товаров без премии)
}

/**
 * Штраф за опоздание
 */
export interface LatePenalty {
  enabled: boolean;
  amount: number;        // фиксированная сумма штрафа
}

/**
 * Штраф за низкий рейтинг
 */
export interface RatingPenalty {
  enabled: boolean;
  perPoint: number;      // штраф за каждый балл ниже целевого
  targetRating: number;  // целевой рейтинг (например, 4.5)
}

/**
 * Доплата за подмену
 */
export interface SubstitutionBonus {
  enabled: boolean;
  amount: number;
}

/**
 * Доплата за стаж
 */
export interface SeniorityBonus {
  enabled: boolean;
  perYear: number;       // доплата за год стажа
}

/**
 * Формула расчёта зарплаты
 */
export interface SalaryFormula {
  id: string;
  pvzId: string;
  name: string;
  description?: string;
  
  // Тип оплаты
  payType: PayType;
  
  // Ставки в зависимости от количества сотрудников
  rate1Employee: number;   // если работает 1 сотрудник
  rate2Employees: number;  // если работает 2 сотрудника
  rate3Employees: number;  // если работает 3 сотрудника
  rate4Employees: number;  // если работает 4+ сотрудников
  
  // Часы для расчёта
  hoursCalculationType: HoursCalculationType;
  
  // Премии
  goodsIssuedBonus?: GoodsBonus;
  goodsReceivedBonus?: GoodsBonus;
  
  // Удержания
  latePenalty?: LatePenalty;
  ratingPenalty?: RatingPenalty;
  
  // Доплаты
  substitutionBonus?: SubstitutionBonus;
  seniorityBonus?: SeniorityBonus;
  
  // Кому применяется
  appliesTo: AppliesTo;
  
  // Активна ли формула
  isActive: boolean;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Индивидуальные настройки сотрудника
 */
export interface EmployeeSalarySettings {
  id: string;
  employeeId: string;
  formulaId: string | null;      // если null — используется формула ПВЗ по умолчанию
  customRate?: number;            // индивидуальная базовая ставка
  hireDate: string;               // дата найма (для расчёта стажа)
  effectiveFrom: string;
  effectiveTo?: string;
}

/**
 * Детальный расчёт смены
 */
export interface ShiftCalculation {
  id: string;
  shiftId: string;
  formulaId: string;
  formulaName: string;
  
  // Исходные данные
  baseRate: number;
  actualHours: number;
  employeesOnShift: number;
  goodsIssuedCount: number;
  goodsReceivedCount: number;
  lateMinutes: number;
  rating: number;
  seniorityYears: number;
  isSubstitution: boolean;
  
  // Начисления
  baseEarnings: number;
  goodsIssuedBonus: number;
  goodsReceivedBonus: number;
  substitutionBonus: number;
  seniorityBonus: number;
  
  // Удержания
  latePenalty: number;
  ratingPenalty: number;
  
  // Итог
  totalEarnings: number;
  
  // Детали расчёта (для отображения в UI)
  calculationDetails: string;
  
  calculatedAt: string;
}

/**
 * Статистика смены для расчёта
 */
export interface ShiftStats {
  goodsIssuedCount: number;
  goodsReceivedCount: number;
  /** Суммарная стоимость выданных товаров (для % премии). */
  goodsIssuedValue?: number;
  /** Суммарная стоимость принятых товаров (для % премии). */
  goodsReceivedValue?: number;
  rating: number;
  lateMinutes: number;
  isSubstitution: boolean;
  employeesOnShift: number;
  seniorityYears?: number;
}

/**
 * Формула по умолчанию
 */
export const defaultSalaryFormula: Omit<SalaryFormula, 'id' | 'pvzId' | 'createdAt' | 'updatedAt'> = {
  name: 'Стандартная формула',
  description: 'Фиксированная ставка за смену, зависит от количества сотрудников',
  payType: 'fixed_shift',
  rate1Employee: 3000,
  rate2Employees: 2500,
  rate3Employees: 2200,
  rate4Employees: 2000,
  hoursCalculationType: 'planned',
  goodsIssuedBonus: {
    enabled: false,
    perItem: 5,
    threshold: 0,
  },
  goodsReceivedBonus: {
    enabled: false,
    perItem: 3,
    threshold: 0,
  },
  latePenalty: {
    enabled: true,
    amount: 500,
  },
  ratingPenalty: {
    enabled: true,
    perPoint: 100,
    targetRating: 4.5,
  },
  substitutionBonus: {
    enabled: true,
    amount: 500,
  },
  seniorityBonus: {
    enabled: true,
    perYear: 200,
  },
  appliesTo: 'all_employees',
  isActive: true,
};