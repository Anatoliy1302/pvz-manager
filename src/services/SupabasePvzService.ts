import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { Pvz } from '../types/user';
import { isUuid, setPvzIdMapping } from '../utils/supabaseHelpers';
import { hasSupabaseSession } from './SupabaseAuthService';

export async function ensurePvzSynced(localPvz: Pvz): Promise<string> {
  if (!(await hasSupabaseSession())) {
    return localPvz.id;
  }

  if (isUuid(localPvz.id)) {
    const { error } = await supabase.from('pvz').upsert(
      {
        id: localPvz.id,
        owner_id: localPvz.ownerId,
        name: localPvz.name,
        address: localPvz.address || '',
        work_start: localPvz.workStart || '09:00',
        work_end: localPvz.workEnd || '21:00',
        working_hours: localPvz.workingHours || '09:00 - 21:00',
        phone: localPvz.phone || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) console.warn('ensurePvzSynced:', error.message);
    return localPvz.id;
  }

  const mapKey = `supabase_pvz_id_${localPvz.id}`;
  const existingMap = await SecureStore.getItemAsync(mapKey);
  if (existingMap) return existingMap;

  const { data: found } = await supabase
    .from('pvz')
    .select('id')
    .eq('owner_id', localPvz.ownerId)
    .eq('name', localPvz.name)
    .maybeSingle();

  if (found?.id) {
    await setPvzIdMapping(localPvz.id, found.id);
    return found.id;
  }

  const { data: inserted, error } = await supabase
    .from('pvz')
    .insert({
      owner_id: localPvz.ownerId,
      name: localPvz.name,
      address: localPvz.address || '',
      work_start: localPvz.workStart || '09:00',
      work_end: localPvz.workEnd || '21:00',
      working_hours: localPvz.workingHours || '09:00 - 21:00',
      phone: localPvz.phone || '',
    })
    .select('id')
    .single();

  if (error || !inserted?.id) {
    console.warn('ensurePvzSynced insert:', error?.message);
    return localPvz.id;
  }

  await setPvzIdMapping(localPvz.id, inserted.id);
  return inserted.id;
}
