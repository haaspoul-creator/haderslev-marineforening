// Administration: opret medlemmer (med personligt link), ret roller, nyheder og Ankerposten.
import { api, $, h, visStatus, fejlTekst, hentBruger, erAdmin, fmtDatoLang, idagISO, sletKnap } from "./app.js";

const status = $("#status");
let mig = null;
const ROLLER = [["medlem", "Medlem"], ["admin", "Administrator"], ["laeser", "Skrivebeskyttet"]];

// ---------- Send login-link (ét vindue med mail, SMS og kopier) ----------
const vindue = h("dialog", { class: "vindue", id: "link-boks", "aria-labelledby": "link-hvem" });
vindue.innerHTML = `
  <div class="vindue-indhold">
    <button class="vindue-luk" type="button" aria-label="Luk">×</button>
    <p class="eyebrow">Login-link</p>
    <h2 id="link-hvem"></h2>
    <p class="muted" id="link-forklar">Vælg, hvordan linket skal sendes. Når modtageren trykker på linket, er vedkommende logget ind. Linket virker i 7 dage og kun én gang.</p>
    <div class="send-knapper">
      <a class="btn" id="mail-link" href="#">✉️ Send på mail</a>
      <a class="btn" id="sms-link" href="#">💬 Send SMS</a>
      <button class="btn alt" type="button" id="kopier">📋 Kopier link</button>
    </div>
    <label for="link-felt">Linket</label>
    <input id="link-felt" readonly>
  </div>`;
document.body.append(vindue);
vindue.querySelector(".vindue-luk").addEventListener("click", () => vindue.close());
vindue.addEventListener("click", (e) => { if (e.target === vindue) vindue.close(); });

function visLink(navn, email, token) {
  const url = `${location.origin}/log-ind/?link=${token}`;
  const tekst = `Hej ${navn}\n\nHer er dit login-link til Haderslev Marineforenings hjemmeside. Tryk på linket, så er du logget ind:\n\n${url}\n\nLinket virker i 7 dage og kun én gang.\n\nVenlig hilsen\nHaderslev Marineforening`;
  $("#link-hvem").textContent = `Send login-link til ${navn}`;
  $("#link-felt").value = url;
  $("#mail-link").href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Dit login-link til Haderslev Marineforening")}&body=${encodeURIComponent(tekst)}`;
  $("#sms-link").href = `sms:?&body=${encodeURIComponent(`Hej ${navn}. Her er dit login-link til Haderslev Marineforenings hjemmeside – tryk på det, så er du logget ind: ${url}`)}`;
  if (!vindue.open) vindue.showModal();
  $("#link-felt").select();
}
$("#kopier").addEventListener("click", async () => {
  const felt = $("#link-felt");
  try { await navigator.clipboard.writeText(felt.value); } catch { felt.select(); document.execCommand("copy"); }
  $("#kopier").textContent = "✓ Kopieret!";
  setTimeout(() => { $("#kopier").textContent = "📋 Kopier link"; }, 2000);
});

// ---------- Anmodninger om login-link ("Glemt adgangskode?") ----------
async function hentAnmodninger() {
  let data;
  try { data = await api("/anmodninger"); } catch { return; }
  $("#anmodninger").hidden = !data.length;
  $("#anm-antal").textContent = data.length;
  const ul = $("#anm-liste");
  ul.textContent = "";
  for (const a of data) {
    const send = h("button", { class: "btn", type: "button", "aria-label": `Send login-link til ${a.navn}` }, "Send login-link");
    send.addEventListener("click", async () => {
      send.disabled = true;
      try { const r = await api(`/anmodninger/${a.id}/link`, { metode: "POST" }); visLink(r.navn, r.email, r.token); hentAnmodninger(); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); send.disabled = false; }
    });
    ul.append(h("li", { class: "anmodning" },
      h("div", {}, h("b", {}, a.navn), h("span", { class: "muted lille" }, ` · ${a.email} · ${new Date(a.oprettet).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`)),
      h("div", { class: "anm-knapper" }, send, sletKnap({ tekst: "Afvis", klasse: "linkknap lille", bekraeft: "Sikker? Tryk igen", label: `Afvis anmodningen fra ${a.navn}`,
        vedSlet: async () => { try { await api(`/anmodninger/${a.id}`, { metode: "DELETE" }); hentAnmodninger(); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); } } }))));
  }
}

// ---------- Medlemmer ----------
async function hentMedlemmer() {
  let data;
  try { data = await api("/medlemmer"); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); return; }
  const el = $("#medlemmer");
  el.textContent = "";
  const tb = h("tbody");
  for (const p of data) {
    const selv = String(p.id) === String(mig.id);
    const valg = h("select", { "aria-label": `Rolle for ${p.navn}` }, ROLLER.map(([v, t]) => h("option", { value: v, selected: p.rolle === v }, t)));
    valg.disabled = selv;
    valg.addEventListener("change", async () => {
      try { await api("/medlemmer/" + p.id, { metode: "PATCH", data: { rolle: valg.value } }); visStatus(status, `${p.navn} er nu ${valg.selectedOptions[0].textContent.toLowerCase()}.`, "ok"); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
    });
    const nytLink = h("button", { class: "btn sm alt", type: "button", "aria-label": `Send login-link til ${p.navn}` }, "Login-link");
    nytLink.addEventListener("click", async () => {
      try { const r = await api(`/medlemmer/${p.id}/link`, { metode: "POST" }); visLink(p.navn, p.email, r.token); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
    });
    tb.append(h("tr", {},
      h("td", {}, h("b", {}, p.navn), selv ? h("span", { class: "maerke" }, "Dig") : null),
      h("td", {}, p.email),
      h("td", {}, p.aktiv ? "Aktiv" : h("span", { class: "muted" }, "Har ikke brugt sit link endnu")),
      h("td", {}, valg),
      h("td", { style: "white-space:nowrap" }, nytLink, " ", selv ? null : sletKnap({
        tekst: "Fjern", label: `Fjern ${p.navn}`,
        vedSlet: async () => {
          try { await api("/medlemmer/" + p.id, { metode: "DELETE" }); visStatus(status, `${p.navn} er fjernet.`, "ok"); hentMedlemmer(); }
          catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
        },
      }))));
  }
  el.append(h("div", { class: "tabel-ramme", tabindex: "0", role: "region", "aria-label": "Medlemmer" },
    h("table", { class: "tabel bred" }, h("thead", {}, h("tr", {}, ["Navn", "E-mail", "Status", "Rolle", "Handling"].map((k) => h("th", { scope: "col" }, k)))), tb)));
  $("#antal").textContent = `${data.length} brugere`;
}

$("#inviter").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    const r = await api("/medlemmer", { metode: "POST", data });
    visStatus(status, `${data.navn.trim()} er oprettet. Send login-linket på mail eller SMS.`, "ok");
    visLink(data.navn.trim(), data.email.trim().toLowerCase(), r.token);
    f.navn.value = ""; f.email.value = "";
    hentMedlemmer();
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
  knap.disabled = false;
});

// ---------- Nyheder ----------
async function hentNyheder() {
  let data;
  try { data = await api("/nyheder"); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); return; }
  const ul = $("#nyheder");
  ul.textContent = "";
  if (!data.length) ul.append(h("li", { class: "muted" }, "Ingen nyheder endnu."));
  for (const n of data) {
    ul.append(h("li", {}, h("b", {}, n.titel), " · ", h("span", { class: "muted" }, fmtDatoLang(n.dato)),
      n.pdf_url ? [" · ", h("a", { href: n.pdf_url }, "PDF"), n.kun_medlemmer ? h("span", { class: "muted" }, " (kun medlemmer)") : null] : null, " · ",
      sletKnap({ tekst: "Slet", klasse: "linkknap lille", label: `Slet nyheden ${n.titel}`,
        vedSlet: async () => {
          try { await api("/nyheder/" + n.id, { metode: "DELETE" }); visStatus(status, "Nyheden er slettet.", "ok"); hentNyheder(); }
          catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
        } })));
  }
}

const tilBase64 = (fil) => new Promise((ok, fejl) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = fejl;
  r.readAsDataURL(fil);
});

$("#ny-nyhed").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    const fil = f.pdf.files[0];
    if (fil && fil.size > 3 * 1024 * 1024) throw new Error("PDF'en er for stor. Den må højst fylde 3 MB.");
    await api("/nyheder", { metode: "POST", data: {
      titel: f.titel.value, tekst: f.tekst.value, dato: f.dato.value || idagISO(),
      pdf: fil ? await tilBase64(fil) : null, pdf_navn: fil ? fil.name : null, kun_medlemmer: f.kun_medlemmer.checked } });
    visStatus(status, "Nyheden er offentliggjort på forsiden.", "ok");
    f.reset(); f.dato.value = idagISO();
    hentNyheder();
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
  knap.disabled = false;
});

(async () => {
  mig = await hentBruger();
  if (!mig) { location.href = "/log-ind/?tilbage=/administration/"; return; }
  if (!erAdmin(mig)) { visStatus(status, "Denne side er kun for administratorer.", "fejl"); return; }
  $("#indhold").hidden = false;
  $("#ny-nyhed").dato.value = idagISO();
  hentAnmodninger();
  hentMedlemmer();
  hentNyheder();
  // Billeder der venter på godkendelse
  api("/billeder").then((b) => {
    const n = b.filter((x) => !x.godkendt).length;
    if (!n) return;
    const note = h("p", { class: "note" }, h("b", {}, `${n} ${n === 1 ? "billede venter" : "billeder venter"} på godkendelse. `), h("a", { href: "/galleri/" }, "Gå til galleriet"));
    $("#indhold").prepend(note);
  }).catch(() => {});
})();
