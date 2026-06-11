import { Dimensions } from 'react-native';
import { t } from '../../../i18n';

export const getWeekdays = (): string[] => [
  t('common.weekdays.mon'),
  t('common.weekdays.tue'),
  t('common.weekdays.wed'),
  t('common.weekdays.thu'),
  t('common.weekdays.fri'),
  t('common.weekdays.sat'),
  t('common.weekdays.sun'),
];

export const WEEK_COL_WIDTH = Math.max(
  72,
  Math.floor((Dimensions.get('window').width - 32 - 36) / 7)
);

export const shiftTypeLabel = (type?: string) => {
  if (!type) return null;
  if (type === 'morning' || type === 'half_morning') return t('common.shiftTypes.morning');
  if (type === 'day' || type === 'full') return t('common.shiftTypes.day');
  if (type === 'evening' || type === 'half_evening') return t('common.shiftTypes.evening');
  if (type === 'hourly') return t('common.shiftTypes.hourlyShort');
  return null;
};

export const formatTimeShort = (start: string, end: string) => {
  const trim = (t: string) => t.slice(0, 5).replace(':00', '');
  return `${trim(start)}–${trim(end)}`;
};

export const shortName = (name: string) => name.split(' ')[0];
