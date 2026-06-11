// src/utils/phoneHelpers.ts

/**
 * Очищает номер телефона от всех нецифровых символов
 * и приводит к единому формату (11 цифр, начинается с 7)
 * 
 * @param phone - номер телефона в любом формате
 * @returns очищенный номер (11 цифр)
 * 
 * @example
 * cleanPhone('+7 (999) 123-45-67') // '79991234567'
 * cleanPhone('8 (999) 123-45-67')  // '79991234567'
 * cleanPhone('9991234567')         // '79991234567'
 */
export const cleanPhone = (phone: string): string => {
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  // Если номер начинается с 8, заменяем на 7
  if (cleaned.length === 11 && cleaned[0] === '8') {
    cleaned = '7' + cleaned.slice(1);
  }
  
  // Если номер из 10 цифр, добавляем 7 в начало
  if (cleaned.length === 10) {
    cleaned = '7' + cleaned;
  }
  
  // Если номер из 11 цифр и начинается не с 7, заменяем первую цифру на 7
  if (cleaned.length === 11 && cleaned[0] !== '7') {
    cleaned = '7' + cleaned.slice(1);
  }
  
  return cleaned;
};

/**
 * Форматирует номер телефона для отображения
 * 
 * @param raw - номер телефона (может быть в любом формате)
 * @returns отформатированный номер вида +7 (999) 123-45-67
 * 
 * @example
 * formatPhoneForDisplay('79991234567') // '+7 (999) 123-45-67'
 * formatPhoneForDisplay('+7 (999) 123-45-67') // '+7 (999) 123-45-67'
 */
export const formatPhoneForDisplay = (raw: string): string => {
  const cleaned = cleanPhone(raw);
  
  if (cleaned.length !== 11) {
    return raw; // возвращаем как есть, если не удалось отформатировать
  }
  
  return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
};

/**
 * Форматирует номер телефона во время ввода
 * 
 * @param text - вводимый текст
 * @returns отформатированный номер
 * 
 * @example
 * formatPhoneInput('79991234567') // '+7 (999) 123-45-67'
 */
export const formatPhoneInput = (text: string): string => {
  if (text === '') return '';
  
  const cleaned = text.replace(/[^0-9]/g, '');
  
  if (cleaned.length === 0) return '';
  
  let formatted = '';
  
  if (cleaned.length === 1) {
    formatted = `+${cleaned}`;
  } else if (cleaned.length <= 4) {
    formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1)}`;
  } else if (cleaned.length <= 7) {
    formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4)}`;
  } else if (cleaned.length <= 9) {
    formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  } else {
    formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
  }
  
  // Ограничиваем длину
  if (formatted.length > 18) {
    formatted = formatted.slice(0, 18);
  }
  
  return formatted;
};

/**
 * Проверяет, является ли номер телефона корректным
 * 
 * @param phone - номер телефона
 * @returns true если номер содержит 11 цифр
 */
export const isValidPhone = (phone: string): boolean => {
  const cleaned = cleanPhone(phone);
  return cleaned.length === 11;
};

/** Российский номер → E.164 для Supabase Phone Auth (+79991234567). */
export const toE164Phone = (phone: string): string => {
  const cleaned = cleanPhone(phone);
  return `+${cleaned}`;
};