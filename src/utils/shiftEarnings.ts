import DataService from '../services/DataService';
import { Shift } from '../types/user';
import { calculateAdvancedShiftEarnings } from './advancedPayrollCalculator';
import { calculateSimpleShiftEarnings } from './salaryRateHelpers';
import { getFormulaForEmployee } from '../services/SalaryFormulaService';

/** Единый расчёт: формула (если есть) → иначе простые ставки. */
export async function calculateUnifiedShiftEarnings(
  employeeId: string,
  pvzId: string,
  shift: Shift
): Promise<number> {
  const formula = await getFormulaForEmployee(employeeId, pvzId);
  if (formula) {
    const employee = await DataService.getUserById(employeeId);
    if (employee) {
      const calculation = await calculateAdvancedShiftEarnings(shift, employee, pvzId);
      return calculation.totalEarnings;
    }
  }
  return calculateSimpleShiftEarnings(employeeId, pvzId, shift);
}
