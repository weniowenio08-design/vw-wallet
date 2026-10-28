// Telegram Bot API: enviar texto/documento, baixar voz/foto e converter o texto do bot (estilo WhatsApp: *negrito*, _itálico_) para HTML.
const api = (env) => `https://api.telegram.org/bot${env.TG_BOT_TOKEN}`;

async function call(env, method, body, form = false) {
  const r = await fetch(`${api(env)}/${method}`, form ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${r.status}: ${j.description || "erro"}`);
  return j.result;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** *negrito* e _itálico_ do texto do bot viram HTML do Telegram; o resto é escapado. */
export const toHtml = (t) => esc(t).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<i>$2</i>").replace(/`([^`\n]+)`/g, "<code>$1</code>");

/** Menu "/" do Telegram: lista os comandos para tocar, sem digitar. */
export const MENU = [["comandos", "Todos os comandos"], ["resumo", "Resumo do mês"], ["ultimos", "Últimos lançamentos"], ["saldo", "Quanto sobra em cada conta"], ["relatorio", "Relatório em PDF"], ["planilha", "Planilha do mês"], ["modoempresa", "Anotar na conta da empresa"], ["modopessoal", "Anotar na conta pessoal"], ["desfazer", "Apagar o último lançamento"], ["apagartudo", "Apagar todos (pede confirmação)"], ["pararrelatorio", "Parar o relatório automático"], ["ajuda", "Como usar"]];
export const setCommands = (env) => call(env, "setMyCommands", { commands: MENU.map(([command, description]) => ({ command, description })) });

export const sendText = (env, chat, body) => call(env, "sendMessage", { chat_id: /^-?\d+$/.test(String(chat)) ? Number(chat) : chat, text: toHtml(String(body)).slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });

export async function sendDocument(env, chat, bytes, filename, mime, caption = "") {
  const fd = new FormData();
  fd.append("chat_id", String(chat)); fd.append("document", new Blob([bytes], { type: mime }), filename);
  if (caption) fd.append("caption", String(caption).slice(0, 900));
  return call(env, "sendDocument", fd, true);
}

const MIME = { oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
export async function downloadMedia(env, fileId, maxBytes = 12e6) {
  const f = await call(env, "getFile", { file_id: fileId });
  if (f.file_size && f.file_size > maxBytes) throw new Error("Arquivo grande demais.");
  const r = await fetch(`https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error("Não consegui baixar o arquivo.");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("Arquivo grande demais.");
  return { bytes, mime: MIME[String(f.file_path).split(".").pop().toLowerCase()] || "" };
}
