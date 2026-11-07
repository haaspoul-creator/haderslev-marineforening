// Galleri: billeder fra medlemmerne (upload + godkendelse) og billedfremviser med pile, Esc og stryg.
import { api, $, h, visStatus, fejlTekst, hentBruger, erAdmin, kanSkrive, fmtDatoLang, sletKnap } from "./app.js";

const status = $("#status");
const galleri = $(".galleri");
let mig = null;

// ---------- Billeder fra medlemmerne ----------
async function hentBilleder() {
  let data;
  try { data = await api("/billeder"); } catch (e) { visStatus(status, fejlTekst(e), "fejl"); return; }
  galleri.querySelectorAll("figure[data-dynamisk]").forEach((f) => f.remove());
  const foerste = galleri.firstElementChild;
  for (const b of data) galleri.insertBefore(visBillede(b), foerste);
}

function visBillede(b) {
  const egen = mig && String(b.bruger_id) === String(mig.id);
  const admin = erAdmin(mig);
  const fig = h("figure", { "data-dynamisk": "", class: b.godkendt ? "" : "afventer" },
    h("a", { href: `/api/billeder/${b.id}/stor` },
      h("img", { src: `/api/billeder/${b.id}/lille`, alt: b.alt, loading: "lazy", width: Math.min(640, b.bredde), height: Math.round(Math.min(640, b.bredde) * b.hoejde / b.bredde) })),
    h("figcaption", {}, h("b", {}, b.titel),
      [b.dato ? fmtDatoLang(b.dato) : null, b.navn ? `Lagt ind af ${b.navn}` : null].filter(Boolean).join(" · ")));
  if (!b.godkendt || egen || admin) {
    const bar = h("div", { class: "billede-handlinger" });
    if (!b.godkendt) bar.append(h("span", { class: "status-maerke status-ny" }, "Afventer godkendelse"));
    if (admin && !b.godkendt) bar.append(h("button", { class: "btn sm", type: "button", onclick: () => godkend(b, true) }, "Godkend"));
    if (admin && b.godkendt) bar.append(h("button", { class: "btn sm alt", type: "button", onclick: () => godkend(b, false) }, "Skjul for offentligheden"));
    if (egen || admin) bar.append(sletKnap({ label: `Slet billedet ${b.titel}`, vedSlet: async () => {
      try { await api("/billeder/" + b.id, { metode: "DELETE" }); visStatus(status, "Billedet er slettet.", "ok"); hentBilleder(); }
      catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
    } }));
    fig.append(bar);
  }
  return fig;
}

async function godkend(b, ja) {
  try {
    await api("/billeder/" + b.id, { metode: "PATCH", data: { godkendt: ja } });
    visStatus(status, ja ? `"${b.titel}" er godkendt og kan nu ses af alle.` : `"${b.titel}" kan nu kun ses af medlemmer.`, "ok");
    hentBilleder();
  } catch (e) { visStatus(status, fejlTekst(e), "fejl"); }
}

// ---------- Upload ----------
const form = $("#upload-form");
const filer = $("#u-filer");
const listeEl = $("#u-liste");
const fejlEl = $("#u-fejl");
let valgte = []; // { fil, url, alt-felt }

function nulstilUpload() {
  valgte.forEach((v) => URL.revokeObjectURL(v.url));
  valgte = [];
  listeEl.textContent = "";
  filer.value = "";
  $("#u-faelles").hidden = $("#u-handling").hidden = true;
  fejlEl.hidden = true;
  $("#u-fremdrift").textContent = "";
}

filer.addEventListener("change", () => {
  fejlEl.hidden = true;
  const nye = [...filer.files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
  if (valgte.length + nye.length > 20) { fejlEl.textContent = "Du kan højst lægge 20 billeder ind ad gangen."; fejlEl.hidden = false; }
  for (const fil of nye.slice(0, 20 - valgte.length)) {
    const url = URL.createObjectURL(fil);
    const i = valgte.length;
    const alt = h("input", { id: "u-alt-" + i, maxlength: "300", required: true, placeholder: "fx To medlemmer ved bordet med flag" });
    const fjern = h("button", { class: "fjern-knap", type: "button", "aria-label": `Fjern ${fil.name}` }, "×");
    const li = h("li", {}, h("img", { src: url, alt: "" }),
      h("div", {}, h("label", { for: "u-alt-" + i, style: "margin-top:0" }, "Hvad viser billedet? ", h("span", { class: "muted" }, "(til blinde og svagtseende)")), alt),
      fjern);
    const v = { fil, url, alt, li };
    fjern.addEventListener("click", () => { valgte = valgte.filter((x) => x !== v); li.remove(); URL.revokeObjectURL(url); if (!valgte.length) nulstilUpload(); });
    valgte.push(v);
    listeEl.append(li);
  }
  filer.value = "";
  if (valgte.length) { $("#u-faelles").hidden = $("#u-handling").hidden = false; if (!$("#u-titel").value) $("#u-titel").focus(); }
});
$("#u-annuller").addEventListener("click", nulstilUpload);
form.addEventListener("input", () => { fejlEl.hidden = true; });

// Gør billedet mindre i browseren og lav en JPEG uden metadata.
async function skaler(fil, maks, kvalitet) {
  let kilde;
  try { kilde = await createImageBitmap(fil, { imageOrientation: "from-image" }); }
  catch {
    kilde = await new Promise((ok, fejl) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fejl(new Error("Billedet kunne ikke læses.")); im.src = URL.createObjectURL(fil); });
  }
  const w0 = kilde.width, h0 = kilde.height, f = Math.min(1, maks / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * f)), hh = Math.max(1, Math.round(h0 * f));
  const c = document.createElement("canvas"); c.width = w; c.height = hh;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, hh); ctx.drawImage(kilde, 0, 0, w, hh);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", kvalitet));
  const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
  return { b64, w, h: hh };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const titel = $("#u-titel").value.trim();
  if (!titel) { fejlEl.textContent = "Skriv en billedtekst."; fejlEl.hidden = false; $("#u-titel").focus(); return; }
  const mangler = valgte.find((v) => !v.alt.value.trim());
  if (mangler) { fejlEl.textContent = "Skriv kort, hvad hvert billede viser."; fejlEl.hidden = false; mangler.alt.focus(); return; }
  const knap = $("#u-send"); knap.disabled = true;
  const frem = $("#u-fremdrift");
  let ok = 0;
  for (const [i, v] of [...valgte].entries()) {
    frem.textContent = `Lægger billede ${i + 1} af ${valgte.length} ind …`;
    try {
      const stor = await skaler(v.fil, 1600, 0.85);
      const lille = await skaler(v.fil, 640, 0.8);
      await api("/billeder", { metode: "POST", data: { titel, alt: v.alt.value.trim(), dato: $("#u-dato").value || null, stor: stor.b64, lille: lille.b64, bredde: stor.w, hoejde: stor.h } });
      ok++;
      v.li.remove(); URL.revokeObjectURL(v.url); valgte = valgte.filter((x) => x !== v);
    } catch (err) {
      fejlEl.textContent = `${v.fil.name}: ${fejlTekst(err)}`; fejlEl.hidden = false;
      break;
    }
  }
  knap.disabled = false;
  frem.textContent = "";
  if (ok) {
    visStatus(status, `${ok} ${ok === 1 ? "billede er" : "billeder er"} lagt i galleriet.` + (erAdmin(mig) ? "" : " De bliver offentlige, når bestyrelsen har godkendt dem."), "ok");
    hentBilleder();
  }
  if (!valgte.length) { nulstilUpload(); $("#u-titel").value = ""; $("#u-dato").value = ""; $("#upload-boks").open = false; }
});

// ---------- Billedfremviser ----------
const d = document.createElement("dialog");
d.className = "fremviser";
d.setAttribute("aria-label", "Billedfremviser");
d.innerHTML = `
  <figure><img alt=""><figcaption></figcaption></figure>
  <button class="fv-luk" type="button" aria-label="Luk billedet">×</button>
  <button class="fv-forrige" type="button" aria-label="Forrige billede">‹</button>
  <button class="fv-naeste" type="button" aria-label="Næste billede">›</button>
  <p class="fv-taeller" aria-live="polite"></p>`;
document.body.append(d);
const img = d.querySelector("img"), tekst = d.querySelector("figcaption"), taeller = d.querySelector(".fv-taeller");
let nr = 0;
const links = () => [...document.querySelectorAll(".galleri figure > a")];

function vis(i) {
  const alle = links();
  nr = (i + alle.length) % alle.length;
  const a = alle[nr], lille = a.querySelector("img"), fig = a.closest("figure");
  img.src = a.href;
  img.alt = lille.alt;
  tekst.textContent = "";
  tekst.append(...[...fig.querySelector("figcaption").childNodes].map((n) => n.cloneNode(true)));
  taeller.textContent = `Billede ${nr + 1} af ${alle.length}`;
}
galleri.addEventListener("click", (e) => {
  const a = e.target.closest("figure > a");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); vis(links().indexOf(a)); d.showModal();
});
d.querySelector(".fv-luk").addEventListener("click", () => d.close());
d.querySelector(".fv-forrige").addEventListener("click", () => vis(nr - 1));
d.querySelector(".fv-naeste").addEventListener("click", () => vis(nr + 1));
d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
d.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") vis(nr - 1);
  if (e.key === "ArrowRight") vis(nr + 1);
});
let x0 = null;
d.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
d.addEventListener("touchend", (e) => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  if (Math.abs(dx) > 50) vis(nr + (dx < 0 ? 1 : -1));
  x0 = null;
});

// ---------- Start ----------
(async () => {
  mig = await hentBruger();
  if (kanSkrive(mig)) {
    $("#upload-boks").hidden = false;
    $("#u-godkend-note").hidden = erAdmin(mig);
  }
  hentBilleder();
})();
