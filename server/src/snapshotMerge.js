function isPlainRecord(value) {
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

function shouldDeepMergeKey(key, value, current) {
  if (!isPlainRecord(value) || !isPlainRecord(current)) return false;
  return key.endsWith('_by_pvz') || DEEP_MERGE_KEYS.has(key);
}

function mergeSyncSnapshotPayload(existing, incoming) {
  const base = isPlainRecord(existing) ? { ...existing } : {};
  const patch = isPlainRecord(incoming) ? incoming : {};
  for (const [key, value] of Object.entries(patch)) {
    if (shouldDeepMergeKey(key, value, base[key])) {
      base[key] = { ...base[key], ...value };
      continue;
    }
    base[key] = value;
  }
  return base;
}

module.exports = { mergeSyncSnapshotPayload };
