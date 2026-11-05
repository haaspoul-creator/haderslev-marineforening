// Vagter: kun for logget ind. Sæt flueben for at tage en vagt, fjern det for at afmelde.
import { sb, $, h, visStatus, idagISO, fmtDag, fmtTid, grupperEfterMaaned, danskFejl, hentBruger, erAdmin, kanSkrive, loginBoks } from "./app.js";

const liste = $("#vagter");
const status = $("#status");
let profil = null;

async function hent() {
  const { data, error } = await sb.from("vagter")
    .select("id, titel, dato, tid, sted, pladser, tilmeldinger(bruger_id, oprettet, profiler(navn))")
    .gte("dato", idagISO()).order("dato").order("tid", { nullsFirst: true });
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  vis(data);
}

function vis(rows) {
  // Bevar fokus på samme flueben efter opdatering (vigtigt for tastatur og skærmlæser).
  const fokusId = document.activeElement && document.activeElement.id;
  liste.textContent = "";
  if (!rows.length) {
    liste.append(h("div", { class: "kort" }, h("p", { class: "muted" }, "Der er ingen kommende vagter lige nu.")));
    return;
  }
  const admin = erAdmin(profil);
  const skriv = kanSkrive(profil);
  const kolonner = ["Dato", "Tid", "Vagt", "Sted", "Tilmeldte", "Jeg tager vagten"];
  if (admin) kolonner.push("Handling");
  const tabel = h("table", { class: "tabel bred" },
    h("thead", {}, h("tr", {}, kolonner.map((k) => h("th", { scope: "col" }, k)))));

  for (const gruppe of grupperEfterMaaned(rows)) {
    const tb = h("tbody", {}, h("tr", { class: "maaned" }, h("th", { colspan: kolonner.length, scope: "colgroup" }, gruppe.maaned)));
    for (const v of gruppe.raekker) {
      const tilmeldte = [...v.tilmeldinger].sort((a, b) => a.oprettet.localeCompare(b.oprettet));
      const min = tilmeldte.some((t) => t.bruger_id === profil.id);
      const fuld = tilmeldte.length >= v.pladser && !min;
      const navne = tilmeldte.map((t) => (t.bruger_id === profil.id ? "dig" : (t.profiler && t.profiler.navn) || "Medlem"));

      let valg;
      if (fuld) {
        valg = h("span", { class: "fuld" }, "Fuld");
      } else {
        const id = "vagt-" + v.id;
        const cb = h("input", { type: "checkbox", id });
        cb.checked = min;
        cb.disabled = !skriv;
        cb.addEventListener("change", () => skift(v, cb));
        valg = h("label", { class: "flueben", for: id }, cb, h("span", {}, "Jeg tager vagten",
          h("span", { class: "skjult-tekst" }, `: ${v.titel}, ${fmtDag(v.dato)}`)));
      }

      tb.append(h("tr", { class: min ? "min" : "" },
        h("td", { class: "dato" }, fmtDag(v.dato)),
        h("td", {}, v.tid ? fmtTid(v.tid) : "–"),
        h("td", {}, h("b", {}, v.titel), min ? h("span", { class: "maerke" }, "Din vagt") : null),
        h("td", {}, v.sted || "–"),
        h("td", {}, h("b", {}, `${tilmeldte.length} / ${v.pladser}`), navne.length ? ": " + navne.join(", ") : ""),
        h("td", {}, valg),
        admin ? h("td", {}, sletKnap(v)) : null));
    }
    tabel.append(tb);
  }
  liste.append(h("div", { class: "tabel-ramme", tabindex: "0", role: "region", "aria-label": "Vagter (kan rulles sidelæns)" }, tabel), h("p", { class: "rul-hint" }, "Stryg sidelæns på tabellen for at se alle kolonner."));
  if (fokusId) { const el = document.getElementById(fokusId); if (el) el.focus(); }
}

async function skift(v, cb) {
  cb.disabled = true;
  let error;
  if (cb.checked) {
    ({ error } = await sb.from("tilmeldinger").insert({ vagt_id: v.id, bruger_id: profil.id }));
    if (!error) visStatus(status, `Tak! Du har taget vagten "${v.titel}" ${fmtDag(v.dato)}.`, "ok");
  } else {
    ({ error } = await sb.from("tilmeldinger").delete().eq("vagt_id", v.id).eq("bruger_id", profil.id));
    if (!error) visStatus(status, `Du er afmeldt vagten "${v.titel}" ${fmtDag(v.dato)}.`, "ok");
  }
  if (error) visStatus(status, danskFejl(error), "fejl");
  hent();
}

function sletKnap(v) {
  const knap = h("button", { class: "btn sm fare", type: "button", "aria-label": `Slet vagten ${v.titel} ${fmtDag(v.dato)}` }, "Slet");
  knap.addEventListener("click", async () => {
    if (!knap.dataset.sikker) { knap.dataset.sikker = "1"; knap.textContent = "Er du sikker?"; return; }
    knap.disabled = true;
    const { error } = await sb.from("vagter").delete().eq("id", v.id);
    if (error) { visStatus(status, danskFejl(error), "fejl"); knap.disabled = false; return; }
    visStatus(status, `Vagten "${v.titel}" er slettet.`, "ok");
    hent();
  });
  return knap;
}

async function start() {
  const bruger = await hentBruger();
  if (!bruger.session) { liste.textContent = ""; liste.append(loginBoks("Vagtplanen")); return; }
  profil = bruger.profil;
  if (!kanSkrive(profil)) visStatus(status, "Du har kun læseadgang. Du kan se vagterne, men ikke tage dem.", "");

  if (erAdmin(profil)) {
    $("#admin-vagt").hidden = false;
    const form = $("#ny-vagt");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const ny = { titel: fd.get("titel").trim(), dato: fd.get("dato"), tid: fd.get("tid") || null, sted: fd.get("sted").trim(), pladser: Number(fd.get("pladser")) || 1 };
      if (!ny.titel || !ny.dato) { visStatus(status, "Udfyld mindst titel og dato.", "fejl"); return; }
      const { error } = await sb.from("vagter").insert(ny);
      if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
      form.reset();
      form.pladser.value = 2;
      visStatus(status, `Vagten "${ny.titel}" er tilføjet.`, "ok");
      hent();
    });
  }

  await hent();
  // Opdater live, når andre tilmelder sig.
  sb.channel("vagter").on("postgres_changes", { event: "*", schema: "public", table: "tilmeldinger" }, hent)
    .on("postgres_changes", { event: "*", schema: "public", table: "vagter" }, hent).subscribe();
}
start();
