// Administration: inviter medlemmer, ret roller, tilføj nyheder (fx Ankerposten som PDF).
import { sb, $, h, visStatus, danskFejl, hentBruger, erAdmin, fmtDatoLang, idagISO } from "./app.js";

const status = $("#status");
let mig = null;
const ROLLER = [["medlem", "Medlem"], ["admin", "Administrator"], ["laeser", "Skrivebeskyttet"]];

async function kaldFunktion(body) {
  const { data, error } = await sb.functions.invoke("medlemmer", { body });
  if (error) {
    let besked = error.message;
    try { const j = await error.context.json(); besked = j.fejl || besked; } catch (_) { /* ingen JSON */ }
    throw new Error(besked);
  }
  return data;
}

// ---------- Medlemmer ----------
async function hentMedlemmer() {
  const { data, error } = await sb.from("profiler").select("id, navn, email, rolle, oprettet").order("navn");
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  const el = $("#medlemmer");
  el.textContent = "";
  const tb = h("tbody");
  for (const p of data) {
    const valg = h("select", { "aria-label": `Rolle for ${p.navn}` },
      ROLLER.map(([v, t]) => h("option", { value: v, selected: p.rolle === v }, t)));
    valg.disabled = p.id === mig.id; // man kan ikke fjerne sin egen admin-rolle ved et uheld
    valg.addEventListener("change", async () => {
      const { error } = await sb.from("profiler").update({ rolle: valg.value }).eq("id", p.id);
      if (error) visStatus(status, danskFejl(error), "fejl");
      else visStatus(status, `${p.navn} er nu ${valg.selectedOptions[0].textContent.toLowerCase()}.`, "ok");
    });
    const fjern = h("button", { class: "btn sm fare", type: "button", "aria-label": `Fjern ${p.navn}` }, "Fjern");
    fjern.hidden = p.id === mig.id;
    fjern.addEventListener("click", async () => {
      if (!fjern.dataset.sikker) { fjern.dataset.sikker = "1"; fjern.textContent = "Er du sikker?"; return; }
      fjern.disabled = true;
      try { await kaldFunktion({ handling: "fjern", id: p.id }); visStatus(status, `${p.navn} er fjernet.`, "ok"); hentMedlemmer(); }
      catch (e) { visStatus(status, danskFejl(e), "fejl"); fjern.disabled = false; }
    });
    tb.append(h("tr", {},
      h("td", {}, h("b", {}, p.navn), p.id === mig.id ? h("span", { class: "maerke" }, "Dig") : null),
      h("td", {}, p.email || ""),
      h("td", {}, valg),
      h("td", {}, fjern)));
  }
  el.append(h("div", { class: "tabel-ramme", tabindex: "0", role: "region", "aria-label": "Medlemmer" },
    h("table", { class: "tabel" },
      h("thead", {}, h("tr", {}, ["Navn", "E-mail", "Rolle", "Handling"].map((k) => h("th", { scope: "col" }, k)))), tb)));
  $("#antal").textContent = `${data.length} brugere`;
}

$("#inviter").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    await kaldFunktion({ handling: "inviter", email: f.email.value.trim(), navn: f.navn.value.trim(), rolle: f.rolle.value, redirectTo: location.origin + "/log-ind/" });
    visStatus(status, `Invitationen er sendt til ${f.email.value.trim()}.`, "ok");
    f.reset();
    hentMedlemmer();
  } catch (err) {
    visStatus(status, danskFejl(err), "fejl");
  } finally { knap.disabled = false; }
});

// ---------- Nyheder ----------
async function hentNyheder() {
  const { data, error } = await sb.from("nyheder").select("id, titel, dato, pdf_url").order("dato", { ascending: false });
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  const ul = $("#nyheder");
  ul.textContent = "";
  if (!data.length) ul.append(h("li", { class: "muted" }, "Ingen nyheder endnu."));
  for (const n of data) {
    const slet = h("button", { class: "linkknap lille", type: "button", "aria-label": `Slet nyheden ${n.titel}` }, "Slet");
    slet.addEventListener("click", async () => {
      if (!slet.dataset.sikker) { slet.dataset.sikker = "1"; slet.textContent = "Er du sikker?"; return; }
      const { error } = await sb.from("nyheder").delete().eq("id", n.id);
      if (error) visStatus(status, danskFejl(error), "fejl"); else { visStatus(status, "Nyheden er slettet.", "ok"); hentNyheder(); }
    });
    ul.append(h("li", {}, h("b", {}, n.titel), " · ", h("span", { class: "muted" }, fmtDatoLang(n.dato)),
      n.pdf_url ? [" · ", h("a", { href: n.pdf_url }, "PDF")] : null, " · ", slet));
  }
}

$("#ny-nyhed").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    let pdf_url = null;
    const fil = f.pdf.files[0];
    if (fil) {
      if (fil.type !== "application/pdf") throw new Error("Filen skal være en PDF.");
      const navn = `${f.dato.value || idagISO()}-${fil.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
      const { error: upErr } = await sb.storage.from("dokumenter").upload(navn, fil, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      pdf_url = sb.storage.from("dokumenter").getPublicUrl(navn).data.publicUrl;
    }
    const { error } = await sb.from("nyheder").insert({ titel: f.titel.value.trim(), tekst: f.tekst.value.trim(), dato: f.dato.value || idagISO(), pdf_url });
    if (error) throw error;
    visStatus(status, "Nyheden er offentliggjort på forsiden.", "ok");
    f.reset();
    hentNyheder();
  } catch (err) {
    visStatus(status, danskFejl(err), "fejl");
  } finally { knap.disabled = false; }
});

async function start() {
  const { session, profil } = await hentBruger();
  if (!session) { location.href = "/log-ind/?tilbage=/administration/"; return; }
  if (!erAdmin(profil)) { $("#indhold").hidden = true; visStatus(status, "Denne side er kun for administratorer.", "fejl"); return; }
  mig = profil;
  $("#indhold").hidden = false;
  $("#ny-nyhed").dato.value = idagISO();
  hentMedlemmer();
  hentNyheder();
}
start();
