-- Permanently deleting an influencer, brand or campaign is only possible for records already in the Archive
-- (trash). The app only ever deletes from there; everything else (duplicate merges, account deletion) runs as
-- the owner and is not affected. On 19 Nov 2026 a browser whose saved copy came back empty sent deletes for a
-- member's whole workspace and the cascades took follow-ups, files and Match data with them — with this rule
-- the database refuses such a delete for every active record, whatever a browser sends.
drop policy if exists delete_only_archived on public.creators;
create policy delete_only_archived on public.creators as restrictive for delete to authenticated using (archived_at is not null);
drop policy if exists delete_only_archived on public.brands;
create policy delete_only_archived on public.brands as restrictive for delete to authenticated using (archived_at is not null);
drop policy if exists delete_only_archived on public.campaigns;
create policy delete_only_archived on public.campaigns as restrictive for delete to authenticated using (archived_at is not null);
