// WhatsApp Cloud API (Meta): enviar texto/documento/modelo, baixar mídia e conferir a assinatura do webhook.
import { hmacHex, safeEq } from "./util.js";

const base = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}`;
async function call(env, path, init = {}) {
  const r = await fetch(base(env) + path, { ...init, headers: { Authorization: `Bearer ${env.WA_TOKEN}`, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${j.error?.message || "erro"}`);
  return j;
}
const msg = (env, payload) => call(env, `/${env.WA_PHONE_ID}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...payload }) });

export const sendText = (env, to, body) => msg(env, { to, type: "text", text: { body: String(body).slice(0, 4000), preview_url: false } });

export async function sendDocument(env, to, bytes, filename, mime, caption = "") {
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp"); fd.append("type", mime);
  fd.append("file", new Blob([bytes], { type: mime }), filename);
  const up = await call(env, `/${env.WA_PHONE_ID}/media`, { method: "POST", body: fd });
  return msg(env, { to, type: "document", document: { id: up.id, filename, ...(caption ? { caption } : {}) } });
}

/** Modelo aprovado (necessário para o robô escrever primeiro, fora das 24 h da última mensagem do usuário). */
export const sendTemplate = (env, to, name, lang = "pt_BR") => msg(env, { to, type: "template", template: { name, language: { code: lang } } });

export async function downloadMedia(env, id, maxBytes = 12e6) {
  const meta = await call(env, `/${id}`);
  if (meta.file_size && meta.file_size > maxBytes) throw new Error("Arquivo grande demais.");
  const r = await fetch(meta.url, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } });
  if (!r.ok) throw new Error("Não consegui baixar a mídia.");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("Arquivo grande demais.");
  return { bytes, mime: (meta.mime_type || "").split(";")[0] };
}

/** Confere X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o segredo do app da Meta). */
export async function verifySignature(env, rawBody, header) {
  if (!env.WA_APP_SECRET || !header || !header.startsWith("sha256=")) return false;
  return safeEq(await hmacHex(env.WA_APP_SECRET, rawBody), header.slice(7));
}
