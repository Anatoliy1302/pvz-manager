import { t } from '../../i18n';

export type ShiftType = 'full' | 'half_morning' | 'half_evening' | 'hourly';
export type ShiftStatus = 'planned' | 'completed' | 'paid';

export interface ShiftTypeConfig {
  id: ShiftType;
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  hours: number;
  color: string;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType?: 'full_shift' | 'half_shift' | 'hourly';
  date: string;
  shiftType: ShiftType;
  customStart?: string;
  customEnd?: string;
  status?: ShiftStatus;
  paymentStatus?: 'pending' | 'paid';
  earnings?: number;
  pvzId?: string;
  pvzName?: string;
}

export const getDefaultShiftTypes = (): ShiftTypeConfig[] => [
  {
    id: 'full',
    name: t('common.shiftTypes.full'),
    shortName: t('common.shiftTypes.fullShort'),
    startTime: '09:00',
    endTime: '21:00',
    hours: 12,
    color: '#6C5CE7',
  },
  {
    id: 'half_morning',
    name: t('common.shiftTypes.morning'),
    shortName: t('common.shiftTypes.morning'),
    startTime: '09:00',
    endTime: '15:00',
    hours: 6,
    color: '#2196F3',
  },
  {
    id: 'half_evening',
    name: t('common.shiftTypes.evening'),
    shortName: t('common.shiftTypes.evening'),
    startTime: '15:00',
    endTime: '21:00',
    hours: 6,
    color: '#FF9800',
  },
  {
    id: 'hourly',
    name: t('common.shiftTypes.hourly'),
    shortName: t('common.shiftTypes.hourlyShort'),
    startTime: '09:00',
    endTime: '21:00',
    hours: 0,
    color: '#4CAF50',
  },
];
