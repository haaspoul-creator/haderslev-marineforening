-- Haderslev Marineforening – databaseskema
-- Kør denne fil i Supabase: SQL Editor -> New query -> indsæt -> Run.
--
-- Roller:
--   admin     = redaktør: opretter/sletter arrangementer, vagter og nyheder, sletter alle beskeder, styrer medlemmer
--   medlem    = kan tilmelde sig vagter og skrive beskeder
--   laeser    = skrivebeskyttet: kan kun læse vagter og beskeder
--
-- Offentligt (uden login): arrangementer og nyheder.
-- Kræver login: vagter, tilmeldinger, beskeder, medlemsliste.

-------------------------------------------------------------------------------
-- Profiler (én pr. bruger, oprettes automatisk når en bruger inviteres)
-------------------------------------------------------------------------------
create type public.rolle as enum ('admin', 'medlem', 'laeser');

create table public.profiler (
  id         uuid primary key references auth.users (id) on delete cascade,
  navn       text not null default '' check (char_length(navn) <= 80),
  email      text,
  rolle      public.rolle not null default 'medlem',
  oprettet   timestamptz not null default now()
);

-- Hjælpefunktioner. "security definer" så de kan bruges i RLS uden rekursion.
create or replace function public.min_rolle()
returns public.rolle language sql stable security definer set search_path = public as $$
  select rolle from public.profiler where id = auth.uid()
$$;

create or replace function public.er_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rolle = 'admin' from public.profiler where id = auth.uid()), false)
$$;

create or replace function public.kan_skrive()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rolle in ('admin', 'medlem') from public.profiler where id = auth.uid()), false)
$$;

-- Ny bruger -> ny profil. Navn hentes fra invitationen, ellers fra e-mailen.
create or replace function public.ny_bruger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiler (id, navn, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'navn', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger ved_ny_bruger
  after insert on auth.users
  for each row execute function public.ny_bruger();

-- Almindelige brugere må kun ændre deres eget navn, ikke rolle eller e-mail.
create or replace function public.beskyt_profil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.er_admin() then
    new.rolle := old.rolle;
    new.email := old.email;
    new.id    := old.id;
  end if;
  return new;
end $$;

create trigger beskyt_profil
  before update on public.profiler
  for each row execute function public.beskyt_profil();

alter table public.profiler enable row level security;

create policy "logget ind kan se profiler" on public.profiler
  for select to authenticated using (true);
create policy "ret egen profil" on public.profiler
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admin retter profiler" on public.profiler
  for update to authenticated using (public.er_admin()) with check (true);

-------------------------------------------------------------------------------
-- Arrangementer (offentlige)
-------------------------------------------------------------------------------
create table public.arrangementer (
  id          bigint generated always as identity primary key,
  titel       text not null check (char_length(titel) between 1 and 120),
  dato        date not null,
  tid         time,
  sted        text not null default '' check (char_length(sted) <= 120),
  beskrivelse text not null default '' check (char_length(beskrivelse) <= 1000),
  oprettet    timestamptz not null default now()
);
create index on public.arrangementer (dato);

alter table public.arrangementer enable row level security;
create policy "alle kan se arrangementer" on public.arrangementer
  for select to anon, authenticated using (true);
create policy "admin opretter arrangementer" on public.arrangementer
  for insert to authenticated with check (public.er_admin());
create policy "admin retter arrangementer" on public.arrangementer
  for update to authenticated using (public.er_admin()) with check (public.er_admin());
create policy "admin sletter arrangementer" on public.arrangementer
  for delete to authenticated using (public.er_admin());

-------------------------------------------------------------------------------
-- Vagter og tilmeldinger (kun for logget ind)
-------------------------------------------------------------------------------
create table public.vagter (
  id        bigint generated always as identity primary key,
  titel     text not null check (char_length(titel) between 1 and 120),
  dato      date not null,
  tid       time,
  sted      text not null default '' check (char_length(sted) <= 120),
  pladser   int not null default 2 check (pladser between 1 and 50),
  oprettet  timestamptz not null default now()
);
create index on public.vagter (dato);

create table public.tilmeldinger (
  vagt_id   bigint not null references public.vagter (id) on delete cascade,
  bruger_id uuid not null references public.profiler (id) on delete cascade default auth.uid(),
  oprettet  timestamptz not null default now(),
  primary key (vagt_id, bruger_id)
);

-- Sørger for, at en vagt aldrig får flere tilmeldte end pladser,
-- også hvis to trykker på samme tid.
create or replace function public.tjek_pladser()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  maks int;
  antal int;
begin
  select pladser into maks from public.vagter where id = new.vagt_id for update;
  select count(*) into antal from public.tilmeldinger where vagt_id = new.vagt_id;
  if antal >= maks then
    raise exception 'Vagten er fuld' using errcode = 'P0001', hint = 'fuld';
  end if;
  return new;
end $$;

create trigger tjek_pladser
  before insert on public.tilmeldinger
  for each row execute function public.tjek_pladser();

alter table public.vagter enable row level security;
alter table public.tilmeldinger enable row level security;

create policy "logget ind kan se vagter" on public.vagter
  for select to authenticated using (true);
create policy "admin opretter vagter" on public.vagter
  for insert to authenticated with check (public.er_admin());
create policy "admin retter vagter" on public.vagter
  for update to authenticated using (public.er_admin()) with check (public.er_admin());
create policy "admin sletter vagter" on public.vagter
  for delete to authenticated using (public.er_admin());

create policy "logget ind kan se tilmeldinger" on public.tilmeldinger
  for select to authenticated using (true);
create policy "medlem tilmelder sig selv" on public.tilmeldinger
  for insert to authenticated
  with check (bruger_id = auth.uid() and public.kan_skrive()
              and exists (select 1 from public.vagter v where v.id = vagt_id and v.dato >= current_date));
create policy "afmeld sig selv, admin alle" on public.tilmeldinger
  for delete to authenticated using (bruger_id = auth.uid() or public.er_admin());

-------------------------------------------------------------------------------
-- Beskeder (kun for logget ind)
-------------------------------------------------------------------------------
create table public.beskeder (
  id        bigint generated always as identity primary key,
  -- Fjernes et medlem, bliver beskederne stående som "Tidligere medlem".
  bruger_id uuid references public.profiler (id) on delete set null default auth.uid(),
  tekst     text not null check (char_length(btrim(tekst)) between 1 and 1000),
  oprettet  timestamptz not null default now()
);
create index on public.beskeder (oprettet desc);

alter table public.beskeder enable row level security;
create policy "logget ind kan læse beskeder" on public.beskeder
  for select to authenticated using (true);
create policy "medlem skriver beskeder" on public.beskeder
  for insert to authenticated with check (bruger_id = auth.uid() and public.kan_skrive());
create policy "slet egne, admin alle" on public.beskeder
  for delete to authenticated using (bruger_id = auth.uid() or public.er_admin());

-------------------------------------------------------------------------------
-- Nyheder (offentlige) – fx "Ankerposten nr. 3/2026" med link til PDF
-------------------------------------------------------------------------------
create table public.nyheder (
  id        bigint generated always as identity primary key,
  titel     text not null check (char_length(titel) between 1 and 160),
  tekst     text not null default '' check (char_length(tekst) <= 5000),
  pdf_url   text check (pdf_url is null or pdf_url ~ '^(https://|/)'),
  dato      date not null default current_date,
  oprettet  timestamptz not null default now()
);
create index on public.nyheder (dato desc);

alter table public.nyheder enable row level security;
create policy "alle kan se nyheder" on public.nyheder
  for select to anon, authenticated using (true);
create policy "admin opretter nyheder" on public.nyheder
  for insert to authenticated with check (public.er_admin());
create policy "admin retter nyheder" on public.nyheder
  for update to authenticated using (public.er_admin()) with check (public.er_admin());
create policy "admin sletter nyheder" on public.nyheder
  for delete to authenticated using (public.er_admin());

-------------------------------------------------------------------------------
-- Rettigheder for API-rollerne
-------------------------------------------------------------------------------
revoke all on public.profiler, public.arrangementer, public.vagter, public.tilmeldinger,
              public.beskeder, public.nyheder from anon, authenticated;
grant select on public.arrangementer, public.nyheder to anon;
grant select, insert, update, delete on public.arrangementer, public.vagter, public.nyheder to authenticated;
grant select, insert, delete on public.tilmeldinger, public.beskeder to authenticated;
grant select, update (navn, rolle) on public.profiler to authenticated;
grant execute on function public.min_rolle(), public.er_admin(), public.kan_skrive() to authenticated;

-------------------------------------------------------------------------------
-- Fil-lager til PDF'er (Ankerposten, referater). Alle kan hente, admin kan uploade.
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumenter', 'dokumenter', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "admin uploader dokumenter" on storage.objects
  for insert to authenticated with check (bucket_id = 'dokumenter' and public.er_admin());
create policy "admin sletter dokumenter" on storage.objects
  for delete to authenticated using (bucket_id = 'dokumenter' and public.er_admin());

-- Realtid: beskeder og tilmeldinger opdateres live hos andre.
alter publication supabase_realtime add table public.beskeder, public.tilmeldinger, public.vagter;
