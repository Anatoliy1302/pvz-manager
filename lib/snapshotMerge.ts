function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const DEEP_MERGE_KEYS = new Set([
  'schedule_assignments_by_pvz',
  'swap_requests_by_pvz',
  'salary_formulas_by_pvz',
  'salary_settings_by_pvz',
  'global_salary_settings_by_pvz',
  'salary_bundles',
  'employee_salary_settings',
  'corrections_by_employee',
  'overtime_by_employee',
]);

function shouldDeepMergeKey(key: string, value: unknown, current: unknown): boolean {
  if (!isPlainRecord(value) || !isPlainRecord(current)) return false;
  return key.endsWith('_by_pvz') || DEEP_MERGE_KEYS.has(key);
}

/** Слияние snapshot: вложенные *_by_pvz и map-ключи не затираются целиком. */
export function mergeDeepSnapshot(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (shouldDeepMergeKey(key, value, current[key])) {
      result[key] = { ...(current[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
      continue;
    }
    result[key] = value;
  }
  return result;
}
