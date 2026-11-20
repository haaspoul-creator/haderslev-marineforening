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
  pdf_url  text,          -- link til en offentlig fil på siden (fx /dokumenter/...)
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
  null, '2026-07-01'
-- kun ved allerførste opsætning, så en slettet nyhed ikke dukker op igen
where not exists (select 1 from nyheder) and not exists (select 1 from brugere);

-- Forslag til indhold på hjemmesiden (fra medlemmer, behandles af administratorer)
create table if not exists forslag (
  id        bigint generated always as identity primary key,
  bruger_id bigint references brugere (id) on delete set null,
  side      text not null check (side in ('forside', 'omos', 'kalender', 'vagter', 'beskeder', 'galleri', 'andet')),
  tekst     text not null check (char_length(btrim(tekst)) between 1 and 2000),
  status    text not null default 'ny' check (status in ('ny', 'igang', 'udfoert', 'afvist')),
  svar      text not null default '' check (char_length(svar) <= 1000),
  oprettet  timestamptz not null default now(),
  opdateret timestamptz not null default now()
);
create index if not exists forslag_oprettet on forslag (oprettet desc);

-- Tilmelding til arrangementer (alle kan tilmelde sig med navn og antal)
alter table arrangementer add column if not exists tilmelding boolean not null default true;
alter table arrangementer add column if not exists max_antal int check (max_antal is null or max_antal between 1 and 1000);
create table if not exists arrangement_tilmeldinger (
  id             bigint generated always as identity primary key,
  arrangement_id bigint not null references arrangementer (id) on delete cascade,
  navn           text not null check (char_length(btrim(navn)) between 1 and 80),
  antal          int not null check (antal between 1 and 20),
  bruger_id      bigint references brugere (id) on delete set null,  -- hvis man var logget ind
  afmeld_hash    text not null,   -- hash af nøglen, som tilmelderens browser gemmer til afmelding
  kilde_hash     text not null,   -- hash af IP + dato, kun til værn mod masseindsendelser
  oprettet       timestamptz not null default now()
);
create index if not exists arr_tilm_arr on arrangement_tilmeldinger (arrangement_id);
create index if not exists arr_tilm_kilde on arrangement_tilmeldinger (kilde_hash, oprettet);

-- Billeder i galleriet, lagt ind af medlemmer. Offentlige først når en administrator har godkendt dem.
create table if not exists billeder (
  id        bigint generated always as identity primary key,
  bruger_id bigint references brugere (id) on delete set null,
  titel     text not null check (char_length(btrim(titel)) between 1 and 120),
  alt       text not null check (char_length(btrim(alt)) between 1 and 300),
  dato      date,
  godkendt  boolean not null default false,
  bredde    int not null check (bredde between 1 and 4000),
  hoejde    int not null check (hoejde between 1 and 4000),
  stor      bytea not null,
  lille     bytea not null,
  oprettet  timestamptz not null default now()
);
create index if not exists billeder_oprettet on billeder (oprettet desc);

-- Slopkisten: medlemmernes bestillinger (varerne ligger i api/_slopkisten.json)
create table if not exists slop_bestillinger (
  id          bigint generated always as identity primary key,
  bruger_id   bigint references brugere (id) on delete set null,
  navn        text not null,                 -- navn og e-mail gemmes, så bestillingen kan udskrives, også hvis kontoen slettes
  email       text not null,
  telefon     text not null default '' check (char_length(telefon) <= 30),
  bemaerkning text not null default '' check (char_length(bemaerkning) <= 1000),
  status      text not null default 'ny' check (status in ('ny', 'bestilt', 'klar', 'udleveret', 'annulleret')),
  oprettet    timestamptz not null default now(),
  opdateret   timestamptz not null default now()
);
create table if not exists slop_linjer (
  id            bigint generated always as identity primary key,
  bestilling_id bigint not null references slop_bestillinger (id) on delete cascade,
  vare_id       text not null,
  varenr        text not null default '',
  titel         text not null,
  variant       text not null default '',
  antal         int not null check (antal between 1 and 50)
);
create index if not exists slop_linjer_best on slop_linjer (bestilling_id);

-- Login-forsøg (til at bremse gætteri pr. afsender uden at låse kontoen for andre)
create table if not exists login_forsoeg (
  id         bigint generated always as identity primary key,
  kilde_hash text not null,
  email      text not null,
  tid        timestamptz not null default now()
);
create index if not exists login_forsoeg_kilde on login_forsoeg (kilde_hash, tid);

-- Ankerposten indeholder persondata og er fjernet fra den offentlige side.
update nyheder set pdf_url = null where pdf_url = '/dokumenter/ankerposten-2026-3.pdf';

-- Nyheder/PDF'er kan gøres "kun for medlemmer" (fx Ankerposten med fødselsdage og telefonnumre)
alter table nyheder add column if not exists kun_medlemmer boolean not null default false;

-- Login-links logger direkte ind. En session, der er startet fra et link, må vælge ny adgangskode
-- uden at kende den gamle i et kort stykke tid (til "glemt adgangskode").
alter table sessioner add column if not exists ny_kode_til timestamptz;

-- "Glemt adgangskode?": anmodninger, som bestyrelsen besvarer med et login-link
create table if not exists login_anmodninger (
  id        bigint generated always as identity primary key,
  bruger_id bigint not null references brugere (id) on delete cascade,
  oprettet  timestamptz not null default now(),
  besvaret  timestamptz
);
create index if not exists login_anmodninger_aaben on login_anmodninger (besvaret, oprettet desc);
