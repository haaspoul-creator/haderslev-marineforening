// Vagter: kun for logget ind. Sæt flueben for at tage en vagt, fjern det for at afmelde.
import { api, $, h, visStatus, fejlTekst, fmtDag, fmtTid, grupperEfterMaaned, hentBruger, erAdmin, kanSkrive, loginBoks, sletKnap, opdaterJaevnligt, redigerbarForm } from "./app.js";

const liste = $("#vagter");
const status = $("#status");
let mig = null;
let editor = null;
let senesteVagter = [];

async function hent() {
  try { senesteVagter = await api("/vagter"); vis(senesteVagter); opdaterPerioder(); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
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

// ---------- Udskriv vagtliste ----------
const maanedNoegle = (iso) => iso.slice(0, 7);
function opdaterPerioder() {
  const valg = $("#u-periode");
  const nu = valg.value;
  const maaneder = [...new Set(senesteVagter.map((v) => maanedNoegle(v.dato)))];
  valg.textContent = "";
  valg.append(h("option", { value: "" }, "Alle kommende vagter"),
    ...maaneder.map((m) => h("option", { value: m }, new Date(m + "-15T12:00").toLocaleDateString("da-DK", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase()))));
  if ([...valg.options].some((o) => o.value === nu)) valg.value = nu;
  $("#udskriv-boks").hidden = !senesteVagter.length;
}

function bygUdskrift() {
  const periode = $("#u-periode").value;
  const vagter = senesteVagter.filter((v) => !periode || maanedNoegle(v.dato) === periode);
  const titel = periode ? $("#u-periode").selectedOptions[0].textContent : "Alle kommende vagter";
  const ark = $("#print-vagtliste");
  ark.textContent = "";
  ark.append(h("header", { class: "print-hoved" },
    h("img", { src: "/assets/img/logo-192.png", alt: "", width: "64", height: "64" }),
    h("div", {}, h("p", { class: "eyebrow" }, "Haderslev Marineforening"), h("h1", {}, "Vagtliste"), h("p", {}, titel)),
    h("p", { class: "udskrevet" }, "Udskrevet " + new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }))));
  const tabel = h("table", { class: "vagtliste" },
    h("thead", {}, h("tr", {}, ["Dato", "Tid", "Vagt", "Sted", "Tilmeldte"].map((k) => h("th", { scope: "col" }, k)))));
  for (const gruppe of grupperEfterMaaned(vagter)) {
    const tb = h("tbody", {}, h("tr", { class: "maaned" }, h("th", { colspan: "5", scope: "colgroup" }, gruppe.maaned)));
    for (const v of gruppe.raekker) {
      // Tilmeldte med navn, og en tom streg for hver ledig plads, så man kan skrive sig på i hånden.
      const navne = v.tilmeldte.map((t) => h("li", {}, t.navn || "Medlem"));
      const ledige = Math.max(0, v.pladser - v.tilmeldte.length);
      for (let i = 0; i < ledige; i++) navne.push(h("li", { class: "ledig" }, h("span", { class: "skjult-tekst" }, "Ledig plads")));
      tb.append(h("tr", {},
        h("td", { class: "dato" }, fmtDag(v.dato)),
        h("td", {}, v.tid ? fmtTid(v.tid) : "–"),
        h("td", {}, h("b", {}, v.titel)),
        h("td", {}, v.sted || "–"),
        h("td", {}, h("span", { class: "pladser" }, `${v.tilmeldte.length} / ${v.pladser}`), h("ol", {}, navne))));
    }
    tabel.append(tb);
  }
  ark.append(vagter.length ? tabel : h("p", {}, "Ingen vagter i perioden."),
    h("p", { class: "print-fod" }, "Skriv dig på en ledig streg, eller sæt flueben på haderslevmarineforening.dk/vagter. Spørgsmål: kontakt bestyrelsen."));
}

$("#u-print").addEventListener("click", () => {
  bygUdskrift();
  document.body.classList.add("udskriv-vagtliste");
  const ryd = () => { document.body.classList.remove("udskriv-vagtliste"); removeEventListener("afterprint", ryd); };
  addEventListener("afterprint", ryd);
  print();
  setTimeout(ryd, 1500);
});

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
  if (erAdmin(mig)) {
    const lf = $("#loerdage");
    const iAar = new Date().getFullYear();
    for (const a of [iAar, iAar + 1, iAar + 2]) lf.aar.append(new Option(String(a), String(a)));
    lf.aar.value = String(new Date().getMonth() >= 9 ? iAar + 1 : iAar); // fra oktober foreslås næste år
    $("#admin-loerdage").hidden = false;
    lf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const knap = lf.querySelector("button[type=submit]");
      knap.disabled = true;
      try {
        const r = await api("/vagter/loerdage", { metode: "POST", data: Object.fromEntries(new FormData(lf)) });
        visStatus(status, r.antal ? `${r.antal} lørdage i ${lf.aar.value} er tilføjet.` : `Alle lørdage i ${lf.aar.value} havde allerede vagten.`, "ok");
        $("#admin-loerdage").open = false;
        hent();
      } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
      knap.disabled = false;
    });
  }
  await hent();
  opdaterJaevnligt(hent);
})();
