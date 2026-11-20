// Tester API og rettigheder mod en LOKAL server og database. SLETTER ALT I DATABASEN!
// Brug:  DATABASE_URL=postgres://postgres:test@localhost:5432/hmf node tools/test.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const B = process.env.BASE || "http://localhost:8080";
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) { console.error("Kun mod en lokal database!"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
await sql.unsafe("drop schema public cascade; create schema public;");
await sql.unsafe(readFileSync(new URL("../api/_skema.sql", import.meta.url), "utf8"));

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
tjek("spærringen rammer ikke andre konti fra samme sted", ok(await klient()("/log-ind", "POST", { email: "anna@test.dk", kode: KODE })));
tjek("spærringen ligger på afsenderen, ikke på kontoen (ingen kolonne-lås)", (await sql`select count(*)::int n from login_forsoeg where email = 'bent@test.dk'`)[0].n >= 5);
await sql`delete from login_forsoeg`;
tjek("efter spærretiden kan man logge ind igen", ok(await spaerret("/log-ind", "POST", { email: "bent@test.dk", kode: KODE })));
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
tjek("admin kan lægge PDF kun for medlemmer", ok(await admin("/nyheder", "POST", { titel: "Ankerposten 5", tekst: "Kun for medlemmer", dato: "2030-02-01", pdf, pdf_navn: "ap5.pdf", kun_medlemmer: true })));
const km = (await anon("/nyheder")).data.find((x) => x.titel === "Ankerposten 5");
tjek("anonym ser nyheden, men ikke linket til PDF'en", km && km.pdf_url === null && km.har_pdf === true && km.kun_medlemmer === true);
const kmId = (await sql`select id from nyheder where titel = 'Ankerposten 5'`)[0].id;
tjek("anonym kan IKKE hente PDF'en direkte", (await fetch(`${B}/api/nyheder/${kmId}/pdf`)).status === 401);
const kmM = (await bent.k("/nyheder")).data.find((x) => x.titel === "Ankerposten 5");
tjek("medlem får linket", kmM && kmM.pdf_url === `/api/nyheder/${kmId}/pdf`);
const kmFil = await fetch(`${B}/api/nyheder/${kmId}/pdf`, { headers: { Cookie: (await (async () => { const r = await fetch(B + "/api/log-ind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@test.dk", kode: KODE }) }); return r.headers.get("set-cookie").split(";")[0]; })()) } });
tjek("logget ind kan hente PDF'en, og den caches ikke offentligt", kmFil.status === 200 && /private/.test(kmFil.headers.get("cache-control")));
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

const carlFoer = await medlem("Carl Nul", "carl0@test.dk");
const dora0 = await medlem("Dora Nul", "dora0@test.dk");
// Rettelser, fejlbeskeder og sikkerhed
const a2 = (await admin("/arrangementer", "POST", { titel: "Grill", dato: "2030-03-01" })).data;
tjek("admin kan rette arrangement", ok(await admin("/arrangementer/" + a2.id, "PATCH", { titel: "Grillaften", dato: "2030-03-02", tid: "18:30", sted: "Havnen", beskrivelse: "" })));
tjek("rettelsen er gemt", (await anon("/arrangementer")).data.some((a) => a.titel === "Grillaften" && a.dato === "2030-03-02" && a.tid === "18:30"));
tjek("medlem kan IKKE rette arrangement", (await bent.k("/arrangementer/" + a2.id, "PATCH", { titel: "x", dato: "2030-03-02" })).status === 403);
const ugyldig = await admin("/arrangementer", "POST", { titel: "x", dato: "2030-02-31" });
tjek("ugyldig dato giver pæn fejl (400): " + ugyldig.data.fejl, ugyldig.status === 400);
tjek("kæmpe id giver 400/404, ikke 500", [400, 404].includes((await admin("/arrangementer/99999999999999999999999", "PATCH", { titel: "x", dato: "2030-01-01" })).status));
tjek("Origin: null afvises", (await bent.k("/beskeder", "POST", { tekst: "x" }, { Origin: "null" })).status === 403);
const v3 = (await admin("/vagter", "POST", { titel: "Bro", dato: "2030-04-01", pladser: 2 })).data;
await carlFoer.k(`/vagter/${v3.id}/tilmeld`, "POST");
await admin(`/vagter/${v3.id}/tilmeld`, "POST");
const forFaa = await admin("/vagter/" + v3.id, "PATCH", { titel: "Bro", dato: "2030-04-01", pladser: 1 });
tjek("kan ikke sætte færre pladser end tilmeldte: " + forFaa.data.fejl, forFaa.status === 400);
tjek("admin kan rette vagt", ok(await admin("/vagter/" + v3.id, "PATCH", { titel: "Brovagt", dato: "2030-04-02", tid: "09:00", sted: "Broen", pladser: 3 })));
tjek("medlem kan IKKE fjerne andre fra vagt", (await carlFoer.k(`/vagter/${v3.id}/tilmeldte/${(await admin("/mig")).data.bruger.id}`, "DELETE")).status === 403);
tjek("admin kan fjerne en tilmeldt", ok(await admin(`/vagter/${v3.id}/tilmeldte/${carlFoer.id}`, "DELETE")));
tjek("fjernet fra vagt", (await admin("/vagter")).data.find((x) => x.id === v3.id).tilmeldte.length === 1);
const andre = klient(); await andre("/log-ind", "POST", { email: "carl0@test.dk", kode: KODE });
tjek("skift kode kræver den nuværende kode", (await carlFoer.k("/mig/kode", "POST", { nuvaerende: "forkert", kode: "EnNyKode123" })).status === 403);
tjek("skift kode uden nuværende kode afvises", (await carlFoer.k("/mig/kode", "POST", { kode: "EnNyKode123" })).status === 403);
await carlFoer.k("/mig/kode", "POST", { nuvaerende: KODE, kode: "EnNyKode123" });
tjek("skift kode logger andre enheder ud", (await andre("/mig")).data.bruger === null && (await carlFoer.k("/mig")).data.bruger !== null);
const t0 = Date.now(); await klient()("/log-ind", "POST", { email: "findes.ikke@test.dk", kode: "x" }); const tIkke = Date.now() - t0;
const t1 = Date.now(); await klient()("/log-ind", "POST", { email: "dora0@test.dk", kode: "x" }); const tFindes = Date.now() - t1;
tjek(`samme svartid om e-mail findes eller ej (${tIkke} / ${tFindes} ms)`, tIkke > tFindes * 0.4);
const pdfR = await fetch(B + (await anon("/nyheder")).data.find((n) => n.pdf_url?.startsWith("/api/")).pdf_url);
tjek("PDF sendes i sandkasse", (pdfR.headers.get("content-security-policy") || "").includes("sandbox"));
for (let i = 0; i < 30; i++) await dora0.k("/beskeder", "POST", { tekst: "spam " + i });
tjek("max 30 beskeder i timen", (await dora0.k("/beskeder", "POST", { tekst: "en til" })).status === 429);

// Tilmelding til arrangementer
const ar = (await admin("/arrangementer", "POST", { titel: "Julefrokost", dato: "2030-12-05", tid: "18:00", tilmelding: true, max_antal: 10 })).data;
const gaest = klient();
const tg = await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Gæst Hansen", antal: 3 });
tjek("anonym kan tilmelde sig med navn og antal", ok(tg) && !!tg.data.token);
const tb = await bent.k(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Bent og fru", antal: 2 });
tjek("medlem kan tilmelde sig", ok(tb));
let arr = (await anon("/arrangementer")).data.find((a) => a.id === ar.id);
tjek("optælling: 5 tilmeldt, 2 tilmeldinger", arr.tilmeldt === 5 && arr.tilmeldinger === 2 && arr.max_antal === 10);
tjek("anonym ser IKKE navne", JSON.stringify(arr).indexOf("Hansen") === -1 && arr.mine.length === 0);
tjek("medlem ser sin egen tilmelding", (await bent.k("/arrangementer")).data.find((a) => a.id === ar.id).mine[0]?.navn === "Bent og fru");
tjek("anonym kan IKKE se deltagerlisten", (await anon(`/arrangementer/${ar.id}/tilmeldinger`)).status === 401);
tjek("medlem kan IKKE se deltagerlisten", (await bent.k(`/arrangementer/${ar.id}/tilmeldinger`)).status === 403);
const dl = (await admin(`/arrangementer/${ar.id}/tilmeldinger`)).data;
tjek("admin ser deltagerlisten med navn og antal", dl.length === 2 && dl[0].navn === "Gæst Hansen" && dl[0].antal === 3);
const forMange = await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Stor familie", antal: 6 });
tjek("over max afvises: " + forMange.data.fejl, forMange.status === 409 && /5 pladser/.test(forMange.data.fejl));
tjek("antal 0 afvises", (await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "X", antal: 0 })).status === 400);
tjek("antal 21 afvises", (await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "X", antal: 21 })).status === 400);
tjek("tomt navn afvises", (await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "  ", antal: 1 })).status === 400);
tjek("robot-felt afvises", (await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Bot", antal: 1, hjemmeside: "http://spam" })).status === 400);
const samt = await Promise.all([1, 2, 3].map(() => klient()(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Samtidig", antal: 2 })));
arr = (await anon("/arrangementer")).data.find((a) => a.id === ar.id);
tjek(`samtidige tilmeldinger overbooker ikke (${arr.tilmeldt}/10)`, arr.tilmeldt <= 10 && samt.filter(ok).length === 2);
tjek("sidste plads kan tages", ok(await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Sidste", antal: 10 - arr.tilmeldt })));
const fb = await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "Sen", antal: 1 });
tjek("fuldt booket afvises: " + fb.data.fejl, fb.status === 409 && /fuldt booket/.test(fb.data.fejl));
tjek("forkert nøgle kan IKKE afmelde", (await klient()(`/arrangementer/${ar.id}/tilmeldinger/${tg.data.id}`, "DELETE", { token: "forkert" })).status === 403);
tjek("andet medlem kan IKKE afmelde Bent", (await carlFoer.k(`/arrangementer/${ar.id}/tilmeldinger/${tb.data.id}`, "DELETE", {})).status === 403);
tjek("gæst kan afmelde med sin nøgle", ok(await klient()(`/arrangementer/${ar.id}/tilmeldinger/${tg.data.id}`, "DELETE", { token: tg.data.token })));
tjek("medlem kan afmelde via sin konto", ok(await bent.k(`/arrangementer/${ar.id}/tilmeldinger/${tb.data.id}`, "DELETE", {})));
const rest = (await admin(`/arrangementer/${ar.id}/tilmeldinger`)).data;
tjek("admin kan fjerne en tilmelding", ok(await admin(`/arrangementer/${ar.id}/tilmeldinger/${rest[0].id}`, "DELETE")));
tjek("max kan ikke sættes under antal tilmeldte", (await admin("/arrangementer/" + ar.id, "PATCH", { titel: "Julefrokost", dato: "2030-12-05", tilmelding: true, max_antal: 1 })).status === 400);
tjek("admin slår tilmelding fra", ok(await admin("/arrangementer/" + ar.id, "PATCH", { titel: "Julefrokost", dato: "2030-12-05", tilmelding: false, max_antal: "" })));
tjek("ingen tilmelding når slået fra", (await gaest(`/arrangementer/${ar.id}/tilmeld`, "POST", { navn: "X", antal: 1 })).status === 400);
const masse = klient(); let sidst;
const ar2 = (await admin("/arrangementer", "POST", { titel: "Åbent hus", dato: "2030-12-06", tilmelding: true })).data;
for (let i = 0; i < 16; i++) sidst = await masse(`/arrangementer/${ar2.id}/tilmeld`, "POST", { navn: "Masse " + i, antal: 1 });
tjek("masseindsendelse fra samme sted bremses", sidst.status === 429);
await sql`delete from arrangement_tilmeldinger`;
await sql`insert into arrangementer (titel, dato, tilmelding) values ('Gammel fest', '2020-01-01', true)`;
const [gf] = await sql`select id from arrangementer where titel = 'Gammel fest'`;
tjek("kan IKKE tilmelde sig overstået arrangement", (await gaest(`/arrangementer/${gf.id}/tilmeld`, "POST", { navn: "X", antal: 1 })).status === 400);

// Billeder i galleriet
const fotoM = await medlem("Foto Fie", "fie@test.dk");
const { readFileSync: rf } = await import("node:fs");
const jpg = rf(new URL("../assets/img/galleri/julefrokost-2023-1-lille.jpg", import.meta.url)).toString("base64");
const nytB = (k, ekstra = {}) => k("/billeder", "POST", { titel: "Julefrokost 2026", alt: "Medlemmer ved langbordet", dato: "2026-11-27", stor: jpg, lille: jpg, bredde: 481, hoejde: 640, ...ekstra });
tjek("anonym kan IKKE uploade", (await nytB(anon)).status === 401);
tjek("skrivebeskyttet kan IKKE uploade", (await nytB(lis.k)).status === 403);
const bb = await nytB(fotoM.k);
tjek("medlem kan uploade (ikke godkendt endnu)", ok(bb) && bb.data.godkendt === false);
tjek("ikke-JPEG afvises", (await nytB(fotoM.k, { stor: Buffer.from("<svg onload=alert(1)>").toString("base64") })).status === 400);
tjek("manglende beskrivelse afvises", (await nytB(fotoM.k, { alt: " " })).status === 400);
tjek("ugyldige mål afvises", (await nytB(fotoM.k, { bredde: 0 })).status === 400);
tjek("anonym ser IKKE ikke-godkendt billede i listen", !(await anon("/billeder")).data.some((x) => x.id === bb.data.id));
tjek("andet medlem ser det IKKE", !(await carlFoer.k("/billeder")).data.some((x) => x.id === bb.data.id));
tjek("uploader ser sit eget", (await fotoM.k("/billeder")).data.some((x) => x.id === bb.data.id));
tjek("admin ser det", (await admin("/billeder")).data.some((x) => x.id === bb.data.id && x.navn === "Foto Fie"));
tjek("anonym kan IKKE hente filen før godkendelse", (await fetch(`${B}/api/billeder/${bb.data.id}/stor`)).status === 404);
tjek("medlem kan IKKE godkende", (await fotoM.k("/billeder/" + bb.data.id, "PATCH", { godkendt: true })).status === 403);
tjek("admin godkender", ok(await admin("/billeder/" + bb.data.id, "PATCH", { godkendt: true })));
const fil = await fetch(`${B}/api/billeder/${bb.data.id}/lille`);
tjek("godkendt billede kan hentes af alle som JPEG i sandkasse", fil.status === 200 && fil.headers.get("content-type") === "image/jpeg" && /sandbox/.test(fil.headers.get("content-security-policy")) && /public/.test(fil.headers.get("cache-control")));
tjek("anonym ser godkendt billede i listen", (await anon("/billeder")).data.some((x) => x.id === bb.data.id));
const ab = await nytB(admin);
tjek("admins billeder godkendes med det samme", ab.data.godkendt === true);
tjek("andet medlem kan IKKE slette Bents billede", (await carlFoer.k("/billeder/" + bb.data.id, "DELETE")).status === 403);
tjek("medlem kan slette sit eget", ok(await fotoM.k("/billeder/" + bb.data.id, "DELETE")));
tjek("admin kan slette alle", ok(await admin("/billeder/" + ab.data.id, "DELETE")));

// Slopkisten
const kat = (await anon("/slopkisten")).data;
tjek("alle kan se varekataloget", kat.varer.length >= 30 && kat.varer.some((v) => v.varianter.some((x) => x.varenr === "C121050")));
const slopM = await medlem("Slop Sven", "sven@test.dk");
const polo = kat.varer.find((v) => v.varianter.some((x) => x.varenr === "C121050"));
const pi = polo.varianter.findIndex((x) => x.varenr === "C121050");
tjek("anonym kan IKKE bestille", (await anon("/slopkisten/bestil", "POST", { linjer: [{ vare: polo.id, variant: pi, antal: 1 }] })).status === 401);
tjek("skrivebeskyttet kan IKKE bestille", (await lis.k("/slopkisten/bestil", "POST", { linjer: [{ vare: polo.id, variant: pi, antal: 1 }] })).status === 403);
tjek("tom kurv afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [] })).status === 400);
tjek("ukendt vare afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "findes-ikke", variant: 0, antal: 1 }] })).status === 400);
tjek("ukendt variant afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: polo.id, variant: 99, antal: 1 }] })).status === 400);
tjek("antal 0 afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: polo.id, variant: pi, antal: 0 }] })).status === 400);
const best = await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: polo.id, variant: pi, antal: 2 }, { vare: "slips", variant: 0, antal: 1 }], navn: "Slop Sven", email: "sven@test.dk", telefon: "12 34 56 78", bemaerkning: "Med afdelingsnavn" });
tjek("medlem kan bestille", ok(best) && !!best.data.id);
const mineB = (await slopM.k("/slopkisten/bestillinger")).data;
tjek("medlem ser sin bestilling med varenr fra kataloget", mineB.length === 1 && mineB[0].linjer[0].varenr === "C121050" && mineB[0].linjer[0].variant === "Medium" && mineB[0].linjer[0].antal === 2);
tjek("bestillingen har medlemmets navn, e-mail og telefon", mineB[0].navn === "Slop Sven" && mineB[0].email === "sven@test.dk" && mineB[0].telefon === "12 34 56 78");
tjek("andet medlem ser IKKE bestillingen", (await carlFoer.k("/slopkisten/bestillinger")).data.length === 0);
tjek("admin ser alle bestillinger", (await admin("/slopkisten/bestillinger")).data.some((b) => b.id === best.data.id));
tjek("medlem kan IKKE ændre status til udleveret", (await slopM.k(`/slopkisten/bestillinger/${best.data.id}`, "PATCH", { status: "udleveret" })).status === 403);
tjek("andet medlem kan IKKE annullere", (await carlFoer.k(`/slopkisten/bestillinger/${best.data.id}`, "PATCH", { status: "annulleret" })).status === 403);
tjek("admin sætter status 'bestilt'", ok(await admin(`/slopkisten/bestillinger/${best.data.id}`, "PATCH", { status: "bestilt" })));
tjek("medlem kan IKKE annullere, når den er bestilt", (await slopM.k(`/slopkisten/bestillinger/${best.data.id}`, "PATCH", { status: "annulleret" })).status === 403);
const KONTAKT = { navn: "Slop Sven", email: "sven@test.dk", telefon: "12345678" };
const udenTlf = await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "slips", variant: 0, antal: 1 }], navn: "Slop Sven", email: "sven@test.dk" });
tjek("bestilling uden telefon afvises: " + udenTlf.data.fejl, udenTlf.status === 400 && /telefon/.test(udenTlf.data.fejl));
tjek("bestilling uden navn afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "slips", variant: 0, antal: 1 }], ...KONTAKT, navn: " " })).status === 400);
tjek("bestilling med ugyldig e-mail afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "slips", variant: 0, antal: 1 }], ...KONTAKT, email: "ikke-en-mail" })).status === 400);
tjek("for kort telefonnummer afvises", (await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "slips", variant: 0, antal: 1 }], ...KONTAKT, telefon: "1234" })).status === 400);
const best2 = await slopM.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "slips", variant: 0, antal: 1 }], ...KONTAKT });
tjek("medlem kan annullere en ny bestilling", ok(await slopM.k(`/slopkisten/bestillinger/${best2.data.id}`, "PATCH", { status: "annulleret" })));
tjek("medlem kan IKKE slette bestillinger", (await slopM.k(`/slopkisten/bestillinger/${best2.data.id}`, "DELETE")).status === 403);
tjek("admin kan slette en bestilling", ok(await admin(`/slopkisten/bestillinger/${best2.data.id}`, "DELETE")));

// Forslag
const carl = await medlem("Carl Carlsen", "carl@test.dk");
const dora = await medlem("Dora Dam", "dora@test.dk", "laeser");
tjek("anonym kan IKKE se forslag", (await anon("/forslag")).status === 401);
tjek("anonym kan IKKE sende forslag", (await anon("/forslag", "POST", { side: "omos", tekst: "x" })).status === 401);
tjek("medlem kan sende forslag", ok(await carl.k("/forslag", "POST", { side: "galleri", tekst: "Billeder fra julefrokosten 2026" })));
tjek("skrivebeskyttet kan også sende forslag", ok(await dora.k("/forslag", "POST", { side: "omos", tekst: "Ret telefonnummeret" })));
tjek("ukendt side afvises", (await carl.k("/forslag", "POST", { side: "hack", tekst: "x" })).status === 400);
tjek("tomt forslag afvises", (await carl.k("/forslag", "POST", { side: "omos", tekst: "  " })).status === 400);
tjek("medlem ser kun egne forslag", (await carl.k("/forslag")).data.length === 1);
const alleF = (await admin("/forslag")).data;
tjek("admin ser alle forslag med navn", alleF.length === 2 && alleF.some((f) => f.navn === "Dora Dam"));
const fC = alleF.find((f) => f.navn === "Carl Carlsen");
tjek("medlem kan IKKE ændre status", (await carl.k("/forslag/" + fC.id, "PATCH", { status: "udfoert", svar: "" })).status === 403);
tjek("Dora kan IKKE slette Carls forslag", (await dora.k("/forslag/" + fC.id, "DELETE")).status === 403);
tjek("admin kan sætte status og svar", ok(await admin("/forslag/" + fC.id, "PATCH", { status: "igang", svar: "Send dem til Harry" })));
const cf = (await carl.k("/forslag")).data[0];
tjek("medlem ser status og svar", cf.status === "igang" && cf.svar === "Send dem til Harry");
tjek("behandlet forslag kan ikke trækkes tilbage", (await carl.k("/forslag/" + fC.id, "DELETE")).status === 403);
const fD = alleF.find((f) => f.navn === "Dora Dam");
tjek("eget ubehandlet forslag kan trækkes tilbage", ok(await dora.k("/forslag/" + fD.id, "DELETE")));
tjek("admin kan slette forslag", ok(await admin("/forslag/" + fC.id, "DELETE")));

// Robusthed og rettelser fra sikkerhedsgennemgangen
const raa = async (sti, metode, rawBody) => (await fetch(B + "/api" + sti, { method: metode, headers: { "Content-Type": "application/json" }, body: rawBody })).status;
tjek("body 'null' giver 400, ikke 500", (await raa("/log-ind", "POST", "null")) === 400);
tjek("body som array giver 400", (await raa("/log-ind", "POST", "[]")) === 400);
tjek("dato som array giver 400", (await admin("/arrangementer", "POST", { titel: "x", dato: ["2030-01-01"] })).status === 400);
const sl = await medlem("Slop Lars", "lars@test.dk");
tjek("slopkiste-linje 'null' giver 400", (await sl.k("/slopkisten/bestil", "POST", { linjer: [null], navn: "Lars", email: "lars@test.dk", telefon: "12345678" })).status === 400);
tjek("e-mail med ? eller & afvises (mailto-manipulation)", (await sl.k("/slopkisten/bestil", "POST", { linjer: [{ vare: "slips", variant: 0, antal: 1 }], navn: "Lars", email: "a@b.dk?cc=x@y.dk", telefon: "12345678" })).status === 400);
const fbx = await sl.k("/billeder", "POST", { titel: "Test", alt: "Test", stor: jpg, lille: jpg, bredde: 481, hoejde: 640 });
await admin("/billeder/" + fbx.data.id, "PATCH", { godkendt: true });
const anonB = (await anon("/billeder")).data.find((x) => x.id === fbx.data.id);
tjek("anonyme ser ikke navnet på den, der har lagt billedet ind", anonB && anonB.navn === null && anonB.bruger_id === null);
tjek("medlemmer ser navnet", (await sl.k("/billeder")).data.find((x) => x.id === fbx.data.id).navn === "Slop Lars");
await admin("/billeder/" + fbx.data.id, "PATCH", { titel: "Ny titel" });
tjek("ret kun titlen skjuler ikke billedet", (await anon("/billeder")).data.some((x) => x.id === fbx.data.id && x.titel === "Ny titel"));
const ar3 = (await admin("/arrangementer", "POST", { titel: "Sommerfest", dato: "2030-07-01", tilmelding: true })).data;
await sql`delete from arrangement_tilmeldinger`;
const g3 = klient(); let r3;
for (let i = 0; i < 2; i++) r3 = await g3(`/arrangementer/${ar3.id}/tilmeld`, "POST", { navn: "Stor familie " + i, antal: 15 });
tjek("højst 30 personer pr. afsender pr. arrangement", ok(r3) && (await g3(`/arrangementer/${ar3.id}/tilmeld`, "POST", { navn: "En til", antal: 1 })).status === 429);
tjek("medlemmer er ikke omfattet af afsender-loftet", ok(await sl.k(`/arrangementer/${ar3.id}/tilmeld`, "POST", { navn: "Lars", antal: 2 })));
const [{ kh }] = await sql`select kilde_hash kh from arrangement_tilmeldinger limit 1`;
const { createHash } = await import("node:crypto");
tjek("afsender gemmes som HMAC, ikke som simpel hash af IP", kh !== createHash("sha256").update("127.0.0.1|" + new Date().toISOString().slice(0, 10)).digest("hex") && kh !== createHash("sha256").update("::1|" + new Date().toISOString().slice(0, 10)).digest("hex"));
tjek("ugyldig URL-kodning vælter ikke serveren", (await fetch(B + "/%")).status === 400 && (await fetch(B + "/api/mig")).status === 200);

// Login-link og "Glemt adgangskode?"
const lm = await medlem("Link Lis", "linklis@test.dk");
const lmId = (await lm.k("/mig")).data.bruger.id;
const lnk = (await admin(`/medlemmer/${lmId}/link`, "POST")).data.token;
const viaLink = klient();
const ll = await viaLink("/link/log-ind", "POST", { token: lnk });
tjek("login-link logger direkte ind", ok(ll) && ll.data.navn === "Link Lis" && (await viaLink("/mig")).data.bruger.email === "linklis@test.dk");
tjek("login-link virker kun én gang", (await klient()("/link/log-ind", "POST", { token: lnk })).status === 404);
tjek("ugyldigt link afvises", (await klient()("/link/log-ind", "POST", { token: "x".repeat(43) })).status === 404);
tjek("efter login via link kan man vælge ny kode uden den gamle", ok(await viaLink("/mig/kode", "POST", { kode: "LinkKode123" })));
tjek("...men kun én gang (bagefter kræves den gamle)", (await viaLink("/mig/kode", "POST", { kode: "AndenKode123" })).status === 403);
tjek("andre enheder blev logget ud ved den nye kode", (await lm.k("/mig")).data.bruger === null);
const lm2 = klient();
tjek("den nye kode virker", ok(await lm2("/log-ind", "POST", { email: "linklis@test.dk", kode: "LinkKode123" })));
tjek("en almindelig session kan IKKE skifte kode uden den gamle", (await lm2("/mig/kode", "POST", { kode: "Hack12345" })).status === 403);
await sql`delete from login_forsoeg`;
const g1 = await klient()("/glemt", "POST", { email: "linklis@test.dk" });
const g2 = await klient()("/glemt", "POST", { email: "findes.ikke@test.dk" });
tjek("'glemt adgangskode' svarer ens, uanset om e-mailen findes", ok(g1) && ok(g2) && JSON.stringify(g1.data) === JSON.stringify(g2.data));
await klient()("/glemt", "POST", { email: "LinkLis@test.dk" });
const anm = (await admin("/anmodninger")).data;
tjek("bestyrelsen ser én anmodning (ingen dubletter, ingen for ukendte)", anm.length === 1 && anm[0].email === "linklis@test.dk");
tjek("medlemmer kan IKKE se anmodninger", (await lm2("/anmodninger")).status === 403);
tjek("anonyme kan IKKE se anmodninger", (await anon("/anmodninger")).status === 401);
tjek("medlemmer kan IKKE lave links via anmodninger", (await lm2(`/anmodninger/${anm[0].id}/link`, "POST")).status === 403);
const svar = await admin(`/anmodninger/${anm[0].id}/link`, "POST");
tjek("admin laver login-link fra anmodningen med ét tryk", ok(svar) && svar.data.token && svar.data.email === "linklis@test.dk");
const efter = (await admin("/anmodninger")).data;
tjek("anmodningen står som 'link sendt', til linket er brugt", efter.length === 1 && efter[0].link_lavet);
const svar2 = await admin(`/anmodninger/${anm[0].id}/link`, "POST");
tjek("et nyt link slår IKKE det første ihjel", ok(svar2) && (await klient()("/link", "POST", { token: svar.data.token })).data.gyldig === true);
tjek("linket kan kigges på uden at blive brugt (til 'Log ind som …'-knappen)", (await klient()("/link", "POST", { token: svar.data.token })).data.navn === "Link Lis");
tjek("linket fra anmodningen logger ind", ok(await klient()("/link/log-ind", "POST", { token: svar.data.token })));
tjek("anmodningen forsvinder, når linket er brugt", (await admin("/anmodninger")).data.length === 0);
tjek("andre ubrugte links til samme person lukkes, når ét er brugt", (await klient()("/link/log-ind", "POST", { token: svar2.data.token })).status === 404
  && (await klient()("/link", "POST", { token: svar2.data.token })).data.gyldig === false);
for (let i = 0; i < 5; i++) await klient()("/glemt", "POST", { email: `spam${i}@test.dk` });
tjek("'glemt adgangskode' kan ikke spammes", (await klient()("/glemt", "POST", { email: "spam9@test.dk" })).status === 429);
await sql`delete from login_forsoeg`;
const nyM = (await admin("/medlemmer", "POST", { navn: "Ny Nis", email: "nis@test.dk", rolle: "medlem" })).data.token;
const nis = klient();
await nis("/link/log-ind", "POST", { token: nyM });
await sql`update sessioner set ny_kode_til = now() - interval '1 minute' where bruger_id = (select id from brugere where email = 'nis@test.dk')`;
tjek("medlem uden adgangskode kan vælge en senere (også efter 30 min.)", ok(await nis("/mig/kode", "POST", { kode: "NisKode1234" })));
tjek("...og derefter kræves den gamle", (await nis("/mig/kode", "POST", { kode: "NisKode9999" })).status === 403);
const gl = (await admin("/medlemmer/" + (await nis("/mig")).data.bruger.id + "/link", "POST")).data.token;
await sql`update links set udloeber = now() - interval '1 minute' where token_hash = encode(sha256(${gl}::bytea), 'hex')`;
tjek("et udløbet link virker ikke", (await klient()("/link", "POST", { token: gl })).data.gyldig === false && (await klient()("/link/log-ind", "POST", { token: gl })).status === 404);
await sql`delete from login_forsoeg`;
tjek("der findes intet nødlink/bagdør", (await anon("/noedlink", "POST", { email: "admin@test.dk" })).status === 404);

// Statiske filer beskyttet
for (const sti of ["/api/index.js", "/tools/test.mjs", "/api/_skema.sql", "/package.json"]) {
  const r = await fetch(B + sti);
  tjek(`${sti} er ikke tilgængelig`, r.status === 404 || r.status === 401);
}

console.log(fejl ? `\n${fejl} test fejlede` : "\nAlle test bestået");
await sql.end();
process.exit(fejl ? 1 : 0);
