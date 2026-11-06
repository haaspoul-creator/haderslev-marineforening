// Forsiden: næste arrangement og seneste nyt hentes fra databasen.
import { api, $, h, fmtDag, fmtDatoLang, fmtTid } from "./app.js";
import { pdfIkon } from "./ikoner.js";

(async () => {
  const el = $("#naeste");
  let data = [];
  let fejl = false;
  try { data = await api("/arrangementer"); } catch { fejl = true; }
  el.textContent = "";
  if (!data.length) {
    el.append(h("p", { class: "muted" }, fejl ? "Kalenderen kunne ikke hentes lige nu." : "Der er ingen planlagte arrangementer lige nu."));
    return;
  }
  const a = data[0];
  const maaned = new Date(a.dato + "T12:00").toLocaleDateString("da-DK", { month: "short" }).replace(".", "");
  el.append(h("div", { class: "dato-blok" },
    h("div", { class: "dag", "aria-hidden": "true" }, h("b", {}, Number(a.dato.slice(8))), maaned),
    h("div", {},
      h("h3", {}, a.titel),
      h("p", { style: "margin:0" }, fmtDag(a.dato).replace(/^./, (c) => c.toUpperCase()) + (a.tid ? " kl. " + fmtTid(a.tid) : "")),
      a.sted ? h("p", { class: "muted", style: "margin:0" }, a.sted) : null,
      a.tilmelding ? h("p", { style: "margin:10px 0 0;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center" },
        h("span", {}, h("b", {}, a.max_antal ? `${a.tilmeldt} / ${a.max_antal}` : a.tilmeldt), " tilmeldt"),
        a.max_antal && a.tilmeldt >= a.max_antal ? h("span", { class: "fuld" }, "Fuldt booket")
          : h("a", { class: "btn sm orange", href: `/arrangementskalender/?tilmeld=${a.id}` }, "Tilmeld dig")) : null)));
})();

(async () => {
  let data;
  try { data = await api("/nyheder"); } catch { return; } // behold den faste tekst
  if (!data.length) return;
  const n = data[0];
  const el = $("#nyt");
  el.textContent = "";
  el.append(
    h("h3", {}, n.titel),
    h("p", { class: "muted lille" }, fmtDatoLang(n.dato)),
    n.tekst ? h("p", { style: "white-space:pre-line" }, n.tekst) : null,
    n.pdf_url ? h("a", { class: "pdf-link", href: n.pdf_url }, pdfIkon(), "Download som PDF") : null);
})();
