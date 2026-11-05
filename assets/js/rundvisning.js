// Rundvisning: kapitelknapper springer til et tidspunkt i videoen.
import "./app.js";
const video = document.getElementById("video");
for (const k of document.querySelectorAll("[data-tid]")) {
  k.addEventListener("click", () => { video.currentTime = Number(k.dataset.tid); video.play().catch(() => {}); video.focus(); });
}
