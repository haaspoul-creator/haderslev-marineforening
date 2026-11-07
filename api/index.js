// Haderslev Marineforening – hele server-delen (API) i én fil.
// Kører som Vercel-funktion, eller lokalt/på egen server via tools/server.mjs.
// Kræver miljøvariablen DATABASE_URL (eller STORAGE_URL / POSTGRES_URL fra Neon) (en almindelig PostgreSQL-forbindelse).
import postgres from "postgres";
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const scrypt = promisify(_scrypt);
// Virker med det navn, Neon/Vercel giver forbindelsen, uanset hvilket præfiks der er valgt.
const DB_URL = process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.POSTGRES_URL;
const sql = postgres(DB_URL, {
  max: 3, idle_timeout: 20,
  ssl: /localhost|127\.0\.0\.1/.test(DB_URL || "") ? false : "require",
  prepare: !/-pooler\./.test(DB_URL || ""), // Neons pooler: ingen gemte forespørgsler
  connection: { TimeZone: "Europe/Copenhagen" }, // "i dag" og tidspunkter i dansk tid
});
const SKEMA = readFileSync(new URL("./_skema.sql", import.meta.url), "utf8");

const SESSION_DAGE = 60;
const LINK_DAGE = 14;
const COOKIE = "hmf_session";

// ---------- Hjælpere ----------
class Fejl extends Error { constructor(status, besked) { super(besked); this.status = status; } }
const hash = (t) => createHash("sha256").update(t).digest("hex");
const nyToken = () => randomBytes(32).toString("base64url");

async function hashKode(kode) {
  const salt = randomBytes(16);
  const key = await scrypt(kode, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
const DUMMY = "scrypt$" + "0".repeat(32) + "$" + "0".repeat(128);
async function tjekKode(kode, gemt) {
  if (!gemt) { await tjekKode(kode, DUMMY); return false; }
  const [, salt, key] = gemt.split("$");
  const ny = await scrypt(kode, Buffer.from(salt, "hex"), 64);
  return timingSafeEqual(ny, Buffer.from(key, "hex"));
}

function laesCookie(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
function saetCookie(res, token, maxAge) {
  const sikker = process.env.NODE_ENV === "development" ? "" : "; Secure";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${sikker}`);
}

async function laesBody(req) {
  if (req.body !== undefined && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body; // Vercel
  const dele = [];
  let str = 0;
  for await (const d of req) { str += d.length; if (str > 4_000_000) throw new Fejl(413, "Filen er for stor (højst ca. 3 MB)."); dele.push(d); }
  if (!dele.length) return {};
  try { return JSON.parse(Buffer.concat(dele).toString("utf8")); } catch { throw new Fejl(400, "Ugyldig forespørgsel."); }
}

const tekst = (v, maks, navn, kraevet = false) => {
  const s = String(v ?? "").trim();
  if (kraevet && !s) throw new Fejl(400, `Udfyld ${navn}.`);
  if (s.length > maks) throw new Fejl(400, `${navn} er for lang (højst ${maks} tegn).`);
  return s;
};
const dato = (v, navn = "dato") => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) throw new Fejl(400, `Udfyld ${navn}.`);
  const [y, m, d] = v.split("-").map(Number), t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d || y < 2000 || y > 2100) throw new Fejl(400, `Ugyldig ${navn}.`);
  return v;
};
const tid = (v) => (v ? (/^\d{2}:\d{2}$/.test(v) ? v : (() => { throw new Fejl(400, "Ugyldigt tidspunkt."); })()) : null);
const ROLLER = ["admin", "medlem", "laeser"];

async function hentBruger(req) {
  const token = laesCookie(req);
  if (!token) return null;
  const [b] = await sql`
    select b.id, b.email, b.navn, b.rolle from sessioner s join brugere b on b.id = s.bruger_id
    where s.token_hash = ${hash(token)} and s.udloeber > now()`;
  return b || null;
}
const kodeKrav = (kode) => {
  if (kode.length < 8) throw new Fejl(400, "Adgangskoden skal være mindst 8 tegn.");
  if (kode.length > 200) throw new Fejl(400, "Adgangskoden er for lang.");
  return kode;
};
const kraevLogin = (b) => { if (!b) throw new Fejl(401, "Du skal være logget ind."); return b; };
const kraevSkriv = (b) => { kraevLogin(b); if (b.rolle === "laeser") throw new Fejl(403, "Du har kun læseadgang."); return b; };
const kraevAdmin = (b) => { kraevLogin(b); if (b.rolle !== "admin") throw new Fejl(403, "Kun administratorer kan gøre dette."); return b; };

async function nytLink(brugerId) {
  const token = nyToken();
  await sql`delete from links where bruger_id = ${brugerId}`;
  await sql`insert into links (token_hash, bruger_id, udloeber) values (${hash(token)}, ${brugerId}, now() + ${LINK_DAGE + " days"}::interval)`;
  return token;
}

// ---------- Ruter ----------
const ruter = [];
const rute = (metode, moenster, fn) => ruter.push([metode, new RegExp("^/api" + moenster.replace(/:(\w+)/g, "(?<$1>\\d+)") + "/?$"), fn]);

// Første opsætning: opretter tabeller og første administrator.
// Kræver miljøvariablen OPSAETNING_KODE og virker kun, så længe der ikke findes en administrator.
rute("POST", "/opsaet", async ({ req, body }) => {
  const kode = process.env.OPSAETNING_KODE;
  const givet = String(req.headers["x-opsaetning"] || "");
  if (!kode || givet.length !== kode.length || !timingSafeEqual(Buffer.from(givet), Buffer.from(kode))) throw new Fejl(404, "Ukendt adresse.");
  await sql.unsafe(SKEMA);
  const [findes] = await sql`select 1 from brugere where rolle = 'admin' limit 1`;
  if (findes) throw new Fejl(409, "Der findes allerede en administrator.");
  const email = tekst(body.email, 200, "e-mail", true).toLowerCase();
  const [b] = await sql`insert into brugere (email, navn, rolle) values (${email}, ${tekst(body.navn, 80, "navn", true)}, 'admin') returning id`;
  return { token: await nytLink(b.id) };
});

// Login
rute("GET", "/mig", async ({ bruger }) => ({ bruger }));

rute("POST", "/log-ind", async ({ body, res }) => {
  const email = tekst(body.email, 200, "e-mail", true).toLowerCase();
  const [b] = await sql`select * from brugere where email = ${email}`;
  if (b && b.fejl_antal >= 5 && b.fejl_tid > new Date(Date.now() - 15 * 60e3))
    throw new Fejl(429, "For mange forkerte forsøg. Vent 15 minutter, og prøv igen.");
  const gyldig = await tjekKode(String(body.kode || ""), b ? b.kode_hash : null); // altid scrypt: ens svartid
  if (!b || !gyldig) {
    if (b) await sql`update brugere set fejl_antal = fejl_antal + 1, fejl_tid = now() where id = ${b.id}`;
    throw new Fejl(401, "Forkert e-mail eller adgangskode.");
  }
  await sql`update brugere set fejl_antal = 0 where id = ${b.id}`;
  const token = nyToken();
  await sql`insert into sessioner (token_hash, bruger_id, udloeber) values (${hash(token)}, ${b.id}, now() + ${SESSION_DAGE + " days"}::interval)`;
  await sql`delete from sessioner where udloeber < now()`;
  saetCookie(res, token, SESSION_DAGE * 86400);
  return { ok: true };
});

rute("POST", "/log-ud", async ({ req, res }) => {
  const token = laesCookie(req);
  if (token) await sql`delete from sessioner where token_hash = ${hash(token)}`;
  saetCookie(res, "", 0);
  return { ok: true };
});

// Personligt link: se hvem det tilhører, og vælg adgangskode
rute("POST", "/link", async ({ body }) => {
  const [l] = await sql`select b.navn, b.email from links l join brugere b on b.id = l.bruger_id
    where l.token_hash = ${hash(String(body.token || ""))} and l.udloeber > now()`;
  if (!l) throw new Fejl(404, "Linket virker ikke længere. Bed en administrator om et nyt.");
  return l;
});
rute("POST", "/aktiver", async ({ body, res }) => {
  const kode = kodeKrav(String(body.kode || ""));
  const [l] = await sql`delete from links where token_hash = ${hash(String(body.token || ""))} and udloeber > now() returning bruger_id`;
  if (!l) throw new Fejl(404, "Linket virker ikke længere. Bed en administrator om et nyt.");
  const navn = body.navn ? tekst(body.navn, 80, "navn", true) : null;
  await sql`update brugere set kode_hash = ${await hashKode(kode)}, fejl_antal = 0, navn = coalesce(${navn}, navn) where id = ${l.bruger_id}`;
  await sql`delete from sessioner where bruger_id = ${l.bruger_id}`;
  const token = nyToken();
  await sql`insert into sessioner (token_hash, bruger_id, udloeber) values (${hash(token)}, ${l.bruger_id}, now() + ${SESSION_DAGE + " days"}::interval)`;
  saetCookie(res, token, SESSION_DAGE * 86400);
  return { ok: true };
});

// Min profil
rute("PATCH", "/mig", async ({ bruger, body }) => {
  kraevLogin(bruger);
  const navn = tekst(body.navn, 80, "navn", true);
  await sql`update brugere set navn = ${navn} where id = ${bruger.id}`;
  return { ok: true };
});
rute("POST", "/mig/kode", async ({ req, bruger, body }) => {
  kraevLogin(bruger);
  const kode = kodeKrav(String(body.kode || ""));
  await sql`update brugere set kode_hash = ${await hashKode(kode)} where id = ${bruger.id}`;
  await sql`delete from sessioner where bruger_id = ${bruger.id} and token_hash <> ${hash(laesCookie(req))}`; // log andre enheder ud
  return { ok: true };
});

// Arrangementer (offentlige)
const ja = (v) => v === true || v === "on" || v === "1" || v === "true";
const maksTal = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Fejl(400, "Maks. antal skal være et helt tal mellem 1 og 1000 (eller tomt).");
  return n;
};
rute("GET", "/arrangementer", async ({ bruger }) => sql`
  select a.id, a.titel, a.dato::text, to_char(a.tid, 'HH24:MI') tid, a.sted, a.beskrivelse, a.tilmelding, a.max_antal,
    coalesce(sum(t.antal), 0)::int tilmeldt, count(t.id)::int tilmeldinger,
    coalesce(json_agg(json_build_object('id', t.id, 'navn', t.navn, 'antal', t.antal))
      filter (where ${bruger ? bruger.id : null}::bigint is not null and t.bruger_id = ${bruger ? bruger.id : null}::bigint), '[]') mine
  from arrangementer a left join arrangement_tilmeldinger t on t.arrangement_id = a.id
  where a.dato >= current_date group by a.id order by a.dato, a.tid nulls first`);
rute("POST", "/arrangementer", async ({ bruger, body }) => {
  kraevAdmin(bruger);
  const [a] = await sql`insert into arrangementer (titel, dato, tid, sted, beskrivelse, tilmelding, max_antal) values (
    ${tekst(body.titel, 120, "titel", true)}, ${dato(body.dato)}, ${tid(body.tid)}, ${tekst(body.sted, 120, "sted")}, ${tekst(body.beskrivelse, 1000, "beskrivelse")},
    ${ja(body.tilmelding)}, ${maksTal(body.max_antal)})
    returning id`;
  return a;
});
rute("PATCH", "/arrangementer/:id", async ({ bruger, body, p }) => {
  kraevAdmin(bruger);
  const maks = maksTal(body.max_antal);
  if (maks) {
    const [{ sum }] = await sql`select coalesce(sum(antal), 0)::int sum from arrangement_tilmeldinger where arrangement_id = ${p.id}`;
    if (maks < sum) throw new Fejl(400, `Der er allerede ${sum} tilmeldt. Maks. antal skal være mindst ${sum}.`);
  }
  const r = await sql`update arrangementer set titel = ${tekst(body.titel, 120, "titel", true)}, dato = ${dato(body.dato)}, tid = ${tid(body.tid)},
    sted = ${tekst(body.sted, 120, "sted")}, beskrivelse = ${tekst(body.beskrivelse, 1000, "beskrivelse")},
    tilmelding = ${ja(body.tilmelding)}, max_antal = ${maks} where id = ${p.id}`;
  if (!r.count) throw new Fejl(404, "Arrangementet findes ikke længere.");
  return { ok: true };
});

// Tilmelding til arrangementer – åben for alle, også uden login.
const kilde = (req) => hash(String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim() + "|" + new Date().toISOString().slice(0, 10));
rute("POST", "/arrangementer/:id/tilmeld", async ({ req, bruger, body, p }) => {
  if (body.hjemmeside) throw new Fejl(400, "Tilmeldingen blev afvist."); // skjult felt – udfyldes kun af robotter
  const navn = tekst(body.navn, 80, "dit navn", true);
  const antal = Number(body.antal);
  if (!Number.isInteger(antal) || antal < 1 || antal > 20) throw new Fejl(400, "Antal personer skal være mellem 1 og 20.");
  const k = kilde(req);
  const [{ seneste }] = await sql`select count(*)::int seneste from arrangement_tilmeldinger where kilde_hash = ${k} and oprettet > now() - interval '1 hour'`;
  if (seneste >= 15) throw new Fejl(429, "Der er kommet mange tilmeldinger herfra. Prøv igen om lidt, eller kontakt bestyrelsen.");
  const token = nyToken();
  const ny = await sql.begin(async (tx) => {
    const [a] = await tx`select titel, tilmelding, max_antal, dato >= current_date aktuel from arrangementer where id = ${p.id} for update`;
    if (!a) throw new Fejl(404, "Arrangementet findes ikke længere.");
    if (!a.aktuel) throw new Fejl(400, "Arrangementet er overstået.");
    if (!a.tilmelding) throw new Fejl(400, "Der er ikke tilmelding til dette arrangement.");
    const [{ sum, antalT }] = await tx`select coalesce(sum(antal), 0)::int sum, count(*)::int "antalT" from arrangement_tilmeldinger where arrangement_id = ${p.id}`;
    if (antalT >= 500) throw new Fejl(409, "Der kan ikke komme flere tilmeldinger. Kontakt bestyrelsen.");
    if (a.max_antal && sum + antal > a.max_antal) {
      const ledige = a.max_antal - sum;
      throw new Fejl(409, ledige > 0 ? `Der er kun ${ledige} ${ledige === 1 ? "plads" : "pladser"} tilbage.` : "Arrangementet er desværre fuldt booket.");
    }
    const [t] = await tx`insert into arrangement_tilmeldinger (arrangement_id, navn, antal, bruger_id, afmeld_hash, kilde_hash)
      values (${p.id}, ${navn}, ${antal}, ${bruger ? bruger.id : null}, ${hash(token)}, ${k}) returning id`;
    return t;
  });
  return { id: ny.id, token };
});
rute("DELETE", "/arrangementer/:id/tilmeldinger/:tid", async ({ bruger, body, p }) => {
  const token = String(body.token || "");
  const r = await sql`delete from arrangement_tilmeldinger where id = ${p.tid} and arrangement_id = ${p.id} and (
    ${bruger?.rolle === "admin"} or (${bruger ? bruger.id : null}::bigint is not null and bruger_id = ${bruger ? bruger.id : null}::bigint)
    or (${token} <> '' and afmeld_hash = ${hash(token)}))`;
  if (!r.count) throw new Fejl(403, "Tilmeldingen kunne ikke findes, eller du kan ikke afmelde den.");
  return { ok: true };
});
rute("GET", "/arrangementer/:id/tilmeldinger", async ({ bruger, p }) => {
  kraevAdmin(bruger);
  return sql`select id, navn, antal, oprettet, bruger_id is not null medlem from arrangement_tilmeldinger
    where arrangement_id = ${p.id} order by oprettet`;
});
rute("DELETE", "/arrangementer/:id", async ({ bruger, p }) => { kraevAdmin(bruger); await sql`delete from arrangementer where id = ${p.id}`; return { ok: true }; });

// Vagter (kun logget ind)
rute("GET", "/vagter", async ({ bruger }) => {
  kraevLogin(bruger);
  return sql`
    select v.id, v.titel, v.dato::text, to_char(v.tid, 'HH24:MI') tid, v.sted, v.pladser,
      coalesce(json_agg(json_build_object('bruger_id', t.bruger_id, 'navn', b.navn) order by t.oprettet)
               filter (where t.bruger_id is not null), '[]') tilmeldte
    from vagter v left join tilmeldinger t on t.vagt_id = v.id left join brugere b on b.id = t.bruger_id
    where v.dato >= current_date group by v.id order by v.dato, v.tid nulls first`;
});
rute("POST", "/vagter", async ({ bruger, body }) => {
  kraevAdmin(bruger);
  const pladser = pladsTal(body.pladser);
  const [v] = await sql`insert into vagter (titel, dato, tid, sted, pladser) values (
    ${tekst(body.titel, 120, "vagt", true)}, ${dato(body.dato)}, ${tid(body.tid)}, ${tekst(body.sted, 120, "sted")}, ${pladser}) returning id`;
  return v;
});
const pladsTal = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Fejl(400, "Antal pladser skal være mellem 1 og 50.");
  return n;
};
rute("PATCH", "/vagter/:id", async ({ bruger, body, p }) => {
  kraevAdmin(bruger);
  const pladser = pladsTal(body.pladser);
  const [{ antal }] = await sql`select count(*)::int antal from tilmeldinger where vagt_id = ${p.id}`;
  if (pladser < antal) throw new Fejl(400, `Der er allerede ${antal} tilmeldt. Fjern nogen først, eller vælg mindst ${antal} pladser.`);
  const r = await sql`update vagter set titel = ${tekst(body.titel, 120, "vagt", true)}, dato = ${dato(body.dato)}, tid = ${tid(body.tid)},
    sted = ${tekst(body.sted, 120, "sted")}, pladser = ${pladser} where id = ${p.id}`;
  if (!r.count) throw new Fejl(404, "Vagten findes ikke længere.");
  return { ok: true };
});
rute("DELETE", "/vagter/:id/tilmeldte/:bid", async ({ bruger, p }) => {
  kraevAdmin(bruger);
  await sql`delete from tilmeldinger where vagt_id = ${p.id} and bruger_id = ${p.bid}`;
  return { ok: true };
});
rute("DELETE", "/vagter/:id", async ({ bruger, p }) => { kraevAdmin(bruger); await sql`delete from vagter where id = ${p.id}`; return { ok: true }; });
rute("POST", "/vagter/:id/tilmeld", async ({ bruger, p }) => {
  kraevSkriv(bruger);
  await sql.begin(async (tx) => {
    // Lås vagten, så to der trykker samtidig ikke kan overbooke den.
    const [v] = await tx`select pladser, dato >= current_date aktuel from vagter where id = ${p.id} for update`;
    if (!v) throw new Fejl(404, "Vagten findes ikke længere.");
    if (!v.aktuel) throw new Fejl(400, "Vagten er overstået.");
    const [{ antal }] = await tx`select count(*)::int antal from tilmeldinger where vagt_id = ${p.id}`;
    if (antal >= v.pladser) throw new Fejl(409, "Vagten er desværre blevet fuld.");
    await tx`insert into tilmeldinger (vagt_id, bruger_id) values (${p.id}, ${bruger.id}) on conflict do nothing`;
  });
  return { ok: true };
});
rute("DELETE", "/vagter/:id/tilmeld", async ({ bruger, p }) => {
  kraevSkriv(bruger);
  await sql`delete from tilmeldinger where vagt_id = ${p.id} and bruger_id = ${bruger.id}`;
  return { ok: true };
});

// Beskeder (kun logget ind)
rute("GET", "/beskeder", async ({ bruger }) => {
  kraevLogin(bruger);
  return sql`select m.id, m.tekst, m.oprettet, m.bruger_id, b.navn from beskeder m left join brugere b on b.id = m.bruger_id
    order by m.oprettet desc limit 100`;
});
rute("POST", "/beskeder", async ({ bruger, body }) => {
  kraevSkriv(bruger);
  const t = tekst(body.tekst, 1000, "beskeden", true);
  const [{ antal }] = await sql`select count(*)::int antal from beskeder where bruger_id = ${bruger.id} and oprettet > now() - interval '1 hour'`;
  if (antal >= 30) throw new Fejl(429, "Du har skrevet mange beskeder den sidste time. Vent lidt, og prøv igen.");
  await sql`insert into beskeder (bruger_id, tekst) values (${bruger.id}, ${t})`;
  return { ok: true };
});
rute("DELETE", "/beskeder/:id", async ({ bruger, p }) => {
  kraevLogin(bruger);
  const r = bruger.rolle === "admin"
    ? await sql`delete from beskeder where id = ${p.id}`
    : await sql`delete from beskeder where id = ${p.id} and bruger_id = ${bruger.id}`;
  if (!r.count) throw new Fejl(403, "Du kan kun slette dine egne beskeder.");
  return { ok: true };
});

// Nyheder (offentlige)
rute("GET", "/nyheder", async () => sql`
  select id, titel, tekst, dato::text, case when pdf is not null then '/api/nyheder/' || id || '/pdf' else pdf_url end pdf_url
  from nyheder order by dato desc, id desc limit 20`);
rute("GET", "/nyheder/:id/pdf", async ({ p, res }) => {
  const [n] = await sql`select pdf, pdf_navn from nyheder where id = ${p.id} and pdf is not null`;
  if (!n) throw new Fejl(404, "Filen findes ikke.");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${(n.pdf_navn || "dokument.pdf").replace(/[^\w.-]/g, "_")}"`);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Security-Policy", "sandbox"); // indhold i PDF'en kan ikke køre som en del af siden
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(n.pdf);
  return undefined;
});
rute("POST", "/nyheder", async ({ bruger, body }) => {
  kraevAdmin(bruger);
  let pdf = null;
  if (body.pdf) {
    pdf = Buffer.from(String(body.pdf), "base64");
    if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Fejl(400, "Filen skal være en PDF.");
    if (pdf.length > 3.2 * 1024 * 1024) throw new Fejl(413, "PDF'en er for stor. Den må højst fylde 3 MB.");
  }
  await sql`insert into nyheder (titel, tekst, dato, pdf, pdf_navn) values (
    ${tekst(body.titel, 160, "overskrift", true)}, ${tekst(body.tekst, 5000, "tekst")}, ${dato(body.dato)}, ${pdf}, ${pdf ? tekst(body.pdf_navn, 120, "filnavn") : null})`;
  return { ok: true };
});
rute("DELETE", "/nyheder/:id", async ({ bruger, p }) => { kraevAdmin(bruger); await sql`delete from nyheder where id = ${p.id}`; return { ok: true }; });

// Medlemmer (kun administratorer)
rute("GET", "/medlemmer", async ({ bruger }) => {
  kraevAdmin(bruger);
  return sql`select id, navn, email, rolle, kode_hash is not null aktiv from brugere order by navn`;
});
rute("POST", "/medlemmer", async ({ bruger, body }) => {
  kraevAdmin(bruger);
  const email = tekst(body.email, 200, "e-mail", true).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fejl(400, "Skriv en gyldig e-mail.");
  const rolle = ROLLER.includes(body.rolle) ? body.rolle : "medlem";
  const [b] = await sql`insert into brugere (email, navn, rolle) values (${email}, ${tekst(body.navn, 80, "navn", true)}, ${rolle})
    on conflict (email) do nothing returning id`;
  if (!b) throw new Fejl(409, "Der findes allerede et medlem med den e-mail.");
  return { token: await nytLink(b.id) };
});
rute("PATCH", "/medlemmer/:id", async ({ bruger, body, p }) => {
  kraevAdmin(bruger);
  if (String(p.id) === String(bruger.id)) throw new Fejl(400, "Du kan ikke ændre din egen rolle.");
  if (!ROLLER.includes(body.rolle)) throw new Fejl(400, "Ukendt rolle.");
  await sql`update brugere set rolle = ${body.rolle} where id = ${p.id}`;
  return { ok: true };
});
rute("POST", "/medlemmer/:id/link", async ({ bruger, p }) => {
  kraevAdmin(bruger);
  const [b] = await sql`select id from brugere where id = ${p.id}`;
  if (!b) throw new Fejl(404, "Medlemmet findes ikke.");
  return { token: await nytLink(b.id) };
});
rute("DELETE", "/medlemmer/:id", async ({ bruger, p }) => {
  kraevAdmin(bruger);
  if (String(p.id) === String(bruger.id)) throw new Fejl(400, "Du kan ikke fjerne dig selv.");
  await sql`delete from brugere where id = ${p.id}`;
  return { ok: true };
});

// Forslag til indhold (logget ind). Medlemmer ser deres egne, administratorer ser alle.
const SIDER = ["forside", "omos", "kalender", "vagter", "beskeder", "galleri", "andet"];
const STATUS = ["ny", "igang", "udfoert", "afvist"];
rute("GET", "/forslag", async ({ bruger }) => {
  kraevLogin(bruger);
  const alle = bruger.rolle === "admin";
  return sql`select f.id, f.side, f.tekst, f.status, f.svar, f.oprettet, f.opdateret, f.bruger_id, b.navn
    from forslag f left join brugere b on b.id = f.bruger_id
    where ${alle} or f.bruger_id = ${bruger.id}
    order by (f.status in ('ny', 'igang')) desc, f.oprettet desc limit 200`;
});
rute("POST", "/forslag", async ({ bruger, body }) => {
  kraevLogin(bruger);
  if (!SIDER.includes(body.side)) throw new Fejl(400, "Vælg hvilken side forslaget handler om.");
  const t = tekst(body.tekst, 2000, "forslaget", true);
  const [{ antal }] = await sql`select count(*)::int antal from forslag where bruger_id = ${bruger.id} and oprettet > now() - interval '1 day'`;
  if (antal >= 20) throw new Fejl(429, "Du har sendt mange forslag i dag. Prøv igen i morgen.");
  await sql`insert into forslag (bruger_id, side, tekst) values (${bruger.id}, ${body.side}, ${t})`;
  return { ok: true };
});
rute("PATCH", "/forslag/:id", async ({ bruger, body, p }) => {
  kraevAdmin(bruger);
  if (!STATUS.includes(body.status)) throw new Fejl(400, "Ukendt status.");
  const r = await sql`update forslag set status = ${body.status}, svar = ${tekst(body.svar, 1000, "svaret")}, opdateret = now() where id = ${p.id}`;
  if (!r.count) throw new Fejl(404, "Forslaget findes ikke.");
  return { ok: true };
});
rute("DELETE", "/forslag/:id", async ({ bruger, p }) => {
  kraevLogin(bruger);
  // Man kan trække sit eget forslag tilbage, så længe det ikke er behandlet. Administratorer kan slette alle.
  const r = bruger.rolle === "admin"
    ? await sql`delete from forslag where id = ${p.id}`
    : await sql`delete from forslag where id = ${p.id} and bruger_id = ${bruger.id} and status = 'ny'`;
  if (!r.count) throw new Fejl(403, "Du kan kun trække dine egne, ubehandlede forslag tilbage.");
  return { ok: true };
});

// Billeder i galleriet. Billederne gøres mindre i browseren (JPEG, uden metadata) før upload.
const erJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
rute("GET", "/billeder", async ({ bruger }) => sql`
  select b.id, b.titel, b.alt, b.dato::text, b.godkendt, b.bredde, b.hoejde, b.oprettet, b.bruger_id, u.navn
  from billeder b left join brugere u on u.id = b.bruger_id
  where b.godkendt or ${bruger?.rolle === "admin"} or (${bruger ? bruger.id : null}::bigint is not null and b.bruger_id = ${bruger ? bruger.id : null}::bigint)
  order by coalesce(b.dato, b.oprettet::date) desc, b.id desc limit 300`);
rute("POST", "/billeder", async ({ bruger, body }) => {
  kraevSkriv(bruger);
  const titel = tekst(body.titel, 120, "billedteksten", true);
  const alt = tekst(body.alt, 300, "beskrivelsen af billedet", true);
  const d = body.dato ? dato(body.dato) : null;
  const stor = Buffer.from(String(body.stor || ""), "base64"), lille = Buffer.from(String(body.lille || ""), "base64");
  if (!erJpeg(stor) || !erJpeg(lille)) throw new Fejl(400, "Billedet kunne ikke læses. Prøv et andet billede.");
  if (stor.length > 2.5 * 1024 * 1024 || lille.length > 400 * 1024) throw new Fejl(413, "Billedet er for stort.");
  const w = Number(body.bredde), hh = Number(body.hoejde);
  if (!Number.isInteger(w) || !Number.isInteger(hh) || w < 1 || hh < 1 || w > 4000 || hh > 4000) throw new Fejl(400, "Ugyldige billedmål.");
  const [{ antal }] = await sql`select count(*)::int antal from billeder where bruger_id = ${bruger.id} and oprettet > now() - interval '1 day'`;
  if (antal >= 40) throw new Fejl(429, "Du har lagt mange billeder ind i dag. Prøv igen i morgen.");
  const [b] = await sql`insert into billeder (bruger_id, titel, alt, dato, godkendt, bredde, hoejde, stor, lille)
    values (${bruger.id}, ${titel}, ${alt}, ${d}, ${bruger.rolle === "admin"}, ${w}, ${hh}, ${stor}, ${lille}) returning id, godkendt`;
  return b;
});
rute("PATCH", "/billeder/:id", async ({ bruger, body, p }) => {
  kraevAdmin(bruger);
  const r = await sql`update billeder set godkendt = ${!!body.godkendt},
    titel = coalesce(${body.titel === undefined ? null : tekst(body.titel, 120, "billedteksten", true)}, titel),
    alt = coalesce(${body.alt === undefined ? null : tekst(body.alt, 300, "beskrivelsen", true)}, alt) where id = ${p.id}`;
  if (!r.count) throw new Fejl(404, "Billedet findes ikke længere.");
  return { ok: true };
});
rute("DELETE", "/billeder/:id", async ({ bruger, p }) => {
  kraevLogin(bruger);
  const r = bruger.rolle === "admin"
    ? await sql`delete from billeder where id = ${p.id}`
    : await sql`delete from billeder where id = ${p.id} and bruger_id = ${bruger.id}`;
  if (!r.count) throw new Fejl(403, "Du kan kun slette dine egne billeder.");
  return { ok: true };
});
for (const str of ["stor", "lille"]) {
  rute("GET", `/billeder/:id/${str}`, async ({ bruger, p, res }) => {
    const [b] = str === "stor"
      ? await sql`select stor data, godkendt, bruger_id from billeder where id = ${p.id}`
      : await sql`select lille data, godkendt, bruger_id from billeder where id = ${p.id}`;
    const maa = b && (b.godkendt || bruger?.rolle === "admin" || (bruger && String(b.bruger_id) === String(bruger.id)));
    if (!maa) throw new Fejl(404, "Billedet findes ikke.");
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", b.godkendt ? "public, max-age=86400" : "private, no-store");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(b.data);
    return undefined;
  });
}

// Slopkisten: varekatalog (fra marineforeningen.dk) og medlemmernes bestillinger.
const SLOP = JSON.parse(readFileSync(new URL("./_slopkisten.json", import.meta.url), "utf8"));
const SLOP_VARER = new Map(SLOP.varer.map((v) => [v.id, v]));
const SLOP_STATUS = ["ny", "bestilt", "klar", "udleveret", "annulleret"];
rute("GET", "/slopkisten", async () => SLOP);
const hentBestillinger = (hvor) => sql`
  select b.id, b.bruger_id, b.navn, b.email, b.telefon, b.bemaerkning, b.status, b.oprettet, b.opdateret,
    coalesce((select json_agg(json_build_object('varenr', l.varenr, 'titel', l.titel, 'variant', l.variant, 'antal', l.antal) order by l.id)
      from slop_linjer l where l.bestilling_id = b.id), '[]') linjer
  from slop_bestillinger b where ${hvor} order by b.oprettet desc limit 300`;
rute("GET", "/slopkisten/bestillinger", async ({ bruger }) => {
  kraevLogin(bruger);
  return bruger.rolle === "admin" ? hentBestillinger(sql`true`) : hentBestillinger(sql`b.bruger_id = ${bruger.id}`);
});
rute("POST", "/slopkisten/bestil", async ({ bruger, body }) => {
  kraevSkriv(bruger);
  const linjer = Array.isArray(body.linjer) ? body.linjer : [];
  if (!linjer.length) throw new Fejl(400, "Kurven er tom.");
  if (linjer.length > 30) throw new Fejl(400, "Højst 30 forskellige varer pr. bestilling.");
  const rene = linjer.map((l) => {
    const v = SLOP_VARER.get(String(l.vare));
    const variant = v && v.varianter[Number(l.variant)];
    const antal = Number(l.antal);
    if (!v || !variant) throw new Fejl(400, "En af varerne findes ikke længere. Opdater siden, og prøv igen.");
    if (!Number.isInteger(antal) || antal < 1 || antal > 50) throw new Fejl(400, "Antal skal være mellem 1 og 50.");
    return { vare_id: v.id, varenr: variant.varenr, titel: v.titel, variant: variant.tekst, antal };
  });
  const telefon = tekst(body.telefon, 30, "telefonnummeret");
  const bemaerkning = tekst(body.bemaerkning, 1000, "bemærkningen");
  const [{ antal }] = await sql`select count(*)::int antal from slop_bestillinger where bruger_id = ${bruger.id} and oprettet > now() - interval '1 day'`;
  if (antal >= 10) throw new Fejl(429, "Du har sendt mange bestillinger i dag. Kontakt slopbestyreren.");
  const id = await sql.begin(async (tx) => {
    const [b] = await tx`insert into slop_bestillinger (bruger_id, navn, email, telefon, bemaerkning)
      values (${bruger.id}, ${bruger.navn}, ${bruger.email}, ${telefon}, ${bemaerkning}) returning id`;
    for (const l of rene) await tx`insert into slop_linjer (bestilling_id, vare_id, varenr, titel, variant, antal)
      values (${b.id}, ${l.vare_id}, ${l.varenr}, ${l.titel}, ${l.variant}, ${l.antal})`;
    return b.id;
  });
  return { id };
});
rute("PATCH", "/slopkisten/bestillinger/:id", async ({ bruger, body, p }) => {
  kraevLogin(bruger);
  if (!SLOP_STATUS.includes(body.status)) throw new Fejl(400, "Ukendt status.");
  // Medlemmer kan kun annullere deres egne bestillinger, så længe de ikke er sendt videre.
  const r = bruger.rolle === "admin"
    ? await sql`update slop_bestillinger set status = ${body.status}, opdateret = now() where id = ${p.id}`
    : body.status === "annulleret"
      ? await sql`update slop_bestillinger set status = 'annulleret', opdateret = now() where id = ${p.id} and bruger_id = ${bruger.id} and status = 'ny'`
      : { count: 0 };
  if (!r.count) throw new Fejl(403, bruger.rolle === "admin" ? "Bestillingen findes ikke." : "Du kan kun annullere dine egne bestillinger, før de er sendt videre.");
  return { ok: true };
});
rute("DELETE", "/slopkisten/bestillinger/:id", async ({ bruger, p }) => {
  kraevAdmin(bruger);
  await sql`delete from slop_bestillinger where id = ${p.id}`;
  return { ok: true };
});

// ---------- Hovedfunktion ----------
let skemaKlar = null;
const sikrSkema = () => (skemaKlar ||= sql.unsafe(SKEMA).catch((e) => { skemaKlar = null; throw e; }));

export default async function handler(req, res) {
  const u = new URL(req.url, "http://x");
  // På Vercel omskrives /api/xxx til /api?sti=xxx (se vercel.json).
  const sti = u.searchParams.has("sti") ? "/api/" + u.searchParams.get("sti").replace(/^\/+/, "") : u.pathname;
  res.setHeader("Cache-Control", "no-store");
  try {
    // Beskyttelse mod at andre sider sender handlinger på vegne af en indlogget bruger (CSRF).
    if (req.method !== "GET") {
      const origin = req.headers.origin;
      let fremmed = false;
      try { fremmed = !!origin && new URL(origin).host !== req.headers.host; } catch { fremmed = true; }
      if (fremmed) throw new Fejl(403, "Forespørgslen blev afvist.");
      if (!/application\/json/.test(req.headers["content-type"] || "")) throw new Fejl(415, "Ugyldig forespørgsel.");
    }
    let fundet = null;
    for (const [metode, re, fn] of ruter) {
      const m = sti.match(re);
      if (m) { if (metode === req.method) { fundet = [fn, m.groups || {}]; break; } fundet = fundet || "metode"; }
    }
    if (!fundet) throw new Fejl(404, "Ukendt adresse.");
    if (fundet === "metode") throw new Fejl(405, "Ikke tilladt.");
    const [fn, p] = fundet;
    await sikrSkema();
    const body = req.method === "GET" ? {} : await laesBody(req);
    const bruger = await hentBruger(req);
    const svar = await fn({ req, res, body, bruger, p });
    if (svar === undefined) return;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(svar));
  } catch (e) {
    // Databasefejl oversættes til forståelige beskeder uden tekniske detaljer.
    let status = e.status, besked = e.message;
    if (!status) {
      if (e.code === "23514" || e.code === "23502") { status = 400; besked = "Nogle af oplysningerne er ugyldige eller for lange."; }
      else if (e.code === "23505") { status = 409; besked = "Det findes allerede."; }
      else if (e.code === "23503") { status = 404; besked = "Det findes ikke længere."; }
      else if (String(e.code || "").startsWith("22")) { status = 400; besked = "Ugyldig dato, tid eller værdi."; }
      else { status = 500; besked = "Der skete en fejl på serveren. Prøv igen."; console.error(e); }
    }
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ fejl: besked }));
  }
}
