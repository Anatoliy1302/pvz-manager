import { syncSupabaseOnLogin, type SyncResult } from './SupabaseSyncService';
import SyncStatusService from './SyncStatusService';

export async function runSyncOnLogin(sessionUser: Parameters<typeof syncSupabaseOnLogin>[0]): Promise<SyncResult> {
  SyncStatusService.startSync();
  const result = await syncSupabaseOnLogin(sessionUser);
  SyncStatusService.finishSync(result.errors);
  return result;
}
