// Kører hjemmesiden uden Vercel: statiske filer + API.
// Brug:  DATABASE_URL=postgres://... node tools/server.mjs   (port 8080, eller PORT=...)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import handler from "../api/index.js";

const ROD = new URL("..", import.meta.url).pathname;
const TYPER = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf", ".xml": "application/xml", ".txt": "text/plain", ".mp4": "video/mp4", ".vtt": "text/vtt" };
const SKJULT = /^\/(api|tools|node_modules|\.git)(\/|$)|\.(md|json|mjs)$/;

http.createServer(async (req, res) => {
  const sti = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (sti.startsWith("/api/")) return handler(req, res);
  try {
    if (SKJULT.test(sti)) throw 0;
    let fil = normalize(join(ROD, sti));
    if (!fil.startsWith(ROD)) throw 0;
    if ((await stat(fil)).isDirectory()) {
      if (!sti.endsWith("/")) { res.writeHead(301, { Location: sti + "/" }); return res.end(); }
      fil = join(fil, "index.html");
    }
    res.writeHead(200, { "Content-Type": TYPER[extname(fil)] || "application/octet-stream" });
    res.end(await readFile(fil));
  } catch {
    res.writeHead(404, { "Content-Type": TYPER[".html"] });
    res.end(await readFile(join(ROD, "404.html")));
  }
}).listen(process.env.PORT || 8080, () => console.log("Kører på http://localhost:" + (process.env.PORT || 8080)));
