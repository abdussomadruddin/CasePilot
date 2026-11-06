-- Hand a browser endpoint to the signed-in user without letting anyone edit other rows.
drop policy if exists "push subscriptions update active device" on public.push_subscriptions;
create policy "push subscriptions update active device"
on public.push_subscriptions for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role := public.current_app_role();
begin
  if v_role is null then
    raise exception 'Active profile required.' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (user_id, role, endpoint, p256dh, auth, user_agent, active, last_seen_at, last_error)
  values (auth.uid(), v_role, p_endpoint, p_p256dh, p_auth, p_user_agent, true, now(), null)
  on conflict (endpoint) do update set
    user_id = excluded.user_id, role = excluded.role, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, active = true, last_seen_at = now(), last_error = null;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
