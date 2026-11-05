// Vagter: kun for logget ind. Sæt flueben for at tage en vagt, fjern det for at afmelde.
import { api, $, h, visStatus, fejlTekst, fmtDag, fmtTid, grupperEfterMaaned, hentBruger, erAdmin, kanSkrive, loginBoks, sletKnap, opdaterJaevnligt, redigerbarForm } from "./app.js";

const liste = $("#vagter");
const status = $("#status");
let mig = null;
let editor = null;

async function hent() {
  try { vis(await api("/vagter")); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
}

function vis(rows) {
  const fokusId = document.activeElement && document.activeElement.id;
  const rulX = liste.querySelector(".tabel-ramme")?.scrollLeft || 0;
  liste.textContent = "";
  if (!rows.length) {
    liste.append(h("div", { class: "kort" }, h("p", { class: "muted" }, "Der er ingen kommende vagter lige nu.")));
    return;
  }
  const admin = erAdmin(mig);
  const skriv = kanSkrive(mig);
  const kolonner = ["Dato", "Tid", "Vagt", "Sted", "Tilmeldte", "Jeg tager vagten"];
  if (admin) kolonner.push("Handling");
  const tabel = h("table", { class: "tabel bred kortvisning" }, h("thead", {}, h("tr", {}, kolonner.map((k) => h("th", { scope: "col" }, k)))));

  for (const gruppe of grupperEfterMaaned(rows)) {
    const tb = h("tbody", {}, h("tr", { class: "maaned" }, h("th", { colspan: kolonner.length, scope: "colgroup" }, gruppe.maaned)));
    for (const v of gruppe.raekker) {
      const min = v.tilmeldte.some((t) => String(t.bruger_id) === String(mig.id));
      const fuld = v.tilmeldte.length >= v.pladser && !min;
      const navne = v.tilmeldte.map((t) => (String(t.bruger_id) === String(mig.id) ? "dig" : t.navn || "Medlem"));
      let valg;
      if (fuld) valg = h("span", { class: "fuld" }, "Fuld");
      else {
        const id = "vagt-" + v.id;
        const cb = h("input", { type: "checkbox", id });
        cb.checked = min;
        cb.disabled = !skriv;
        cb.addEventListener("change", () => skift(v, cb));
        valg = h("label", { class: "flueben", for: id }, cb,
          h("span", {}, "Jeg tager vagten", h("span", { class: "skjult-tekst" }, `: ${v.titel}, ${fmtDag(v.dato)}`)));
      }
      tb.append(h("tr", { class: min ? "min" : "" },
        h("td", { class: "dato", "data-label": "Dato" }, fmtDag(v.dato)),
        h("td", { "data-label": "Tid" }, v.tid ? fmtTid(v.tid) : "–"),
        h("td", { class: "titelcelle" }, h("b", {}, v.titel), min ? h("span", { class: "maerke" }, "Din vagt") : null),
        h("td", { "data-label": "Sted" }, v.sted || "–"),
        h("td", { "data-label": "Tilmeldte" }, h("b", {}, `${v.tilmeldte.length} / ${v.pladser}`), admin && v.tilmeldte.length
          ? h("ul", { class: "tilmeldte" }, v.tilmeldte.map((t, i) => h("li", {}, navne[i], " ", sletKnap({
              tekst: "×", klasse: "fjern-knap", bekraeft: "Fjern?", label: `Fjern ${t.navn || "medlem"} fra vagten ${v.titel}`,
              vedSlet: async () => {
                try { await api(`/vagter/${v.id}/tilmeldte/${t.bruger_id}`, { metode: "DELETE" }); visStatus(status, `${t.navn} er fjernet fra vagten "${v.titel}".`, "ok"); hent(); }
                catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
              } }))))
          : navne.length ? ": " + navne.join(", ") : ""),
        h("td", { class: "valgcelle" }, valg),
        admin ? h("td", { class: "handlinger" }, h("button", { class: "btn sm alt", type: "button", "aria-label": `Ret vagten ${v.titel} ${fmtDag(v.dato)}`, onclick: () => editor.ret(v) }, "Ret"), sletKnap({
          label: `Slet vagten ${v.titel} ${fmtDag(v.dato)}`,
          vedSlet: async () => {
            try { await api("/vagter/" + v.id, { metode: "DELETE" }); visStatus(status, `Vagten "${v.titel}" er slettet.`, "ok"); hent(); }
            catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
          },
        })) : null));
    }
    tabel.append(tb);
  }
  const ramme = h("div", { class: "tabel-ramme", tabindex: "0", role: "region", "aria-label": "Vagter (kan rulles sidelæns)" }, tabel);
  liste.append(ramme, h("p", { class: "rul-hint" }, "Stryg sidelæns på tabellen for at se alle kolonner."));
  ramme.scrollLeft = rulX;
  if (fokusId) document.getElementById(fokusId)?.focus();
}

async function skift(v, cb) {
  cb.disabled = true;
  try {
    if (cb.checked) {
      await api(`/vagter/${v.id}/tilmeld`, { metode: "POST" });
      visStatus(status, `Tak! Du har taget vagten "${v.titel}" ${fmtDag(v.dato)}.`, "ok");
    } else {
      await api(`/vagter/${v.id}/tilmeld`, { metode: "DELETE" });
      visStatus(status, `Du er afmeldt vagten "${v.titel}" ${fmtDag(v.dato)}.`, "ok");
    }
  } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
  hent();
}

(async () => {
  mig = await hentBruger();
  if (!mig) { liste.textContent = ""; liste.append(loginBoks("Vagtplanen")); return; }
  if (!kanSkrive(mig)) visStatus(status, "Du har kun læseadgang. Du kan se vagterne, men ikke tage dem.");
  if (erAdmin(mig)) {
    $("#admin-vagt").hidden = false;
    const form = $("#ny-vagt");
    form.addEventListener("nulstillet", () => { form.pladser.value = 2; });
    editor = redigerbarForm({
      form, boks: $("#admin-vagt"), overskrift: "Tilføj vagt", knaptekst: "Tilføj vagt",
      gem: async (data, id) => {
        try {
          if (id) await api("/vagter/" + id, { metode: "PATCH", data });
          else await api("/vagter", { metode: "POST", data });
          visStatus(status, id ? `Vagten "${data.titel.trim()}" er rettet.` : `Vagten "${data.titel.trim()}" er tilføjet.`, "ok");
          hent();
          return true;
        } catch (err) { visStatus(status, fejlTekst(err), "fejl"); return false; }
      },
    });
  }
  await hent();
  opdaterJaevnligt(hent);
})();
