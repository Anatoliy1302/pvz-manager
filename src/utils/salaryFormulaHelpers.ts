import { SalaryFormula, GoodsBonus } from '../types/salary';
import { Shift, User } from '../types/user';

export function calculateTotalHours(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  let hours = endHour - startHour;
  let minutes = endMinute - startMinute;

  if (minutes < 0) {
    hours--;
    minutes += 60;
  }

  if (hours < 0) {
    hours += 24;
  }

  return Number((hours + minutes / 60).toFixed(2));
}

/** Админ или сотрудник с полными правами = «менеджер» для appliesTo. */
export function isSalaryManager(employee: User): boolean {
  return employee.role === 'admin' || employee.permissions?.isFullAdmin === true;
}

export function formulaAppliesToEmployee(formula: SalaryFormula, employee: User): boolean {
  if (formula.appliesTo === 'all_employees') return true;
  if (formula.appliesTo === 'managers_only') return isSalaryManager(employee);
  if (formula.appliesTo === 'assistants_only') {
    return employee.role === 'employee' && !isSalaryManager(employee);
  }
  return true;
}

export function calculateBaseEarningsForFormula(
  formula: SalaryFormula,
  rate: number,
  hours: number,
  shift: Pick<Shift, 'startTime' | 'endTime'>
): { earnings: number; calculation: string } {
  const plannedHours = calculateTotalHours(shift.startTime, shift.endTime);
  const safePlannedHours = plannedHours > 0 ? plannedHours : 1;

  if (formula.payType === 'fixed_shift') {
    return { earnings: rate, calculation: `Фиксированная ставка: ${rate} ₽` };
  }

  if (formula.payType === 'hourly') {
    const earnings = rate * hours;
    return { earnings, calculation: `${rate} ₽/ч × ${hours} ч = ${earnings} ₽` };
  }

  // mixed: минимум фикс за смену или почасовая, если выгоднее
  const hourlyRate = rate / safePlannedHours;
  const fixedPart = rate;
  const hourlyPart = hourlyRate * hours;
  const earnings = Math.round(Math.max(fixedPart, hourlyPart));

  if (earnings === fixedPart && hourlyPart <= fixedPart) {
    return { earnings, calculation: `Смешанная (мин. фикс): ${rate} ₽` };
  }

  return {
    earnings,
    calculation: `Смешанная: ${hourlyRate.toFixed(2)} ₽/ч × ${hours} ч = ${earnings.toFixed(2)} ₽`,
  };
}

export function calculateGoodsBonusAmount(
  bonusConfig: GoodsBonus | undefined,
  goodsCount: number,
  goodsValue: number | undefined,
  bonusName: string
): { bonus: number; calculation: string } {
  if (!bonusConfig?.enabled || goodsCount <= 0) {
    return { bonus: 0, calculation: '' };
  }

  const threshold = bonusConfig.threshold || 0;
  const countAbove = Math.max(0, goodsCount - threshold);
  if (countAbove === 0) {
    return { bonus: 0, calculation: '' };
  }

  if (bonusConfig.percent && bonusConfig.percent > 0) {
    const valueBase =
      goodsValue && goodsValue > 0
        ? goodsValue * (countAbove / goodsCount)
        : bonusConfig.perItem
          ? countAbove * bonusConfig.perItem
          : 0;

    if (valueBase <= 0) {
      return { bonus: 0, calculation: '' };
    }

    const bonus = Math.round((valueBase * bonusConfig.percent) / 100);
    return {
      bonus,
      calculation: `${bonusName}: ${bonusConfig.percent}% от ${Math.round(valueBase)} ₽ = ${bonus} ₽`,
    };
  }

  if (bonusConfig.perItem) {
    const bonus = countAbove * bonusConfig.perItem;
    return {
      bonus,
      calculation: `${bonusName}: ${countAbove} шт × ${bonusConfig.perItem} ₽ = ${bonus} ₽`,
    };
  }

  return { bonus: 0, calculation: '' };
}
