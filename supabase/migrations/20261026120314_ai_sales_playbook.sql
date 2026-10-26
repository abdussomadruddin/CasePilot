-- Central versioned playbook; JSON entries are saved atomically as one revision.
create table public.ai_sales_playbook (
 id boolean primary key default true check(id), revision integer not null default 1 check(revision>0),
 rules text not null, stages jsonb not null check(jsonb_typeof(stages)='array'),
 knowledge jsonb not null default '[]' check(jsonb_typeof(knowledge)='array'),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null
);
create table public.ai_sales_stage_state (
 lead_id uuid not null references public.leads(id) on delete cascade,
 session_id text not null references public.ai_device_assignments(session_id) on delete cascade,
 stage_id text not null, previous_stage_id text not null default '',
 corrected boolean not null default false, conversation_hash text not null default '',
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null,
 primary key(lead_id,session_id)
);
alter table public.ai_sales_playbook enable row level security;
alter table public.ai_sales_stage_state enable row level security;
revoke all on public.ai_sales_playbook,public.ai_sales_stage_state from public,anon,authenticated;
grant all on public.ai_sales_playbook,public.ai_sales_stage_state to service_role;
alter table public.ai_follow_up_drafts add column playbook_revision integer not null default 0,
 add column stage_revision integer not null default 0, add column knowledge_expires_at timestamptz;
insert into public.ai_sales_playbook(id,rules,stages,knowledge) values(true,$seed$Gunakan Bahasa Melayu Malaysia semula jadi, ringkas dan sopan; campur English apabila sesuai dengan conversation. Panggil pelanggan “cik” secara default. Jangan mendesak.
Tanya satu soalan pada satu masa. Jawab soalan terus pelanggan sebelum qualification. Jangan tanya maklumat yang sudah dijawab dalam conversation. Kumpul hanya maklumat yang relevan; elakkan data sensitif yang tidak diperlukan.
Tentukan langkah seterusnya daripada pertukaran terakhir. Jangan mula INTRO semula apabila pelanggan membalas. Kekalkan konteks semasa bertukar fasa.
Jangan mereka harga, diskaun, stok, spesifikasi, angka pembiayaan, promosi atau tarikh akhir. Gunakan fakta perniagaan yang diluluskan dan masih sah sahaja. Bezakan anggaran daripada angka disahkan. Jangan janji kelulusan loan atau hasil terjamin.
Bantahan: akui kebimbangan, fahami puncanya, jelaskan secara relevan dan kembali ke fasa sebelumnya apabila selesai. Jangan terus tawarkan diskaun atau berdebat.
Closing mengikut kesediaan pelanggan. Booking, permohonan, quotation akhir dan semakan dokumen memerlukan pengesahan manusia. Hormati permintaan masa dan jangan hubungi. Jangan buat dakwaan berdasarkan gambar, PDF atau voice note yang belum dibaca.$seed$,$seed$[{"id":"INTRO","name":"INTRO","goal":"Akui enquiry dan fahami minat awal.","instructions":"Kenal pasti produk daripada conversation. Jawab soalan pelanggan dahulu. Elakkan presentation penuh terlalu awal.","transition":"Ke FACT_FINDING selepas minat awal difahami; jangan ulang INTRO bagi conversation sedia ada.","examples":"Cik berminat varian yang mana ya?","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"FACT_FINDING","name":"FACT FINDING","goal":"Fahami keperluan secara berperingkat.","instructions":"Tanya maklumat relevan seperti model, varian, tujuan, bajet, kerja, lokasi, trade-in, deposit, timeline dan kesediaan dokumen. Tidak perlu lengkap semua medan. Pendapatan hanya jika benar-benar perlu.","transition":"Ke PRESENTATION apabila maklumat cukup untuk cadangan relevan.","examples":"Cik lebih selesa bayaran bulanan sekitar berapa?","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"PRESENTATION","name":"PRESENTATION","goal":"Cadangkan pilihan yang relevan.","instructions":"Keperluan pelanggan → cadangan → manfaat relevan → fakta disahkan → langkah seterusnya. Gunakan Knowledge Base aktif sahaja untuk fakta produk.","transition":"Ke OBJECTION_HANDLING apabila ada bantahan; CLOSING apabila pelanggan bersedia.","examples":"Pilih manfaat yang berkait dengan keperluan pelanggan; jangan hantar senarai panjang.","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"OBJECTION_HANDLING","name":"OBJECTION HANDLING","goal":"Selesaikan kebimbangan sebenar.","instructions":"Akui, fahami bantahan, tanya penjelasan jika perlu, beri jawapan relevan dan semak sama ada selesai. Harga, ansuran, deposit, loan, kepercayaan, pesaing, masa, keluarga dan kesesuaian ialah kemungkinan bantahan.","transition":"Kembali ke fasa sebelumnya selepas bantahan selesai. Hormati pelanggan yang perlukan masa.","examples":"Faham cik. Yang cik risau lebih kepada deposit atau komitmen bulanan?","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"CLOSING","name":"CLOSING","goal":"Bantu pelanggan mengambil langkah yang mereka bersedia.","instructions":"Minat rendah: fahami keperluan. Sederhana: banding pilihan dan selesaikan kebimbangan. Tinggi: bantu quotation atau terangkan proses. Booking, permohonan dan angka akhir perlu pengesahan salesperson.","transition":"Ke WON hanya apabila pembelian jelas disahkan. Ke LOST apabila pelanggan jelas menolak. Jika belum selesai, follow-up pada langkah terakhir.","examples":"Jika pelanggan sudah setuju semakan loan, terangkan dokumen diluluskan yang diperlukan.","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"FOLLOW_UP","name":"FOLLOW UP","goal":"Sambung langkah terakhir tanpa mengulang mesej generik.","instructions":"FOLLOW_UP ialah tindakan pada fasa sebelumnya. Kekalkan konteks bantahan, quotation atau dokumen yang belum selesai. Rujuk mesej terakhir dan follow-up terdahulu; jangan tanya semula minat umum.","transition":"Apabila pelanggan membalas, sambung fasa jualan yang relevan. Tiada jadual atau penghantaran automatik.","examples":"Cik, dah sempat sediakan payslip 3 bulan terkini untuk semakan yang kita bincang hari tu?","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"WON","name":"WON","goal":"Pembelian sudah disahkan.","instructions":"Hentikan follow-up jualan. Serahkan urusan selepas jualan kepada salesperson.","transition":"Hanya pengguna berakses boleh membetulkan fasa jika tersalah.","examples":"","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true},{"id":"LOST","name":"LOST","goal":"Pelanggan jelas tidak meneruskan.","instructions":"Hentikan follow-up jualan. Jangan cuba memaksa pelanggan kembali.","transition":"Hanya pengguna berakses boleh membetulkan fasa jika tersalah. Opt-out tetap mengatasi pembetulan.","examples":"","prohibitions":"Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.","active":true}]$seed$::jsonb,'[]'::jsonb);

create function public.save_ai_sales_playbook(p_actor uuid,p_revision integer,p_rules text,p_stages jsonb,p_knowledge jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and active and role='admin') then raise exception 'Access denied'; end if;
 if p_revision is null or length(trim(p_rules))=0 or length(p_rules)>8000 or jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages) not between 1 and 20 or jsonb_typeof(p_knowledge)<>'array' or jsonb_array_length(p_knowledge)>60 then raise exception 'Playbook tidak sah'; end if;
 update public.ai_sales_playbook set rules=p_rules,stages=p_stages,knowledge=p_knowledge,revision=revision+1,updated_at=now(),updated_by=p_actor where id and revision=p_revision returning revision into n;
 if n is null then raise exception 'Versi playbook berubah. Muat semula dahulu.'; end if;
 return n;
end $$;
create function public.save_ai_sales_stage(p_actor uuid,p_lead uuid,p_session text,p_revision integer,p_book_revision integer,p_stage text,p_previous text,p_corrected boolean,p_hash text) returns integer
language plpgsql security invoker set search_path='' as $$
declare b public.ai_sales_playbook%rowtype; s public.ai_sales_stage_state%rowtype; r integer; member_role text;
begin
 select role into member_role from public.profiles where id=p_actor and active;
 if member_role is null or member_role not in ('admin','customer_service','broker') then raise exception 'Access denied'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_lead::text || ':' || p_session,0));
 perform 1 from public.leads where id=p_lead and deleted_at is null and status<>'rejected' and (member_role='admin' or owner_id=p_actor) for share;
 if not found then raise exception 'Lead tidak tersedia'; end if;
 perform 1 from public.ai_device_assignments where session_id=p_session and user_id=p_actor for share;
 if not found then raise exception 'Device tidak tersedia'; end if;
 select * into b from public.ai_sales_playbook where id for share;
 if b.revision is distinct from p_book_revision then raise exception 'Versi playbook berubah'; end if;
 if not exists(select 1 from jsonb_array_elements(b.stages) e where e->>'id'=p_stage and (e->>'active')::boolean) then raise exception 'Fasa tidak aktif'; end if;
 if p_previous<>'' and not exists(select 1 from jsonb_array_elements(b.stages) e where e->>'id'=p_previous and (e->>'active')::boolean and e->>'id' not in ('WON','LOST','FOLLOW_UP')) then raise exception 'Fasa sebelumnya tidak sah'; end if;
 -- Lock one state row; missing-row contention is handled by the PK and CAS upsert.
 insert into public.ai_sales_stage_state(lead_id,session_id,stage_id,previous_stage_id,corrected,conversation_hash,revision,updated_by)
 select p_lead,p_session,p_stage,p_previous,p_corrected,p_hash,1,p_actor where p_revision=0
 on conflict(lead_id,session_id) do nothing returning revision into r;
 if r is not null then return r; end if;
 update public.ai_sales_stage_state set stage_id=p_stage,previous_stage_id=p_previous,corrected=p_corrected,conversation_hash=p_hash,revision=revision+1,updated_at=now(),updated_by=p_actor
 where lead_id=p_lead and session_id=p_session and revision=p_revision returning revision into r;
 if r is null then raise exception 'Fasa berubah. Muat semula dahulu.'; end if;
 return r;
end $$;
revoke all on function public.save_ai_sales_playbook(uuid,integer,text,jsonb,jsonb),public.save_ai_sales_stage(uuid,uuid,text,integer,integer,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.save_ai_sales_playbook(uuid,integer,text,jsonb,jsonb),public.save_ai_sales_stage(uuid,uuid,text,integer,integer,text,text,boolean,text) to service_role;

-- Keep the existing contact/count transaction intact behind new version gates.
alter function public.open_ai_follow_up(uuid,uuid) rename to open_ai_follow_up_base;
revoke all on function public.open_ai_follow_up_base(uuid,uuid) from public,anon,authenticated;
create function public.open_ai_follow_up(p_draft_id uuid,p_ticket uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare d public.ai_follow_up_drafts%rowtype; b public.ai_sales_playbook%rowtype; s public.ai_sales_stage_state%rowtype;
begin
 select * into d from public.ai_follow_up_drafts where id=p_draft_id and user_id=auth.uid() and ticket=p_ticket;
 if not found then raise exception 'Draf tidak tersedia'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(d.lead_id::text || ':' || d.session_id,0));
 select * into b from public.ai_sales_playbook where id for share;
 if d.playbook_revision is distinct from b.revision then raise exception 'Playbook berubah. Jana semula.'; end if;
 if d.knowledge_expires_at is not null and d.knowledge_expires_at<=now() then raise exception 'Knowledge tamat tempoh. Jana semula.'; end if;
 select * into s from public.ai_sales_stage_state where lead_id=d.lead_id and session_id=d.session_id for share;
 if coalesce(s.revision,0)<>d.stage_revision or s.stage_id in ('WON','LOST') then raise exception 'Fasa berubah atau jualan tamat. Jana semula.'; end if;
 return public.open_ai_follow_up_base(p_draft_id,p_ticket);
end $$;
revoke all on function public.open_ai_follow_up(uuid,uuid) from public,anon;
grant execute on function public.open_ai_follow_up(uuid,uuid) to authenticated;
