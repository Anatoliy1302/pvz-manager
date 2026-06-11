// src/types/user.ts

export type UserRole = 'owner' | 'admin' | 'employee';
export type ShiftStatus = 'planned' | 'active' | 'completed' | 'paid';
export type PaymentStatus = 'pending' | 'paid';

// Права сотрудника
export interface EmployeePermissions {
  canViewShifts: boolean;      // просмотр своих смен
  canRequestShifts: boolean;   // подача заявок на смены
  canSwapShifts: boolean;      // обмен сменами
  canViewStats: boolean;       // просмотр статистики
  canManageEmployees: boolean; // управление сотрудниками (для админ-прав)
  canManageSchedule: boolean;  // управление расписанием
  canManageShifts: boolean;    // управление сменами
  canViewRequests: boolean;    // просмотр заявок на смены
  isFullAdmin: boolean;        // полные права администратора
}

// Дефолтные права для сотрудника
export const defaultPermissions: EmployeePermissions = {
  canViewShifts: true,
  canRequestShifts: true,
  canSwapShifts: false,
  canViewStats: true,
  canManageEmployees: false,
  canManageSchedule: false,
  canManageShifts: false,
  canViewRequests: false,
  isFullAdmin: false,
};

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: 'active' | 'pending' | 'blocked';
  pvzId?: string;              // основной ПВЗ (для сотрудников и админов)
  pvzIds?: string[];           // доступные ПВЗ (для админов с полными правами)
  createdAt: string;
  invitedBy?: string;          // кто пригласил
  permissions?: EmployeePermissions;
  
  // НОВЫЕ ПОЛЯ (добавляем):
  permissionLevel?: 'full' | 'restricted';  // для админа всегда 'full' (restricted устарело)
  passwordHash?: string;                     // хеш пароля (для смены пароля)
  avatarUri?: string;                        // локальный URI фото профиля
}

export interface Pvz {
  id: string;
  name: string;
  address: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  radius?: number;
  workingHours: string;        // строка для отображения "09:00 - 21:00"
  workStart: string;           // "09:00"
  workEnd: string;             // "21:00"
  phone: string;
  ownerId: string;
}

export interface Shift {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType?: 'full_shift' | 'half_shift' | 'hourly';
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  paymentStatus: PaymentStatus;
  
  // Расчётные поля
  totalHours?: number;
  earnings?: number;
  hourlyRateApplied?: number;
  calculationFormula?: string;
  pvzId?: string;
  pvzName?: string;
  
  // Закрытие смены
  startedAt?: string;          // фактическое время начала
  endedAt?: string;            // фактическое время окончания
  closedBy?: string;
  closedAt?: string;
  autoEnded?: boolean;         // автоматически завершена (по геолокации)
  
  // Тип смены при создании
  shiftType?: 'full' | 'half_morning' | 'half_evening' | 'hourly';
  customStart?: string;
  customEnd?: string;
  
  // НОВЫЕ ПОЛЯ (добавляем):
  actualHours?: number;        // фактически отработанные часы
  actualStartTime?: string;    // для геолокации
  actualEndTime?: string;
  locationVerified?: boolean;   // проверена ли геолокация
  locationLat?: number;
  locationLng?: number;
}