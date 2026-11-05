// Log ind, login-link på e-mail, glemt adgangskode, ny adgangskode efter invitation, og "Min profil".
import { sb, $, visStatus, danskFejl, hentBruger, logUd, linkType, linkFejl } from "./app.js";

const status = $("#status");
const vis = (id) => {
  for (const s of document.querySelectorAll("[data-trin]")) s.hidden = s.id !== id;
  const sektion = document.getElementById(id);
  const fokus = sektion && sektion.querySelector("h1, h2");
  if (fokus) { fokus.setAttribute("tabindex", "-1"); fokus.focus(); }
};
const tilbageTil = () => {
  const t = new URLSearchParams(location.search).get("tilbage");
  return t && t.startsWith("/") && !t.startsWith("//") ? t : "/";
};
const minLaengde = 8;
const adresse = () => location.origin + "/log-ind/";

async function start() {
  if (linkFejl) visStatus(status, "Linket virker ikke længere (det er måske brugt eller for gammelt). Bed om et nyt nedenfor.", "fejl");

  const { session, profil } = await hentBruger();

  if (session && (linkType === "invite" || linkType === "recovery")) {
    $("#ny-kode-titel").textContent = linkType === "invite" ? "Velkommen ombord!" : "Vælg en ny adgangskode";
    $("#ny-kode-intro").textContent = linkType === "invite"
      ? "Du er inviteret til Haderslev Marineforenings medlemsside. Skriv dit navn, som de andre skal se det, og vælg en adgangskode."
      : "Skriv din nye adgangskode to gange.";
    $("#navn-felt").hidden = linkType !== "invite";
    if (profil) $("#ny-navn").value = profil.navn || "";
    vis("trin-ny-kode");
    return;
  }
  if (session) { visProfil(profil); return; }
  vis("trin-login");
}

function visProfil(profil) {
  $("#profil-navn").value = profil.navn || "";
  $("#profil-email").textContent = profil.email || "";
  const roller = { admin: "Administrator", medlem: "Medlem", laeser: "Skrivebeskyttet (kan kun læse)" };
  $("#profil-rolle").textContent = roller[profil.rolle] || profil.rolle;
  vis("trin-profil");
}

// --- Log ind med adgangskode ---
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const knap = f.querySelector("button[type=submit]");
  knap.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.kode.value });
  knap.disabled = false;
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  location.href = tilbageTil();
});

// --- Login-link uden adgangskode ---
$("#link-knap").addEventListener("click", async () => {
  const email = $("#login-email").value.trim();
  if (!email) { visStatus(status, "Skriv din e-mail først.", "fejl"); $("#login-email").focus(); return; }
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: adresse() } });
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  visStatus(status, `Vi har sendt et login-link til ${email}. Åbn mailen og tryk på linket. Tjek eventuelt spam-mappen.`, "ok");
});

// --- Glemt adgangskode ---
$("#glemt-knap").addEventListener("click", async () => {
  const email = $("#login-email").value.trim();
  if (!email) { visStatus(status, "Skriv din e-mail i feltet ovenfor, og tryk så på \"Glemt adgangskode\" igen.", "fejl"); $("#login-email").focus(); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: adresse() });
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  visStatus(status, `Hvis ${email} er oprettet, får du om lidt en mail med et link til at vælge en ny adgangskode.`, "ok");
});

// --- Ny adgangskode (efter invitation eller "glemt adgangskode") ---
$("#ny-kode-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.kode1.value.length < minLaengde) { visStatus(status, `Adgangskoden skal være mindst ${minLaengde} tegn.`, "fejl"); return; }
  if (f.kode1.value !== f.kode2.value) { visStatus(status, "De to adgangskoder er ikke ens.", "fejl"); return; }
  const { error } = await sb.auth.updateUser({ password: f.kode1.value });
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  if (!$("#navn-felt").hidden && f.navn.value.trim()) {
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("profiler").update({ navn: f.navn.value.trim() }).eq("id", user.id);
  }
  visStatus(status, "Din adgangskode er gemt. Du er nu logget ind.", "ok");
  setTimeout(() => { location.href = "/vagter/"; }, 1200);
});

// --- Min profil ---
$("#profil-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const navn = e.target.navn.value.trim();
  if (!navn) { visStatus(status, "Navnet må ikke være tomt.", "fejl"); return; }
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("profiler").update({ navn }).eq("id", user.id);
  if (error) { visStatus(status, danskFejl(error), "fejl"); return; }
  visStatus(status, "Dit navn er gemt.", "ok");
});
$("#skift-kode").addEventListener("click", () => {
  $("#ny-kode-titel").textContent = "Skift adgangskode";
  $("#ny-kode-intro").textContent = "Skriv din nye adgangskode to gange.";
  $("#navn-felt").hidden = true;
  vis("trin-ny-kode");
});
$("#log-ud").addEventListener("click", logUd);

start();
