// Opdaterer menu og fod på alle sider, så de altid er ens.
// Kør:  node tools/faelles.mjs
// Ret menu, adresse eller kontaktoplysninger HER, og kør scriptet igen.
import { readFileSync, writeFileSync } from "node:fs";

const KONTAKT = {
  adresse: ["Det Maritime Hus", "Ved Havnen 18", "6100 Haderslev"],
  kontaktperson: "Formand Harry Madsen",
  telefon: "40 94 73 75",
  email: "Harry.madsen@hotmail.com",
  facebook: "", // fx "https://www.facebook.com/..." – tom = vises som pladsholder
};

const MENU = [
  ["/", "Hjem", "hjem"],
  ["/om-os/", "Om os", "omos"],
  ["/arrangementskalender/", "Arrangementskalender", "kalender"],
  ["/vagter/", "Vagter", "vagter"],
  ["/beskeder/", "Beskeder", "beskeder"],
  ["/galleri/", "Galleri", "galleri"],
  ["/slopkisten/", "Slopkisten", "slop"],
];

const SIDER = {
  "index.html": "hjem",
  "om-os/index.html": "omos",
  "arrangementskalender/index.html": "kalender",
  "vagter/index.html": "vagter",
  "beskeder/index.html": "beskeder",
  "galleri/index.html": "galleri",
  "log-ind/index.html": "",
  "administration/index.html": "",
  "forslag/index.html": "",
  "rundvisning/index.html": "",
  "slopkisten/index.html": "slop",
  "404.html": "",
};

const LOGO = `<img src="/assets/img/logo-96.png" width="44" height="44" alt="">`;

function top(aktiv) {
  const punkter = MENU.map(([href, tekst, noegle]) =>
    `<li><a href="${href}"${noegle === aktiv ? ' aria-current="page"' : ""}>${tekst}</a></li>`).join("\n        ");
  return `<a class="spring-til-indhold" href="#indhold-start">Spring til indhold</a>
<header class="top">
  <div class="top-indre">
    <a class="brand" href="/">${LOGO}<span>Haderslev Marineforening</span></a>
    <button class="menu-knap" type="button" aria-expanded="false" aria-controls="hovedmenu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>Menu
    </button>
    <nav class="hovedmenu" id="hovedmenu" aria-label="Hovedmenu">
      <ul>
        ${punkter}
      </ul>
    </nav>
    <div class="bruger" id="bruger"><a class="btn sm alt" href="/log-ind/">Log ind</a></div>
  </div>
</header>`;
}

function fod() {
  const k = KONTAKT;
  const tlf = k.telefon.replace(/\s/g, "");
  // Uden Facebook-link vises boksen "Følg os" slet ikke.
  const fb = k.facebook ? `\n    <div>\n      <b>Følg os</b><br>\n      <a href="${k.facebook}" rel="noopener">Haderslev Marineforening på Facebook</a>\n    </div>` : "";
  return `<footer class="fod">
  <div class="fod-indre">
    <div>
      <b>Haderslev Marineforening</b>
      <address>${k.adresse.join("<br>")}</address>
    </div>
    <div>
      <b>Kontakt</b><br>
      ${k.kontaktperson}<br>
      Telefon: <a href="tel:+45${tlf}">${k.telefon}</a><br>
      E-mail: <a href="mailto:${k.email}">${k.email}</a>
    </div>
    <div>
      <b>Marinestuen</b><br>
      Åben for hyggeligt samvær<br>
      alle normale lørdage kl. 10–13
    </div>${fb}
    <p class="smaat">Haderslev Marineforening er en afdeling af Marineforeningen. · <a href="/rundvisning/">Se rundvisningen</a> · <a href="/forslag/">Forslag til hjemmesiden</a></p>
  </div>
</footer>`;
}

const erstat = (html, navn, indhold) => {
  const re = new RegExp(`<!-- FÆLLES:${navn} -->[\\s\\S]*?<!-- /FÆLLES:${navn} -->`);
  if (!re.test(html)) throw new Error(`Mangler markør FÆLLES:${navn}`);
  return html.replace(re, `<!-- FÆLLES:${navn} -->\n${indhold}\n<!-- /FÆLLES:${navn} -->`);
};

for (const [fil, aktiv] of Object.entries(SIDER)) {
  let html = readFileSync(fil, "utf8");
  html = erstat(html, "TOP", top(aktiv));
  html = erstat(html, "FOD", fod());
  writeFileSync(fil, html);
  console.log("Opdateret", fil);
}
