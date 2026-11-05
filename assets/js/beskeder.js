// Beskeder: kun for logget ind. Viser de seneste 100 med navn og tidspunkt.
import { api, $, h, visStatus, fejlTekst, fmtTidspunkt, hentBruger, erAdmin, kanSkrive, loginBoks, sletKnap, opdaterJaevnligt } from "./app.js";

const liste = $("#beskeder");
const status = $("#status");
const MAKS = 1000;
let mig = null;

async function hent() {
  try { vis(await api("/beskeder")); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
}

function vis(rows) {
  liste.textContent = "";
  const kort = h("div", { class: "kort" });
  if (!rows.length) kort.append(h("p", { class: "muted" }, "Ingen beskeder endnu. Skriv den første."));
  for (const b of rows) {
    const egen = String(b.bruger_id) === String(mig.id);
    const navn = b.navn || "Tidligere medlem";
    const el = h("article", { class: "besked" + (egen ? " egen" : "") },
      h("div", { class: "hoved" }, h("b", {}, navn), h("time", { class: "muted lille", datetime: b.oprettet }, fmtTidspunkt(b.oprettet))),
      h("div", { class: "tekst" }, b.tekst));
    if (egen || erAdmin(mig)) el.append(sletKnap({
      klasse: "linkknap lille", bekraeft: "Er du sikker? Klik igen for at slette",
      label: `Slet besked fra ${navn}, ${fmtTidspunkt(b.oprettet)}`,
      vedSlet: async () => {
        try { await api("/beskeder/" + b.id, { metode: "DELETE" }); visStatus(status, "Beskeden er slettet.", "ok"); hent(); }
        catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
      },
    }));
    kort.append(el);
  }
  liste.append(kort);
}

(async () => {
  mig = await hentBruger();
  if (!mig) { liste.textContent = ""; liste.append(loginBoks("Beskederne")); return; }
  const form = $("#ny-besked");
  if (kanSkrive(mig)) {
    form.hidden = false;
    const felt = form.tekst;
    const taeller = $("#taeller");
    const opdater = () => { taeller.textContent = `${felt.value.length} / ${MAKS} tegn`; };
    felt.addEventListener("input", opdater);
    opdater();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tekst = felt.value.trim();
      if (!tekst) { visStatus(status, "Skriv en besked først.", "fejl"); felt.focus(); return; }
      const knap = form.querySelector("button[type=submit]");
      knap.disabled = true;
      try {
        await api("/beskeder", { metode: "POST", data: { tekst } });
        felt.value = ""; opdater();
        visStatus(status, "Din besked er sendt.", "ok");
        hent();
      } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
      knap.disabled = false;
    });
  } else visStatus(status, "Du har kun læseadgang og kan ikke skrive beskeder.");
  await hent();
  opdaterJaevnligt(hent);
})();
