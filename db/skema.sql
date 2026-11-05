-- Haderslev Marineforening – databaseskema (almindelig PostgreSQL 14+)
-- Køres automatisk af tools/opret-admin.mjs, eller manuelt: psql "$DATABASE_URL" -f db/skema.sql
-- Rettighederne (hvem må hvad) håndhæves i api/index.js.

create table if not exists brugere (
  id         bigint generated always as identity primary key,
  email      text not null unique check (email = lower(email)),
  navn       text not null check (char_length(navn) between 1 and 80),
  rolle      text not null default 'medlem' check (rolle in ('admin', 'medlem', 'laeser')),
  kode_hash  text,                         -- null indtil medlemmet har brugt sit link
  fejl_antal int not null default 0,       -- forkerte logins i træk (spærring mod gætteri)
  fejl_tid   timestamptz,
  oprettet   timestamptz not null default now()
);

-- Login-sessioner (cookie). Kun et hash af nøglen gemmes.
create table if not exists sessioner (
  token_hash text primary key,
  bruger_id  bigint not null references brugere (id) on delete cascade,
  udloeber   timestamptz not null
);

-- Personlige links til at vælge adgangskode (invitation eller glemt kode).
create table if not exists links (
  token_hash text primary key,
  bruger_id  bigint not null references brugere (id) on delete cascade,
  udloeber   timestamptz not null
);

create table if not exists arrangementer (
  id          bigint generated always as identity primary key,
  titel       text not null check (char_length(titel) between 1 and 120),
  dato        date not null,
  tid         time,
  sted        text not null default '' check (char_length(sted) <= 120),
  beskrivelse text not null default '' check (char_length(beskrivelse) <= 1000),
  oprettet    timestamptz not null default now()
);
create index if not exists arrangementer_dato on arrangementer (dato);

create table if not exists vagter (
  id       bigint generated always as identity primary key,
  titel    text not null check (char_length(titel) between 1 and 120),
  dato     date not null,
  tid      time,
  sted     text not null default '' check (char_length(sted) <= 120),
  pladser  int not null default 2 check (pladser between 1 and 50),
  oprettet timestamptz not null default now()
);
create index if not exists vagter_dato on vagter (dato);

create table if not exists tilmeldinger (
  vagt_id   bigint not null references vagter (id) on delete cascade,
  bruger_id bigint not null references brugere (id) on delete cascade,
  oprettet  timestamptz not null default now(),
  primary key (vagt_id, bruger_id)
);

create table if not exists beskeder (
  id        bigint generated always as identity primary key,
  bruger_id bigint references brugere (id) on delete set null,  -- fjernet medlem -> "Tidligere medlem"
  tekst     text not null check (char_length(btrim(tekst)) between 1 and 1000),
  oprettet  timestamptz not null default now()
);
create index if not exists beskeder_oprettet on beskeder (oprettet desc);

create table if not exists nyheder (
  id       bigint generated always as identity primary key,
  titel    text not null check (char_length(titel) between 1 and 160),
  tekst    text not null default '' check (char_length(tekst) <= 5000),
  pdf_url  text,          -- link til fil på siden, fx /dokumenter/ankerposten-2026-3.pdf
  pdf      bytea,         -- eller selve PDF'en, uploadet fra Administration
  pdf_navn text,
  dato     date not null default current_date,
  oprettet timestamptz not null default now()
);
create index if not exists nyheder_dato on nyheder (dato desc);

-- Startindhold (kun hvis der ikke er nogen nyheder endnu)
insert into nyheder (titel, tekst, pdf_url, dato)
select 'Ankerposten nr. 3/2026',
  'Marinestuen er åben for hyggeligt samvær alle normale lørdage kl. 10–13. Foreningen er flyttet til Kreditbanken og har fået sit eget MobilePay-nummer: 60 55 39 22. Kontingentet er stadig 550 kr. Der er kommet nye medlemmer – både fuldgyldige og passive – og fællesspisningen med grillet lammekølle i april fik rigtig god opbakning.',
  '/dokumenter/ankerposten-2026-3.pdf', '2026-07-01'
where not exists (select 1 from nyheder);
