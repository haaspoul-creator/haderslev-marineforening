// Arrangementskalender: offentlig tabel grupperet efter måned, med tilmelding (navn + antal) og optælling.
// Administratorer kan tilføje, rette og slette arrangementer og se deltagerlisten.
import { api, $, h, visStatus, fejlTekst, fmtDag, fmtTid, fmtTidspunkt, grupperEfterMaaned, hentBruger, erAdmin, sletKnap, redigerbarForm, opdaterJaevnligt } from "./app.js";

const liste = $("#kalender");
const status = $("#status");
let mig = null;
let admin = false;
let editor = null;
let raekker = [];

// Tilmeldinger lavet fra denne browser (så man kan afmelde sig uden login).
const GEM = "hmf_tilmeldinger";
const egne = () => { try { return JSON.parse(localStorage.getItem(GEM)) || {}; } catch { return {}; } };
const gemEgne = (o) => { try { localStorage.setItem(GEM, JSON.stringify(o)); } catch { /* privat vindue */ } };
function mineFor(a) {
  const lokal = Object.entries(egne()).filter(([, t]) => t.arr === a.id).map(([id, t]) => ({ id, ...t }));
  const ids = new Set(lokal.map((t) => String(t.id)));
  return [...lokal, ...(a.mine || []).filter((t) => !ids.has(String(t.id)))];
}
const personer = (n) => `${n} ${n === 1 ? "person" : "personer"}`;
const naar = (a) => fmtDag(a.dato) + (a.tid ? " kl. " + fmtTid(a.tid) : "");

async function hent() {
  try { raekker = await api("/arrangementer"); vis(raekker); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
}

function tilmeldingsCelle(a) {
  if (!a.tilmelding) return h("span", { class: "muted lille" }, "Ingen tilmelding");
  const ledige = a.max_antal ? a.max_antal - a.tilmeldt : null;
  const fuld = ledige !== null && ledige <= 0;
  const mine = mineFor(a);
  const celle = h("div", { class: "tilmelding" },
    h("div", { class: "optaelling" },
      h("b", {}, a.max_antal ? `${a.tilmeldt} / ${a.max_antal}` : String(a.tilmeldt)), " tilmeldt",
      ledige !== null && !fuld ? h("span", { class: "muted lille" }, ` · ${ledige} ledige`) : null));
  for (const t of mine) {
    celle.append(h("div", { class: "min-tilmelding" }, "✓ Du har tilmeldt ", h("b", {}, `${t.navn} (${t.antal})`), " ",
      sletKnap({ tekst: "Afmeld", klasse: "linkknap lille", bekraeft: "Sikker? Tryk igen", label: `Afmeld ${t.navn} fra ${a.titel}`,
        vedSlet: () => afmeld(a, t) })));
  }
  if (fuld) celle.append(h("span", { class: "fuld" }, "Fuldt booket"));
  else celle.append(h("button", { class: "btn sm", type: "button", "aria-label": `Tilmeld til ${a.titel} ${naar(a)}`, onclick: () => aabnTilmelding(a) }, mine.length ? "Tilmeld flere" : "Tilmeld"));
  if (admin) celle.append(h("button", { class: "btn sm alt", type: "button", "aria-label": `Se deltagerlisten for ${a.titel}`, onclick: () => aabnListe(a) }, `Deltagerliste (${a.tilmeldinger})`));
  return celle;
}

function vis(rows) {
  liste.textContent = "";
  if (!rows.length) {
    liste.append(h("div", { class: "kort" }, h("p", { class: "muted" }, "Der er ingen kommende arrangementer i kalenderen lige nu. Kig forbi igen senere.")));
    return;
  }
  const kolonner = ["Dato", "Tid", "Arrangement", "Sted", "Tilmelding"];
  if (admin) kolonner.push("Handling");
  const tabel = h("table", { class: "tabel bred kortvisning" },
    h("caption", { class: "skjult-tekst" }, "Kommende arrangementer"),
    h("thead", {}, h("tr", {}, kolonner.map((k) => h("th", { scope: "col" }, k)))));
  for (const gruppe of grupperEfterMaaned(rows)) {
    const tb = h("tbody", {}, h("tr", { class: "maaned" }, h("th", { colspan: kolonner.length, scope: "colgroup" }, gruppe.maaned)));
    for (const a of gruppe.raekker) {
      tb.append(h("tr", { id: "arr-" + a.id, class: mineFor(a).length ? "min" : "" },
        h("td", { class: "dato", "data-label": "Dato" }, fmtDag(a.dato)),
        h("td", { "data-label": "Tid" }, a.tid ? fmtTid(a.tid) : "–"),
        h("td", { class: "titelcelle" }, h("b", {}, a.titel), a.beskrivelse ? h("span", { class: "beskrivelse" }, a.beskrivelse) : null),
        h("td", { "data-label": "Sted" }, a.sted || "–"),
        h("td", { class: "valgcelle" }, tilmeldingsCelle(a)),
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

async function afmeld(a, t) {
  try {
    await api(`/arrangementer/${a.id}/tilmeldinger/${t.id}`, { metode: "DELETE", data: { token: t.token || "" } });
    visStatus(status, `${t.navn} er afmeldt "${a.titel}".`, "ok");
  } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
  const o = egne(); delete o[t.id]; gemEgne(o);
  hent();
}

// ---------- Tilmeldingsvindue ----------
const dlg = h("dialog", { class: "vindue", "aria-labelledby": "tm-titel" });
dlg.innerHTML = `
  <form method="dialog" class="vindue-indhold" id="tm-form" novalidate>
    <button class="vindue-luk" type="button" value="luk" aria-label="Luk">×</button>
    <p class="eyebrow">Tilmelding</p>
    <h2 id="tm-titel"></h2>
    <p class="muted" id="tm-naar"></p>
    <p class="note" id="tm-ledige" hidden></p>
    <label for="tm-navn">Navn</label>
    <input id="tm-navn" name="navn" autocomplete="name" maxlength="80" required>
    <label for="tm-antal">Antal personer <span class="muted">(dig selv og evt. gæster)</span></label>
    <div class="antal-vaelger">
      <button type="button" class="btn alt sm" data-trin="-1" aria-label="Færre personer">−</button>
      <input id="tm-antal" name="antal" type="number" min="1" max="20" value="1" inputmode="numeric" required>
      <button type="button" class="btn alt sm" data-trin="1" aria-label="Flere personer">+</button>
    </div>
    <div class="skjult-felt" aria-hidden="true"><label for="tm-hjemmeside">Lad dette felt være tomt</label><input id="tm-hjemmeside" name="hjemmeside" tabindex="-1" autocomplete="off"></div>
    <p class="note fejl" id="tm-fejl" role="alert" hidden></p>
    <div class="form-handling"><button class="btn" type="submit" id="tm-send">Tilmeld</button><button class="btn alt sm" type="button" value="luk">Annuller</button></div>
  </form>`;
document.body.append(dlg);
const tmForm = dlg.querySelector("#tm-form");
tmForm.addEventListener("input", () => { dlg.querySelector("#tm-fejl").hidden = true; });
let aktuel = null;
dlg.querySelectorAll('[value="luk"]').forEach((b) => b.addEventListener("click", () => dlg.close()));
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
dlg.querySelectorAll("[data-trin]").forEach((b) => b.addEventListener("click", () => {
  const f = tmForm.antal; f.value = Math.min(20, Math.max(1, (Number(f.value) || 1) + Number(b.dataset.trin)));
}));

function aabnTilmelding(a) {
  aktuel = a;
  tmForm.reset();
  dlg.querySelector("#tm-titel").textContent = a.titel;
  dlg.querySelector("#tm-naar").textContent = naar(a).replace(/^./, (c) => c.toUpperCase()) + (a.sted ? " · " + a.sted : "");
  const ledige = a.max_antal ? a.max_antal - a.tilmeldt : null;
  const l = dlg.querySelector("#tm-ledige");
  l.hidden = ledige === null;
  if (ledige !== null) { l.textContent = `Der er ${ledige} ${ledige === 1 ? "ledig plads" : "ledige pladser"}.`; tmForm.antal.max = Math.min(20, ledige); }
  else tmForm.antal.max = 20;
  dlg.querySelector("#tm-fejl").hidden = true;
  if (mig && !mineFor(a).length) tmForm.navn.value = mig.navn;
  dlg.showModal();
  (tmForm.navn.value ? tmForm.antal : tmForm.navn).focus();
}

tmForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fejl = dlg.querySelector("#tm-fejl");
  const navn = tmForm.navn.value.trim();
  const antal = Number(tmForm.antal.value);
  fejl.hidden = true;
  if (!navn) { fejl.textContent = "Skriv dit navn."; fejl.hidden = false; tmForm.navn.focus(); return; }
  if (!Number.isInteger(antal) || antal < 1 || antal > Number(tmForm.antal.max)) {
    fejl.textContent = `Antal skal være mellem 1 og ${tmForm.antal.max}.`; fejl.hidden = false; tmForm.antal.focus(); return;
  }
  const knap = dlg.querySelector("#tm-send");
  knap.disabled = true;
  try {
    const r = await api(`/arrangementer/${aktuel.id}/tilmeld`, { metode: "POST", data: { navn, antal, hjemmeside: tmForm.hjemmeside.value } });
    const o = egne(); o[r.id] = { arr: aktuel.id, token: r.token, navn, antal }; gemEgne(o);
    dlg.close();
    visStatus(status, `Tak, ${navn}! ${personer(antal).replace(/^./, (c) => c.toUpperCase())} er tilmeldt "${aktuel.titel}" ${naar(aktuel)}.`, "ok");
    await hent();
    document.getElementById("arr-" + aktuel.id)?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } catch (err) {
    fejl.textContent = fejlTekst(err); fejl.hidden = false;
    hent();
  }
  knap.disabled = false;
});

// ---------- Deltagerliste (administratorer) ----------
const ldlg = h("dialog", { class: "vindue bred-vindue", "aria-labelledby": "dl-titel" });
ldlg.innerHTML = `
  <div class="vindue-indhold">
    <button class="vindue-luk" type="button" aria-label="Luk">×</button>
    <p class="eyebrow">Deltagerliste</p>
    <h2 id="dl-titel"></h2>
    <p class="muted" id="dl-naar"></p>
    <p class="optaelling-stor" id="dl-total"></p>
    <div id="dl-liste"></div>
    <div class="form-handling"><button class="btn sm" type="button" id="dl-kopier">Kopier liste</button><button class="btn alt sm" type="button" id="dl-print">Udskriv</button></div>
  </div>`;
document.body.append(ldlg);
ldlg.querySelector(".vindue-luk").addEventListener("click", () => ldlg.close());
ldlg.addEventListener("click", (e) => { if (e.target === ldlg) ldlg.close(); });
ldlg.querySelector("#dl-print").addEventListener("click", () => { document.body.classList.add("udskriv-liste"); print(); document.body.classList.remove("udskriv-liste"); });
let listeTekst = "";
ldlg.querySelector("#dl-kopier").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(listeTekst); e.target.textContent = "Kopieret!"; }
  catch { e.target.textContent = "Kunne ikke kopiere"; }
  setTimeout(() => { e.target.textContent = "Kopier liste"; }, 2000);
});

async function aabnListe(a) {
  ldlg.querySelector("#dl-titel").textContent = a.titel;
  ldlg.querySelector("#dl-naar").textContent = naar(a).replace(/^./, (c) => c.toUpperCase()) + (a.sted ? " · " + a.sted : "");
  if (!ldlg.open) ldlg.showModal();
  const el = ldlg.querySelector("#dl-liste");
  let data;
  try { data = await api(`/arrangementer/${a.id}/tilmeldinger`); } catch (e) { el.textContent = fejlTekst(e); return; }
  const sum = data.reduce((s, t) => s + t.antal, 0);
  ldlg.querySelector("#dl-total").innerHTML = "";
  ldlg.querySelector("#dl-total").append(h("b", {}, personer(sum)), ` fordelt på ${data.length} ${data.length === 1 ? "tilmelding" : "tilmeldinger"}`, a.max_antal ? ` · maks. ${a.max_antal}` : "");
  listeTekst = `${a.titel} – ${naar(a)}\n${data.map((t, i) => `${i + 1}. ${t.navn} (${t.antal})`).join("\n")}\nI alt: ${personer(sum)}`;
  el.textContent = "";
  if (!data.length) { el.append(h("p", { class: "muted" }, "Ingen tilmeldte endnu.")); return; }
  el.append(h("table", { class: "tabel deltagere" },
    h("thead", {}, h("tr", {}, ["#", "Navn", "Antal", "Tilmeldt", ""].map((k) => h("th", { scope: "col" }, k)))),
    h("tbody", {}, data.map((t, i) => h("tr", {},
      h("td", {}, i + 1),
      h("td", {}, h("b", {}, t.navn), t.medlem ? h("span", { class: "muted lille" }, " · medlem") : null),
      h("td", {}, t.antal),
      h("td", { class: "muted lille" }, fmtTidspunkt(t.oprettet)),
      h("td", {}, sletKnap({ tekst: "×", klasse: "fjern-knap", bekraeft: "Fjern?", label: `Fjern ${t.navn} fra deltagerlisten`,
        vedSlet: async () => {
          try { await api(`/arrangementer/${a.id}/tilmeldinger/${t.id}`, { metode: "DELETE" }); await aabnListe(a); hent(); }
          catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
        } })))))));
}

// ---------- Start ----------
(async () => {
  mig = await hentBruger();
  admin = erAdmin(mig);
  if (admin) {
    $("#admin-arr").hidden = false;
    editor = redigerbarForm({
      form: $("#ny-arrangement"), boks: $("#admin-arr"), overskrift: "Tilføj arrangement", knaptekst: "Tilføj til kalenderen",
      gem: async (data, id) => {
        try {
          data.tilmelding = $("#a-tilmelding").checked;
          if (id) await api("/arrangementer/" + id, { metode: "PATCH", data });
          else await api("/arrangementer", { metode: "POST", data });
          visStatus(status, id ? `"${data.titel.trim()}" er rettet.` : `"${data.titel.trim()}" er tilføjet til kalenderen.`, "ok");
          hent();
          return true;
        } catch (err) { visStatus(status, fejlTekst(err), "fejl"); return false; }
      },
    });
  }
  await hent();
  // Link fra forsiden: /arrangementskalender/?tilmeld=ID åbner tilmeldingen direkte.
  const tilmeld = new URLSearchParams(location.search).get("tilmeld");
  const a = tilmeld && raekker.find((x) => String(x.id) === tilmeld);
  if (a && a.tilmelding) { history.replaceState(null, "", location.pathname); aabnTilmelding(a); }
  opdaterJaevnligt(hent, 30000);
})();
