# Raio-X do Site — analisador de sites e landing pages

Cole o endereço de um site (e de até 3 concorrentes) e receba um relatório completo, em português, com **nota geral**, **panorama por área**, **comparação com a concorrência** e um **plano de ação** dizendo o que mudar e em que ordem.

## Por que um site (e não extensão ou plugin)?

| Formato | Prós | Contras |
|---|---|---|
| **Site (escolhido)** | A cliente só cola a URL, funciona em qualquer aparelho, analisa vários concorrentes em paralelo, roda um navegador real no servidor (velocidade no celular, fontes, cores), relatório em PDF | Precisa de hospedagem |
| Extensão do Chrome | Analisa a página aberta | Só funciona no Chrome do usuário; bloqueios de CORS dificultam medir concorrentes; instalação afasta clientes |
| Plugin WordPress | Fica dentro do painel | Só serve para WordPress; não analisa concorrentes com qualidade |

A arquitetura deixa a porta aberta: a API (`POST /api/analyze`) pode ser usada depois por uma extensão ou plugin que só exibe o relatório.

## O que é analisado

| Área | Exemplos de verificações |
|---|---|
| ⚡ Velocidade | TTFB, LCP, FCP, CLS, carregamento no celular com 4G simulado, peso total, requisições, scripts bloqueantes, compressão, cache, HTTP/2, serviços de terceiros, nota do Google PageSpeed (opcional) |
| 🎯 Conversão | Botões de ação (quantidade, texto, visíveis na primeira tela no desktop e no celular), tamanho do formulário, WhatsApp/telefone, prova social, garantia/CNPJ/privacidade, FAQ, vídeo, headline, Analytics/GTM/Pixel |
| 🔎 SEO | Title, meta descrição, H1, hierarquia de títulos, canônica, noindex, idioma, Open Graph (prévia no WhatsApp), schema.org, quantidade de texto, robots.txt, sitemap, favicon |
| 📱 Celular | Viewport, rolagem lateral, alvos de toque pequenos, zoom bloqueado, comprimento da página |
| 🖼️ Imagens | Alt, WebP/AVIF, imagens pesadas, imagens maiores que o espaço exibido, lazy loading, imagem do topo com lazy, quebradas, width/height |
| 🔤 Fontes | Quantas famílias, **combinação títulos × textos** (serifada, sem serifa, decorativa), tamanho no celular, entrelinha, escala de tamanhos, pesos carregados, font-display, preconnect |
| 🎨 Cores | Paleta extraída da página, número de cores de destaque, **harmonia** (análoga, complementar, triádica, dispersa), **contraste WCAG** texto × fundo, se o botão principal se destaca |
| 🐞 Erros | Status HTTP, erros de JavaScript, arquivos que falham (404/500), CSS indisponível, links quebrados |
| ♿ Acessibilidade | Rótulos de formulário, botões só com ícone, estrutura semântica |
| 🔒 Segurança | HTTPS, conteúdo misto, cabeçalhos de segurança, versões expostas, plataforma detectada |

Cada item recebe status (bom / atenção / corrigir), **impacto** e **esforço**. O plano de ação ordena tudo por *impacto ÷ esforço* em três blocos: **Faça agora**, **Próximos passos** e **Melhorias contínuas**.

### Imagem do erro

Para os problemas visuais o relatório mostra um **recorte da página com o elemento destacado em vermelho**: texto com pouco contraste, botão principal, formulário, título (H1), imagens quebradas/pesadas/sem alt/maiores que o necessário, elementos que vazam da tela no celular, botões pequenos demais para o dedo e textos minúsculos no celular. Clique na imagem para ampliar.

### Comparação com concorrentes

Cada item da análise detalhada mostra **como cada concorrente se saiu na mesma verificação** (status e valor), com as imagens lado a lado (ex.: seu botão × botão do concorrente). No plano de ação aparece quem já faz bem aquele ponto.

Além disso o relatório mostra ranking, gráfico de notas por área, tabela de métricas lado a lado (com ★ no melhor), **onde você perde**, **o que os concorrentes fazem e você não** e **onde você está à frente**, e uma **comparação visual lado a lado**: primeira tela no desktop e no celular, botão principal, headline, tipografia do texto, formulário e a página inteira no celular.

## Como rodar

Requisitos: Node.js 20+ e Google Chrome/Chromium instalado (sem navegador a análise continua, mas mais limitada).

```bash
npm install
npm start            # http://localhost:3000
```

Variáveis (veja `.env.example`):

- `PAGESPEED_API_KEY` — chave gratuita do [Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started). Adiciona a nota oficial do Google, métricas Lighthouse e dados de usuários reais (CrUX).
- `CHROME_PATH` — caminho do Chrome/Chromium, se não for detectado.
- `MAX_CONCURRENT_JOBS` — análises simultâneas (padrão 2).

### Docker

```bash
docker build -t raio-x-site .
docker run -p 3000:3000 -e PAGESPEED_API_KEY=sua-chave raio-x-site
```

Funciona em qualquer serviço que rode containers (Railway, Render, Fly.io, VPS).

## Testes

```bash
npm test               # sem navegador (rápido)
npm run test:browser   # inclui a coleta com Chromium
```

Os testes sobem duas landing pages de exemplo (`test/fixtures/ruim.html` e `boa.html`) e verificam notas, checagens, plano de ação e comparação.

## Estrutura

```
server.js                    API (fila de análises) + arquivos estáticos
public/                      Interface (HTML/CSS/JS puro)
src/analyzer/
  collect.js                 Baixa HTML, CSS, robots, sitemap, links; abre o navegador
  browser.js                 Chromium (desktop + celular com 4G): métricas, requisições, estilos, imagens, CTAs, screenshots
  pagespeed.js               Integração opcional com Google PageSpeed
  checks/*.js                Uma regra de negócio por área
  scoring.js                 Notas por área, nota geral, plano de ação e resumo
  compare.js                 Comparação com concorrentes
src/utils/                   Cores (contraste/harmonia) e segurança de URLs
```

## API

```
POST /api/analyze   { "url": "https://site.com", "competitors": ["https://c1.com"] }  → { "id": "..." }
GET  /api/jobs/:id  → { status: queued|running|done|error, progress, result }
GET  /api/img/:id/:n → imagens do relatório (capturas e recortes), disponíveis por 6 horas
GET  /api/health    → { browser: true|false, pagespeed: true|false }
```

Por segurança o servidor recusa endereços internos (localhost, 10.x, 192.168.x…). Para testes locais use `ALLOW_PRIVATE_URLS=1`.

## Próximos passos sugeridos

- Resumo e recomendações de copy escritos por IA a partir dos dados coletados.
- Histórico de análises por cliente (banco de dados) e acompanhamento da evolução da nota.
- Marca/logotipo da agência no PDF (white label).
- Extensão do Chrome que chama esta API para analisar a aba aberta.
