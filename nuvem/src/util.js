// Utilidades do Worker: respostas JSON, CORS, hashes, números de WhatsApp.
export const json = (d, status = 200, h = {}) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...h } });

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/** CORS: só o endereço do app (APP_ORIGIN) pode chamar a API pelo navegador. */
export function corsHeaders(req, env) {
  const o = req.headers.get("Origin");
  if (o && env.APP_ORIGIN && o === env.APP_ORIGIN) return { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Invite", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400", Vary: "Origin" };
  return { Vary: "Origin" };
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
export const sha256hex = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export async function hmacHex(key, data /* ArrayBuffer | string */) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, typeof data === "string" ? new TextEncoder().encode(data) : data));
}
export function safeEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

export const digits = (s) => String(s || "").replace(/\D/g, "");
/** Celular brasileiro: o WhatsApp às vezes entrega 12 dígitos (sem o 9 depois do DDD). Normaliza para 13. */
export function normWa(n) { let d = digits(n); if (d.startsWith("55") && d.length === 12 && /^[6-9]/.test(d.slice(4))) d = d.slice(0, 4) + "9" + d.slice(4); return d; }
export const maskWa = (n) => (n ? `+${n.slice(0, 2)} ${n.slice(2, 4)} •••••${n.slice(-4)}` : "");
export const randCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
export const toB64 = (bytes) => { let s = ""; const C = 0x8000; for (let i = 0; i < bytes.length; i += C) s += String.fromCharCode.apply(null, bytes.subarray(i, i + C)); return btoa(s); };
