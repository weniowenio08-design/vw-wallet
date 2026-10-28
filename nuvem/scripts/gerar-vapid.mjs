// Gera as chaves VAPID dos avisos push. Uso:  node scripts/gerar-vapid.mjs
// Grava o par em nuvem/.segredos/vapid.json (fora do Git) e mostra os comandos para guardar no Cloudflare.
import fs from "node:fs";
import { gerarVapid } from "../src/push.js";

const dir = new URL("../.segredos/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const alvo = new URL("vapid.json", dir);
if (fs.existsSync(alvo)) { console.log("Já existe um par em nuvem/.segredos/vapid.json. Apague-o se quiser gerar outro (os avisos já ligados deixam de funcionar)."); process.exit(0); }
const v = await gerarVapid();
fs.writeFileSync(alvo, JSON.stringify({ publicKey: v.publicKey, privateJwk: v.privateJwk }, null, 2), { mode: 0o600 });
console.log("Chave pública (vai no wrangler.toml em VAPID_PUBLIC_KEY e no config.json do app):\n" + v.publicKey);
console.log("\nChave privada: guardada em nuvem/.segredos/vapid.json. Para enviá-la ao Cloudflare:");
console.log("  node -e \"process.stdout.write(JSON.stringify(require('./.segredos/vapid.json').privateJwk))\" | npx wrangler secret put VAPID_PRIVATE_JWK");
