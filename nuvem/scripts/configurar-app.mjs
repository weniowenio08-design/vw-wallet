// Liga o app à nuvem. Uso:  node scripts/configurar-app.mjs https://uiracu-nuvem.SEU-USUARIO.workers.dev
// Escreve docs/config.json ({ api, vapid }) e libera esse endereço (e só ele) na política de segurança do app (connect-src).
import fs from "node:fs";

const api = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(api)) { console.error("Passe o endereço do Worker, ex.: https://uiracu-nuvem.exemplo.workers.dev"); process.exit(1); }
const vapidFile = new URL("../.segredos/vapid.json", import.meta.url);
if (!fs.existsSync(vapidFile)) { console.error("Rode antes: node scripts/gerar-vapid.mjs"); process.exit(1); }
const vapid = JSON.parse(fs.readFileSync(vapidFile, "utf8")).publicKey;

const docs = new URL("../../docs/", import.meta.url);
fs.writeFileSync(new URL("config.json", docs), JSON.stringify({ api, vapid }, null, 2) + "\n");

const idx = new URL("index.html", docs); let h = fs.readFileSync(idx, "utf8");
h = h.replace(/connect-src [^;"]*/, `connect-src 'self' ${api}`);
fs.writeFileSync(idx, h);
console.log("Pronto: docs/config.json criado e connect-src liberado para", api);
