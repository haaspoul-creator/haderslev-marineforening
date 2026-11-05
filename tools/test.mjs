// Tester API og rettigheder mod en LOKAL server og database. SLETTER ALT I DATABASEN!
// Brug:  DATABASE_URL=postgres://postgres:test@localhost:5432/hmf node tools/test.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const B = process.env.BASE || "http://localhost:8080";
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) { console.error("Kun mod en lokal database!"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
await sql.unsafe("drop schema public cascade; create schema public;");
await sql.unsafe(readFileSync(new URL("../db/skema.sql", import.meta.url), "utf8"));

let fejl = 0;
const tjek = (n, ok) => { console.log(`${ok ? "OK  " : "FEJL"} ${n}`); if (!ok) fejl++; };
const KODE = "Testkode123";

function klient() {
  let cookie = "";
  return async (sti, metode = "GET", data, ekstra = {}) => {
    const r = await fetch(B + "/api" + sti, { method: metode, redirect: "manual",
      headers: { ...(metode !== "GET" ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...ekstra },
      body: metode !== "GET" ? JSON.stringify(data || {}) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}
const ok = (r) => r.status === 200;

// Første admin via scriptet
const ud = execFileSync("node", [new URL("./opret-admin.mjs", import.meta.url).pathname, "admin@test.dk", "Harry Madsen"], { env: process.env }).toString();
const adminToken = ud.match(/link=([\w-]+)/)[1];
const admin = klient();
tjek("link viser navn", (await admin("/link", "POST", { token: adminToken })).data.navn === "Harry Madsen");
tjek("for kort kode afvises", (await admin("/aktiver", "POST", { token: adminToken, kode: "kort" })).status === 400);
tjek("admin aktiverer sit link", ok(await admin("/aktiver", "POST", { token: adminToken, kode: KODE })));
tjek("link kan kun bruges én gang", (await klient()("/aktiver", "POST", { token: adminToken, kode: KODE })).status === 404);
tjek("admin er logget ind", (await admin("/mig")).data.bruger.rolle === "admin");

async function medlem(navn, email, rolle = "medlem") {
  const r = await admin("/medlemmer", "POST", { navn, email, rolle });
  const k = klient();
  await k("/aktiver", "POST", { token: r.data.token, kode: KODE });
  const id = (await k("/mig")).data.bruger.id;
  return { k, id };
}
const anna = await medlem("Anna Andersen", "anna@test.dk");
const bent = await medlem("Bent Bentsen", "bent@test.dk");
const lis = await medlem("Lis Læser", "lis@test.dk", "laeser");
tjek("dobbelt e-mail afvises", (await admin("/medlemmer", "POST", { navn: "X", email: "anna@test.dk" })).status === 409);

// Login
const x = klient();
tjek("forkert kode afvises", (await x("/log-ind", "POST", { email: "anna@test.dk", kode: "forkert" })).status === 401);
tjek("rigtig kode virker (store bogstaver i e-mail)", ok(await x("/log-ind", "POST", { email: "ANNA@test.dk", kode: KODE })));
tjek("log ud virker", ok(await x("/log-ud", "POST")) && (await x("/mig")).data.bruger === null);
const spaerret = klient();
for (let i = 0; i < 5; i++) await spaerret("/log-ind", "POST", { email: "bent@test.dk", kode: "forkert" + i });
tjek("spærres efter 5 forkerte forsøg", (await spaerret("/log-ind", "POST", { email: "bent@test.dk", kode: KODE })).status === 429);
await sql`update brugere set fejl_antal = 0`;
tjek("CSRF: anden hjemmeside afvises", (await anna.k("/beskeder", "POST", { tekst: "x" }, { Origin: "https://ond.example" })).status === 403);

// Anonym
const anon = klient();
await admin("/arrangementer", "POST", { titel: "Ulkeaften", dato: "2030-01-10", tid: "19:00", sted: "Det Maritime Hus" });
tjek("anonym kan se arrangementer", (await anon("/arrangementer")).data.length === 1);
tjek("anonym kan se nyheder", (await anon("/nyheder")).data.length === 1);
tjek("anonym kan IKKE se vagter", (await anon("/vagter")).status === 401);
tjek("anonym kan IKKE se beskeder", (await anon("/beskeder")).status === 401);
tjek("anonym kan IKKE se medlemmer", (await anon("/medlemmer")).status === 401);
tjek("anonym kan IKKE oprette arrangement", (await anon("/arrangementer", "POST", { titel: "x", dato: "2030-01-01" })).status === 401);

// Medlem
tjek("medlem kan IKKE oprette arrangement", (await anna.k("/arrangementer", "POST", { titel: "x", dato: "2030-01-01" })).status === 403);
tjek("medlem kan IKKE oprette vagt", (await anna.k("/vagter", "POST", { titel: "x", dato: "2030-01-01", pladser: 1 })).status === 403);
tjek("medlem kan IKKE se medlemsliste", (await anna.k("/medlemmer")).status === 403);
tjek("medlem kan IKKE ændre roller", (await anna.k("/medlemmer/" + anna.id, "PATCH", { rolle: "admin" })).status === 403);
tjek("medlem kan rette eget navn", ok(await anna.k("/mig", "PATCH", { navn: "Anna A." })));

// Vagter
const v = (await admin("/vagter", "POST", { titel: "Kaffe", dato: "2030-01-05", pladser: 1 })).data;
tjek("admin kan oprette vagt", !!v.id);
tjek("ugyldigt antal pladser afvises", (await admin("/vagter", "POST", { titel: "x", dato: "2030-01-05", pladser: 0 })).status === 400);
tjek("medlem kan tage vagt", ok(await anna.k(`/vagter/${v.id}/tilmeld`, "POST")));
const fuld = await bent.k(`/vagter/${v.id}/tilmeld`, "POST");
tjek("fuld vagt afvises: " + fuld.data.fejl, fuld.status === 409);
tjek("Bent ser Annas navn", (await bent.k("/vagter")).data[0].tilmeldte[0].navn === "Anna A.");
await bent.k(`/vagter/${v.id}/tilmeld`, "DELETE");
tjek("Bent kan IKKE afmelde Anna", (await admin("/vagter")).data[0].tilmeldte.length === 1);
tjek("Anna kan afmelde sig", ok(await anna.k(`/vagter/${v.id}/tilmeld`, "DELETE")) && (await admin("/vagter")).data[0].tilmeldte.length === 0);
tjek("skrivebeskyttet kan IKKE tage vagt", (await lis.k(`/vagter/${v.id}/tilmeld`, "POST")).status === 403);
tjek("skrivebeskyttet kan se vagter", ok(await lis.k("/vagter")));
const v2 = (await admin("/vagter", "POST", { titel: "Bar", dato: "2030-01-06", pladser: 3 })).data;
const samtidig = await Promise.all([anna, bent].map((m) => m.k(`/vagter/${v.id}/tilmeld`, "POST")));
tjek("to på samme tid til 1 plads: kun én får den", samtidig.filter(ok).length === 1);
await sql`insert into vagter (titel, dato, pladser) values ('Gammel', '2020-01-01', 5)`;
const [g] = await sql`select id from vagter where titel = 'Gammel'`;
tjek("kan IKKE tage overstået vagt", (await anna.k(`/vagter/${g.id}/tilmeld`, "POST")).status === 400);

// Beskeder
tjek("medlem kan skrive besked", ok(await anna.k("/beskeder", "POST", { tekst: "Hej fra Anna" })));
tjek("tom besked afvises", (await anna.k("/beskeder", "POST", { tekst: "   " })).status === 400);
tjek("for lang besked afvises", (await anna.k("/beskeder", "POST", { tekst: "x".repeat(1001) })).status === 400);
tjek("skrivebeskyttet kan IKKE skrive", (await lis.k("/beskeder", "POST", { tekst: "x" })).status === 403);
const b1 = (await lis.k("/beskeder")).data[0];
tjek("skrivebeskyttet kan læse beskeder", b1 && b1.navn === "Anna A.");
tjek("Bent kan IKKE slette Annas besked", (await bent.k("/beskeder/" + b1.id, "DELETE")).status === 403);
await bent.k("/beskeder", "POST", { tekst: "Bents" });
const b2 = (await bent.k("/beskeder")).data.find((b) => b.tekst === "Bents");
tjek("Bent kan slette sin egen", ok(await bent.k("/beskeder/" + b2.id, "DELETE")));
tjek("admin kan slette andres", ok(await admin("/beskeder/" + b1.id, "DELETE")));

// Nyheder med PDF
const pdf = Buffer.from("%PDF-1.4\n%test\n").toString("base64");
tjek("admin kan lægge nyhed med PDF", ok(await admin("/nyheder", "POST", { titel: "Ankerposten 4", tekst: "Nyt", dato: "2030-01-01", pdf, pdf_navn: "ap4.pdf" })));
const n = (await anon("/nyheder")).data[0];
const pr = await fetch(B + n.pdf_url);
tjek("PDF kan hentes af alle", pr.status === 200 && pr.headers.get("content-type") === "application/pdf");
tjek("ikke-PDF afvises", (await admin("/nyheder", "POST", { titel: "x", dato: "2030-01-01", pdf: Buffer.from("hej").toString("base64"), pdf_navn: "x.pdf" })).status === 400);
tjek("medlem kan IKKE lægge nyheder", (await anna.k("/nyheder", "POST", { titel: "x", dato: "2030-01-01" })).status === 403);

// Medlemmer
tjek("admin kan ændre rolle", ok(await admin("/medlemmer/" + bent.id, "PATCH", { rolle: "laeser" })));
tjek("rolleændring virker straks", (await bent.k("/beskeder", "POST", { tekst: "x" })).status === 403);
tjek("admin kan IKKE ændre egen rolle", (await admin("/medlemmer/" + (await admin("/mig")).data.bruger.id, "PATCH", { rolle: "medlem" })).status === 400);
const nyt = await admin(`/medlemmer/${anna.id}/link`, "POST");
const annaNy = klient();
tjek("nyt link (glemt kode) virker", ok(await annaNy("/aktiver", "POST", { token: nyt.data.token, kode: "NyKode1234" })));
tjek("gammel session logges ud ved ny kode", (await anna.k("/mig")).data.bruger === null);
await annaNy("/beskeder", "POST", { tekst: "Sidste besked" });
tjek("admin kan fjerne medlem", ok(await admin("/medlemmer/" + anna.id, "DELETE")));
tjek("fjernet medlems besked står som Tidligere medlem", (await admin("/beskeder")).data.some((b) => b.tekst === "Sidste besked" && b.navn === null));
tjek("fjernet medlem er logget ud", (await annaNy("/mig")).data.bruger === null);

// Statiske filer beskyttet
for (const sti of ["/api/index.js", "/tools/test.mjs", "/db/skema.sql", "/package.json"]) {
  const r = await fetch(B + sti);
  tjek(`${sti} er ikke tilgængelig`, r.status === 404 || r.status === 401);
}

console.log(fejl ? `\n${fejl} test fejlede` : "\nAlle test bestået");
await sql.end();
process.exit(fejl ? 1 : 0);
