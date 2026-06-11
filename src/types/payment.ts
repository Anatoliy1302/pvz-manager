// src/types/payment.ts

export type PaymentType = 'advance' | 'salary' | 'bonus';
export type PaymentStatus = 'pending' | 'completed' | 'rejected';
export type AdvanceRequestStatus = 'pending' | 'approved' | 'rejected';

/**
 * Выплата (аванс или зарплата)
 */
export interface Payment {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  type: PaymentType;
  periodStart: string;     // начало периода (YYYY-MM-DD)
  periodEnd: string;       // конец периода (YYYY-MM-DD)
  paidAt: string;          // дата выплаты
  note?: string;           // комментарий
  createdBy: string;       // ID создателя
  createdByName: string;   // имя создателя
  status: PaymentStatus;
  pvzId: string;
}

/**
 * Запрос на аванс от сотрудника
 */
export interface AdvanceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  reason?: string;
  status: AdvanceRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  pvzId: string;
}

/**
 * Финансовый баланс сотрудника
 */
export interface EmployeeBalance {
  employeeId: string;
  employeeName: string;
  totalEarned: number;     // всего начислено (смены − штрафы + бонусы)
  totalPaid: number;       // всего выплачено
  balance: number;         // остаток к выплате
  lastUpdated: string;
}

/**
 * Финансовая сводка за период
 */
export interface PeriodFinanceSummary {
  periodStart: string;
  periodEnd: string;
  totalEarned: number;
  totalPaid: number;
  totalBalance: number;
  employeesCount: number;
  paymentsCount: number;
}

/**
 * Детализация по сотруднику за период
 */
export interface EmployeePeriodDetail {
  employeeId: string;
  employeeName: string;
  shifts: Array<{
    id: string;
    date: string;
    shiftType: string;
    earnings: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    type: PaymentType;
    paidAt: string;
    note?: string;
  }>;
  totalEarned: number;
  totalPaid: number;
  balance: number;
}