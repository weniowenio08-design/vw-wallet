# VW Wallet Investments

App para o celular (Oppo Find X9 Pro) que **vigia o mercado 24 horas, mesmo com o app fechado**, e avisa por notificação quando aparece uma boa oferta para um investidor **seguro e de longo prazo**. Os valores que você digita (patrimônio, metas, favoritos) ficam **só no celular**.

## Como funciona

```
┌──────────────────────────┐   a cada 30 min no pregão    ┌────────────────────────┐
│ Cérebro (GitHub Actions) │ ───────────────────────────▶ │ App (GitHub Pages)     │
│ preços, juros, notícias, │      publica os dados        │ instalado na tela do   │
│ indicadores, sinais      │                              │ celular, abre rápido   │
└───────────┬──────────────┘                              └────────────────────────┘
            │ oferta boa? ──▶ notificação pelo ntfy ──▶ celular (app fechado, tela apagada)
```

- **Não gasta tokens.** O cérebro usa regras e indicadores (queda da máxima, RSI, média de 200 dias, dividend yield) e lê notícias por RSS. Uma chave da Anthropic (opcional) só gera um resumo do dia.
- **Perfil seguro:** só ativos de qualidade (lista `core`) viram "oferta"; com o Ibovespa em estresse, as ofertas ficam "em espera".
- **Fontes:** Yahoo Finance (preços e dividendos), Banco Central (Selic, CDI, dólar, IPCA, boletim Focus), Tesouro Transparente (taxas do Tesouro), CVM (informe mensal dos FIIs), notícias de InfoMoney, Money Times, Exame, G1, Folha, Estadão, Agência Brasil, Seu Dinheiro, Investing.com, Suno, Google Notícias, logos da brapi.

## O que o app tem
Hoje (panorama, ofertas, agenda, Focus do Banco Central, taxas do Tesouro, lembrete do aporte) · Mercado (altas, quedas, filtros e ordem) · Notícias (Brasil, mundo, meus ativos) · Carteira (patrimônio, metas, aporte sugerido, plataformas com busca entre ~60 bancos, corretoras, fintechs, plataformas do exterior e de cripto, e aceita qualquer outro nome) · Perfil de investidor (9 perguntas) · Gráficos de 24 h, 2 dias, 1 semana, 1 mês, 1 ano e 5 anos · Favoritos e alertas de preço · Busca global · Dicionário (toque no "?" ao lado das siglas).


**Novidades da v1.1 (estudo de 26/10):** saúde da carteira (nota de 0 a 1000, cinco pilares) e teste de estresse contra o seu limite de perda; P/VP oficial dos FIIs (informe da CVM); renda estimada; simuladores (patrimônio e meta, CDB x LCI x Tesouro, imposto na venda); trilha de 10 lições; PIN de bloqueio; avisos por categoria. Veja `ESTUDO - o que faltava e o que foi feito.md`.

## Avisos por categoria (ntfy)
Assine **dois** tópicos no ntfy: o tópico do arquivo `SEGREDOS-NAO-COMPARTILHAR.txt` (ofertas) e o mesmo tópico com `-mercado` no fim (mudança do clima do mercado e notícias importantes).

## Publicar (uma vez só)

Precisa de uma conta **GitHub gratuita** (criar a conta é com você). Depois, no PC:

1. `gh auth login` (escolha GitHub.com, HTTPS, navegador).
2. Na pasta do projeto: `gh repo create vw-wallet --public --source . --push`
   - Público é necessário para o GitHub Actions ser grátis e ilimitado. **Nada pessoal está no repositório**: só dados públicos de mercado.
3. Ative o Pages: `gh api -X POST repos/{seu-usuario}/vw-wallet/pages -f build_type=workflow`
4. Segredos: `gh secret set NTFY_TOPIC` (cole o tópico do arquivo `SEGREDOS-NAO-COMPARTILHAR.txt`). Opcional: `gh secret set ANTHROPIC_API_KEY`.
5. Variável: `gh variable set APP_URL --body "https://{seu-usuario}.github.io/vw-wallet/"`
6. Rode uma vez: `gh workflow run brain.yml`

## No celular (Oppo)
1. Abra o endereço do app no **Chrome** > menu ⋮ > **Instalar app** (ou "Adicionar à tela inicial"). Ele vira um ícone com a logo VW.
2. Instale o **ntfy** (Play Store ou F-Droid), toque em **+** e assine o tópico secreto.
3. **Importante na ColorOS:** Configurações > Bateria > ntfy > **sem restrições**; Configurações > Apps > ntfy > **início automático** ligado; deixe as notificações do ntfy em **prioridade alta**.
4. No app, aba **Mais**, cole o tópico e toque em "Permitir avisos".

## Limites honestos
- O GitHub pode atrasar ou pular execuções agendadas (às vezes 5 a 30 minutos). Não é um sistema de negociação em tempo real.
- Fontes gratuitas podem mudar ou falhar. O Yahoo Finance é não oficial; o app mostra "último dado salvo" se algo cair.
- Os sinais são regras objetivas e não previsões. O estudo histórico (aba Mais) mostra uma vantagem pequena e tem viés de sobrevivência.
- Alertas de preço criados no app conferem o preço quando o app atualiza; para aviso com o app fechado, use as ofertas do ntfy.
- É material de estudo, não recomendação personalizada. Quem compra e vende é você, pelos seus bancos e corretoras.

## Arquivos
- `brain/universe.mjs`: lista de ativos vigiados (edite para incluir outros).
- `brain/run.mjs`: o cérebro. `brain/backtest.mjs`: estudo de 10 anos. `brain/logos.mjs`: baixa logos.
- `docs/`: o app (`index.html`, `main.js`, `style.css`, `sw.js`, `manifest.webmanifest`) e `docs/data` (gerado).
- `.github/workflows/brain.yml`: o agendamento na nuvem.
- Rodar local: `node brain/run.mjs` (use `NO_NOTIFY=1` para não enviar avisos) e `py -m http.server 8765` dentro de `docs`.
