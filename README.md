# Raio-X do Site — analisador de sites e landing pages

Cole o endereço de um site (e de até 3 concorrentes) e receba um relatório completo, em português, com **nota geral**, **panorama por área**, **comparação com a concorrência** e um **plano de ação** dizendo o que mudar e em que ordem.

## Por que um site (e não extensão ou plugin)?

| Formato | Prós | Contras |
|---|---|---|
| **Site (escolhido)** | A cliente só cola a URL, funciona em qualquer aparelho, analisa vários concorrentes em paralelo, roda um navegador real no servidor (velocidade no celular, fontes, cores), relatório em PDF | Precisa de hospedagem |
| Extensão do Chrome | Analisa a página aberta | Só funciona no Chrome do usuário; bloqueios de CORS dificultam medir concorrentes; instalação afasta clientes |
| Plugin WordPress | Fica dentro do painel | Só serve para WordPress; não analisa concorrentes com qualidade |

A arquitetura deixa a porta aberta: a API (`POST /api/analyze`) pode ser usada depois por uma extensão ou plugin que só exibe o relatório.

## Design

A interface segue o design system **Conversão Extrema** — veja [`DESIGN.md`](DESIGN.md): fonte Geist, ícones Phosphor (servidos localmente, sem CDN), tokens de cor claro/escuro, superfícies definidas por borda de 1px (sem sombra), CTA *shiny* com borda esmeralda giratória, botão secundário com anel no hover, grade de pontos de fundo, selos `soft`/`deep`, paleta de gráfico `chart-1..3` em ordem fixa (a 4ª série usa neutro hachurado) e densidade `ds-app` no relatório. Alternância de tema persistida em `localStorage('theme')`, com script anti-flash.

## Colocar no ar no Render (passo a passo)

O repositório já traz o `render.yaml` (Blueprint) e o `Dockerfile` com o Chromium.

1. Crie uma conta em [render.com](https://render.com) e conecte o GitHub.
2. No painel: **New → Blueprint** e escolha o repositório `controle-de-site` (branch com este código).
3. O Render vai pedir os valores das variáveis:
   - `ADMIN_EMAIL` — seu e-mail de acesso (vira o primeiro administrador).
   - `ADMIN_PASSWORD` — senha inicial (mínimo 8 caracteres; troque depois em **Minha conta**).
   - `PAGESPEED_API_KEY` — opcional, chave gratuita do Google PageSpeed.
4. Confirme. O primeiro deploy leva alguns minutos (instala o Chromium). No fim aparece o endereço `https://raio-x-do-site.onrender.com` (ou parecido).
5. Abra o endereço, entre com o e-mail/senha do passo 3 e cadastre a equipe em **Equipe**.

Custos e limites: o plano `starter` (≈ US$ 7/mês) + disco de 1 GB (≈ US$ 0,25/mês) guarda os relatórios. Ele roda uma análise por vez (`LOW_MEMORY=1`, `MAX_CONCURRENT_JOBS=1`). Se análises de sites pesados falharem por falta de memória, troque o plano para `standard` e, se quiser mais velocidade, remova `LOW_MEMORY` e aumente `MAX_CONCURRENT_JOBS` para 2. `ADMIN_EMAIL`/`ADMIN_PASSWORD` só são usados quando o banco ainda não tem nenhum usuário.

## Login e acesso

- **Contas**: só administradores criam contas (**Equipe → Adicionar pessoa**), com senha provisória gerada na hora e texto pronto para enviar. Administradores também geram nova senha, mudam papel (membro/administrador), desativam e excluem contas. Sempre fica pelo menos um administrador ativo.
- **Minha conta**: cada pessoa troca a própria senha (encerra as sessões em outros dispositivos).
- **Segurança**: senhas com scrypt, sessão em cookie `HttpOnly`/`SameSite=Lax` (e `Secure` em HTTPS) válida por 30 dias, limite de 8 tentativas de login a cada 15 minutos, proteção contra CSRF por cabeçalho obrigatório e nenhum dado acessível sem login.
- **Histórico da equipe**: todos os membros veem as análises da equipe; só quem criou a análise ou um administrador pode excluí-la.
- **Link do cliente**: no relatório, **Compartilhar com o cliente** gera um link secreto `/p/<código>` que abre só aquele relatório, sem login e sem acesso a mais nada. **Desativar link** invalida o endereço na hora.

## Demonstração estática

`npm run demo -- <id-do-relatorio> <pasta>` gera uma versão navegável sem servidor (dados simulados no navegador) a partir de relatórios salvos — útil para apresentar a ferramenta.

## Relatórios salvos

Toda análise é gravada em um banco SQLite embutido do Node (`node:sqlite`, sem dependência extra) junto com as imagens:

- **Link permanente** — cada relatório fica em `/r/<id>` e pode ser enviado ao cliente (botão "Copiar link do relatório").
- **Histórico** — a página inicial lista as análises salvas, com filtro por endereço e opção de excluir.
- **Evolução** — ao analisar a mesma página de novo, o relatório mostra a variação da nota geral e de cada área em relação à análise anterior, e um gráfico com todas as análises daquela página.

Os dados ficam em `DATA_DIR` (padrão `./data`). Faça backup dessa pasta.

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
ADMIN_EMAIL=voce@empresa.com ADMIN_PASSWORD=uma-senha-forte npm start   # http://localhost:3000
```

Na primeira execução o administrador é criado com esses dados; depois as variáveis podem ser removidas.

Variáveis (veja `.env.example`):

- `PAGESPEED_API_KEY` — chave gratuita do [Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started). Adiciona a nota oficial do Google, métricas Lighthouse e dados de usuários reais (CrUX).
- `CHROME_PATH` — caminho do Chrome/Chromium, se não for detectado.
- `MAX_CONCURRENT_JOBS` — análises simultâneas (padrão 2).

### Docker

```bash
docker build -t raio-x-site .
docker run -p 3000:3000 -v raiox-dados:/app/data -e PAGESPEED_API_KEY=sua-chave raio-x-site
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
server.js                    API (fila de análises, relatórios salvos) + arquivos estáticos
src/store.js                 Banco SQLite: relatórios, imagens, histórico, usuários, sessões
src/auth.js                  Senhas (scrypt), cookies de sessão, limite de tentativas
render.yaml                  Blueprint para publicar no Render
scripts/build-demo.mjs       Gera a demonstração estática
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
POST /api/login · POST /api/logout · GET /api/me · POST /api/me/password
GET/POST /api/users · PATCH/DELETE /api/users/:id      (administrador)
POST/DELETE /api/reports/:id/share                      → cria/desativa o link do cliente
GET  /api/public/:token                                 → relatório pelo link do cliente (sem login)
GET  /api/reports?q=&limit=      → análises salvas (mais recentes primeiro)
GET  /api/reports/:id           → relatório completo + histórico da mesma página
GET  /api/reports/:id/img/:n    → imagens do relatório (capturas e recortes)
DELETE /api/reports/:id         → exclui a análise
GET  /api/health    → { browser: true|false, pagespeed: true|false }
```

Todas as rotas exceto login, link público e `/api/health` exigem sessão; requisições que alteram dados exigem o cabeçalho `x-requested-with: raio-x`.

Por segurança o servidor recusa endereços internos (localhost, 10.x, 192.168.x…). Para testes locais use `ALLOW_PRIVATE_URLS=1`.

## Próximos passos sugeridos

- Resumo e recomendações de copy escritos por IA a partir dos dados coletados.
- Separar histórico por cliente/projeto e permissões por cliente.
- Marca/logotipo da agência no PDF (white label).
- Extensão do Chrome que chama esta API para analisar a aba aberta.
