// Teste do Web Push: o que o Worker cifra tem de ser decifrável pelo aparelho (RFC 8291) e o JWT VAPID tem de ter assinatura válida.
import test from "node:test";
import assert from "node:assert/strict";
import { gerarVapid, encryptPayload, sendPush, b64u, unb64u, subValida } from "../src/push.js";

const enc = new TextEncoder(), dec = new TextDecoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));

async function novoAparelho() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  return { kp, pub, auth, sub: { endpoint: "https://push.example.test/abc", keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
}
async function decifrar(ap, body) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ap.kp.privateKey, 256));
  const ikm = await hkdf(ap.auth, secret, cat(enc.encode("WebPush: info\0"), ap.pub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), ct));
  assert.equal(plain[plain.length - 1], 2, "delimitador de preenchimento");
  return dec.decode(plain.slice(0, -1));
}

test("cifra e decifra ida e volta (com acentos)", async () => {
  const ap = await novoAparelho();
  const msg = { title: "ITUB4 · compra", body: "R$ 38,10 · 7% abaixo da máxima · nota 82", url: "./#/ativo/ITUB4" };
  const body = await encryptPayload(ap.sub, msg);
  assert.deepEqual(JSON.parse(await decifrar(ap, body)), msg);
});

test("sendPush monta cabeçalhos e assinatura VAPID válidos", async () => {
  const v = await gerarVapid(), ap = await novoAparelho();
  const env = { VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(v.privateJwk), VAPID_SUBJECT: "mailto:teste@example.com" };
  let visto;
  const f = globalThis.fetch; globalThis.fetch = async (url, init) => { visto = { url, init }; return new Response(null, { status: 201 }); };
  try {
    const r = await sendPush(env, ap.sub, { title: "oi" });
    assert.equal(r.ok, true);
  } finally { globalThis.fetch = f; }
  assert.equal(visto.url, ap.sub.endpoint);
  assert.equal(visto.init.headers["Content-Encoding"], "aes128gcm");
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(visto.init.headers.Authorization); assert.ok(m);
  const [h, p, s] = m[1].split(".");
  assert.equal(m[2], v.publicKey);
  assert.equal(JSON.parse(dec.decode(unb64u(p))).aud, "https://push.example.test");
  const pub = await crypto.subtle.importKey("raw", unb64u(v.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64u(s), enc.encode(h + "." + p)), true);
  assert.equal(JSON.parse(await decifrar(ap, visto.init.body)).title, "oi");
});

test("inscrição morta (410) é sinalizada", async () => {
  const v = await gerarVapid(), ap = await novoAparelho();
  const env = { VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(v.privateJwk) };
  const f = globalThis.fetch; globalThis.fetch = async () => new Response(null, { status: 410 });
  try { assert.deepEqual((await sendPush(env, ap.sub, "x")).gone, true); } finally { globalThis.fetch = f; }
});

test("subValida recusa endereço que não é https", () => {
  assert.equal(subValida({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }), false);
  assert.equal(subValida({ endpoint: "https://x", keys: { p256dh: "a", auth: "b" } }), true);
});
