import { colors } from '../../../constants/colors';
import { t } from '../../../i18n';
import { ShiftAssignment, ShiftTypeConfig } from '../scheduleTypes';

export const getWeekdays = (): string[] => [
  t('common.weekdays.mon'),
  t('common.weekdays.tue'),
  t('common.weekdays.wed'),
  t('common.weekdays.thu'),
  t('common.weekdays.fri'),
  t('common.weekdays.sat'),
  t('common.weekdays.sun'),
];

export interface PvzWorkHours {
  workStart: string;
  workEnd: string;
  totalHours: number;
}

export const validateTime = (time: string): boolean => {
  if (!time || time.length !== 5) return false;
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
};

export const parseTimeToDate = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};

export const formatTimeFromDate = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getDefaultHourlyTimes = (pvzWorkHours: PvzWorkHours) => {
  const start = pvzWorkHours.workStart;
  const [startH, startM] = start.split(':').map(Number);
  const [workEndH, workEndM] = pvzWorkHours.workEnd.split(':').map(Number);
  const workEndMinutes = workEndH * 60 + workEndM;
  let endMinutes = (startH + 4) * 60 + startM;
  if (endMinutes > workEndMinutes) {
    endMinutes = workEndMinutes;
  }
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return {
    start,
    end: `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`,
  };
};

export const getShiftTypes = (pvzWorkHours: PvzWorkHours): ShiftTypeConfig[] => {
  const fullShiftHours = pvzWorkHours.totalHours;
  const halfShiftHours = fullShiftHours / 2;

  const [startH, startM] = pvzWorkHours.workStart.split(':').map(Number);
  const morningEndH = startH + halfShiftHours;
  const morningEnd = `${Math.floor(morningEndH).toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;

  const [endH, endM] = pvzWorkHours.workEnd.split(':').map(Number);
  const eveningStartH = endH - halfShiftHours;
  const eveningStart = `${Math.floor(eveningStartH).toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

  return [
    {
      id: 'full',
      name: t('common.shiftTypes.full'),
      shortName: t('common.shiftTypes.fullShort'),
      startTime: pvzWorkHours.workStart,
      endTime: pvzWorkHours.workEnd,
      hours: fullShiftHours,
      color: '#4CAF50',
    },
    {
      id: 'half_morning',
      name: t('screens.schedule.halfMorning'),
      shortName: t('common.shiftTypes.morning'),
      startTime: pvzWorkHours.workStart,
      endTime: morningEnd,
      hours: halfShiftHours,
      color: '#2196F3',
    },
    {
      id: 'half_evening',
      name: t('screens.schedule.halfEvening'),
      shortName: t('common.shiftTypes.evening'),
      startTime: eveningStart,
      endTime: pvzWorkHours.workEnd,
      hours: halfShiftHours,
      color: '#FF9800',
    },
    {
      id: 'hourly',
      name: t('common.shiftTypes.hourly'),
      shortName: t('common.shiftTypes.hourlyShort'),
      startTime: t('common.shiftTypes.customTime'),
      endTime: '',
      hours: 0,
      color: '#9C27B0',
    },
  ];
};

export const getDatesForView = (currentDate: Date, viewMode: 'day' | 'week' | 'month') => {
  const dates: Date[] = [];
  const startDate = new Date(currentDate);

  if (viewMode === 'day') {
    dates.push(new Date(currentDate));
  } else if (viewMode === 'week') {
    const dayOfWeek = currentDate.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(currentDate.getDate() - diff);
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
  } else {
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const diff = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    startDate.setDate(firstDayOfMonth.getDate() - diff);
    for (let i = 0; i < 35; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
  }
  return dates;
};

export const formatScheduleDate = (date: Date) =>
  date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

export const getWeekRange = (dates: Date[]) => {
  if (dates.length === 0) return '';
  const start = dates[0];
  const end = dates[dates.length - 1];
  return `${start.getDate()} ${start.toLocaleDateString('ru-RU', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('ru-RU', { month: 'short' })}`;
};

export const getShiftInfo = (assignment: ShiftAssignment, shiftTypes: ShiftTypeConfig[]) => {
  const shiftType = shiftTypes.find((t) => t.id === assignment.shiftType);
  return shiftType?.shortName || t('common.shiftTypes.shift');
};

export const getHourlyTimeRange = (assignment: ShiftAssignment) => {
  if (!assignment.customStart || !assignment.customEnd) return '';
  return `${assignment.customStart} – ${assignment.customEnd}`;
};

export const getShiftColor = (assignment: ShiftAssignment, shiftTypes: ShiftTypeConfig[]) => {
  const shiftType = shiftTypes.find((t) => t.id === assignment.shiftType);
  return shiftType?.color || colors.gray;
};

export const getPaymentStatus = (assignment: ShiftAssignment) => {
  if (assignment.paymentStatus === 'paid') {
    return { text: t('common.shiftStatus.paidOut'), color: colors.success, bg: '#E8F5E9' };
  }
  if (assignment.status === 'completed') {
    return { text: t('common.shiftStatus.awaitingPayout'), color: colors.warning, bg: '#FFF3E0' };
  }
  return { text: t('common.shiftStatus.scheduled'), color: colors.gray, bg: '#F5F5F5' };
};
