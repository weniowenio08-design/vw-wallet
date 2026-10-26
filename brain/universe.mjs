// Universo vigiado pelo cérebro. core=true: empresa/fundo de qualidade que cabe no perfil
// "seguro e de longo prazo" (só estes podem gerar oferta forte). Os demais só ficam em observação.
export const UNIVERSE = [
  // ---- Ações brasileiras
  { sym: "ITUB4", name: "Itaú", type: "acao", core: true, sector: "Bancos" },
  { sym: "BBDC4", name: "Bradesco", type: "acao", core: false, sector: "Bancos" },
  { sym: "BBAS3", name: "Banco do Brasil", type: "acao", core: false, sector: "Bancos" },
  { sym: "BPAC11", name: "BTG Pactual", type: "acao", core: false, sector: "Bancos" },
  { sym: "SANB11", name: "Santander Brasil", type: "acao", core: false, sector: "Bancos" },
  { sym: "B3SA3", name: "B3", type: "acao", core: true, sector: "Serviços financeiros" },
  { sym: "BBSE3", name: "BB Seguridade", type: "acao", core: true, sector: "Seguros" },
  { sym: "PSSA3", name: "Porto Seguro", type: "acao", core: true, sector: "Seguros" },
  { sym: "WEGE3", name: "WEG", type: "acao", core: true, sector: "Indústria" },
  { sym: "PETR4", name: "Petrobras", type: "acao", core: true, sector: "Petróleo" },
  { sym: "VALE3", name: "Vale", type: "acao", core: true, sector: "Mineração" },
  { sym: "SUZB3", name: "Suzano", type: "acao", core: true, sector: "Papel e celulose" },
  { sym: "KLBN11", name: "Klabin", type: "acao", core: false, sector: "Papel e celulose" },
  { sym: "CPLE3", name: "Copel", type: "acao", core: true, sector: "Energia elétrica" },
  { sym: "EGIE3", name: "Engie Brasil", type: "acao", core: true, sector: "Energia elétrica" },
  { sym: "TAEE11", name: "Taesa", type: "acao", core: true, sector: "Energia elétrica" },
  { sym: "CMIG4", name: "Cemig", type: "acao", core: false, sector: "Energia elétrica" },
  { sym: "SBSP3", name: "Sabesp", type: "acao", core: true, sector: "Saneamento" },
  { sym: "ABEV3", name: "Ambev", type: "acao", core: true, sector: "Bebidas" },
  { sym: "RADL3", name: "RaiaDrogasil", type: "acao", core: true, sector: "Varejo farmacêutico" },
  { sym: "VIVT3", name: "Vivo (Telefônica)", type: "acao", core: true, sector: "Telecom" },
  { sym: "RENT3", name: "Localiza", type: "acao", core: false, sector: "Locação" },
  { sym: "MGLU3", name: "Magazine Luiza", type: "acao", core: false, sector: "Varejo" },
  { sym: "CYRE3", name: "Cyrela", type: "acao", core: false, sector: "Construção" },
  { sym: "MRVE3", name: "MRV", type: "acao", core: false, sector: "Construção" },
  // ---- Fundos imobiliários
  { sym: "KNCR11", name: "Kinea Rendimentos", type: "fii", core: true, sector: "FII papel" },
  { sym: "KNHF11", name: "Kinea Hedge Fund", type: "fii", core: true, sector: "FII híbrido" },
  { sym: "MXRF11", name: "Maxi Renda", type: "fii", core: false, sector: "FII papel" },
  { sym: "CPTS11", name: "Capitânia Securities", type: "fii", core: false, sector: "FII papel" },
  { sym: "HGLG11", name: "CSHG Logística", type: "fii", core: true, sector: "FII logística" },
  { sym: "BRCO11", name: "Bresco Logística", type: "fii", core: true, sector: "FII logística" },
  { sym: "BTLG11", name: "BTG Logística", type: "fii", core: true, sector: "FII logística" },
  { sym: "XPLG11", name: "XP Log", type: "fii", core: true, sector: "FII logística" },
  { sym: "XPML11", name: "XP Malls", type: "fii", core: true, sector: "FII shopping" },
  { sym: "HGBS11", name: "Hedge Brasil Shopping", type: "fii", core: true, sector: "FII shopping" },
  { sym: "VISC11", name: "Vinci Shopping Centers", type: "fii", core: true, sector: "FII shopping" },
  { sym: "KNRI11", name: "Kinea Renda Imobiliária", type: "fii", core: true, sector: "FII híbrido" },
  { sym: "TRXF11", name: "TRX Real Estate", type: "fii", core: true, sector: "FII renda urbana" },
  { sym: "HGRU11", name: "CSHG Renda Urbana", type: "fii", core: true, sector: "FII renda urbana" },
  // ---- ETFs na B3
  { sym: "IVVB11", name: "ETF S&P 500 (B3)", type: "etf", core: true, sector: "Exterior" },
  { sym: "BOVA11", name: "ETF Ibovespa", type: "etf", core: true, sector: "Índice" },
  { sym: "GOLD11", name: "ETF Ouro (B3)", type: "etf", core: true, sector: "Ouro" },
];

// Índices e indicadores de contexto (nunca viram "oferta")
export const CONTEXT = [
  { key: "ibov", yahoo: "^BVSP", name: "Ibovespa" },
  { key: "usd", yahoo: "BRL=X", name: "Dólar (R$)" },
  { key: "sp500", yahoo: "^GSPC", name: "S&P 500" },
  { key: "ust10", yahoo: "^TNX", name: "Treasury 10 anos (%)" },
  { key: "brent", yahoo: "BZ=F", name: "Petróleo Brent (US$)" },
  { key: "gold", yahoo: "GC=F", name: "Ouro (US$)" },
];

export const toYahoo = (u) => (u.yahoo ? u.yahoo : u.sym + ".SA");
