/** Явные списки колонок для Supabase select (без select('*')). */

export const PVZ_COLUMNS =
  'id,owner_id,name,address,work_start,work_end,working_hours,phone,owner_inn,created_at';

export const PROFILE_COLUMNS =
  'id,name,phone,email,role,status,pvz_id,pvz_ids,permission_level,permissions,created_at';

export const PAYMENT_COLUMNS =
  'id,pvz_id,employee_id,amount,period_start,period_end,status,note,created_at';

export const PENALTY_COLUMNS =
  'id,pvz_id,employee_id,type,amount,reason,date,created_at';

export const INVITATION_COLUMNS =
  'id,pvz_id,invited_by,phone,name,role,status,created_at';

export const SHIFT_REQUEST_COLUMNS =
  'id,pvz_id,employee_id,employee_name,date,start_time,end_time,status,reason,created_at';

export const ADVANCE_REQUEST_COLUMNS =
  'id,pvz_id,employee_id,employee_name,amount,period_start,period_end,reason,status,created_at,reviewed_at,reviewed_by,reviewed_by_name';

export const NOTIFICATION_COLUMNS =
  'id,user_id,title,message,type,is_read,data,created_at';

export const CHAT_MESSAGE_COLUMNS = 'id,room_id,user_id,user_name,text,created_at';

export const SHIFT_COLUMNS =
  'id,employee_id,employee_name,date,start_time,end_time,status,payment_status,shift_type,total_hours,earnings,pvz_id';
