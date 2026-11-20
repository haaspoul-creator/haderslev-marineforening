// Administration: opret medlemmer (med personligt link), ret roller, nyheder og Ankerposten.
import { api, $, h, visStatus, fejlTekst, hentBruger, erAdmin, fmtDatoLang, idagISO, sletKnap } from "./app.js";

const status = $("#status");
let mig = null;
const ROLLER = [["medlem", "Medlem"], ["admin", "Administrator"], ["laeser", "Skrivebeskyttet"]];

// ---------- Send login-link (ét vindue: kopier beskeden, eller åbn mail/SMS med den skrevet færdig) ----------
const vindue = h("dialog", { class: "vindue", id: "link-boks", "aria-labelledby": "link-hvem" });
vindue.innerHTML = `
  <div class="vindue-indhold">
    <button class="vindue-luk" type="button" aria-label="Luk">×</button>
    <p class="eyebrow">Login-link</p>
    <h2 id="link-hvem"></h2>
    <p class="muted" id="link-forklar">Send beskeden til medlemmet. Når medlemmet trykker på linket, er vedkommende logget ind. Linket virker i 7 dage.</p>
    <div class="send-knapper">
      <button class="btn" type="button" id="kopier-besked">📋 Kopier beskeden</button>
      <div class="smaa">
        <a class="btn alt" id="outlook-link" href="#" target="_blank" rel="noopener">✉️ Hotmail / Outlook</a>
        <a class="btn alt" id="gmail-link" href="#" target="_blank" rel="noopener">✉️ Gmail</a>
        <a class="btn alt" id="mail-link" href="#">✉️ Mailprogram</a>
        <a class="btn alt" id="sms-link" href="#" hidden>💬 SMS</a>
      </div>
    </div>
    <p class="advarsel" id="link-advarsel">⚠️ Send kun til medlemmets <b>egen</b> e-mail eller telefon. Tryk ikke selv på linket – så bliver du logget ind som medlemmet.</p>
    <details class="lille" style="margin-top:12px"><summary>Vis selve linket</summary>
      <label for="link-felt">Linket</label>
      <input id="link-felt" readonly>
      <button class="btn alt sm" type="button" id="kopier" style="margin-top:8px">📋 Kopier kun linket</button>
    </details>
  </div>`;
document.body.append(vindue);
vindue.querySelector(".vindue-luk").addEventListener("click", () => vindue.close());
vindue.addEventListener("click", (e) => { if (e.target === vindue) vindue.close(); });
// SMS-knappen giver kun mening på en telefon/tablet
const telefon = matchMedia("(pointer: coarse)").matches;
let besked = "";

function visLink(navn, email, token) {
  const url = `${location.origin}/log-ind/?link=${token}`;
  const emne = "Dit login-link til Haderslev Marineforening";
  besked = `Hej ${navn}\n\nHer er dit login-link til Haderslev Marineforenings hjemmeside. Tryk på linket, og tryk derefter på knappen "Log ind", så er du logget ind:\n\n${url}\n\nLinket virker i 7 dage.\n\nVenlig hilsen\nHaderslev Marineforening`;
  const q = encodeURIComponent;
  $("#link-hvem").textContent = `Send login-link til ${navn}`;
  $("#link-forklar").textContent = `Send beskeden til ${navn} (${email}). Når ${navn} trykker på linket, er vedkommende logget ind. Linket virker i 7 dage.`;
  $("#link-felt").value = url;
  $("#outlook-link").href = `https://outlook.live.com/mail/0/deeplink/compose?to=${q(email)}&subject=${q(emne)}&body=${q(besked)}`;
  $("#gmail-link").href = `https://mail.google.com/mail/?view=cm&fs=1&to=${q(email)}&su=${q(emne)}&body=${q(besked)}`;
  $("#mail-link").href = `mailto:${q(email)}?subject=${q(emne)}&body=${q(besked)}`;
  $("#sms-link").hidden = !telefon;
  $("#sms-link").href = `sms:?&body=${q(`Hej ${navn}. Her er dit login-link til Haderslev Marineforenings hjemmeside – tryk på det og så på "Log ind": ${url}`)}`;
  if (!vindue.open) vindue.showModal();
  $("#kopier-besked").focus();
}
async function kopier(tekst, knap, normal) {
  try { await navigator.clipboard.writeText(tekst); }
  catch { const t = h("textarea"); t.value = tekst; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  knap.textContent = "✓ Kopieret! Sæt den ind i en mail eller SMS";
  setTimeout(() => { knap.textContent = normal; }, 3000);
}
$("#kopier-besked").addEventListener("click", (e) => kopier(besked, e.currentTarget, "📋 Kopier beskeden"));
$("#kopier").addEventListener("click", (e) => kopier($("#link-felt").value, e.currentTarget, "📋 Kopier kun linket"));

// ---------- Anmodninger om login-link ("Glemt adgangskode?") ----------
async function hentAnmodninger() {
  let data;
  try { data = await api("/anmodninger"); } catch { return; }
  $("#anmodninger").hidden = !data.length;
  // Et link virker i 7 dage. Er det udløbet uden at være brugt, venter medlemmet igen.
  for (const a of data) a.udloebet = !!a.link_lavet && Date.now() - new Date(a.link_lavet) > 7 * 864e5;
  const venter = data.filter((a) => !a.link_lavet || a.udloebet).length;
  $("#anm-antal").textContent = venter;
  $("#anm-antal").hidden = !venter;
  const ul = $("#anm-liste");
  ul.textContent = "";
  for (const a of data) {
    const send = h("button", { class: a.link_lavet && !a.udloebet ? "btn alt sm" : "btn", type: "button", "aria-label": `Send login-link til ${a.navn}` }, a.link_lavet && !a.udloebet ? "Send igen" : "Send login-link");
    send.addEventListener("click", async () => {
      send.disabled = true;
      try { const r = await api(`/anmodninger/${a.id}/link`, { metode: "POST" }); visLink(r.navn, r.email, r.token); hentAnmodninger(); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); send.disabled = false; }
    });
    ul.append(h("li", { class: "anmodning" },
      h("div", {}, h("b", {}, a.navn), h("span", { class: "muted lille" }, ` · ${a.email} · ${new Date(a.oprettet).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`),
        a.udloebet ? h("div", { class: "fejl-tekst lille" }, "Linket er udløbet uden at blive brugt – send et nyt")
          : a.link_lavet ? h("div", { class: "anm-sendt lille" }, "✓ Link lavet – ikke brugt endnu") : null),
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
