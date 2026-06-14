/**
 * Безопасный JSON.parse с fallback при повреждённых данных.
 */
export function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch (error) {
    console.error('[safeParseJson] Невалидный JSON:', error);
    return fallback;
  }
}
