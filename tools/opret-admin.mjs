// Opretter databasens tabeller (hvis de mangler) og den første administrator.
// Brug:  DATABASE_URL=postgres://... node tools/opret-admin.mjs din@mail.dk "Dit Navn" [https://haderslevmarineforening.dk]
// Scriptet skriver et link ud, som åbnes for at vælge adgangskode.
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";

const [email, navn, adresse = "http://localhost:8080"] = process.argv.slice(2);
if (!email || !navn) { console.error('Brug: node tools/opret-admin.mjs email "Navn" [adresse]'); process.exit(1); }
const DB_URL = process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.POSTGRES_URL;
const sql = postgres(DB_URL, { ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : "require", onnotice: () => {} });
await sql.unsafe(readFileSync(new URL("../api/_skema.sql", import.meta.url), "utf8"));
const [b] = await sql`insert into brugere (email, navn, rolle) values (${email.toLowerCase()}, ${navn}, 'admin')
  on conflict (email) do update set rolle = 'admin' returning id`;
const token = randomBytes(32).toString("base64url");
await sql`delete from links where bruger_id = ${b.id}`;
await sql`insert into links (token_hash, bruger_id, udloeber) values (${createHash("sha256").update(token).digest("hex")}, ${b.id}, now() + interval '14 days')`;
console.log(`\n${navn} er administrator. Åbn dette link for at vælge adgangskode (virker i 14 dage):\n\n${adresse}/log-ind/?link=${token}\n`);
await sql.end();
