-- Run inside a transaction; test data and test admin token are always rolled back.
-- Uses only UUID records, never changes game state, scores or questions.
do $test$
declare a text := gen_random_uuid()::text; d jsonb; r jsonb; q uuid; t text;
begin
 insert into mdl.admin_sessions(token) values(a::uuid);
 if (public.community_submit_document('01','x','test','') ->> 'error') <> 'invalid_document' then raise exception 'invalid content accepted'; end if;
 if (public.community_submit_document('01','Test title','test','', 'javascript:alert(1)') ->> 'error') <> 'invalid_link' then raise exception 'unsafe URL accepted'; end if;
 d:=public.community_submit_document('01','Security test '||a,'test',repeat('test ',12));
 if d->>'status' <> 'pending' then raise exception 'not queued: %',d; end if;
 q:=(d->>'id')::uuid;
 if public.community_document(q)->>'error' <> 'not_found' then raise exception 'pending document leaked'; end if;
 if exists(select 1 from jsonb_array_elements(public.community_catalog()->'documents') e where e->>'id'=q::text) then raise exception 'pending catalog leak'; end if;
 r:=public.community_submit_document('01','Security test '||a,'other',repeat('test ',12));
 if r->>'id' <> q::text then raise exception 'retry not idempotent'; end if;
 begin
  perform public.admin_review_community_document('invalid',q,'approved');
  raise exception 'unauthorized reviewer accepted';
 exception when insufficient_privilege then null; end;
 if public.admin_review_community_document(a,q,'approved')->>'ok' <> 'true' then raise exception 'approval failed'; end if;
 if public.community_document(q)->>'id' <> q::text then raise exception 'approved document missing'; end if;
 if public.admin_review_community_document(a,q,'rejected')->>'error' <> 'not_pending' then raise exception 'stale review accepted'; end if;
 d:=public.community_submit_document('','New route test '||a,'test',repeat('test ',12),'','','Test route','Test place',31.8,35.1);
 q:=(d->>'id')::uuid; t:=d->>'tour_id';
 if exists(select 1 from jsonb_array_elements(public.community_catalog()->'routes') e where e->>'id'=t) then raise exception 'pending route leaked'; end if;
 perform public.admin_review_community_document(a,q,'rejected');
 if public.community_document(q)->>'error' <> 'not_found' then raise exception 'rejected document leaked'; end if;
 if exists(select 1 from mdl.tour_documents where id=q and reviewed_at is null) then raise exception 'missing review timestamp'; end if;
 if has_table_privilege('anon','mdl.tour_documents','SELECT,INSERT,UPDATE,DELETE') then raise exception 'direct table exposure'; end if;
end $test$;
