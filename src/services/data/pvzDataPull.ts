/** Pull shared PVZ operational data (schedule, finance, salary) from owner snapshot. */
export async function pullPvzOperationalData(pvzId: string): Promise<void> {
  if (!pvzId) return;

  const { pullPvzScheduleFromServer } = await import('./scheduleDataService');
  const { pullPvzFinanceFromServer } = await import('./financeDataService');
  const { pullPvzSalaryFromServer } = await import('../SupabaseSalarySettingsService');

  await Promise.all([
    pullPvzScheduleFromServer(pvzId),
    pullPvzFinanceFromServer(pvzId),
    pullPvzSalaryFromServer(pvzId),
  ]);
}
