// Slopkisten: varer med varenummer, kurv og bestilling for medlemmer; oversigt og udskrift for bestyrelsen.
import { api, $, h, visStatus, fejlTekst, fmtTidspunkt, hentBruger, erAdmin, kanSkrive, sletKnap } from "./app.js";

const status = $("#status");
let mig = null;
let katalog = { varer: [] };
let kategori = "";
const STATUS = { ny: "Ny", bestilt: "Bestilt hjem", klar: "Klar til afhentning", udleveret: "Udleveret", annulleret: "Annulleret" };

// ---------- Kurv (gemmes i browseren) ----------
const KURV = "hmf_slopkurv";
const laesKurv = () => { try { return JSON.parse(localStorage.getItem(KURV)) || []; } catch { return []; } };
const gemKurv = (k) => { try { localStorage.setItem(KURV, JSON.stringify(k)); } catch { /* privat vindue */ } visKurv(); };
const vareFor = (id) => katalog.varer.find((v) => v.id === id);
const varenrTekst = (v) => [v.varenr, v.tekst].filter(Boolean).join(" – ") || "Standard";

function laegIKurv(vare, variant, antal) {
  const k = laesKurv();
  const findes = k.find((l) => l.vare === vare.id && l.variant === variant);
  if (findes) findes.antal = Math.min(50, findes.antal + antal); else k.push({ vare: vare.id, variant, antal });
  gemKurv(k);
  const v = vare.varianter[variant];
  visStatus(status, `${antal} × ${vare.titel}${v.tekst ? " (" + v.tekst + ")" : ""} er lagt i din bestilling.`, "ok");
}

function visKurv() {
  const el = $("#kurv-indhold");
  const k = laesKurv().filter((l) => vareFor(l.vare)?.varianter[l.variant]);
  const n = k.reduce((s, l) => s + l.antal, 0);
  $("#kurv-antal").hidden = !n; $("#kurv-antal").textContent = n;
  $("#kurv-knap").hidden = !n; $("#kurv-knap-antal").textContent = `(${n})`;
  el.textContent = "";
  if (!mig) {
    el.append(h("p", { class: "muted" }, "Kun medlemmer kan bestille fra slopkisten."),
      h("a", { class: "btn", href: "/log-ind/?tilbage=/slopkisten/" }, "Log ind for at bestille"));
    return;
  }
  if (!kanSkrive(mig)) { el.append(h("p", { class: "muted" }, "Du har kun læseadgang og kan ikke bestille.")); return; }
  if (!k.length) { el.append(h("p", { class: "muted" }, "Kurven er tom. Vælg størrelse og antal ved en vare, og tryk \"Læg i kurv\".")); return; }
  const ul = h("ul", { class: "kurv-linjer" });
  k.forEach((l) => {
    const v = vareFor(l.vare), va = v.varianter[l.variant];
    const antal = h("input", { type: "number", min: "1", max: "50", value: String(l.antal), "aria-label": `Antal ${v.titel}`, inputmode: "numeric" });
    antal.addEventListener("change", () => { const kk = laesKurv(); const x = kk.find((y) => y.vare === l.vare && y.variant === l.variant); if (x) { x.antal = Math.min(50, Math.max(1, Number(antal.value) || 1)); gemKurv(kk); } });
    ul.append(h("li", {},
      h("div", {}, h("b", {}, v.titel), h("span", { class: "muted lille" }, varenrTekst(va))),
      antal,
      h("button", { class: "fjern-knap", type: "button", "aria-label": `Fjern ${v.titel} fra bestillingen`, onclick: () => gemKurv(laesKurv().filter((y) => !(y.vare === l.vare && y.variant === l.variant))) }, "×")));
  });
  const TLF = "hmf_slop_telefon";
  let gemtTlf = ""; try { gemtTlf = localStorage.getItem(TLF) || ""; } catch { /* privat vindue */ }
  const felt = (id, navn, label, attrs) => [h("label", { for: id }, label, h("span", { class: "kraevet", "aria-hidden": "true" }, " *")),
    h("input", { id, name: navn, required: true, "aria-required": "true", ...attrs })];
  const form = h("form", { class: "kurv-form", novalidate: true },
    h("p", { class: "muted lille", style: "margin:12px 0 0" }, "Felter med * skal udfyldes, så slopbestyreren kan kontakte dig."),
    ...felt("k-navn", "navn", "Navn", { autocomplete: "name", maxlength: "80", value: mig.navn || "" }),
    ...felt("k-email", "email", "E-mail", { type: "email", autocomplete: "email", maxlength: "200", value: mig.email || "" }),
    ...felt("k-tlf", "telefon", "Telefon", { type: "tel", autocomplete: "tel", maxlength: "30", inputmode: "tel", value: gemtTlf }),
    h("label", { for: "k-bem" }, "Bemærkning ", h("span", { class: "muted" }, "(valgfri)")),
    h("textarea", { id: "k-bem", name: "bemaerkning", rows: "2", maxlength: "1000", placeholder: "Fx broderi med afdelingsnavn" }),
    h("p", { class: "note fejl", id: "k-fejl", role: "alert", hidden: true }),
    h("div", { class: "form-handling" }, h("button", { class: "btn", type: "submit" }, "Send bestilling"),
      h("button", { class: "btn alt sm", type: "button", onclick: () => gemKurv([]) }, "Tøm")));
  form.addEventListener("input", (e) => { form.querySelector("#k-fejl").hidden = true; e.target.removeAttribute("aria-invalid"); });
  form.addEventListener("submit", sendBestilling);
  el.append(ul, form);
}

async function sendBestilling(e) {
  e.preventDefault();
  const f = e.target, knap = f.querySelector("button[type=submit]"), fejl = f.querySelector("#k-fejl");
  const vis = (felt, tekst) => { fejl.textContent = tekst; fejl.hidden = false; felt.setAttribute("aria-invalid", "true"); felt.focus(); };
  const navn = f.navn.value.trim(), email = f.email.value.trim(), telefon = f.telefon.value.trim();
  if (!navn) return vis(f.navn, "Skriv dit navn.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return vis(f.email, "Skriv en gyldig e-mail.");
  if (!/^\d{8,15}$/.test(telefon.replace(/[\s+()-]/g, ""))) return vis(f.telefon, "Skriv dit telefonnummer (mindst 8 cifre).");
  knap.disabled = true;
  try {
    const r = await api("/slopkisten/bestil", { metode: "POST", data: { linjer: laesKurv(), navn, email, telefon, bemaerkning: f.bemaerkning.value } });
    try { localStorage.setItem("hmf_slop_telefon", telefon); } catch { /* privat vindue */ }
    gemKurv([]);
    visStatus(status, `Tak, ${navn}! Din bestilling nr. ${r.id} er sendt til slopbestyreren, som kontakter dig på ${telefon} eller ${email} om pris og udlevering.`, "ok");
    hentMine();
    if (erAdmin(mig)) hentAlle();
  } catch (err) { fejl.textContent = fejlTekst(err); fejl.hidden = false; knap.disabled = false; }
}

// ---------- Varer ----------
function visVarer() {
  const soeg = $("#s-soeg").value.trim().toLowerCase();
  const liste = katalog.varer.filter((v) => (!kategori || v.kategori === kategori) &&
    (!soeg || (v.titel + " " + v.varianter.map((x) => x.varenr + " " + x.tekst).join(" ")).toLowerCase().includes(soeg)));
  const el = $("#varer");
  el.textContent = "";
  $("#s-antal").textContent = `${liste.length} ${liste.length === 1 ? "vare" : "varer"}`;
  if (!liste.length) { el.append(h("p", { class: "muted" }, "Ingen varer matcher din søgning.")); return; }
  for (const v of liste) {
    const id = "v-" + v.id;
    const valg = v.varianter.length > 1
      ? h("select", { id: id + "-var", "aria-label": `Størrelse/variant for ${v.titel}` }, v.varianter.map((x, i) => h("option", { value: String(i) }, varenrTekst(x))))
      : null;
    const nrTekst = h("p", { class: "varenr" }, v.varianter.length > 1 ? `${v.varianter.length} varianter` : (v.varianter[0].varenr ? "Varenr. " + v.varianter[0].varenr : ""));
    if (valg) valg.addEventListener("change", () => { nrTekst.textContent = v.varianter[valg.value].varenr ? "Varenr. " + v.varianter[valg.value].varenr : ""; });
    const antal = h("input", { id: id + "-antal", type: "number", min: "1", max: "50", value: "1", inputmode: "numeric" });
    const kan = mig && kanSkrive(mig);
    el.append(h("article", { class: "vare" },
      h("img", { src: v.billede, alt: v.titel, loading: "lazy", width: "300", height: "300" }),
      h("div", { class: "vare-tekst" },
        h("p", { class: "eyebrow" }, v.kategori),
        h("h3", {}, v.titel),
        nrTekst,
        v.noter.length ? h("p", { class: "muted lille" }, v.noter.join(" ")) : null,
        valg ? h("div", {}, h("label", { for: id + "-var" }, "Størrelse / variant"), valg) : null,
        kan ? h("div", { class: "vare-koeb" },
          h("div", {}, h("label", { for: id + "-antal" }, "Antal"), antal),
          h("button", { class: "btn sm", type: "button", "aria-label": `Læg ${v.titel} i kurv`,
            onclick: () => { const n = Math.min(50, Math.max(1, Number(antal.value) || 1)); laegIKurv(v, valg ? Number(valg.value) : 0, n); antal.value = 1; } }, "Læg i kurv")) : null)));
  }
}

function visKategorier() {
  const el = $("#s-kategorier");
  const kat = [...new Set(katalog.varer.map((v) => v.kategori))];
  el.textContent = "";
  for (const k of ["", ...kat]) {
    const b = h("button", { type: "button", class: "chip", "aria-pressed": String(k === kategori) }, k || "Alle");
    b.addEventListener("click", () => { kategori = k; visKategorier(); visVarer(); });
    el.append(b);
  }
}

// ---------- Bestillinger ----------
function bestillingsKort(b, admin) {
  const art = h("article", { class: "bestilling kort", "data-id": b.id },
    h("header", { class: "bestilling-hoved" },
      h("img", { class: "print-logo", src: "/assets/img/logo-192.png", alt: "", width: "56", height: "56" }),
      h("div", {},
        h("p", { class: "print-kun eyebrow" }, "Haderslev Marineforening · Slopkisten"),
        h("h3", {}, `Bestilling nr. ${b.id}`),
        h("p", { class: "muted lille" }, fmtTidspunkt(b.oprettet))),
      h("span", { class: `status-maerke slop-${b.status}` }, STATUS[b.status])),
    admin ? h("dl", { class: "medlemsinfo" },
      h("dt", {}, "Medlem"), h("dd", {}, b.navn),
      h("dt", {}, "E-mail"), h("dd", {}, h("a", { href: "mailto:" + b.email }, b.email)),
      h("dt", {}, "Telefon"), h("dd", {}, b.telefon ? h("a", { href: "tel:" + b.telefon.replace(/\s/g, "") }, b.telefon) : "–")) : null,
    h("table", { class: "tabel linjer" },
      h("thead", {}, h("tr", {}, ["Varenr.", "Vare", "Størrelse", "Antal"].map((k) => h("th", { scope: "col" }, k)))),
      h("tbody", {}, b.linjer.map((l) => h("tr", {}, h("td", { class: "mono" }, l.varenr || "–"), h("td", {}, l.titel), h("td", {}, l.variant || "–"), h("td", {}, l.antal)))),
      h("tfoot", {}, h("tr", {}, h("td", { colspan: "3" }, "I alt"), h("td", {}, b.linjer.reduce((s, l) => s + l.antal, 0))))),
    b.bemaerkning ? h("p", { class: "bemaerkning" }, h("b", {}, "Bemærkning: "), b.bemaerkning) : null,
    h("div", { class: "print-kun underskrift" }, h("span", {}, "Bestilt hjem (dato): ________________"), h("span", {}, "Udleveret (dato): ________________"), h("span", {}, "Betalt: ________________")));
  const handling = h("div", { class: "form-handling bestilling-handling" });
  if (admin) {
    const valg = h("select", { "aria-label": `Status for bestilling ${b.id}` }, Object.entries(STATUS).map(([v, t]) => h("option", { value: v, selected: b.status === v }, t)));
    valg.addEventListener("change", async () => {
      try { await api(`/slopkisten/bestillinger/${b.id}`, { metode: "PATCH", data: { status: valg.value } }); visStatus(status, `Bestilling nr. ${b.id}: ${STATUS[valg.value].toLowerCase()}.`, "ok"); hentAlle(); hentMine(); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
    });
    handling.append(valg,
      h("button", { class: "btn sm", type: "button", onclick: () => udskriv(art) }, "Udskriv"),
      sletKnap({ label: `Slet bestilling ${b.id}`, vedSlet: async () => {
        try { await api(`/slopkisten/bestillinger/${b.id}`, { metode: "DELETE" }); visStatus(status, `Bestilling nr. ${b.id} er slettet.`, "ok"); hentAlle(); hentMine(); }
        catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
      } }));
  } else if (b.status === "ny") {
    handling.append(sletKnap({ tekst: "Annuller bestilling", klasse: "btn sm fare", label: `Annuller bestilling ${b.id}`, vedSlet: async () => {
      try { await api(`/slopkisten/bestillinger/${b.id}`, { metode: "PATCH", data: { status: "annulleret" } }); visStatus(status, `Bestilling nr. ${b.id} er annulleret.`, "ok"); hentMine(); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
    } }));
  }
  if (handling.children.length) art.append(handling);
  return art;
}

function udskriv(art) {
  art.classList.add("udskriv-denne");
  document.body.classList.add("udskriv-bestilling");
  const ryd = () => { art.classList.remove("udskriv-denne"); document.body.classList.remove("udskriv-bestilling"); removeEventListener("afterprint", ryd); };
  addEventListener("afterprint", ryd);
  print();
  setTimeout(ryd, 1000);
}

async function hentMine() {
  if (!mig) return;
  let data;
  try { data = await api("/slopkisten/bestillinger"); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); return; }
  const mine = data.filter((b) => String(b.bruger_id) === String(mig.id));
  $("#mine").hidden = !mine.length;
  const el = $("#mine-bestillinger");
  el.textContent = "";
  el.append(...mine.map((b) => bestillingsKort(b, false)));
}

async function hentAlle() {
  let data;
  try { data = await api("/slopkisten/bestillinger"); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); return; }
  const f = $("#b-filter").value;
  const vis = data.filter((b) => f === "alle" || (f === "ny" ? b.status === "ny" : ["ny", "bestilt", "klar"].includes(b.status)));
  const el = $("#alle-bestillinger");
  el.textContent = "";
  if (!vis.length) { el.append(h("p", { class: "muted" }, "Ingen bestillinger at vise.")); return; }
  el.append(h("div", { class: "bestillinger" }, vis.map((b) => bestillingsKort(b, true))));
}

// ---------- Start ----------
$("#s-soeg").addEventListener("input", visVarer);
$("#kurv-knap").addEventListener("click", () => { $("#kurv").scrollIntoView({ behavior: "smooth", block: "start" }); });
(async () => {
  [mig, katalog] = await Promise.all([hentBruger(), api("/slopkisten").catch((e) => { visStatus(status, fejlTekst(e), "fejl"); return { varer: [] }; })]);
  visKategorier();
  visVarer();
  visKurv();
  hentMine();
  if (erAdmin(mig)) {
    $("#admin-bestillinger").hidden = false;
    $("#b-filter").addEventListener("change", hentAlle);
    hentAlle();
  }
})();
