// Arrangementskalender: offentlig tabel grupperet efter måned. Administratorer kan tilføje og slette.
import { sb, $, h, visStatus, idagISO, fmtDag, fmtTid, grupperEfterMaaned, danskFejl, hentBruger, erAdmin } from "./app.js";

const liste = $("#kalender");
const status = $("#status");
let admin = false;

async function hent() {
  const { data, error } = await sb.from("arrangementer")
    .select("id, titel, dato, tid, sted, beskrivelse")
    .gte("dato", idagISO()).order("dato").order("tid", { nullsFirst: true });
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  vis(data);
}

function vis(rows) {
  liste.textContent = "";
  if (!rows.length) {
    liste.append(h("div", { class: "kort" }, h("p", { class: "muted" }, "Der er ingen kommende arrangementer i kalenderen lige nu. Kig forbi igen senere.")));
    return;
  }
  const kolonner = ["Dato", "Tid", "Arrangement", "Sted"];
  if (admin) kolonner.push("Handling");
  const tabel = h("table", { class: "tabel" },
    h("caption", { class: "skjult-tekst" }, "Kommende arrangementer"),
    h("thead", {}, h("tr", {}, kolonner.map((k) => h("th", { scope: "col" }, k)))));
  for (const gruppe of grupperEfterMaaned(rows)) {
    const tb = h("tbody", {}, h("tr", { class: "maaned" }, h("th", { colspan: kolonner.length, scope: "colgroup" }, gruppe.maaned)));
    for (const a of gruppe.raekker) {
      tb.append(h("tr", {},
        h("td", { class: "dato" }, fmtDag(a.dato)),
        h("td", {}, a.tid ? fmtTid(a.tid) : "–"),
        h("td", {}, h("b", {}, a.titel), a.beskrivelse ? h("span", { class: "beskrivelse" }, a.beskrivelse) : null),
        h("td", {}, a.sted || "–"),
        admin ? h("td", {}, sletKnap(a)) : null));
    }
    tabel.append(tb);
  }
  liste.append(h("div", { class: "tabel-ramme", tabindex: "0", role: "region", "aria-label": "Arrangementer (kan rulles sidelæns)" }, tabel), h("p", { class: "rul-hint" }, "Stryg sidelæns på tabellen for at se alle kolonner."));
}

function sletKnap(a) {
  const knap = h("button", { class: "btn sm fare", type: "button" }, "Slet");
  knap.setAttribute("aria-label", `Slet ${a.titel} ${fmtDag(a.dato)}`);
  knap.addEventListener("click", async () => {
    if (!knap.dataset.sikker) { knap.dataset.sikker = "1"; knap.textContent = "Er du sikker?"; return; }
    knap.disabled = true;
    const { error } = await sb.from("arrangementer").delete().eq("id", a.id);
    if (error) { visStatus(status, danskFejl(error), "fejl"); knap.disabled = false; return; }
    visStatus(status, `"${a.titel}" er slettet.`, "ok");
    hent();
  });
  return knap;
}

async function start() {
  const { profil } = await hentBruger();
  admin = erAdmin(profil);
  const form = $("#ny-arrangement");
  if (admin && form) {
    $("#admin-arr").hidden = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const ny = {
        titel: fd.get("titel").trim(), dato: fd.get("dato"), tid: fd.get("tid") || null,
        sted: fd.get("sted").trim(), beskrivelse: fd.get("beskrivelse").trim()
      };
      if (!ny.titel || !ny.dato) { visStatus(status, "Udfyld mindst titel og dato.", "fejl"); return; }
      const knap = form.querySelector("button[type=submit]");
      knap.disabled = true;
      const { error } = await sb.from("arrangementer").insert(ny);
      knap.disabled = false;
      if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
      form.reset();
      visStatus(status, `"${ny.titel}" er tilføjet til kalenderen.`, "ok");
      hent();
    });
  }
  hent();
}
start();
