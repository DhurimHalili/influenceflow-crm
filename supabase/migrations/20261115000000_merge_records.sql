-- Merging two copies of one influencer / brand moves EVERYTHING to the copy
-- you keep before the other row is deleted: Gmail history (email_events),
-- files and media kit, follow-ups, campaign links, meetings, activities,
-- invoices, contacts, leads. Without this, deleting the duplicate cascaded its
-- files away and left its emails pointing at a record that no longer exists.
--
-- Runs as the signed-in member only: both records must be theirs, and the
-- caller must be approved. Idempotent: running it twice moves nothing twice.

create or replace function public.merge_records(p_kind text, p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  moved_events int := 0;
begin
  if uid is null or not public.is_approved() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('creator', 'brand') or p_keep is null or p_remove is null or p_keep = p_remove then
    raise exception 'bad merge' using errcode = '22023';
  end if;
  if p_kind = 'creator' then
    if (select count(*) from public.creators where user_id = uid and id in (p_keep, p_remove)) <> 2 then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  else
    if (select count(*) from public.brands where user_id = uid and id in (p_keep, p_remove)) <> 2 then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  end if;

  -- Gmail history: one row per message per record, so a message both copies saw stays once.
  delete from public.email_events r
   where r.user_id = uid and r.entity_id = p_remove
     and exists (select 1 from public.email_events k where k.user_id = uid and k.entity_id = p_keep and k.gmail_id = r.gmail_id);
  update public.email_events set entity_id = p_keep where user_id = uid and entity_id = p_remove;
  get diagnostics moved_events = row_count;

  update public.activities set entity_id = p_keep where user_id = uid and entity_id = p_remove;
  update public.meetings set related_id = p_keep where user_id = uid and related_id = p_remove;
  update public.inbound_leads set entity_id = p_keep where user_id = uid and entity_id = p_remove;

  if p_kind = 'creator' then
    update public.followups set creator_id = p_keep where user_id = uid and creator_id = p_remove;
    update public.creator_files set creator_id = p_keep where user_id = uid and creator_id = p_remove;
    update public.external_links set creator_id = p_keep where user_id = uid and creator_id = p_remove;
    -- One media kit per creator: the kept one wins, else the duplicate's moves over.
    if not exists (select 1 from public.media_kits where user_id = uid and creator_id = p_keep) then
      update public.media_kits set creator_id = p_keep where user_id = uid and creator_id = p_remove;
    end if;
    delete from public.campaign_creators r
     where r.user_id = uid and r.creator_id = p_remove
       and exists (select 1 from public.campaign_creators k where k.campaign_id = r.campaign_id and k.creator_id = p_keep);
    update public.campaign_creators set creator_id = p_keep where user_id = uid and creator_id = p_remove;
  else
    update public.followups set brand_id = p_keep where user_id = uid and brand_id = p_remove;
    update public.brand_contacts set brand_id = p_keep where user_id = uid and brand_id = p_remove;
    update public.campaigns set brand_id = p_keep where user_id = uid and brand_id = p_remove;
    update public.invoices set brand_id = p_keep where user_id = uid and brand_id = p_remove;
    update public.external_links set brand_id = p_keep where user_id = uid and brand_id = p_remove;
  end if;

  return jsonb_build_object('emails', moved_events);
end;
$$;

revoke all on function public.merge_records(text, uuid, uuid) from public, anon;
grant execute on function public.merge_records(text, uuid, uuid) to authenticated;
