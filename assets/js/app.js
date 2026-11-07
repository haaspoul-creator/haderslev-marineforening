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
  // Er beskeden rullet ud af syne, vises den også kort nederst på skærmen.
  const r = el.getBoundingClientRect();
  if (tekst && (r.bottom < 70 || r.top > innerHeight)) {
    let t = document.querySelector(".toast");
    if (!t) { t = h("div", { class: "toast", "aria-hidden": "true" }); document.body.append(t); }
    t.textContent = tekst;
    t.className = "toast vis" + (type === "fejl" ? " fejl" : "");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("vis"), 4000);
  }
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
function saetMenu(aaben) {
  menu.classList.toggle("aaben", aaben);
  knap.setAttribute("aria-expanded", String(aaben));
  knap.lastChild.textContent = aaben ? "Luk" : "Menu";
}
if (knap && menu) {
  knap.addEventListener("click", () => saetMenu(!menu.classList.contains("aaben")));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menu.classList.contains("aaben")) { saetMenu(false); knap.focus(); }
    const k = document.querySelector(".konto[open]");
    if (k) { k.open = false; k.querySelector("summary").focus(); }
  });
}
// Luk kontomenuen ved klik udenfor
const smal = matchMedia("(max-width: 1279px)");
document.addEventListener("click", (e) => { const k = document.querySelector(".konto[open]"); if (k && !smal.matches && !k.contains(e.target)) k.open = false; });
// I mobilmenuen er kontopunkterne altid foldet ud.
const kontoFold = () => { const k = document.querySelector(".konto"); if (k) k.open = smal.matches; };
smal.addEventListener("change", kontoFold);

(async () => {
  const felt = $("#bruger");
  if (!felt) return;
  const b = await hentBruger();
  if (!b) return; // "Log ind"-knappen står der allerede
  felt.textContent = "";
  const rolle = { admin: "Administrator", medlem: "Medlem", laeser: "Kan kun læse" }[b.rolle] || "";
  const initialer = b.navn.split(/\s+/).map((d) => d[0]).join("").slice(0, 2).toUpperCase();
  felt.append(h("details", { class: "konto" },
    h("summary", { "aria-label": `Konto: ${b.navn}` }, h("span", { class: "initial", "aria-hidden": "true" }, initialer), h("span", { class: "kontonavn navn" }, b.navn)),
    h("div", { class: "konto-menu" },
      h("div", { class: "rolle" }, `Logget ind som ${b.navn} · ${rolle}`),
      h("a", { href: "/log-ind/" }, "Min profil"),
      h("a", { href: "/forslag/" }, "Forslag til hjemmesiden"),
      erAdmin(b) ? h("a", { href: "/administration/" }, "Administration") : null,
      h("button", { type: "button", onclick: logUd }, "Log ud"))));
  kontoFold();
})();

// Formular der både kan oprette og rette (bruges til arrangementer og vagter).
// ret(række) fylder formularen og åbner den; gem(data, id) kaldes ved indsendelse.
export function redigerbarForm({ form, boks, overskrift, knaptekst, gem }) {
  const summary = boks.querySelector("summary");
  const knap = form.querySelector("button[type=submit]");
  const annuller = h("button", { class: "btn alt sm", type: "button", hidden: true }, "Annuller");
  knap.after(annuller);
  let id = null;
  const nulstil = () => {
    id = null; form.reset();
    summary.textContent = overskrift; knap.textContent = knaptekst; annuller.hidden = true;
    form.dispatchEvent(new Event("nulstillet"));
  };
  annuller.addEventListener("click", () => { nulstil(); boks.open = false; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    knap.disabled = true;
    try { if (await gem(Object.fromEntries(new FormData(form)), id)) nulstil(); }
    finally { knap.disabled = false; }
  });
  return {
    ret(raekke) {
      id = raekke.id;
      for (const [k, v] of Object.entries(raekke)) {
        const el = form.elements[k];
        if (!el || el.type === "file") continue;
        if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
      }
      summary.textContent = `Ret "${raekke.titel}"`; knap.textContent = "Gem ændringer"; annuller.hidden = false;
      boks.open = true;
      boks.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      form.elements[0].focus({ preventScroll: true });
    },
  };
}
