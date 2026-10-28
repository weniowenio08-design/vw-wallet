// Liga a IA (Google Gemini) para o bot entender ÁUDIO e FOTO DE NOTA. Uso (PowerShell, pasta nuvem):  node scripts/ligar-ia.mjs
// 1) Pede a chave (criada em https://aistudio.google.com/apikey). 2) Confere se ela funciona e se o modelo existe.
// 3) Guarda a chave como segredo no Cloudflare (sem mostrar). 4) Se o modelo padrão não existir, escolhe um "flash" e republica.
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";

const toml = new URL("../wrangler.toml", import.meta.url);
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });
const chave = await ask("Cole a chave do Google AI Studio (o formato muda: pode começar com AIza, AQ. ou outra coisa) e aperte Enter: ");
if (!/^[0-9A-Za-z._-]{30,}$/.test(chave)) { console.error("Isso não parece uma chave: use o botão Copiar do Google AI Studio (sem espaços, com 30 caracteres ou mais)."); process.exit(1); }

const get = async (caminho) => { const r = await fetch("https://generativelanguage.googleapis.com/v1beta/" + caminho, { headers: { "x-goog-api-key": chave } }); return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }; };
let modelo = "gemini-2.5-flash";
let r = await get(`models/${modelo}`);
if (r.status === 400 || r.status === 403) { console.error("A chave foi recusada pelo Google (" + (r.j.error?.message || r.status) + "). Gere outra em aistudio.google.com/apikey."); process.exit(1); }
let trocou = false;
if (!r.ok) {
  const lista = await get("models?pageSize=100");
  const achado = (lista.j.models || []).filter((m) => /flash/.test(m.name) && !/lite|image|tts|live|thinking|exp/.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, "")).sort().reverse()[0];
  if (!achado) { console.error("Não achei um modelo Gemini 'flash' disponível para essa chave."); process.exit(1); }
  modelo = achado; trocou = true;
}
console.log("Chave válida. Modelo: " + modelo);
const p = spawnSync("npx", ["wrangler", "secret", "put", "GEMINI_API_KEY"], { input: chave, encoding: "utf8", shell: true });
if (p.status !== 0) { console.error("Não consegui guardar a chave: " + (p.stderr || "").slice(0, 200)); process.exit(1); }
if (trocou) {
  let t = fs.readFileSync(toml, "utf8");
  t = /^GEMINI_MODEL\s*=.*$/m.test(t) ? t.replace(/^GEMINI_MODEL\s*=.*$/m, `GEMINI_MODEL = "${modelo}"`) : t.replace("[vars]", `[vars]\nGEMINI_MODEL = "${modelo}"`);
  fs.writeFileSync(toml, t);
  const d = spawnSync("npx", ["wrangler", "deploy"], { cwd: new URL("..", import.meta.url), encoding: "utf8", shell: true });
  if (d.status !== 0) { console.error(d.stderr || d.stdout); process.exit(1); }
}
console.log("Pronto! Mande um áudio ou a foto de uma nota ao bot para testar.");
