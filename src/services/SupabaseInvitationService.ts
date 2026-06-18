import { supabase } from '../../lib/supabase';
import { fetchAllFromQuery } from '../../lib/supabasePagination';
import {
  isUuid,
  mergeById,
  normalizePhone,
  resolvePvzId,
  resolveUserId,
} from '../utils/supabaseHelpers';
import { INVITATION_COLUMNS } from './supabase/selectColumns';
import { ensureSupabaseClientSession } from './SupabaseAuthService';

export interface SyncInvitation {
  id: string;
  phone: string;
  name: string;
  role: 'employee' | 'admin';
  pvzId: string;
  pvzName?: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  invitedBy: string;
  invitedByName?: string;
}

function rowToInvitation(row: Record<string, unknown>): SyncInvitation {
  return {
    id: row.id as string,
    phone: normalizePhone(String(row.phone)),
    name: row.name as string,
    role: row.role as SyncInvitation['role'],
    pvzId: row.pvz_id as string,
    status: row.status as SyncInvitation['status'],
    createdAt: row.created_at as string,
    invitedBy: row.invited_by as string,
  };
}

async function invitationToRow(
  invitation: SyncInvitation
): Promise<Record<string, unknown> | null> {
  const pvzId = await resolvePvzId(invitation.pvzId);
  const invitedBy = await resolveUserId(invitation.invitedBy);
  if (!invitedBy || !isUuid(pvzId)) return null;

  const row: Record<string, unknown> = {
    pvz_id: pvzId,
    invited_by: invitedBy,
    phone: normalizePhone(invitation.phone),
    name: invitation.name,
    role: invitation.role,
    status: invitation.status,
  };

  if (invitation.id && isUuid(invitation.id)) {
    row.id = invitation.id;
  }

  return row;
}

export async function fetchInvitationsFromSupabase(): Promise<SyncInvitation[] | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const data = await fetchAllFromQuery<Record<string, unknown>>(() =>
    supabase.from('invitations').select(INVITATION_COLUMNS).order('created_at', { ascending: false })
  );

  if (!data) {
    console.warn('fetchInvitationsFromSupabase: paginated fetch failed');
    return null;
  }

  return data.map((row) => rowToInvitation(row));
}

export async function fetchInvitationByPhone(phone: string): Promise<SyncInvitation | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const cleanPhone = normalizePhone(phone);
  const { data, error } = await supabase
    .from('invitations')
    .select(INVITATION_COLUMNS)
    .eq('phone', cleanPhone)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('fetchInvitationByPhone:', error.message);
    return null;
  }

  return data ? rowToInvitation(data as Record<string, unknown>) : null;
}

export async function upsertInvitationToSupabase(
  invitation: SyncInvitation
): Promise<SyncInvitation | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const row = await invitationToRow(invitation);
  if (!row) return null;

  const { data, error } = await supabase
    .from('invitations')
    .upsert(row, { onConflict: 'id' })
    .select(INVITATION_COLUMNS)
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('invitations')
      .insert(row)
      .select(INVITATION_COLUMNS)
      .single();

    if (insertError) {
      console.warn('upsertInvitationToSupabase:', insertError.message);
      return null;
    }
    return rowToInvitation(inserted as Record<string, unknown>);
  }

  return data ? rowToInvitation(data as Record<string, unknown>) : null;
}

export async function updateInvitationStatusInSupabase(
  id: string,
  status: SyncInvitation['status']
): Promise<boolean> {
  if (!(await ensureSupabaseClientSession())) return false;

  if (isUuid(id)) {
    const { error } = await supabase.from('invitations').update({ status }).eq('id', id);
    if (error) {
      console.warn('updateInvitationStatusInSupabase:', error.message);
      return false;
    }
    return true;
  }

  return false;
}

export function mergeInvitations(
  local: SyncInvitation[],
  remote: SyncInvitation[]
): SyncInvitation[] {
  return mergeById(local, remote);
}
