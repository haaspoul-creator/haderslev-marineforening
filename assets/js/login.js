// Log ind, vælg adgangskode via personligt link (invitation eller glemt kode), og "Min profil".
import { api, $, visStatus, fejlTekst, hentBruger, logUd } from "./app.js";

const status = $("#status");
const params = new URLSearchParams(location.search);
const linkToken = params.get("link");
let foersteVisning = true;
const vis = (id) => {
  for (const s of document.querySelectorAll("[data-trin]")) s.hidden = s.id !== id;
  const o = document.querySelector(`#${id} h1`);
  // Flyt kun fokus, når trinnet skifter efter en handling – ikke ved sidens start.
  if (o && !foersteVisning) { o.setAttribute("tabindex", "-1"); o.focus(); }
  foersteVisning = false;
};
const tilbageTil = () => { const t = params.get("tilbage"); return t && t.startsWith("/") && !t.startsWith("//") ? t : "/"; };
let tilstand = "link"; // "link" | "skift"

(async () => {
  if (linkToken) {
    // Fjern koden fra adresselinjen, så den ikke gemmes i historikken.
    history.replaceState(null, "", "/log-ind/");
    try {
      const l = await api("/link", { metode: "POST", data: { token: linkToken } });
      $("#ny-kode-titel").textContent = `Velkommen, ${l.navn}!`;
      $("#ny-kode-intro").textContent = `Vælg en adgangskode til ${l.email}. Du kan også rette dit navn, som de andre medlemmer ser det.`;
      $("#ny-navn").value = l.navn;
      $("#navn-felt").hidden = false;
      vis("trin-ny-kode");
    } catch (e) { visStatus(status, fejlTekst(e), "fejl"); vis("trin-login"); }
    return;
  }
  const b = await hentBruger();
  if (b) visProfil(b); else vis("trin-login");
})();

function visProfil(b) {
  $("#profil-navn").value = b.navn;
  $("#profil-email").textContent = b.email;
  $("#profil-rolle").textContent = { admin: "Administrator", medlem: "Medlem", laeser: "Skrivebeskyttet (kan kun læse)" }[b.rolle] || b.rolle;
  vis("trin-profil");
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    await api("/log-ind", { metode: "POST", data: { email: f.email.value, kode: f.kode.value } });
    location.href = tilbageTil();
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); knap.disabled = false; }
});

$("#ny-kode-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.kode1.value.length < 8) { visStatus(status, "Adgangskoden skal være mindst 8 tegn.", "fejl"); return; }
  if (f.kode1.value !== f.kode2.value) { visStatus(status, "De to adgangskoder er ikke ens.", "fejl"); return; }
  try {
    if (tilstand === "skift") {
      await api("/mig/kode", { metode: "POST", data: { kode: f.kode1.value } });
      visStatus(status, "Din nye adgangskode er gemt.", "ok");
      f.reset();
      visProfil((await api("/mig")).bruger);
      return;
    }
    await api("/aktiver", { metode: "POST", data: { token: linkToken, kode: f.kode1.value, navn: f.navn.value } });
    visStatus(status, "Din adgangskode er gemt. Du er nu logget ind.", "ok");
    setTimeout(() => { location.href = "/vagter/"; }, 1200);
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
});

$("#profil-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/mig", { metode: "PATCH", data: { navn: e.target.navn.value } });
    visStatus(status, "Dit navn er gemt.", "ok");
    const n = document.querySelector("#bruger .navn"); if (n) n.textContent = e.target.navn.value.trim();
  }
  catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
});
$("#skift-kode").addEventListener("click", () => {
  tilstand = "skift";
  $("#ny-kode-titel").textContent = "Skift adgangskode";
  $("#ny-kode-intro").textContent = "Skriv din nye adgangskode to gange.";
  $("#navn-felt").hidden = true;
  vis("trin-ny-kode");
});
$("#log-ud").addEventListener("click", logUd);
