// Fælles kode for alle sider: API-kald, login-status, menu og hjælpefunktioner.

// ---------- API ----------
export async function api(sti, { metode = "GET", data } = {}) {
  let r;
  try {
    r = await fetch("/api" + sti, {
      method: metode,
      headers: data !== undefined || metode !== "GET" ? { "Content-Type": "application/json" } : {},
      body: data !== undefined ? JSON.stringify(data) : metode !== "GET" ? "{}" : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Ingen forbindelse. Tjek internettet, og prøv igen.");
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.fejl || "Der skete en fejl. Prøv igen.");
  return json;
}

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
export const fejlTekst = (e) => (e && e.message) || "Der skete en fejl. Prøv igen.";

// Kør fn igen hvert 20. sekund, mens siden er synlig (så man ser andres ændringer).
export function opdaterJaevnligt(fn, ms = 20000) {
  setInterval(() => { if (document.visibilityState === "visible") fn(); }, ms);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fn(); });
}

// Knap der skal trykkes to gange ("Er du sikker?")
export function sletKnap({ tekst = "Slet", klasse = "btn sm fare", label, bekraeft = "Er du sikker?", vedSlet }) {
  const knap = h("button", { class: klasse, type: "button", "aria-label": label }, tekst);
  knap.addEventListener("click", async () => {
    if (!knap.dataset.sikker) { knap.dataset.sikker = "1"; knap.textContent = bekraeft; return; }
    knap.disabled = true;
    try { await vedSlet(); } finally { knap.disabled = false; }
  });
  return knap;
}

// ---------- Datoer på dansk ----------
export function idagISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const tilDato = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const fmtDag = (iso) => tilDato(iso).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
export const fmtDatoLang = (iso) => tilDato(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
export const fmtMaaned = (iso) => tilDato(iso).toLocaleDateString("da-DK", { month: "long", year: "numeric" });
export const fmtTid = (t) => (t ? t.slice(0, 5).replace(":", ".") : "");
export const fmtTidspunkt = (ts) => new Date(ts).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function grupperEfterMaaned(liste) {
  const ud = [];
  for (const r of liste) {
    const m = fmtMaaned(r.dato);
    if (!ud.length || ud[ud.length - 1].maaned !== m) ud.push({ maaned: m, raekker: [] });
    ud[ud.length - 1].raekker.push(r);
  }
  return ud;
}

// ---------- Bruger ----------
let brugerLoefte = null;
export function hentBruger() {
  if (!brugerLoefte) brugerLoefte = api("/mig").then((r) => r.bruger).catch(() => null);
  return brugerLoefte;
}
export const erAdmin = (b) => !!b && b.rolle === "admin";
export const kanSkrive = (b) => !!b && (b.rolle === "admin" || b.rolle === "medlem");

export async function logUd() {
  await api("/log-ud", { metode: "POST" }).catch(() => {});
  location.href = "/";
}

export function loginBoks(hvad) {
  const tilbage = encodeURIComponent(location.pathname);
  return h("div", { class: "kort smal" },
    h("h2", {}, "Kun for medlemmer"),
    h("p", {}, `${hvad} kan kun ses af foreningens medlemmer. Log ind med den e-mail, du er oprettet med.`),
    h("p", { class: "muted lille" }, "Har du ikke en konto? Kontakt bestyrelsen, så får du et link til at oprette dig."),
    h("a", { class: "btn", href: `/log-ind/?tilbage=${tilbage}` }, "Log ind"));
}

// ---------- Menu og login-felt i toppen ----------
const knap = $(".menu-knap");
const menu = $("#hovedmenu");
if (knap && menu) knap.addEventListener("click", () => knap.setAttribute("aria-expanded", String(menu.classList.toggle("aaben"))));

(async () => {
  const felt = $("#bruger");
  if (!felt) return;
  const b = await hentBruger();
  if (!b) return; // "Log ind"-knappen står der allerede
  felt.textContent = "";
  felt.append(h("a", { class: "navn", href: "/log-ind/", title: "Min profil" }, b.navn));
  if (erAdmin(b)) felt.append(h("a", { href: "/administration/" }, "Administration"));
  felt.append(h("button", { class: "btn sm alt", type: "button", onclick: logUd }, "Log ud"));
})();
