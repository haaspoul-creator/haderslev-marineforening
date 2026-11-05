// Beskeder: kun for logget ind. Viser de seneste 100 med navn og tidspunkt.
import { sb, $, h, visStatus, fmtTidspunkt, danskFejl, hentBruger, erAdmin, kanSkrive, loginBoks } from "./app.js";

const liste = $("#beskeder");
const status = $("#status");
const MAKS = 1000;
let profil = null;

async function hent() {
  const { data, error } = await sb.from("beskeder")
    .select("id, tekst, oprettet, bruger_id, profiler(navn)")
    .order("oprettet", { ascending: false }).limit(100);
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  vis(data);
}

function vis(rows) {
  liste.textContent = "";
  const kort = h("div", { class: "kort" });
  if (!rows.length) kort.append(h("p", { class: "muted" }, "Ingen beskeder endnu. Skriv den første."));
  const admin = erAdmin(profil);
  for (const b of rows) {
    const egen = b.bruger_id === profil.id;
    const navn = (b.profiler && b.profiler.navn) || "Tidligere medlem";
    const el = h("article", { class: "besked" + (egen ? " egen" : "") },
      h("div", { class: "hoved" }, h("b", {}, navn), h("time", { class: "muted lille", datetime: b.oprettet }, fmtTidspunkt(b.oprettet))),
      h("div", { class: "tekst" }, b.tekst));
    if (egen || admin) el.append(sletKnap(b, navn));
    kort.append(el);
  }
  liste.append(kort);
}

function sletKnap(b, navn) {
  const knap = h("button", { class: "linkknap lille", type: "button", "aria-label": `Slet besked fra ${navn}, ${fmtTidspunkt(b.oprettet)}` }, "Slet");
  knap.addEventListener("click", async () => {
    if (!knap.dataset.sikker) { knap.dataset.sikker = "1"; knap.textContent = "Er du sikker? Klik igen for at slette"; return; }
    knap.disabled = true;
    const { error } = await sb.from("beskeder").delete().eq("id", b.id);
    if (error) { visStatus(status, danskFejl(error), "fejl"); knap.disabled = false; return; }
    visStatus(status, "Beskeden er slettet.", "ok");
    hent();
  });
  return knap;
}

async function start() {
  const bruger = await hentBruger();
  if (!bruger.session) { liste.textContent = ""; liste.append(loginBoks("Beskederne")); return; }
  profil = bruger.profil;

  const form = $("#ny-besked");
  if (kanSkrive(profil)) {
    form.hidden = false;
    const felt = form.tekst;
    const taeller = $("#taeller");
    const opdaterTaeller = () => { taeller.textContent = `${felt.value.length} / ${MAKS} tegn`; };
    felt.addEventListener("input", opdaterTaeller);
    opdaterTaeller();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tekst = felt.value.trim();
      if (!tekst) { visStatus(status, "Skriv en besked først.", "fejl"); felt.focus(); return; }
      const knap = form.querySelector("button[type=submit]");
      knap.disabled = true;
      const { error } = await sb.from("beskeder").insert({ tekst, bruger_id: profil.id });
      knap.disabled = false;
      if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
      felt.value = "";
      opdaterTaeller();
      visStatus(status, "Din besked er sendt.", "ok");
      hent();
    });
  } else {
    visStatus(status, "Du har kun læseadgang og kan ikke skrive beskeder.", "");
  }

  await hent();
  sb.channel("beskeder").on("postgres_changes", { event: "*", schema: "public", table: "beskeder" }, hent).subscribe();
}
start();
