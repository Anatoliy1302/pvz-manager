// src/utils/dateHelpers.ts
import { getDateLocale, t } from '../i18n';

/** Локальная дата YYYY-MM-DD без сдвига UTC. */
export const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Форматирует дату для отображения
 * 
 * @param dateString - дата в формате YYYY-MM-DD или ISO
 * @param format - формат вывода: 'short', 'long', 'dayMonth', 'monthYear'
 * @returns отформатированная дата
 * 
 * @example
 * formatDate('2024-01-15', 'short') // '15.01.2024'
 * formatDate('2024-01-15', 'long')  // '15 января 2024'
 * formatDate('2024-01-15', 'dayMonth') // '15 января'
 */
export const formatDate = (
  dateString: string,
  format: 'short' | 'long' | 'dayMonth' | 'monthYear' = 'short'
): string => {
  const date = new Date(dateString);
  const locale = getDateLocale();

  switch (format) {
    case 'short':
      return date.toLocaleDateString(locale);
    case 'long':
      return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    case 'dayMonth':
      return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
      });
    case 'monthYear':
      return date.toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      });
    default:
      return date.toLocaleDateString(locale);
  }
};

/**
 * Форматирует время для отображения
 * 
 * @param timeString - время в формате HH:MM
 * @returns отформатированное время
 */
export const formatTime = (timeString: string): string => {
  if (!timeString) return '';
  const [hours, minutes] = timeString.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

/**
 * Форматирует количество часов для отображения
 * 
 * @param hours - количество часов (может быть дробным)
 * @returns строка вида "5 ч 30 мин" или "2 ч"
 * 
 * @example
 * formatHours(5.5) // '5 ч 30 мин'
 * formatHours(2)   // '2 ч'
 * formatHours(0.75) // '45 мин'
 */
export const formatHours = (hours: number): string => {
  const h = t('common.stats.hoursShort');
  const min = t('common.stats.minutesShort');

  if (!hours || hours === 0) return `0 ${h}`;

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (wholeHours === 0 && minutes === 0) return `0 ${h}`;
  if (wholeHours === 0) return `${minutes} ${min}`;
  if (minutes === 0) return `${wholeHours} ${h}`;
  return `${wholeHours} ${h} ${minutes} ${min}`;
};

/**
 * Возвращает диапазон дат для текущего месяца
 * 
 * @returns объект с началом и концом месяца
 */
export const getCurrentMonthRange = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

/**
 * Возвращает диапазон дат для выбранного месяца
 * 
 * @param year - год
 * @param month - месяц (0-11)
 * @returns объект с началом и концом месяца
 */
export const getMonthRange = (year: number, month: number): { start: string; end: string } => {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

/**
 * Проверяет, является ли дата сегодняшней
 * 
 * @param dateString - дата в формате YYYY-MM-DD
 * @returns true если дата сегодня
 */
export const isToday = (dateString: string): boolean => {
  const today = new Date().toISOString().split('T')[0];
  return dateString === today;
};

/**
 * Проверяет, является ли дата завтрашней
 * 
 * @param dateString - дата в формате YYYY-MM-DD
 * @returns true если дата завтра
 */
export const isTomorrow = (dateString: string): boolean => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateString === tomorrow.toISOString().split('T')[0];
};

/**
 * Возвращает человеко-читаемое представление даты
 * ("Сегодня", "Завтра", или отформатированную дату)
 * 
 * @param dateString - дата в формате YYYY-MM-DD
 * @returns строка с датой
 */
export const getRelativeDateString = (dateString: string): string => {
  if (isToday(dateString)) return t('common.calendar.today');
  if (isTomorrow(dateString)) return t('common.calendar.tomorrow');
  return formatDate(dateString, 'dayMonth');
};

/**
 * Возвращает массив дат между двумя датами (включительно)
 * 
 * @param startDate - начальная дата (YYYY-MM-DD)
 * @param endDate - конечная дата (YYYY-MM-DD)
 * @returns массив дат
 */
export const getDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

/**
 * Возвращает номер недели в году для даты
 * 
 * @param date - дата
 * @returns номер недели (1-53)
 */
export const getWeekNumber = (date: Date): number => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

/**
 * Форматирует дату и время для отображения
 * 
 * @param dateString - дата в формате YYYY-MM-DD
 * @param timeString - время в формате HH:MM
 * @returns строка вида "15 января, 14:30"
 */
export const formatDateTime = (dateString: string, timeString: string): string => {
  return `${formatDate(dateString, 'dayMonth')}, ${formatTime(timeString)}`;
};