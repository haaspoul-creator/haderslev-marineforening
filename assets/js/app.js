// Fælles kode for alle sider: forbindelse, login-status, menu og hjælpefunktioner.

// Læs login-type fra linket i e-mailen (invitation, ny adgangskode, login-link),
// før Supabase-klienten fjerner det fra adresselinjen.
const hashParams = new URLSearchParams(location.hash.slice(1));
export const linkType = hashParams.get("type"); // "invite" | "recovery" | "magiclink" | null
export const linkFejl = hashParams.get("error_description");

const cfg = window.HMF_CONFIG || {};
export const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
});

// ---------- DOM-hjælpere ----------
export const $ = (s, el = document) => el.querySelector(s);

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

export function visStatus(el, tekst, type = "") {
  if (!el) return;
  el.textContent = tekst || "";
  el.className = "note status" + (type ? " " + type : "");
  el.hidden = !tekst;
  if (tekst) el.setAttribute("role", type === "fejl" ? "alert" : "status");
}

// ---------- Datoer på dansk ----------
export function idagISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const tilDato = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const fmtDag = (iso) => tilDato(iso).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
export const fmtDagKort = (iso) => tilDato(iso).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
export const fmtDatoLang = (iso) => tilDato(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
export const fmtMaaned = (iso) => tilDato(iso).toLocaleDateString("da-DK", { month: "long", year: "numeric" });
export const fmtTid = (t) => (t ? t.slice(0, 5).replace(":", ".") : "");
export const fmtTidspunkt = (ts) => new Date(ts).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Grupperer en sorteret liste efter måned: [{maaned, rækker:[...]}]
export function grupperEfterMaaned(liste) {
  const ud = [];
  for (const r of liste) {
    const m = fmtMaaned(r.dato);
    if (!ud.length || ud[ud.length - 1].maaned !== m) ud.push({ maaned: m, raekker: [] });
    ud[ud.length - 1].raekker.push(r);
  }
  return ud;
}

// ---------- Fejlbeskeder på dansk ----------
export function danskFejl(err) {
  const m = (err && (err.message || err.error_description || err.msg)) || String(err || "");
  if (/Invalid login credentials/i.test(m)) return "Forkert e-mail eller adgangskode.";
  if (/Email not confirmed/i.test(m)) return "Din e-mail er ikke bekræftet endnu. Brug linket i invitationen.";
  if (/fuld/i.test(m)) return "Vagten er desværre blevet fuld.";
  if (/rate limit|too many/i.test(m)) return "For mange forsøg. Vent et par minutter og prøv igen.";
  if (/Password should be at least|weak/i.test(m)) return "Adgangskoden skal være mindst 8 tegn.";
  if (/Signups not allowed|not found|User not found/i.test(m)) return "Der findes ingen bruger med den e-mail. Kontakt bestyrelsen for at blive oprettet.";
  if (/already been registered|already registered|already exists/i.test(m)) return "Der findes allerede en bruger med den e-mail.";
  if (/row-level security|permission denied|violates/i.test(m)) return "Du har ikke adgang til at gøre dette.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Ingen forbindelse. Tjek internettet og prøv igen.";
  return "Der skete en fejl: " + m;
}

// ---------- Bruger og profil ----------
let brugerLoefte = null;
export function hentBruger() {
  if (!brugerLoefte) {
    brugerLoefte = (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { session: null, profil: null };
      const { data: profil } = await sb.from("profiler").select("id, navn, email, rolle").eq("id", session.user.id).maybeSingle();
      return { session, profil: profil || { id: session.user.id, navn: session.user.email, rolle: "laeser" } };
    })();
  }
  return brugerLoefte;
}
export const erAdmin = (p) => p && p.rolle === "admin";
export const kanSkrive = (p) => p && (p.rolle === "admin" || p.rolle === "medlem");

export async function logUd() {
  await sb.auth.signOut();
  location.href = "/";
}

// Viser en besked med login-knap, hvis siden kræver login.
export function loginBoks(hvad) {
  const tilbage = encodeURIComponent(location.pathname);
  return h("div", { class: "kort smal" },
    h("h2", {}, "Kun for medlemmer"),
    h("p", {}, `${hvad} kan kun ses af foreningens medlemmer. Log ind med den e-mail, du er oprettet med.`),
    h("p", { class: "muted lille" }, "Har du ikke en konto? Kontakt bestyrelsen, så sender vi dig en invitation."),
    h("a", { class: "btn", href: `/log-ind/?tilbage=${tilbage}` }, "Log ind"));
}

// ---------- Menu og login-felt i toppen ----------
function opsaetMenu() {
  const knap = $(".menu-knap");
  const menu = $("#hovedmenu");
  if (knap && menu) {
    knap.addEventListener("click", () => {
      const aaben = menu.classList.toggle("aaben");
      knap.setAttribute("aria-expanded", String(aaben));
    });
  }
}

async function opdaterBrugerfelt() {
  const felt = $("#bruger");
  if (!felt) return;
  const { session, profil } = await hentBruger();
  felt.textContent = "";
  if (!session) {
    felt.append(h("a", { class: "btn sm alt", href: "/log-ind/" }, "Log ind"));
    return;
  }
  felt.append(h("a", { class: "navn", href: "/log-ind/", title: "Min profil" }, profil.navn || "Min profil"));
  if (erAdmin(profil)) felt.append(h("a", { href: "/administration/" }, "Administration"));
  felt.append(h("button", { class: "btn sm alt", type: "button", onclick: logUd }, "Log ud"));
}

opsaetMenu();
opdaterBrugerfelt();
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
    brugerLoefte = null;
    // setTimeout: Supabase anbefaler ikke at kalde databasen direkte i denne callback.
    setTimeout(opdaterBrugerfelt, 0);
  }
});
