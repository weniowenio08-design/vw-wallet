# Uiraçu nuvem: assessor de gastos no WhatsApp + avisos com o ícone do app

Tudo aqui roda no plano **gratuito** do Cloudflare. O app continua funcionando sem isto (gastos anotados só no aparelho); a nuvem liga o WhatsApp, o relatório automático e os avisos push.

## O que cada peça faz
- **Worker** (`src/`): recebe o WhatsApp, anota gastos, guarda no banco D1, gera PDF e planilha, envia relatórios e dispara os avisos.
- **App** (`../docs`): aba **Gastos** (funciona sozinha) e botão **Conectar ao WhatsApp** (usa o Worker).
- **Cérebro do mercado** (`../brain`): passa a avisar pelo Worker (push com o ícone do Uiraçu). Se ninguém estiver inscrito, continua usando o ntfy.

## 1. Contas (só o Senhor Wayne cria; leva ~40 min)
1. **Cloudflare** (grátis): https://dash.cloudflare.com/sign-up
2. **Meta para desenvolvedores**: https://developers.facebook.com > *Criar app* > tipo **Empresa** > adicionar o produto **WhatsApp**.
   - Em *WhatsApp > Configuração da API* aparece um **número de teste**. Anote o **ID do número de telefone** (`WA_PHONE_ID`) e o número do bot (`WA_BOT_NUMBER`).
   - Em *Para*, **adicione seu número e o do seu pai** (recebem um código por WhatsApp). O número de teste só conversa com números cadastrados (até 5): perfeito para a família.
   - O token temporário vale 24 h. Para um **token permanente**: Business Manager > *Usuários do sistema* > criar usuário > gerar token com permissões `whatsapp_business_messaging` e `whatsapp_business_management` (`WA_TOKEN`).
   - Em *Configurações do app > Básico* copie o **Segredo do app** (`WA_APP_SECRET`).
3. **Modelo de mensagem** (para o relatório automático escrever primeiro): *WhatsApp > Modelos de mensagem* > criar `relatorio_mensal`, categoria **Utilidade**, idioma **Português (BR)**, texto: `Seu relatório do Uiraçu está pronto. Responda esta mensagem para recebê-lo.` Sem ele aprovado, o relatório automático ainda avisa pelo app e entrega o PDF quando você mandar qualquer mensagem ao bot.
4. **IA para áudio e foto (opcional)**: chave em https://aistudio.google.com/apikey (`GEMINI_API_KEY`). **Atenção:** áudio e fotos de notas vão para o Google; na camada gratuita ele pode usar o conteúdo para melhorar produtos. Texto e comandos **não** usam IA.

## 2. Comandos (PowerShell, nesta pasta: `app-carteira\nuvem`)
```powershell
npx wrangler login
npx wrangler d1 create uiracu            # copie o database_id para o wrangler.toml
npx wrangler d1 execute uiracu --remote --file=schema.sql
node scripts/gerar-vapid.mjs             # copie a chave pública para VAPID_PUBLIC_KEY no wrangler.toml
# preencha no wrangler.toml: database_id, WA_PHONE_ID, WA_BOT_NUMBER, VAPID_PUBLIC_KEY
node -e "process.stdout.write(JSON.stringify(require('./.segredos/vapid.json').privateJwk))" | npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler secret put WA_TOKEN
npx wrangler secret put WA_APP_SECRET
npx wrangler secret put WA_VERIFY_TOKEN  # invente uma frase longa; a mesma vai na Meta
npx wrangler secret put BRAIN_SECRET     # invente outra frase longa
npx wrangler secret put ALLOWED          # números permitidos: 5581999990000,5581988880000
npx wrangler secret put GEMINI_API_KEY   # opcional
npx wrangler deploy                      # mostra https://uiracu-nuvem.SEU-USUARIO.workers.dev
```
Depois, na Meta: *WhatsApp > Configuração > Webhook*: URL `https://uiracu-nuvem.SEU-USUARIO.workers.dev/wa`, token = `WA_VERIFY_TOKEN`, assinar o campo **messages**.

Ligar o app e o cérebro à nuvem:
```powershell
node scripts/configurar-app.mjs https://uiracu-nuvem.SEU-USUARIO.workers.dev
cd ..
gh variable set UIRACU_API --body "https://uiracu-nuvem.SEU-USUARIO.workers.dev"
gh secret set BRAIN_SECRET            # a mesma frase de BRAIN_SECRET acima
git add -A; git commit -m "Uiraçu: gastos, nuvem e avisos push"; git push
gh workflow run brain.yml
```

## 3. Testar
1. No app: **Mais > Avisos do Uiraçu > Ligar** e **Enviar um aviso de teste** (deve chegar com o ícone do Uiraçu).
2. **Gastos > Conectar ao WhatsApp**: toque em *Abrir o WhatsApp e enviar o código* e envie. O bot responde "Conectado".
3. Mande ao bot: `gastei 45 no mercado`, um áudio, a foto de uma nota, `relatório`, `planilha`, `resumo`, `desfazer`, `relatório automático dia 30`.
4. Logs ao vivo: `npx wrangler tail`.

## 4. Ícone da tela inicial que não mudou
O Chrome no Android guarda o ícone no momento da instalação do app (WebAPK) e **não troca sozinho quando o `manifest` muda** (a atualização automática cobre cor, atalhos e nome, não o ícone; não adianta esperar 24 h). Solução: **desinstalar o Uiraçu do celular e instalar de novo** depois de publicar a versão nova. O selo da barra de status (silhueta da harpia) já vai junto no aviso push.

## 5. Limites honestos
- WhatsApp: o robô só escreve **primeiro** com modelo aprovado; dentro de 24 h após sua última mensagem, responde e envia arquivos à vontade (grátis). Um modelo mensal de utilidade pode custar centavos se a Meta exigir cartão.
- Seus gastos ficam num banco no Cloudflare (conta do Senhor Wayne), ligado ao número de cada pessoa; o app mantém uma cópia no aparelho. Para o app existir só no celular, não ligue a nuvem.
- Limite de 5 usuários (`MAX_USERS`) e 40 áudios/fotos por dia por pessoa (`AI_DAILY_LIMIT`).
- O mês do relatório automático: do dia 11 em diante é o mês corrente; do dia 1 ao 10 é o mês que fechou.

## 6. Testes automáticos (sem internet)
`node --test test/push.test.mjs` e `node --test test/bot.test.mjs` (15 verificações: assinatura do webhook, vínculo, anotação, comandos, IA simulada, relatório, agendador, push).
