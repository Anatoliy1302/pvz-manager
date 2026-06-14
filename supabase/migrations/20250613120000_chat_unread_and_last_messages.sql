-- RPC: инкремент unread_count (обходит RLS chat_members для employee-отправителей)
create or replace function public.increment_chat_unread(
  p_room_id text,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pvz_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_target_user_id = auth.uid() then
    return;
  end if;

  select pvz_id into v_pvz_id from public.chat_rooms where id = p_room_id;
  if v_pvz_id is null then
    raise exception 'room not found';
  end if;

  if not (
    public.is_pvz_owner(v_pvz_id)
    or public.can_admin_access_pvz(v_pvz_id)
    or (public.my_role() = 'employee' and public.room_pvz_id(p_room_id) = public.my_pvz_id())
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.chat_members (room_id, user_id, unread_count)
  values (p_room_id, p_target_user_id, 0)
  on conflict (room_id, user_id) do nothing;

  update public.chat_members
  set unread_count = unread_count + 1
  where room_id = p_room_id and user_id = p_target_user_id;
end;
$$;

grant execute on function public.increment_chat_unread(text, uuid) to authenticated;

-- RPC: последнее сообщение по списку комнат (без N+1)
create or replace function public.get_chat_room_last_messages(p_room_ids text[])
returns table(
  room_id text,
  text text,
  user_id uuid,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.room_id)
    m.room_id,
    m.text,
    m.user_id,
    m.created_at
  from public.chat_messages m
  where m.room_id = any (p_room_ids)
  order by m.room_id, m.created_at desc;
$$;

grant execute on function public.get_chat_room_last_messages(text[]) to authenticated;
