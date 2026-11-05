// Arrangementskalender: offentlig tabel grupperet efter måned. Administratorer kan tilføje og slette.
import { api, $, h, visStatus, fejlTekst, fmtDag, fmtTid, grupperEfterMaaned, hentBruger, erAdmin, sletKnap, redigerbarForm } from "./app.js";

const liste = $("#kalender");
const status = $("#status");
let admin = false;
let editor = null;

async function hent() {
  try { vis(await api("/arrangementer")); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
}

function vis(rows) {
  liste.textContent = "";
  if (!rows.length) {
    liste.append(h("div", { class: "kort" }, h("p", { class: "muted" }, "Der er ingen kommende arrangementer i kalenderen lige nu. Kig forbi igen senere.")));
    return;
  }
  const kolonner = ["Dato", "Tid", "Arrangement", "Sted"];
  if (admin) kolonner.push("Handling");
  const tabel = h("table", { class: "tabel kortvisning" },
    h("caption", { class: "skjult-tekst" }, "Kommende arrangementer"),
    h("thead", {}, h("tr", {}, kolonner.map((k) => h("th", { scope: "col" }, k)))));
  for (const gruppe of grupperEfterMaaned(rows)) {
    const tb = h("tbody", {}, h("tr", { class: "maaned" }, h("th", { colspan: kolonner.length, scope: "colgroup" }, gruppe.maaned)));
    for (const a of gruppe.raekker) {
      tb.append(h("tr", {},
        h("td", { class: "dato", "data-label": "Dato" }, fmtDag(a.dato)),
        h("td", { "data-label": "Tid" }, a.tid ? fmtTid(a.tid) : "–"),
        h("td", { class: "titelcelle" }, h("b", {}, a.titel), a.beskrivelse ? h("span", { class: "beskrivelse" }, a.beskrivelse) : null),
        h("td", { "data-label": "Sted" }, a.sted || "–"),
        admin ? h("td", { class: "handlinger" }, h("button", { class: "btn sm alt", type: "button", "aria-label": `Ret ${a.titel} ${fmtDag(a.dato)}`, onclick: () => editor.ret(a) }, "Ret"), sletKnap({
          label: `Slet ${a.titel} ${fmtDag(a.dato)}`,
          vedSlet: async () => {
            try { await api("/arrangementer/" + a.id, { metode: "DELETE" }); visStatus(status, `"${a.titel}" er slettet.`, "ok"); hent(); }
            catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
          },
        })) : null));
    }
    tabel.append(tb);
  }
  liste.append(h("div", { class: "tabel-ramme", tabindex: "0", role: "region", "aria-label": "Arrangementer (kan rulles sidelæns)" }, tabel),
    h("p", { class: "rul-hint" }, "Stryg sidelæns på tabellen for at se alle kolonner."));
}

(async () => {
  admin = erAdmin(await hentBruger());
  if (admin) {
    $("#admin-arr").hidden = false;
    editor = redigerbarForm({
      form: $("#ny-arrangement"), boks: $("#admin-arr"), overskrift: "Tilføj arrangement", knaptekst: "Tilføj til kalenderen",
      gem: async (data, id) => {
        try {
          if (id) await api("/arrangementer/" + id, { metode: "PATCH", data });
          else await api("/arrangementer", { metode: "POST", data });
          visStatus(status, id ? `"${data.titel.trim()}" er rettet.` : `"${data.titel.trim()}" er tilføjet til kalenderen.`, "ok");
          hent();
          return true;
        } catch (err) { visStatus(status, fejlTekst(err), "fejl"); return false; }
      },
    });
  }
  hent();
})();
