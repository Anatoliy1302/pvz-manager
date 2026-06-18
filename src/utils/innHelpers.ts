/** Нормализует ИНН: только цифры. */
export function normalizeInn(value: string): string {
  return value.replace(/\D/g, '');
}

/** ИНН юрлица (10) или ИП (12) в РФ. */
export function isValidInn(value: string): boolean {
  const digits = normalizeInn(value);
  return digits.length === 10 || digits.length === 12;
}
