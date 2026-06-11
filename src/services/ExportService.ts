// src/services/ExportService.ts
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import DataService from './DataService';
import {
  calculateEmployeeAccruals,
  getPaymentsByPeriod,
  syncShiftStatusesInStorage,
} from './PaymentService';
import { Shift, User } from '../types/user';
import { Payment, PaymentType } from '../types/payment';
import { toDateKey } from '../utils/dateHelpers';
import { t } from '../i18n';
import {
  calcShiftHours,
  getShiftDisplayStatus,
  getShiftStatusLabel,
} from '../utils/employeeStatsHelpers';
import { isShiftCountableForAccruals } from '../utils/shiftStatusHelper';

export interface AccountantExportOptions {
  pvzId?: string;
  pvzName: string;
  periodStart: string;
  periodEnd: string;
}

interface PayrollRow {
  name: string;
  phone: string;
  role: string;
  shiftsCount: number;
  hours: number;
  shiftsEarned: number;
  fines: number;
  bonuses: number;
  netEarned: number;
  paid: number;
  balance: number;
}

class ExportService {
  async exportAccountantReport(options: AccountantExportOptions): Promise<void> {
    try {
      await syncShiftStatusesInStorage();

      const { pvzId, pvzName, periodStart, periodEnd } = options;
      const employees = await this.getActiveEmployees(pvzId);
      const allShifts = await this.getPeriodShifts(pvzId, periodStart, periodEnd);
      const payments = await this.getPeriodPayments(pvzId, periodStart, periodEnd);

      const payrollRows: PayrollRow[] = [];
      for (const emp of employees) {
        const empPvzId = emp.pvzId || pvzId || '';
        const accruals = await calculateEmployeeAccruals(emp.id, empPvzId, {
          periodStart,
          periodEnd,
        });
        const empShifts = allShifts.filter(
          (s) => s.employeeId === emp.id && isShiftCountableForAccruals(s)
        );
        const hours = empShifts.reduce((sum, s) => sum + calcShiftHours(s), 0);

        payrollRows.push({
          name: emp.name,
          phone: emp.phone,
          role: emp.role === 'admin' ? 'Администратор' : 'Сотрудник',
          shiftsCount: empShifts.length,
          hours: Math.round(hours * 10) / 10,
          shiftsEarned: accruals.shiftsEarned,
          fines: accruals.totalFines,
          bonuses: accruals.totalBonuses,
          netEarned: accruals.netEarned,
          paid: accruals.totalPaid,
          balance: accruals.balance,
        });
      }

      const sections: string[] = [];

      sections.push(
        this.buildMetaSection(pvzName, periodStart, periodEnd),
        '',
        this.buildPayrollSection(payrollRows),
        '',
        this.buildShiftsSection(allShifts.filter(isShiftCountableForAccruals)),
        '',
        this.buildPaymentsSection(payments)
      );

      const safePvz = this.sanitizeFileName(pvzName);
      const fileName = `бухгалтерия_${safePvz}_${periodStart}_${periodEnd}`;
      await this.shareCsv(sections.join('\n'), fileName);
    } catch (error) {
      console.error('Ошибка экспорта для бухгалтера:', error);
      Alert.alert(t('common.error.title'), t('alerts.export.reportFailed'));
    }
  }

  async exportEmployees(pvzId: string, pvzName: string): Promise<void> {
    try {
      const employees = await this.getActiveEmployees(pvzId);
      const headers = ['Имя', 'Телефон', 'Роль', 'Дата создания'];
      const rows = employees.map((emp) => [
        emp.name,
        emp.phone,
        emp.role === 'admin' ? 'Администратор' : 'Сотрудник',
        emp.createdAt ? new Date(emp.createdAt).toLocaleDateString('ru-RU') : '',
      ]);
      await this.shareTable(rows, headers, `сотрудники_${this.sanitizeFileName(pvzName)}`);
    } catch (error) {
      console.error('Ошибка экспорта сотрудников:', error);
      Alert.alert(t('common.error.title'), t('alerts.export.employeesFailed'));
    }
  }

  async exportShifts(
    pvzId: string,
    pvzName: string,
    periodStart: string,
    periodEnd: string
  ): Promise<void> {
    try {
      await syncShiftStatusesInStorage();
      const shifts = await this.getPeriodShifts(pvzId, periodStart, periodEnd);
      const headers = [
        'Дата',
        'Сотрудник',
        'Начало',
        'Конец',
        'Часы',
        'Начислено',
        'Статус',
      ];
      const rows = shifts.map((shift) => [
        shift.date,
        shift.employeeName,
        shift.startTime,
        shift.endTime,
        calcShiftHours(shift).toFixed(1),
        shift.earnings || 0,
        getShiftStatusLabel(getShiftDisplayStatus(shift)),
      ]);
      const fileName = `смены_${this.sanitizeFileName(pvzName)}_${periodStart}_${periodEnd}`;
      await this.shareTable(rows, headers, fileName);
    } catch (error) {
      console.error('Ошибка экспорта смен:', error);
      Alert.alert(t('common.error.title'), t('alerts.export.shiftsFailed'));
    }
  }

  async exportPayments(
    pvzId: string,
    pvzName: string,
    periodStart: string,
    periodEnd: string
  ): Promise<void> {
    try {
      const payments = await getPaymentsByPeriod(pvzId, periodStart, periodEnd);
      await this.shareCsv(
        this.buildPaymentsSection(payments),
        `выплаты_${this.sanitizeFileName(pvzName)}_${periodStart}_${periodEnd}`
      );
    } catch (error) {
      console.error('Ошибка экспорта выплат:', error);
      Alert.alert(t('common.error.title'), t('alerts.export.paymentsFailed'));
    }
  }

  private async getActiveEmployees(pvzId?: string): Promise<User[]> {
    const users = await DataService.getUsers();
    return users
      .filter((u) => u.role !== 'owner' && u.status === 'active')
      .filter((u) => !pvzId || u.pvzId === pvzId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  private async getPeriodPayments(
    pvzId: string | undefined,
    periodStart: string,
    periodEnd: string
  ): Promise<Payment[]> {
    if (pvzId) {
      return getPaymentsByPeriod(pvzId, periodStart, periodEnd);
    }

    const pvzs = await DataService.getPvzs();
    const all: Payment[] = [];
    for (const pvz of pvzs) {
      const chunk = await getPaymentsByPeriod(pvz.id, periodStart, periodEnd);
      all.push(...chunk);
    }
    return all.sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''));
  }

  private async getPeriodShifts(
    pvzId: string | undefined,
    periodStart: string,
    periodEnd: string
  ): Promise<Shift[]> {
    const allShifts = await DataService.getShifts();
    return allShifts
      .filter((s) => {
        if (pvzId && s.pvzId && s.pvzId !== pvzId) return false;
        return s.date >= periodStart && s.date <= periodEnd;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }

  private buildMetaSection(pvzName: string, periodStart: string, periodEnd: string): string {
    const rows = [
      ['Отчёт для бухгалтера'],
      ['ПВЗ', pvzName],
      ['Период', `${periodStart} — ${periodEnd}`],
      ['Дата выгрузки', toDateKey(new Date())],
    ];
    return rows.map((row) => row.map(this.escapeField).join(',')).join('\n');
  }

  private buildPayrollSection(rows: PayrollRow[]): string {
    const headers = [
      'Сотрудник',
      'Телефон',
      'Роль',
      'Смен',
      'Часов',
      'За смены',
      'Штрафы',
      'Бонусы',
      'Итого к выплате',
      'Выплачено',
      'Остаток',
    ];
    const data = rows.map((r) => [
      r.name,
      r.phone,
      r.role,
      r.shiftsCount,
      r.hours,
      r.shiftsEarned,
      r.fines,
      r.bonuses,
      r.netEarned,
      r.paid,
      r.balance,
    ]);
    return ['ВЕДОМОСТЬ НАЧИСЛЕНИЙ', this.tableToCsv(data, headers)].join('\n');
  }

  private buildShiftsSection(shifts: Shift[]): string {
    const headers = [
      'Дата',
      'Сотрудник',
      'Начало',
      'Конец',
      'Часы',
      'Начислено',
      'Статус',
    ];
    const data = shifts.map((shift) => [
      shift.date,
      shift.employeeName,
      shift.startTime,
      shift.endTime,
      calcShiftHours(shift).toFixed(1),
      shift.earnings || 0,
      getShiftStatusLabel(getShiftDisplayStatus(shift)),
    ]);
    return ['ДЕТАЛИЗАЦИЯ СМЕН', this.tableToCsv(data, headers)].join('\n');
  }

  private buildPaymentsSection(payments: Payment[]): string {
    const headers = [
      'Дата выплаты',
      'Сотрудник',
      'Сумма',
      'Тип',
      'Период',
      'Комментарий',
    ];
    const data = payments.map((p) => [
      (p.paidAt || '').split('T')[0],
      p.employeeName,
      p.amount,
      this.paymentTypeLabel(p.type),
      `${p.periodStart} — ${p.periodEnd}`,
      p.note || '',
    ]);
    return ['ВЫПЛАТЫ', this.tableToCsv(data, headers)].join('\n');
  }

  private paymentTypeLabel(type: PaymentType): string {
    if (type === 'advance') return 'Аванс';
    if (type === 'bonus') return 'Бонус';
    return 'Зарплата';
  }

  private tableToCsv(rows: unknown[][], headers: string[]): string {
    return [headers, ...rows].map((row) => row.map(this.escapeField).join(',')).join('\n');
  }

  private async shareTable(
    rows: unknown[][],
    headers: string[],
    fileName: string
  ): Promise<void> {
    await this.shareCsv(this.tableToCsv(rows, headers), fileName);
  }

  private async shareCsv(content: string, fileName: string): Promise<void> {
    const csvContent = '\uFEFF' + content;
    const fileUri = FileSystem.documentDirectory + `${fileName}.csv`;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      Alert.alert(t('common.error.title'), t('alerts.export.sharingUnavailable'));
      return;
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: `Экспорт ${fileName}`,
      UTI: 'public.comma-separated-values-text',
    });
  }

  private escapeField(field: unknown): string {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[^\wа-яА-ЯёЁ\d-]+/gi, '_').slice(0, 40) || 'pvz';
  }
}

export default new ExportService();
