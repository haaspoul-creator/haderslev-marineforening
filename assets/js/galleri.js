// Galleri: billedfremviser i fuld størrelse med pile, Esc og stryg på mobil.
import "./app.js";

const links = [...document.querySelectorAll(".galleri figure a")];
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

function vis(i) {
  nr = (i + links.length) % links.length;
  const a = links[nr], lille = a.querySelector("img"), fig = a.closest("figure");
  img.src = a.href;
  img.alt = lille.alt;
  tekst.innerHTML = fig.querySelector("figcaption").innerHTML;
  taeller.textContent = `Billede ${nr + 1} af ${links.length}`;
}
links.forEach((a, i) => a.addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return; // åbn i ny fane som normalt
  e.preventDefault(); vis(i); d.showModal();
}));
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
