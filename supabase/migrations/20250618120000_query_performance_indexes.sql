-- Составные индексы для типичных фильтров приложения (pvz_id / employee_id + date / created_at).

create index if not exists payments_pvz_id_created_at_idx
  on public.payments (pvz_id, created_at desc);

create index if not exists payments_employee_id_created_at_idx
  on public.payments (employee_id, created_at desc);

create index if not exists penalties_pvz_id_date_idx
  on public.penalties (pvz_id, date desc);

create index if not exists penalties_employee_id_date_idx
  on public.penalties (employee_id, date desc);

create index if not exists shift_requests_pvz_id_created_at_idx
  on public.shift_requests (pvz_id, created_at desc);

create index if not exists shift_requests_employee_id_created_at_idx
  on public.shift_requests (employee_id, created_at desc);

create index if not exists advance_requests_pvz_id_created_at_idx
  on public.advance_requests (pvz_id, created_at desc);

create index if not exists advance_requests_employee_id_created_at_idx
  on public.advance_requests (employee_id, created_at desc);

create index if not exists invitations_pvz_id_status_idx
  on public.invitations (pvz_id, status);

create index if not exists invitations_phone_status_idx
  on public.invitations (phone, status);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists chat_messages_room_id_created_at_idx
  on public.chat_messages (room_id, created_at asc);

create index if not exists profiles_pvz_id_idx
  on public.profiles (pvz_id);
