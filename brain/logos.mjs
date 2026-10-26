// Baixa uma vez os logos dos ativos vigiados para docs/logos (o app não depende de site de terceiros).
import fs from "node:fs/promises";
import path from "node:path";
import { UNIVERSE } from "./universe.mjs";

const OUT = path.join(path.resolve(import.meta.dirname, ".."), "docs", "logos");
await fs.mkdir(OUT, { recursive: true });
let ok = 0, miss = [];
for (const u of UNIVERSE) {
  try {
    const r = await fetch(`https://icons.brapi.dev/icons/${u.sym}.svg`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const t = await r.text();
    if (!r.ok || !t.includes("<svg")) throw new Error("HTTP " + r.status);
    await fs.writeFile(path.join(OUT, u.sym + ".svg"), t);
    ok++;
  } catch (e) { miss.push(u.sym); }
  await new Promise((r) => setTimeout(r, 120));
}
console.log("logos:", ok, "de", UNIVERSE.length, miss.length ? "| sem logo: " + miss.join(", ") : "");
