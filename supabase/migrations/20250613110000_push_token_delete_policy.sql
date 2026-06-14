-- Allow users to delete their own push token (invalid token cleanup)
drop policy if exists "user_push_tokens_delete_own" on public.user_push_tokens;

create policy "user_push_tokens_delete_own"
  on public.user_push_tokens for delete to authenticated
  using (user_id = auth.uid()::text);
