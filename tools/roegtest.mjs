// Røgtest i en rigtig browser (Playwright/Chromium) mod en LOKAL server og database.
// Opretter demodata, åbner alle sider på desktop og mobil og prøver de vigtigste funktioner.
// SLETTER ALT I DATABASEN! Brug kun lokalt eller i CI.
// Brug:  DATABASE_URL=postgres://postgres:test@localhost:5432/hmf BASE=http://localhost:8080 node tools/roegtest.mjs
import postgres from "postgres";
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const B = process.env.BASE || "http://localhost:8080";
const DB = process.env.DATABASE_URL || "";
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error("Kun mod en lokal database!"); process.exit(1); }

// ---------- Demodata ----------
const sql = postgres(DB, { onnotice: () => {} });
await sql.unsafe("drop schema public cascade; create schema public;");
await sql.unsafe(readFileSync(new URL("../api/_skema.sql", import.meta.url), "utf8"));
const KODE = "Testkode123";
async function aktiver(token) {
  const r = await fetch(B + "/api/aktiver", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, kode: KODE }) });
  if (!r.ok) throw new Error("Kunne ikke aktivere bruger: " + r.status);
  return r.headers.get("set-cookie").split(";")[0];
}
const ud = execFileSync("node", [new URL("./opret-admin.mjs", import.meta.url).pathname, "admin@test.dk", "Harry Madsen"], { env: process.env }).toString();
const adminCookie = await aktiver(ud.match(/link=([\w-]+)/)[1]);
for (const [navn, email, rolle] of [["Anna Andersen", "anna@test.dk", "medlem"], ["Bent Bentsen", "bent@test.dk", "medlem"]]) {
  const r = await (await fetch(B + "/api/medlemmer", { method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ navn, email, rolle }) })).json();
  await aktiver(r.token);
}
await sql`insert into arrangementer (titel, dato, tid, sted, max_antal) values
  ('Ulkeaften med skydning', current_date + 7, '19:00', 'Det Maritime Hus', null),
  ('Julefrokost', current_date + 16, '18:00', 'Det Maritime Hus', 40)`;
await sql`insert into vagter (titel, dato, tid, sted, pladser) values
  ('Bar ved julefrokost', current_date + 16, '17:30', 'Det Maritime Hus', 2),
  ('Kaffe i Marinestuen', current_date + 2, '10:00', 'Marinestuen', 1)`;
await sql.end();

// ---------- Browser ----------
let fejl = 0;
const tjek = (n, ok) => { console.log(`${ok ? "OK  " : "FEJL"} ${n}`); if (!ok) fejl++; };
const konsol = [];
const browser = await chromium.launch();
async function side(opts = {}) {
  const ctx = await browser.newContext({ locale: "da-DK", timezoneId: "Europe/Copenhagen", viewport: { width: 1280, height: 900 }, ...opts });
  await ctx.addInitScript(() => { window.print = () => { window._printet = true; }; });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => konsol.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/status of 40[13]/.test(m.text())) konsol.push(m.text()); });
  return p;
}
async function login(p, email, til = "/") {
  await p.goto(`${B}/log-ind/?tilbage=${til}`);
  await p.fill("#login-email", email);
  await p.fill("#login-kode", KODE);
  await p.click("#login-form button[type=submit]");
  await p.waitForURL(B + til);
}
const SIDER = ["/", "/om-os/", "/arrangementskalender/", "/vagter/", "/beskeder/", "/galleri/", "/slopkisten/", "/forslag/", "/rundvisning/", "/log-ind/"];

try {
  // Alle sider indlæses uden fejl og uden vandret rulning – desktop og mobil, med og uden login
  for (const [navn, opts] of [["desktop", {}], ["mobil", devices["iPhone 13"]]]) {
    for (const bruger of [null, "anna@test.dk"]) {
      const p = await side(opts);
      if (bruger) await login(p, bruger);
      const bredde = p.viewportSize().width;
      for (const s of SIDER) {
        const r = await p.goto(B + s);
        await p.waitForLoadState("networkidle");
        const bred = await p.evaluate((w) => document.documentElement.scrollWidth <= w + 1, bredde);
        tjek(`${navn} ${bruger ? "medlem" : "anonym"} ${s}: status ${r.status()}${bred ? "" : ", VANDRET RULNING"}`, r.status() === 200 && bred);
      }
      await p.context().close();
    }
  }

  // Tilmelding til arrangement uden login
  const g = await side();
  await g.goto(B + "/arrangementskalender/");
  await g.locator("tr", { hasText: "Julefrokost" }).locator(".tilmelding button").first().click();
  await g.fill("#tm-navn", "Gæst Jensen");
  await g.fill("#tm-antal", "2");
  await g.click("#tm-send");
  await g.waitForSelector("text=2 personer er tilmeldt");
  tjek("gæst kan tilmelde sig et arrangement", (await g.locator("tr", { hasText: "Julefrokost" }).locator(".optaelling").textContent()).startsWith("2 / 40"));

  // Medlem: tag vagt, skriv besked, bestil fra slopkisten
  const a = await side();
  await login(a, "anna@test.dk", "/vagter/");
  await a.waitForSelector("table.tabel");
  await a.locator("tr", { hasText: "Bar ved julefrokost" }).locator("input[type=checkbox]").check();
  await a.waitForSelector("text=Tak! Du har taget vagten");
  tjek("medlem kan tage en vagt", (await a.locator("tr.min").count()) === 1);
  await a.click("#u-print");
  tjek("vagtlisten kan udskrives", await a.evaluate(() => window._printet === true));
  await a.goto(B + "/beskeder/");
  await a.fill("#b-tekst", "Hej fra røgtesten");
  await a.click("#ny-besked button[type=submit]");
  await a.waitForSelector(".besked.egen");
  tjek("medlem kan skrive en besked", (await a.textContent("#beskeder")).includes("Hej fra røgtesten"));
  await a.goto(B + "/slopkisten/");
  await a.fill("#s-soeg", "C121050");
  await a.selectOption(".vare select", { label: "C121050 – Medium" });
  await a.click(".vare button");
  await a.fill("#k-tlf", "20304050");
  await a.click(".kurv-form button[type=submit]");
  await a.waitForSelector(".kvittering");
  tjek("medlem kan bestille fra slopkisten", (await a.textContent(".kvittering")).includes("C121050"));

  // Admin: ser deltagerliste og bestillinger
  const m = await side();
  await login(m, "admin@test.dk", "/arrangementskalender/");
  await m.locator("tr", { hasText: "Julefrokost" }).locator("button", { hasText: "Deltagerliste" }).click();
  await m.waitForSelector("#dl-liste table");
  tjek("admin ser deltagerlisten", (await m.textContent("#dl-liste")).includes("Gæst Jensen"));
  await m.goto(B + "/slopkisten/");
  await m.waitForSelector("#admin-bestillinger .bestilling");
  tjek("admin ser slopkiste-bestillingen", (await m.textContent("#admin-bestillinger")).includes("Anna Andersen"));

  // Glemt adgangskode: medlem beder om link -> admin sender med ét tryk -> linket logger ind
  const glemt = await side();
  await glemt.goto(B + "/log-ind/");
  await glemt.fill("#glemt-email", "bent@test.dk");
  await glemt.click("#glemt-form button[type=submit]");
  await glemt.waitForSelector("#glemt-tak:not([hidden])");
  tjek("medlem kan bede om et login-link", true);
  await m.goto(B + "/");
  await m.waitForSelector(".anm-tal", { state: "attached" });
  tjek("admin ser et tal i menuen", (await m.textContent(".konto summary")).includes("1"));
  await m.goto(B + "/administration/");
  await m.waitForSelector("#anmodninger:not([hidden])");
  tjek("anmodningen står øverst under Administration", (await m.textContent("#anmodninger")).includes("Bent Bentsen"));
  await m.click("#anm-liste button.btn");
  await m.waitForSelector("dialog#link-boks[open]");
  const link = await m.inputValue("#link-felt");
  const mail = decodeURIComponent(await m.getAttribute("#mail-link", "href"));
  const sms = decodeURIComponent(await m.getAttribute("#sms-link", "href"));
  tjek("vinduet har mail, SMS og kopier med linket", mail.startsWith("mailto:bent@test.dk") && mail.includes(link) && sms.includes(link));
  await glemt.goto(link);
  await glemt.waitForSelector("#trin-velkommen:not([hidden])");
  tjek("linket logger direkte ind", (await glemt.textContent("#vk-titel")).includes("Bent Bentsen") && !glemt.url().includes("link="));
  await glemt.fill("#vk-kode1", "BentsNyeKode1");
  await glemt.fill("#vk-kode2", "BentsNyeKode1");
  await glemt.click("#vk-form button[type=submit]");
  await glemt.waitForURL(/vagter/);
  tjek("ny adgangskode kan vælges uden den gamle", true);
  const igen = await side();
  await igen.goto(B + "/log-ind/");
  await igen.fill("#login-email", "bent@test.dk");
  await igen.fill("#login-kode", "BentsNyeKode1");
  await igen.click("#login-form button[type=submit]");
  await igen.waitForURL(B + "/");
  tjek("den nye adgangskode virker", true);
} catch (e) {
  console.error("FEJL undervejs:", e.message.split("\n")[0]);
  fejl++;
}

tjek("ingen JavaScript-fejl i browseren" + (konsol.length ? ": " + konsol.join(" | ") : ""), konsol.length === 0);
await browser.close();
console.log(fejl ? `\n${fejl} røgtest fejlede` : "\nAlle røgtest bestået");
process.exit(fejl ? 1 : 0);
