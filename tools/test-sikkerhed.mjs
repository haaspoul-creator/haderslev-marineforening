// Tester databasens sikkerhedsregler mod en LOKAL Supabase (npx supabase start).
// Kør:  node tools/test-sikkerhed.mjs
import { createClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const KODE = "Testkode123";

const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
let fejl = 0;
const tjek = (navn, ok) => { console.log(`${ok ? "OK  " : "FEJL"} ${navn}`); if (!ok) fejl++; };

async function bruger(email, navn, rolle) {
  const { data: liste } = await service.auth.admin.listUsers();
  let u = liste.users.find((x) => x.email === email);
  if (!u) ({ data: { user: u } } = await service.auth.admin.createUser({ email, password: KODE, email_confirm: true, user_metadata: { navn } }));
  await service.from("profiler").update({ rolle, navn }).eq("id", u.id);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: KODE });
  if (error) throw error;
  return { c, id: u.id };
}

const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const admin = await bruger("admin@test.dk", "Harry (admin)", "admin");
const anna = await bruger("anna@test.dk", "Anna Andersen", "medlem");
const bent = await bruger("bent@test.dk", "Bent Bentsen", "medlem");
const lis = await bruger("lis@test.dk", "Lis Læser", "laeser");

// --- Anonym besøgende ---
tjek("anonym kan se arrangementer", ((await anon.from("arrangementer").select()).data || []).length > 0);
tjek("anonym kan se nyheder", ((await anon.from("nyheder").select()).data || []).length > 0);
tjek("anonym kan IKKE se vagter", ((await anon.from("vagter").select()).data || []).length === 0);
tjek("anonym kan IKKE se beskeder", ((await anon.from("beskeder").select()).data || []).length === 0);
tjek("anonym kan IKKE se profiler/e-mails", ((await anon.from("profiler").select()).data || []).length === 0);
tjek("anonym kan IKKE oprette arrangement", !!(await anon.from("arrangementer").insert({ titel: "x", dato: "2030-01-01" })).error);

// --- Medlem ---
tjek("medlem kan IKKE oprette arrangement", !!(await anna.c.from("arrangementer").insert({ titel: "x", dato: "2030-01-01" })).error);
tjek("medlem kan IKKE oprette vagt", !!(await anna.c.from("vagter").insert({ titel: "x", dato: "2030-01-01" })).error);
const { error: rolleFejl } = await anna.c.from("profiler").update({ rolle: "admin" }).eq("id", anna.id);
const { data: annaP } = await service.from("profiler").select("rolle").eq("id", anna.id).single();
tjek("medlem kan IKKE gøre sig selv til admin", !!rolleFejl || annaP.rolle === "medlem");
await anna.c.from("profiler").update({ navn: "Anna A." }).eq("id", anna.id);
tjek("medlem kan rette eget navn", (await service.from("profiler").select("navn").eq("id", anna.id).single()).data.navn === "Anna A.");
await bent.c.from("profiler").update({ navn: "Hacket" }).eq("id", anna.id);
tjek("medlem kan IKKE rette andres navn", (await service.from("profiler").select("navn").eq("id", anna.id).single()).data.navn === "Anna A.");

// Vagt med 1 plads
const { data: v } = await admin.c.from("vagter").insert({ titel: "Testvagt", dato: "2030-01-01", pladser: 1 }).select().single();
tjek("admin kan oprette vagt", !!v);
tjek("medlem kan tage vagt", !(await anna.c.from("tilmeldinger").insert({ vagt_id: v.id, bruger_id: anna.id })).error);
const fuld = await bent.c.from("tilmeldinger").insert({ vagt_id: v.id, bruger_id: bent.id });
tjek("fuld vagt afviser næste (" + (fuld.error && fuld.error.message) + ")", !!fuld.error && /fuld/i.test(fuld.error.message));
tjek("medlem kan IKKE tilmelde en anden", !!(await bent.c.from("tilmeldinger").insert({ vagt_id: v.id, bruger_id: lis.id })).error);
await bent.c.from("tilmeldinger").delete().eq("vagt_id", v.id).eq("bruger_id", anna.id);
tjek("medlem kan IKKE afmelde en anden", ((await service.from("tilmeldinger").select().eq("vagt_id", v.id)).data || []).length === 1);
await anna.c.from("tilmeldinger").delete().eq("vagt_id", v.id).eq("bruger_id", anna.id);
tjek("medlem kan afmelde sig selv", ((await service.from("tilmeldinger").select().eq("vagt_id", v.id)).data || []).length === 0);
tjek("skrivebeskyttet kan IKKE tage vagt", !!(await lis.c.from("tilmeldinger").insert({ vagt_id: v.id, bruger_id: lis.id })).error);
tjek("skrivebeskyttet kan se vagter", ((await lis.c.from("vagter").select()).data || []).length > 0);
const { data: gammel } = await admin.c.from("vagter").insert({ titel: "Gammel", dato: "2020-01-01", pladser: 5 }).select().single();
tjek("kan IKKE tage en vagt i fortiden", !!(await anna.c.from("tilmeldinger").insert({ vagt_id: gammel.id, bruger_id: anna.id })).error);

// Beskeder
const { data: b1 } = await anna.c.from("beskeder").insert({ tekst: "Hej fra Anna", bruger_id: anna.id }).select().single();
tjek("medlem kan skrive besked", !!b1);
tjek("medlem kan IKKE skrive i en andens navn", !!(await anna.c.from("beskeder").insert({ tekst: "falsk", bruger_id: bent.id })).error);
tjek("skrivebeskyttet kan IKKE skrive besked", !!(await lis.c.from("beskeder").insert({ tekst: "x", bruger_id: lis.id })).error);
tjek("skrivebeskyttet kan læse beskeder", ((await lis.c.from("beskeder").select()).data || []).length > 0);
tjek("tom besked afvises", !!(await anna.c.from("beskeder").insert({ tekst: "   ", bruger_id: anna.id })).error);
await bent.c.from("beskeder").delete().eq("id", b1.id);
tjek("medlem kan IKKE slette andres besked", ((await service.from("beskeder").select().eq("id", b1.id)).data || []).length === 1);
const { data: b2 } = await bent.c.from("beskeder").insert({ tekst: "Bents besked", bruger_id: bent.id }).select().single();
await bent.c.from("beskeder").delete().eq("id", b2.id);
tjek("medlem kan slette egen besked", ((await service.from("beskeder").select().eq("id", b2.id)).data || []).length === 0);
await admin.c.from("beskeder").delete().eq("id", b1.id);
tjek("admin kan slette alle beskeder", ((await service.from("beskeder").select().eq("id", b1.id)).data || []).length === 0);

// Admin
const { data: a } = await admin.c.from("arrangementer").insert({ titel: "Test", dato: "2030-01-01" }).select().single();
tjek("admin kan oprette arrangement", !!a);
await admin.c.from("arrangementer").delete().eq("id", a.id);
tjek("admin kan slette arrangement", ((await service.from("arrangementer").select().eq("id", a.id)).data || []).length === 0);
await admin.c.from("profiler").update({ rolle: "laeser" }).eq("id", bent.id);
tjek("admin kan ændre roller", (await service.from("profiler").select("rolle").eq("id", bent.id).single()).data.rolle === "laeser");
await service.from("profiler").update({ rolle: "medlem" }).eq("id", bent.id);
await service.from("vagter").delete().in("id", [v.id, gammel.id]);

// Edge-funktion
const r1 = await anna.c.functions.invoke("medlemmer", { body: { handling: "inviter", email: "ny@test.dk", navn: "Ny" } });
tjek("medlem kan IKKE invitere", !!r1.error);
const r0 = await anon.functions.invoke("medlemmer", { body: { handling: "inviter", email: "ny@test.dk", navn: "Ny" } });
tjek("anonym kan IKKE invitere", !!r0.error);
const r2 = await admin.c.functions.invoke("medlemmer", { body: { handling: "inviter", email: "ny.medlem@test.dk", navn: "Nyt Medlem", rolle: "medlem", redirectTo: "http://localhost:8080/log-ind/" } });
tjek("admin kan invitere" + (r2.error ? " – " + (await r2.error.context.text()) : ""), !r2.error);
if (!r2.error) {
  const { data: p } = await service.from("profiler").select("navn, rolle").eq("id", r2.data.id).single();
  tjek("invitation opretter profil med navn", p && p.navn === "Nyt Medlem");
  const r3 = await admin.c.functions.invoke("medlemmer", { body: { handling: "fjern", id: r2.data.id } });
  tjek("admin kan fjerne medlem", !r3.error);
}
const r4 = await admin.c.functions.invoke("medlemmer", { body: { handling: "fjern", id: admin.id } });
tjek("admin kan IKKE fjerne sig selv", !!r4.error);

console.log(fejl ? `\n${fejl} test fejlede` : "\nAlle test bestået");
process.exit(fejl ? 1 : 0);
