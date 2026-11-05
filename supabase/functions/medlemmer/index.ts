// Edge Function "medlemmer": lader administratorer invitere og fjerne medlemmer fra hjemmesiden.
// Bruger service-nøglen, som kun findes på Supabase' server og aldrig sendes til browseren.
// Ingen eksterne pakker – kalder Supabase' egne API'er direkte.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLLER = ["admin", "medlem", "laeser"];
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const somService = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function fejltekst(r: Response) {
  try { const j = await r.json(); return j.msg || j.message || j.error_description || j.error || `Fejl ${r.status}`; }
  catch { return `Fejl ${r.status}`; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return svar(405, { fejl: "Kun POST" });

  // Hvem kalder? Tjek med kalderens egen adgang, at vedkommende er logget ind og er administrator.
  const auth = req.headers.get("Authorization") ?? "";
  const somKalder = { apikey: ANON, Authorization: auth, "Content-Type": "application/json" };
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: somKalder });
  if (!u.ok) return svar(401, { fejl: "Du skal være logget ind." });
  const kalder = await u.json();
  const a = await fetch(`${URL_}/rest/v1/rpc/er_admin`, { method: "POST", headers: somKalder, body: "{}" });
  if (!a.ok || (await a.json()) !== true) return svar(403, { fejl: "Kun administratorer kan gøre dette." });

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return svar(400, { fejl: "Ugyldig forespørgsel." }); }

  if (body.handling === "inviter") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const navn = String(body.navn ?? "").trim().slice(0, 80);
    const rolle = ROLLER.includes(body.rolle) ? body.rolle : "medlem";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return svar(400, { fejl: "Skriv en gyldig e-mail." });
    if (!navn) return svar(400, { fejl: "Skriv medlemmets navn." });

    const redirect = typeof body.redirectTo === "string" ? `?redirect_to=${encodeURIComponent(body.redirectTo)}` : "";
    const r = await fetch(`${URL_}/auth/v1/invite${redirect}`, {
      method: "POST", headers: somService, body: JSON.stringify({ email, data: { navn } }),
    });
    if (!r.ok) return svar(400, { fejl: await fejltekst(r) });
    const ny = await r.json();
    await fetch(`${URL_}/rest/v1/profiler?id=eq.${ny.id}`, {
      method: "PATCH", headers: somService, body: JSON.stringify({ navn, rolle }),
    });
    return svar(200, { ok: true, id: ny.id });
  }

  if (body.handling === "fjern") {
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return svar(400, { fejl: "Mangler bruger." });
    if (id === kalder.id) return svar(400, { fejl: "Du kan ikke fjerne dig selv." });
    const r = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: somService });
    if (!r.ok) return svar(400, { fejl: await fejltekst(r) });
    return svar(200, { ok: true });
  }

  return svar(400, { fejl: "Ukendt handling." });
});
