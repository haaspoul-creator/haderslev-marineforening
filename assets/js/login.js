// Log ind, login-link (logger direkte ind), "Glemt adgangskode?" og "Min profil".
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
// Send kun videre til en side på denne hjemmeside (ingen omdirigering til fremmede sider).
const tilbageTil = () => {
  try {
    const u = new URL(params.get("tilbage") || "/", location.origin);
    return u.origin === location.origin ? u.pathname + u.search + u.hash : "/";
  } catch { return "/"; }
};
let tilstand = "link"; // "link" | "skift"

(async () => {
  if (linkToken) {
    // Fjern koden fra adresselinjen, så den ikke gemmes i historikken.
    history.replaceState(null, "", "/log-ind/");
    try {
      const l = await api("/link/log-ind", { metode: "POST", data: { token: linkToken } });
      visVelkommen(l);
    } catch (e) { visStatus(status, fejlTekst(e), "fejl"); vis("trin-login"); }
    return;
  }
  const b = await hentBruger();
  if (b) visProfil(b); else vis("trin-login");
})();

// Efter login via link: man er logget ind. En ny adgangskode er frivillig (men foreslås for nye medlemmer).
function visVelkommen(l) {
  $("#vk-titel").textContent = `Velkommen, ${l.navn}!`;
  if (!l.har_kode) {
    $("#vk-spoerg").textContent = "Vælg en adgangskode";
    $("#vk-hjaelp").textContent = "Så kan du logge ind igen uden link. Du kan også springe over og bare bruge et nyt login-link næste gang.";
    $("#vk-navn-felt").hidden = false;
    $("#vk-navn").value = l.navn;
  }
  $("#vk-spring").href = tilbageTil() === "/" ? "/vagter/" : tilbageTil();
  vis("trin-velkommen");
}

$("#vk-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.kode1.value.length < 8) { visStatus(status, "Adgangskoden skal være mindst 8 tegn – eller tryk \"Spring over\".", "fejl"); f.kode1.focus(); return; }
  if (f.kode1.value !== f.kode2.value) { visStatus(status, "De to adgangskoder er ikke ens.", "fejl"); f.kode2.focus(); return; }
  try {
    if (!$("#vk-navn-felt").hidden && f.navn.value.trim()) await api("/mig", { metode: "PATCH", data: { navn: f.navn.value } });
    await api("/mig/kode", { metode: "POST", data: { kode: f.kode1.value } });
    visStatus(status, "Din adgangskode er gemt.", "ok");
    setTimeout(() => { location.href = $("#vk-spring").getAttribute("href"); }, 1000);
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); }
});

$("#glemt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const email = f.email.value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { visStatus(status, "Skriv din e-mail.", "fejl"); f.email.focus(); return; }
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  try {
    await api("/glemt", { metode: "POST", data: { email } });
    f.hidden = true;
    $("#glemt-tak").hidden = false;
    visStatus(status, "");
  } catch (err) { visStatus(status, fejlTekst(err), "fejl"); knap.disabled = false; }
});
// Udfyld e-mail i "glemt"-feltet med det, man har skrevet i login-feltet
$("#login-email").addEventListener("input", (e) => { if (!$("#glemt-email").dataset.rettet) $("#glemt-email").value = e.target.value; });
$("#glemt-email").addEventListener("input", (e) => { e.target.dataset.rettet = "1"; });

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
  } catch (err) {
    visStatus(status, fejlTekst(err) + (err.status === 401 ? " Har du glemt den? Brug \"Glemt adgangskode?\" herunder." : ""), "fejl");
    knap.disabled = false;
  }
});

$("#ny-kode-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.kode1.value.length < 8) { visStatus(status, "Adgangskoden skal være mindst 8 tegn.", "fejl"); return; }
  if (f.kode1.value !== f.kode2.value) { visStatus(status, "De to adgangskoder er ikke ens.", "fejl"); return; }
  try {
    if (tilstand === "skift") {
      if (!f.nuvaerende.value) { visStatus(status, "Skriv din nuværende adgangskode.", "fejl"); f.nuvaerende.focus(); return; }
      await api("/mig/kode", { metode: "POST", data: { nuvaerende: f.nuvaerende.value, kode: f.kode1.value } });
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
  $("#nuv-felt").hidden = false;
  $("#k-nuvaerende").required = true;
  vis("trin-ny-kode");
});
$("#log-ud").addEventListener("click", logUd);
