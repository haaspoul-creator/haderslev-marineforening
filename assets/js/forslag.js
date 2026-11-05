// Forslag til indhold: medlemmer skriver forslag og ser status; administratorer behandler dem.
import { api, $, h, visStatus, fejlTekst, fmtTidspunkt, hentBruger, erAdmin, loginBoks, sletKnap } from "./app.js";

const status = $("#status");
const liste = $("#liste");
const SIDER = { forside: "Forsiden", omos: "Om os", kalender: "Arrangementskalender", vagter: "Vagter", beskeder: "Beskeder", galleri: "Galleri", andet: "Andet / ny side" };
const STATUS = { ny: "Ny", igang: "I gang", udfoert: "Udført", afvist: "Ikke aktuelt" };
let mig = null;
let admin = false;

async function hent() {
  let data;
  try { data = await api("/forslag"); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); return; }
  if (admin && $("#f-filter").value === "aabne") data = data.filter((f) => f.status === "ny" || f.status === "igang");
  liste.textContent = "";
  if (!data.length) {
    liste.append(h("p", { class: "muted" }, admin ? "Ingen forslag at vise." : "Du har ikke sendt nogen forslag endnu."));
    return;
  }
  for (const f of data) liste.append(visForslag(f));
}

function visForslag(f) {
  const egen = String(f.bruger_id) === String(mig.id);
  const el = h("article", { class: "forslag" },
    h("div", { class: "hoved" },
      h("b", {}, SIDER[f.side] || f.side),
      h("span", { class: `status-maerke status-${f.status}` }, STATUS[f.status]),
      h("span", { class: "muted lille" }, (admin ? (f.navn || "Tidligere medlem") + " · " : "") + fmtTidspunkt(f.oprettet))),
    h("div", { class: "tekst" }, f.tekst),
    f.svar ? h("div", { class: "svar" }, h("b", {}, "Svar fra bestyrelsen: "), f.svar) : null);

  if (admin) {
    const id = "fs-" + f.id;
    const valg = h("select", { id: id + "-status" }, Object.entries(STATUS).map(([v, t]) => h("option", { value: v, selected: f.status === v }, t)));
    const svar = h("input", { id: id + "-svar", maxlength: "1000", value: f.svar || "", placeholder: "Kort svar til medlemmet (valgfrit)" });
    const gem = h("button", { class: "btn sm", type: "button" }, "Gem");
    gem.addEventListener("click", async () => {
      gem.disabled = true;
      try { await api("/forslag/" + f.id, { metode: "PATCH", data: { status: valg.value, svar: svar.value } }); visStatus(status, "Forslaget er opdateret.", "ok"); hent(); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
      gem.disabled = false;
    });
    el.append(h("div", { class: "behandl" },
      h("div", {}, h("label", { for: id + "-status", style: "margin-top:0" }, "Status"), valg),
      h("div", {}, h("label", { for: id + "-svar", style: "margin-top:0" }, "Svar"), svar),
      h("div", { style: "display:flex;gap:8px" }, gem, sletKnap({ label: "Slet forslaget", vedSlet: () => slet(f) }))));
  } else if (egen && f.status === "ny") {
    el.append(sletKnap({ tekst: "Træk tilbage", klasse: "linkknap lille", bekraeft: "Er du sikker? Klik igen", label: "Træk forslaget tilbage", vedSlet: () => slet(f) }));
  }
  return el;
}

async function slet(f) {
  try { await api("/forslag/" + f.id, { metode: "DELETE" }); visStatus(status, "Forslaget er fjernet.", "ok"); hent(); }
  catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
}

$("#nyt-forslag").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    await api("/forslag", { metode: "POST", data: { side: f.side.value, tekst: f.tekst.value } });
    f.reset();
    visStatus(status, "Tak for dit forslag! Du kan følge det i listen.", "ok");
    hent();
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
  knap.disabled = false;
});

(async () => {
  mig = await hentBruger();
  if (!mig) { $("#login").append(loginBoks("Forslagssiden")); return; }
  admin = erAdmin(mig);
  $("#indhold").hidden = false;
  if (admin) {
    $("#t-liste").textContent = "Alle forslag";
    $("#filter").hidden = false;
    $("#f-filter").addEventListener("change", hent);
  }
  hent();
})();
