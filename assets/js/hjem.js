// Forsiden: næste arrangement og seneste nyt hentes fra databasen.
import { sb, $, h, idagISO, fmtDag, fmtDatoLang, fmtTid } from "./app.js";
import { pdfIkon } from "./ikoner.js";

async function naesteArrangement() {
  const el = $("#naeste");
  const { data, error } = await sb.from("arrangementer").select("titel, dato, tid, sted")
    .gte("dato", idagISO()).order("dato").order("tid", { nullsFirst: true }).limit(1);
  el.textContent = "";
  if (error || !data.length) {
    el.append(h("p", { class: "muted" }, error ? "Kalenderen kunne ikke hentes lige nu." : "Der er ingen planlagte arrangementer lige nu."));
    return;
  }
  const a = data[0];
  const [, , dag] = a.dato.split("-");
  const maaned = new Date(a.dato + "T12:00").toLocaleDateString("da-DK", { month: "short" }).replace(".", "");
  el.append(h("div", { class: "dato-blok" },
    h("div", { class: "dag", "aria-hidden": "true" }, h("b", {}, Number(dag)), maaned),
    h("div", {},
      h("h3", {}, a.titel),
      h("p", { style: "margin:0" }, fmtDag(a.dato).replace(/^./, (c) => c.toUpperCase()) + (a.tid ? " kl. " + fmtTid(a.tid) : "")),
      a.sted ? h("p", { class: "muted", style: "margin:0" }, a.sted) : null)));
}

async function senesteNyt() {
  const el = $("#nyt");
  const { data, error } = await sb.from("nyheder").select("titel, tekst, pdf_url, dato").order("dato", { ascending: false }).limit(1);
  if (error || !data.length) return; // behold den statiske tekst
  const n = data[0];
  el.textContent = "";
  el.append(
    h("h3", {}, n.titel),
    h("p", { class: "muted lille" }, fmtDatoLang(n.dato)),
    n.tekst ? h("p", { style: "white-space:pre-line" }, n.tekst) : null,
    n.pdf_url ? h("a", { class: "pdf-link", href: n.pdf_url, download: "" }, pdfIkon(), "Download som PDF") : null);
}

naesteArrangement();
senesteNyt();
