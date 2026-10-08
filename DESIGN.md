# Conversão Extrema — Design System

> Documento de referência do design system. Fonte única dos tokens:
> o bloco `@theme` de `src/index.css` (junto das variáveis de tema).
> Biblioteca de componentes: `src/components/ui`.

**Stack:** React 18 · Tailwind CSS 4.3 · Vite · @phosphor-icons/react
**Temas:** claro e escuro (classe `dark` em `<html>`, persistida em `localStorage`)

---

## 1. Princípios

1. **Clean e refinado** — superfícies definidas por bordas hairline de 1px, não por sombras. Tipografia calibrada, muito respiro, acento esmeralda usado com parcimônia.
2. **Hierarquia por exceção** — a página inteira é aérea (cards 100% transparentes, só contorno). O único bloco com preenchimento opaco e elevação é a tabela de planos: o ponto de conversão.
3. **Tokens antes de valores** — cor, tipo, raio e motion vêm de tokens nomeados. Se a paleta mudar no `@theme` de `src/index.css`, o sistema inteiro acompanha.
4. **Tema é variável, não fork** — os tokens semânticos são CSS variables trocadas entre `:root` e `.dark`; nenhum componente conhece o tema.
5. **Microinterações com assinatura** — a borda esmeralda giratória é a assinatura da marca: contínua nos CTAs shiny, revelada no hover do secundário.

---

## 2. Tipografia

**Fonte:** [Geist](https://vercel.com/font) (300–700), `-webkit-font-smoothing: antialiased`.

Escala nomeada — use os primitivos `Display` / `Heading` / `Text` em vez de classes soltas:

| Token | px | Peso | Leading | Tracking | Uso |
| :--- | ---: | ---: | ---: | ---: | :--- |
| `display-2xl` | 72 | 600 | 1.0 | −0.04em | Heros de altíssimo impacto |
| `display-xl` | 60 | 600 | 1.02 | −0.035em | Hero principal |
| `display-lg` | 48 | 600 | 1.05 | −0.03em | Hero secundário / CTA final |
| `heading-xl` | 40 | 600 | 1.1 | −0.022em | Título de página (h1) |
| `heading-lg` | 32 | 600 | 1.15 | −0.02em | Título de seção (h2) |
| `heading-md` | 24 | 600 | 1.25 | −0.017em | Subtítulo (h3) |
| `heading-sm` | 20 | 600 | 1.3 | −0.013em | Título de card (h4) |
| `body-xl` | 20 | 400 | 1.6 | 0 | Sub-headline / lead |
| `body-lg` | 18 | 400 | 1.6 | 0 | Parágrafo destacado |
| `body-md` | 16 | 400 | 1.6 | 0 | Corpo padrão |
| `body-sm` | 14 | 400 | 1.55 | 0 | Texto de apoio |
| `label-lg` | 15 | 500 | 1.2 | −0.006em | Botões / rótulos |
| `label-md` | 13 | 500 | 1.2 | 0 | Rótulos compactos |
| `caption` | 12 | 400 | 1.4 | 0 | Legendas / metadados |
| `eyebrow` | 12 | 400 | 1.0 | +0.14em | Rótulo uppercase acima de títulos |
| `code` | 13 | 400 | 1.6 | 0 | Trechos de código (mono) |

Regra de ouro: títulos com tracking negativo (densidade ótica), corpo com 1.6 de entrelinha.

---

## 3. Cor

### 3.1 Escalas brutas

- **Neutral** `0–950` — neutra quente proprietária (`#ffffff → #0a0a0a`), com passo extra `150` (`#ececec`) para hairlines.
- **Emerald** `50–950` — acento da marca; `500 = #10b981` é o tom canônico.
- **Feedback** — `success #10b981` · `warning #f5a623` · `danger #ef4444` · `info #3b82f6`.

### 3.2 Tokens semânticos (temáveis)

Definidos como canais RGB em CSS variables (`src/index.css`) para permitir opacidade via Tailwind (`bg-ink/5`):

| Token | Claro | Escuro | Papel |
| :--- | :--- | :--- | :--- |
| `canvas` | `#fafafa` | `#0a0a0a` | Fundo da página |
| `surface` | `#ffffff` | `#171717` | Superfície de cards / navbar |
| `elevated` | `#f5f5f5` | `#262626` | Superfície elevada (planos, hovers) |
| `ink` | `#171717` | `#fafafa` | Títulos e texto principal |
| `body` | `#262626` | `#d1d1d1` | Texto de corpo |
| `mute` | `#525252` | `#a8a8a8` | Texto secundário |
| `faint` | `#a1a1a1` | `#737373` | Placeholder / desabilitado |
| `hairline` | `#ececec` | `#262626` | Bordas 1px |
| `hairline-strong` | `#d4d4d4` | `#404040` | Bordas com mais presença |
| `inverse` / `on-inverse` | `#171717` / `#fff` | `#fafafa` / `#0a0a0a` | Fundo/texto do CTA primário |

### 3.3 Pares `soft` / `deep` — fundo e texto de selo

`soft` é o fundo, `deep` é o texto. Existem para `emerald` e para os quatro de estado (`success` · `warning` · `danger` · `info`), e **trocam com o tema**:

| | Claro | Escuro |
| :--- | :--- | :--- |
| `*-soft` | tom pálido do matiz (`#d1fae5`, `#fef3c7`, `#fee2e2`, `#dbeafe`) | o próprio matiz a **16%** |
| `*-deep` | passo escuro (`#047857`, `#b45309`, `#b91c1c`, `#1d4ed8`) | passo **400** (`#34d399`, `#fbbf24`, `#f87171`, `#60a5fa`) |

Sobre fundo escuro o "deep" legível é o **claro**, não o escuro — com o passo de origem o texto ficava mais escuro que o próprio fundo do selo. E o par escuro não é o claro invertido: é redesenhado para a superfície escura.

Os 16% e os passos 400 foram medidos, não escolhidos no olho: o texto fica entre **5,5:1 e 7,9:1** sobre `surface` e sobre `elevated` — acima dos 4,5:1 que 11px em negrito exige.

> ⚠️ Seleção de texto (`::selection`) **não** usa este par. Fundo de selo é discreto de propósito; seleção precisa ser inconfundível, e 16% de matiz mal se distinguiria do fundo. Ela tem `--sel-bg`/`--sel-fg` próprios.

### 3.4 Paleta categórica de gráfico

`--chart-1` · `--chart-2` · `--chart-3` — três matizes em **ordem fixa, nunca ciclada**.

| Token | Claro | Escuro |
| :--- | :--- | :--- |
| `--chart-1` | `#2a78d6` | `#3987e5` |
| `--chart-2` | `#eb6834` | `#d95926` |
| `--chart-3` | `#1baf7a` | `#199e70` |

Três regras que valem toda vez que a paleta aparece:

1. **A cor segue a entidade, nunca o ranking.** Filtrar uma série não pode repintar as que sobraram — Black é sempre `chart-1`, mesmo quando cai para terceiro lugar.
2. **Uma quarta série não vira um matiz novo.** Ela vira "Outros", facetas ou codificação composta. Gerar o quarto passo derruba a separação.
3. **A identidade nunca depende só da cor.** Com 2+ séries a legenda está sempre presente, e o terceiro passo — que fica abaixo de 3:1 de contraste no claro — sempre acompanha a mesma série numa tabela.

A escolha foi validada, não estimada: sob simulação de daltonismo a pior separação entre todos os pares é ΔE 9.2 no claro e 9.4 no escuro, contra alvo de 8. **A marca não lidera aqui de propósito** — com o esmeralda no lugar do azul a separação caía para 4.2 em tritanopia. Cor de gráfico responde a legibilidade; o verde da marca segue vivendo nos estados e nos acentos. Os passos escuros não são inversão automática dos claros: cada um foi escolhido e revalidado contra `surface` do modo escuro.

### 3.5 Gradiente da marca

`--brand-grad-from → --brand-grad-to` = **emerald-500 `#10b981` → emerald-400 `#34d399`**, sempre da esquerda para a direita.

> ⚠️ O gradiente é **100% esmeralda** — ele NUNCA parte do preto, do branco ou da cor
> do texto. E ele se aplica **apenas ao trecho destacado** do título (o `<HoverHeadline>`);
> o resto do título permanece sólido na cor `ink`.
> Certo: `Venda mais com <span gradiente>IA pronta para usar</span>`
> Errado: título inteiro em gradiente preto→verde.

Utilities:

- `text-brand-gradient` — texto com o gradiente (background-clip).
- `hover-text-shine` — idem, com brilho que varre o texto no hover (usado por `HoverHeadline`).
- `bg-brand-gradient` — preenchimento (badges, selos de check, play).
- `fill-brand-gradient` — preenchimento de SVG com o gradiente. Alcança o `<path>` descendente, então pode ser aplicada no ícone ou num wrapper.
- `ds-app` — **escopo de densidade de aplicação.** Reaponta três famílias de token: **raio** (`sm` 6 · `md` 8 · `lg` 12 · `xl` 16), **tipografia** um degrau abaixo (`heading-xl` 28 · `heading-lg` 22 · `heading-md` 18 · `heading-sm` 15 · `body-lg` 15 · `body-md` 14) e a **forma do campo** (`--ds-input-*`: 36px de altura, canto discreto no lugar da pílula). O eyebrow também muda de caráter: 0.06em e peso 600, em vez de 0.14em e peso 400. Aplique no elemento raiz do shell (dashboard, login, telas internas) e todos os componentes dentro passam a usar a calibragem menor — nenhum componente muda, porque na v4 todo utilitário compila para `var(--radius-*)`. Mesmo mecanismo do `.dark`. Regra de bolso: raio até ~10% da altura do bloco.
- `icon-duotone` — pinta o segundo tom dos ícones `weight="duotone"` do Phosphor com o acento esmeralda, mantendo o contorno em `currentColor`. Ajuste por instância com `--icon-duotone-accent` e `--icon-duotone-opacity`. **Disponível, mas fora do padrão** — ver §8.

O `<linearGradient id="brand-gradient">` vive em um `<svg>` oculto no `App.jsx` — obrigatório para `fill-brand-gradient` funcionar.

---

## 4. Espaçamento, raio, elevação, motion, breakpoints

- **Espaçamento** — base 4px (`0.5=2px … 22=88px`), mais `section` (96px) e `gutter`.
- **Raio** — `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 40 · full`. Cards usam `xl`; selos internos `md`/`full`; pílulas `full`.
- **Elevação** — `shadow-xs…xl` discretas, usadas com muita parcimônia. Na landing, **os únicos elementos com sombra projetada são os cards de plano**; todo o resto se separa por borda de 1px. No tema escuro sombra projetada praticamente não lê sobre fundo escuro — mais um motivo para não depender dela.
- **Motion** — durações `fast 150 · normal 200 · slow 300 · slower 500` (ms); easings `out-soft cubic-bezier(0.22,1,0.36,1)` e `in-out-soft cubic-bezier(0.65,0,0.35,1)`.
- **Breakpoints** — `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1440`. Container máx. 1200px (`container-wide` 1360px).

---

## 5. Tema claro / escuro

- Fonte de verdade: classe `dark` em `<html>`. O hook `useTheme` (em `ThemeToggle.jsx`) usa `useSyncExternalStore` — todos os toggles ficam sincronizados.
- Persistência em `localStorage('theme')`; script anti-flash no `index.html` aplica o tema antes da primeira pintura (fallback: `prefers-color-scheme`).
- Componentes nunca leem o tema: usam tokens semânticos ou variantes `dark:` do Tailwind.

---

## 6. Componentes (`src/components/ui`)

Tudo é importado do barrel `components/ui`:

```jsx
import { Button, PricingCard, useSpotlight } from './components/ui'
```

> **Antes desta seção, veja `src/lib/catalog.js`.** Este capítulo descreve o que
> cada componente **é**; o catálogo descreve **quando ele é a escolha certa** —
> escopo, props, um `quandoUsar` e um `evite` por componente, mais o índice de
> decisão (`decisoes`) e as regras transversais (`regras`). É um arquivo de dados,
> então serve tanto a quem lê o repositório quanto à aba **Componentes**, que é
> montada a partir dele. Os dois não têm como divergir.

### 6.1 Primitivos e tipografia

| Componente | Props principais | Notas |
| :--- | :--- | :--- |
| `SidebarNav` | Navegação lateral: `groups` (com subtítulo em `ink`, mais contraste que os itens), submenus, item ativo em pílula, `collapsed` para a faixa de ícones. Gatilho de recolher é um círculo montado na borda. `header` aceita função `({ collapsed }) => nó` |
| `Logo` | `variant`: `full` (símbolo + wordmark) · `symbol` (só o símbolo, para menu recolhido, favicon, avatar) |
| `Breadcrumbs` | Trilha de navegação, menor que o título da página — é orientação, não conteúdo. **Derive a trilha da própria árvore de navegação**, não escreva à mão em cada tela: escritas separadamente, uma hora elas discordam, e é a trilha que discorda calada. Item intermediário sem tela própria vai sem `href` e sai como texto |
| `Table` | Tabela dirigida por dados: `columns` (`align`, `numeric`, `render`, `renderFooter`, `sortable`, `sortValue`) + `rows` + `footer` + `defaultSort`. O `footer` é a linha de total, em `<tfoot>` — numa tabela que soma para um número mostrado em outro lugar da tela, é o total que deixa conferir, e em `<tfoot>` ele fica parado quando a ordem muda. **Ordenação** é interna por padrão (`sortable` na coluna) e vira controlada com `sort` + `onSortChange`. Seleção e paginação continuam de fora |
| `DateInput` / `DateRangeField` | Data nativa com a casca do sistema. No par, o `max` da inicial é a final e o `min` da final é a inicial — validação por construção, o calendário não deixa escolher um fim antes do começo. Valor em ISO; o formato **exibido** é o do navegador |
| `MetricCard` | Quadrante de número: `label` · `value` · `delta` (número, não string) · `higherIsBetter` · `comparison`. **Direção e sentido são coisas diferentes**: a seta vem do sinal do `delta`, a cor vem de `delta × higherIsBetter`. Métricas onde cair é a boa notícia (reembolso, churn, custo) passam `higherIsBetter={false}` |
| `Container` | `className` | Largura máx. + gutters |
| `Section` | `id`, `className` | Padding vertical de seção |
| `Eyebrow` | — | Rótulo uppercase com tracking largo |
| `SectionHeader` | `eyebrow`, `title`, `description` | Cabeçalho centralizado das sections |
| `Stars` | `size` | 5 estrelas com o gradiente da marca |
| `Display` / `Heading` / `Text` | `size`/`level`, `tone` | Encapsulam a escala nomeada |
| `Code` / `Kbd` / `Link` | — | Inline utilitários |

### 6.2 Button

Pílula. `variant`: `shiny` (padrão) · `shiny-brand` · `secondary` · `ghost`. `size`: `sm · md · lg`. `icon` desliza no hover. `as` polimórfico (`a`, etc).

- **`shiny`** — CTA primário: fundo grafite em gradiente, **borda esmeralda giratória contínua** (`@property --gradient-angle` + `border-spin` 2.5s) e **faixa diagonal de pontos esmeralda** no lado direito (máscara `125°` de 54% a 85% — código completo no Apêndice A.2).
- **`shiny-brand`** — pílula esmeralda com borda branca giratória e pontos brancos.
- **`secondary`** — branco no claro / transparente com anel `hairline-strong` 1px no escuro. **Hover:** anel esmeralda giratório (pseudo-elemento `::after` mascarado, reusa `border-spin`); no escuro também preenche de **branco com texto escuro** (espelha o estado de repouso do tema claro).
- **`ghost`** — texto puro com fundo `ink/10` no hover.
- `ButtonIconBadge` — wrapper de compatibilidade: `Button` shiny com ícone.

### 6.3 Cards

| Componente | Uso |
| :--- | :--- |
| `Card` (`variant="flat"`) | Borda 1px, fundo `surface` — UI densa |
| `Card` (`variant="premium"`) | Superfície de marketing (ver §7.1) |
| `FeatureIconCard` | Selo circular (`bg-emerald/[0.08]`, ícone `text-ink`) + título + descrição. Usado na seção "Para quem é" |
| `MediaCard` | Imagem 16:10 no topo, badge sobreposta, conteúdo |
| `TestimonialCard` | Estrelas, citação, autor com selo verificado |
| `VideoTestimonialCard` | Thumbnail com play, badge de resultado, duração |
| `PricingCard` | Plano (ver §7.2); `featured` adiciona anel esmeralda + escala 1.04 + CTA shiny |

### 6.4 Composição e estrutura

| Componente | Uso |
| :--- | :--- |
| `Navbar` | Sticky, `surface/80` + blur, logo temável, links, toggle e CTAs |
| `Footer` | Wordmark, links legais |
| `Faq` | Acordeão acessível (aria-expanded), ícone `+` que gira para `×`. Estado aberto marcado só por borda e fundo esmeralda diluído |
| `Stats` | Grade de métricas (`dark` para fundo escuro) |
| `Container` | `size`: `default` (1200px) · `wide` (1360px) · `fluid` (sem teto, para shell de app) |
| `SectionHeader` | `measure`: `2xl` (672px, padrão editorial) · `prose` · `false` (sem teto — use em layout de aplicação) |
| `SolutionShowcase` | Bloco texto + visual alternável (`reverse`); ícone de contorno com `fill-brand-gradient` |
| `Marquee` | Loop infinito CSS puro, `duration`/`repeat`/`gapClass`, fade nas bordas, pausa no hover |
| `DotGrid` | Fundo de pontos com spotlight esmeralda que segue o cursor |
| `VideoLightbox` | Preview mudo em loop (YouTube nocookie) + lightbox fullscreen via portal |
| `FadeIn` | Reveal com IntersectionObserver; `delay`, `direction` |
| `HoverHeadline` | Trecho de título com `hover-text-shine` |
| `ThemeToggle` / `useTheme` | Alternância de tema sincronizada |
| `Input` / `Field` | `shape`: `auto` (pílula na landing, canto discreto dentro de `.ds-app`) · `pill` · `soft`; `icon` adiciona ícone à esquerda. Foco esmeralda |
| `Select` | `<select>` nativo com a casca do sistema — mesma altura, raio e padding do `Input`, para alinhar numa barra de filtros. Nativo de propósito: teclado, rolagem, busca por digitação e o picker do mobile vêm de graça |
| `SegmentedControl` | `options` (`[{ value, label }]`) + `value` + `onChange`. Escolha única entre **2–4** opções curtas, todas à vista. Passando disso, ou com rótulo longo, use `Select` |
| `Badge` | Tons de marca `emerald` · `soft` · `neutral`; tons de estado `success` · `warning` · `danger` · `info` (fundo diluído + texto escuro do próprio matiz) |

### 6.5 Hooks

- **`useSpotlight()`** (`src/lib/useSpotlight.js`) — publica a posição do ponteiro em `--spot-x/--spot-y` (throttle por `requestAnimationFrame`). Espalhe o retorno no card; o CSS desenha dois efeitos a partir dessas coordenadas: o brilho interno (`::after`, só na superfície premium) e o brilho de borda (`::before`, nas duas superfícies).

---

## 7. Superfícies de card (regras de ouro)

### 7.1 `.premium-card` — o card padrão de marketing

Sem preenchimento decorativo, sem `backdrop-filter` e **sem sombra projetada** em nenhum
dos temas. A definição vem inteiramente da borda hairline de 1px:

| tema | fundo |
| :--- | :--- |
| **Claro** | branco chapado (`surface`), sem gradiente |
| **Escuro** | **100% transparente** — a grade de pontos da página atravessa |

- **Hover**: eleva 2px (`translateY`) e acende dois brilhos alimentados pelo `useSpotlight`, ambos com `pointer-events: none` e nenhuma mudança de sombra:
  - **borda** (`::before`) — anel de 1px por cima da hairline, com um radial de 220px ancorado no cursor. A máscara em `mask-composite: exclude` recorta o miolo e deixa só a moldura (mesma técnica do hover do botão secundário). Vale também para a superfície flat, via `.card-glow`.
  - **interior** (`::after`) — radial esmeralda de 260px. Exclusivo da premium: na flat, que é opaca, não aparece.
- O brilho de borda é de propósito **sem bloom externo**: no sistema a superfície é definida pelo contorno, não pela elevação — então o que acende é o contorno.
- Nenhum brilho interno de aresta estático: sobre branco chapado é invisível e, no escuro, somava com a borda lendo como 2px.

### 7.2 `.ds-plan-card` — exclusivo dos planos

O único bloco com corpo **e o único com sombra projetada** na página:

- Preenchimento **opaco** em diagonal 135°: claro `surface → canvas` (praticamente branco, receita do botão secundário); escuro `elevated → surface` + tinta esmeralda 6% na quina inferior direita.
- Aresta de vidro no topo (`inset 0 1px 0` branco 60%/7%) e sombra projetada leve, que cresce um pouco no hover.
- Racional: a tabela de preços é o ponto de conversão — merece o único nível extra de elevação.
- **Empilhamento**: o plano em destaque usa `scale(1.04)`; para a sua sombra passar por cima dos vizinhos, o **wrapper** dele precisa de `position: relative; z-index: 10`. Um `z-index` no card não basta se o wrapper tiver `transform` (isso cria stacking context).

### 7.3 Efeitos com máscara — lição aprendida

Os `@property` do ângulo da borda giratória (`--gradient-angle`, `--gradient-angle-offset`) são registrados com **`inherits: false`**. Isso é essencial: o ângulo anima a 60fps e só o próprio botão o usa — com herança ligada, todo descendente era re-estilizado a cada frame, o que fazia o WebKit descartar a camada mascarada dos pontos (causa dos bugs históricos dos "shiny dots"). As máscaras em si (`--dots-mask`) ficam em custom properties comuns, nunca registradas.

---

## 8. Landing — ordem narrativa

`Hero (vídeo) → Logos (Marquee) → Soluções → Para quem é → Depoimentos → Planos → Sobre o fundador → FAQ → CTA final`

- "Para quem é" fica **entre Soluções e Depoimentos**: o leitor entende o produto, se reconhece no perfil e cai na prova social — tudo antes do preço.
- Brilho esmeralda do hero: **existe só no tema escuro** (`opacity-10`); no claro a camada nem é renderizada (`hidden dark:block`).
- Botão flutuante do WhatsApp: `Button` shiny com selo em `bg-brand-gradient`.

---

## 9. Anti-padrões

- ❌ Sombra projetada escura no tema escuro (invisível; use borda + gradiente).
- ❌ `hex` solto em componente — use token semântico ou escala.
- ❌ `strokeWidth` em ícone do Phosphor. Os ícones são desenhados em `fill`, não em traço: a espessura vem de `weight` (`thin` · `light` · `regular` · `bold` · `fill` · `duotone`), que são seis desenhos distintos e não uma escala contínua.
- ❌ `tracking-eyebrow` (0.14em) em rótulo de formulário, cabeçalho de tabela ou qualquer etiqueta de UI. É tracking decorativo de marketing; em 12px ele espalha 1.7px por caractere e lê como enfeite. Use `tracking-label` (0.04em).
- ❌ `SectionHeader` sem `measure={false}` dentro de layout de aplicação — o teto de 672px deixa o cabeçalho com metade da largura da grade abaixo.
- ❌ Padrão repetido com o motivo centrado na quina do tile. Um ponto de raio 0.5px centrado em `1px 1px` cai entre quatro pixels, fica com ~20% de cobertura em cada e some em tela 1x — em 2x sobra resolução e ele aparece, então o defeito passa despercebido em monitor retina. Centre em `0.5px 0.5px` para o ponto cair dentro de um pixel. **Não engorde o raio para compensar:** isso deixa o ponto grosso em vez de alinhado.
- ❌ `duotone` em card ou selo. Ícone preenchido pesa demais numa página que se sustenta em linhas de 1px — o contorno puro (`regular`) é que conversa com o layout. A utility existe para um bloco de destaque isolado; abaixo de ~20px nem isso, porque os dois tons empastam.
- ❌ Gráfico de eixo duplo (duas escalas de y). É o erro de gráfico mais comum: a correlação que ele parece mostrar é escolhida por quem definiu as escalas. Duas medidas de grandeza diferente → dois gráficos, facetas, ou indexadas a uma base comum.
- ❌ Cor de gráfico atribuída por posição no ranking. A cor pertence à entidade; se um filtro repinta as séries que sobraram, todo o histórico visual da tela se perde.
- ❌ Esmaecer as séries não focadas no hover. A 45% de opacidade elas leem como **desabilitadas**, não como fora de foco. Realce a que está sob o cursor (fundo `ink/[0.04]`) e deixe o tooltip dirigir a atenção.
- ❌ Ordenar tabela pelo que está escrito na célula em vez de pelo dado. `"R$ 9.800"` vem antes de `"R$ 12.000"` por texto; `"01/07"` vem antes de `"30/06"`; `"Ontem"` vem antes de `"Hoje"`. Sempre que `render` monta a célula a partir de outro campo, a coluna precisa de `sortValue`.
- ❌ Preset de período e intervalo de datas como dois estados separados. Um é atalho do outro: o intervalo é a fonte da verdade e o segmentado só mostra qual preset, se algum, coincide com ele. Separados, o botão "7 dias" acaba marcado com outras datas nos campos ao lado.
- ❌ Delta calculado contra um período anterior incompleto. 30 dias comparados com os 12 que havia antes dizem qualquer coisa — sem janela anterior inteira, o delta some.
- ❌ Um booleano só (`up`) governando a seta **e** a cor de um delta. São dois conceitos: a seta diz o que o número fez, a cor diz se isso é bom. Junte-os e quem precisa de vermelho num número que subiu acaba com a seta apontando para baixo ao lado de um `+0,4%`. Use `delta` (com sinal) × `higherIsBetter`.
- ❌ Delta sem base de comparação nomeada. "+12,4%" contra o quê? Se não há período para comparar, não mostre delta — e não mostre a legenda "vs. …" sozinha, porque ela promete uma comparação que a tela não faz.
- ❌ Rótulo de eixo que não corresponde à posição da linha. Dividir o máximo em quatro e arredondar os rótulos à parte põe a linha escrita "45k" em 45,75k. Calcule um passo redondo primeiro e deixe o topo do eixo cair num múltiplo dele.
- ❌ Controle de filtro que muda de estado e não muda a tela. Pior que não ter filtro: ensina que aquele controle não faz nada. Uma fatia só, e gráfico, indicadores e tabela se refazem todos contra ela.
- ❌ Marca que preenche a faixa. Coluna/barra tem teto de **24px** e o resto do slot é ar — bloco grosso e saturado lê alto e, em escala, meio infantil. O alvo de hover continua sendo a faixa inteira, não os 24px pintados.
- ❌ Coluna de tabela repetindo `R$ 0` linha após linha, ou uma coluna "Total" que duplica a única coluna de dados. Zero vira travessão em `faint`; coluna que duplica outra sai.
- ❌ Tooltip centrado no cursor, em cima da marca que ele descreve. Coloque ao lado, virando de lado na metade oposta do gráfico — o mesmo movimento evita o corte na borda.
- ❌ Canto arredondado na base de uma barra ancorada no eixo. O arredondamento vai só na **ponta do dado**; arredondar a base descola a marca do zero. Em barra empilhada, o vão de 2px fica **entre** os segmentos, nunca entre o último e a linha de base.
- ❌ Valor impresso em cima de toda barra ou ponto. Rótulo direto é seletivo (o pico, o último, o que a frase do título cita); o resto vive no hover e na tabela.
- ❌ Texto do gráfico na cor da série. Valores, rótulos e legenda usam token de texto (`ink` · `mute` · `faint`); quem carrega a identidade é a marca colorida ao lado.
- ❌ Registrar máscaras com `@property`, ou registrar o ângulo animado com `inherits: true` (ver §7.3).
- ❌ `backdrop-filter: blur` sobre a grade de pontos (apaga o padrão que deveria aparecer).
- ❌ Dar preenchimento/elevação a cards comuns — o destaque é exclusivo dos planos.

---

## 10. Checklist de fidelidade (erros comuns de reprodução)

Ao recriar este sistema em outra ferramenta/stack, confira item por item —
estes são os erros mais cometidos por geradores de código:

- [ ] **Botão shiny**: a borda esmeralda **GIRA continuamente** (animação `border-spin`
      de 2.5s no `--gradient-angle` registrado via `@property`). Sem `@property`,
      o conic-gradient não anima — não substitua por borda estática.
- [ ] **Pontos do shiny**: minúsculos — grade de **4×4px com pontos de 0.5px de raio**,
      centrados em `0.5px 0.5px` (ver §9) —
      e visíveis **só numa faixa diagonal** (máscara `125deg`, de 54% a 85%).
      Não são textura de fundo inteira nem pontos grandes.
- [ ] **Botão secundário**: no hover ganha **o anel esmeralda giratório** (pseudo-elemento
      `::after` com mask que exclui o miolo) e, **no tema escuro, preenche de branco
      com texto escuro**. Não é só "branco com borda".
- [ ] **Gradiente de título**: emerald-500 → emerald-400, **nunca preto→verde**,
      e **apenas no trecho destacado** — o resto do título fica em `ink`.
- [ ] **Selo de ícone dos cards**: círculo perfeito (`rounded-full`), fundo
      `emerald` a **8%**, **SEM borda**, ícone na cor `ink`. Igual em todas as sections.
- [ ] **Eyebrow**: só texto uppercase com tracking `0.14em` — **sem traço, hífen,
      barra ou qualquer ornamento antes do texto**.
- [ ] **Grade de pontos de fundo**: cobre a **página inteira** (camada fixa atrás de
      todas as sections), não apenas o hero. Raio menor no claro (`0.75px`).
- [ ] **Cards comuns**: **sem sombra projetada em nenhum tema** — claro = branco
      chapado (sem gradiente), escuro = 100% transparente. Só borda de 1px.
      **Cards de plano**: sempre opacos e os **únicos** com sombra.
- [ ] **Plano em destaque**: o wrapper precisa de `relative z-10`, senão a sombra
      dele fica atrás do card vizinho.
- [ ] **Brilho esmeralda do hero**: existe **só no tema escuro**.
- [ ] **Tipografia**: Geist; títulos com tracking negativo; pesos 500–600 (não 700+).

---

## Apêndice A — Código canônico (copie tal qual)

O código abaixo é extraído do repositório e é a **fonte de verdade** dos efeitos.
Ao portar para outra stack, preserve os valores — especialmente os números
pequenos (0.5px, 5px, 125deg, 2.5s): são eles que definem a assinatura visual.

### A.1 Variáveis de tema (claro/escuro)

```css
:root {
  --c-canvas: 250 250 250;   --c-surface: 255 255 255;  --c-elevated: 245 245 245;
  --c-ink: 23 23 23;         --c-body: 38 38 38;        --c-mute: 82 82 82;
  --c-faint: 161 161 161;    --c-hairline: 236 236 236; --c-hairline-strong: 212 212 212;
  --c-inverse: 23 23 23;     --c-on-inverse: 255 255 255;
  --brand-grad-from: #10b981; /* emerald-500 */
  --brand-grad-to:   #34d399; /* emerald-400 */
}
.dark {
  --c-canvas: 10 10 10;      --c-surface: 23 23 23;     --c-elevated: 38 38 38;
  --c-ink: 250 250 250;      --c-body: 209 209 209;     --c-mute: 168 168 168;
  --c-faint: 115 115 115;    --c-hairline: 38 38 38;    --c-hairline-strong: 64 64 64;
  --c-inverse: 250 250 250;  --c-on-inverse: 10 10 10;
}
/* Uso: color: rgb(var(--c-ink)); background: rgb(var(--c-surface) / 0.5); */
```

### A.2 Botão shiny (CTA primário) — borda giratória + pontos

```css
/* inherits:false é ESSENCIAL — ver §7.3 */
@property --gradient-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
@property --gradient-angle-offset { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

.shiny-cta {
  --gradient-angle: 0deg;
  position: relative;
  overflow: hidden;
  border-radius: 9999px;
  color: #fff;
  /* fundo grafite (padding-box) + borda cônica giratória (border-box) */
  background: linear-gradient(#1c2421, #0a0a0a) padding-box,
    conic-gradient(
      from var(--gradient-angle),
      transparent 0%, #047857 5%, #10b981 15%, #047857 30%, transparent 40%, transparent 100%
    ) border-box;
  border: 1px solid transparent;
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -2px 6px rgba(0,0,0,0.2),
    0 12px 24px -8px rgba(0,0,0,0.5);
  transition: box-shadow 300ms ease, transform 300ms ease;
  isolation: isolate;
  animation: border-spin 2.5s linear infinite;
}
@keyframes border-spin { to { --gradient-angle: 360deg; } }

.shiny-cta:hover {
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -2px 6px rgba(0,0,0,0.25),
    0 16px 32px -8px rgba(16,185,129,0.6);
}
.shiny-cta:active { transform: translateY(1px); }

/* Pontos: grade 5px, ponto de 0.5px, faixa diagonal 125° (54%→85%) */
.shiny-dots {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background-size: 5px 5px;
  --dots-mask: linear-gradient(
    125deg,
    transparent 54%, rgba(0,0,0,0.85) 66%, rgba(0,0,0,0.85) 74%, transparent 85%
  );
  -webkit-mask-image: var(--dots-mask);
  mask-image: var(--dots-mask);
}
.shiny-cta .shiny-dots {
  background-image: radial-gradient(circle at 1px 1px, rgba(16,185,129,0.6) 0.5px, transparent 0);
}
.shiny-brand .shiny-dots {
  background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 0.5px, transparent 0);
}

/* conteúdo acima da camada de pontos */
.shiny-cta-content {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
```

```html
<!-- Markup: a camada de pontos é um span irmão do conteúdo -->
<button class="shiny-cta px-8 py-4">
  <span class="shiny-dots" aria-hidden="true"></span>
  <span class="shiny-cta-content">Quero fazer parte →</span>
</button>
```

O `shiny-brand` (verde) é idêntico trocando: fundo `linear-gradient(#10b981, #047857)`,
brilho da cônica branco (`#fff` no lugar de `#10b981`) e sombras esverdeadas.

### A.3 Botão secundário — anel giratório no hover

```css
/* Repouso — claro: pílula branca; escuro: transparente com anel 1px */
.ds-btn-secondary {
  position: relative;
  overflow: hidden;
  border-radius: 9999px;
  /* claro */
  background: linear-gradient(to bottom, #fff, #fafafa);
  color: #171717;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 1px #fff,
    0 8px 20px -4px rgba(0,0,0,0.12);
}
.dark .ds-btn-secondary {
  background: transparent;
  color: rgb(var(--c-ink));
  box-shadow: inset 0 0 0 1px rgb(var(--c-hairline-strong));
}
/* Hover no escuro: preenche de BRANCO com texto escuro (espelha o claro) */
.dark .ds-btn-secondary:hover {
  background: #fff;
  color: #171717;
  box-shadow: none;
}

/* Anel esmeralda giratório revelado no hover (ambos os temas) */
.ds-btn-secondary::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px; /* espessura do anel */
  background: conic-gradient(
    from var(--gradient-angle),
    transparent 0%, #047857 5%, #10b981 15%, #047857 30%, transparent 40%, transparent 100%
  );
  /* desenha SÓ o anel: máscara exclui o miolo */
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 300ms ease;
  pointer-events: none;
  animation: border-spin 2.5s linear infinite;
}
.ds-btn-secondary:hover::after { opacity: 1; }
```

### A.4 Gradiente de título (trecho destacado)

```css
.text-brand-gradient {
  background-image: linear-gradient(to right, var(--brand-grad-from), var(--brand-grad-to));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
/* Variante com brilho que varre no hover */
.hover-text-shine {
  background-image: linear-gradient(
    110deg,
    var(--brand-grad-from) 0%, var(--brand-grad-to) 40%,
    #a7f3d0 50%,                       /* emerald-200: o "brilho" */
    var(--brand-grad-to) 60%, var(--brand-grad-from) 100%
  );
  background-size: 250% auto;
  background-position: 100% center;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  transition: background-position 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.hover-text-shine:hover { background-position: 0% center; }
```

```html
<!-- O gradiente cobre SÓ o trecho destacado; o resto fica em ink -->
<h1 style="color: rgb(var(--c-ink))">
  Venda mais gastando menos com
  <span class="hover-text-shine">IA pronta para usar</span>
</h1>
```

### A.5 Eyebrow — texto puro, sem ornamento

```html
<!-- SEM traço/hífen/barra antes do texto. Só uppercase + tracking largo. -->
<span style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase;
             color: rgb(var(--c-ink))">
  Para quem é
</span>
```

### A.6 Selo de ícone dos cards (FeatureIconCard)

```html
<!-- Círculo SEM borda, fundo esmeralda 8%, ícone na cor ink (44×44px) -->
<div style="width:44px; height:44px; border-radius:9999px;
            background: rgb(16 185 129 / 0.08);
            display:flex; align-items:center; justify-content:center;
            color: rgb(var(--c-ink))">
  <svg><!-- ícone Phosphor 20px, weight="duotone", fill currentColor --></svg>
</div>
```

Igual em **todas** as sections que usam card com ícone — não varia de seção para seção.

### A.7 Superfícies de card

```css
/* Card comum (premium-card) — SEM sombra projetada nos dois temas */
.premium-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgb(var(--c-hairline));
  /* CLARO: branco chapado, sem gradiente */
  background-color: rgb(var(--c-surface));
  box-shadow: none;
  transition: box-shadow 300ms ease, transform 300ms ease;
}
.premium-card:hover { transform: translateY(-2px); }
/* ESCURO: 100% transparente — só a borda de 1px */
.dark .premium-card { background: transparent; box-shadow: none; }

/* Card de plano (ds-plan-card) — SEMPRE opaco, o único bloco sólido da página */
.ds-plan-card {
  background-image: linear-gradient(135deg, rgb(var(--c-surface)) 0%, rgb(var(--c-canvas)) 100%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.6), 0 8px 30px rgb(23 23 23 / 0.06);
}
.dark .ds-plan-card {
  background-image:
    radial-gradient(115% 115% at 100% 100%, rgb(16 185 129 / 0.06) 0%, transparent 58%),
    linear-gradient(135deg, rgb(var(--c-elevated)) 0%, rgb(var(--c-surface)) 100%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 10px 28px rgb(0 0 0 / 0.3);
}
/* Plano em destaque: escala persistente + empilhamento acima dos vizinhos */
@media (min-width: 768px) {
  .pricing-featured { transform: scale(1.04); }
  .pricing-featured:hover { transform: translateY(-2px) scale(1.04); }
}

/* Luz que segue o cursor (opcional — precisa de JS publicando --spot-x/--spot-y) */
.premium-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease;
  background: radial-gradient(
    260px circle at var(--spot-x, 50%) var(--spot-y, 50%),
    rgba(16,185,129,0.14), transparent 68%
  );
}
.premium-card:hover::after { opacity: 1; }
```

/* Brilho de borda no hover — anel de 1px ancorado no cursor.
   `.card-glow` é o opt-in para superfícies flat. */
.premium-card::before,
.card-glow::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: radial-gradient(
    var(--card-glow-size, 220px) circle at var(--spot-x, 50%) var(--spot-y, 50%),
    var(--card-glow-core), var(--card-glow-edge) 45%, transparent 72%
  );
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 400ms ease;
  pointer-events: none;
}
.premium-card:hover::before,
.card-glow:hover::before { opacity: 1; }
```

```js
// JS do spotlight (por card; throttle em requestAnimationFrame)
card.addEventListener('pointermove', (e) => {
  const r = card.getBoundingClientRect()
  card.style.setProperty('--spot-x', `${e.clientX - r.left}px`)
  card.style.setProperty('--spot-y', `${e.clientY - r.top}px`)
})
```

```html
<!-- Grade de planos: o WRAPPER do destacado leva o z-index, não o card.
     Sem isso o vizinho da direita pinta por cima da sombra do destacado,
     porque o wrapper de animação (transform) cria um stacking context. -->
<div class="grid md:grid-cols-3 gap-6 items-start">
  <div>                       <!-- plano comum -->        …</div>
  <div class="relative z-10"> <!-- plano em DESTAQUE -->  …</div>
  <div>                       <!-- plano comum -->        …</div>
</div>
```

### A.8 Grade de pontos de fundo (página INTEIRA)

O raio do ponto é **temável** — menor no claro, para a grade não competir com o
conteúdo sobre fundo branco:

```css
:root  { --dot-r: 0.75px; --dot-r-fade: 1.2px; }  /* claro */
.dark  { --dot-r: 1px;    --dot-r-fade: 1.6px; }  /* escuro */
```

```html
<!-- Camada fixa atrás de TODO o conteúdo — não é um enfeite só do hero -->
<div style="position:fixed; inset:0; z-index:-1; pointer-events:none;
            background-image: radial-gradient(circle, rgb(var(--c-ink) / 0.05)
                              var(--dot-r), transparent var(--dot-r-fade));
            background-size: 24px 24px;">
</div>
```

Opcional (assinatura da landing): uma segunda camada idêntica com pontos esmeralda
(`rgba(16,185,129,0.45)`) mascarada num círculo de ~220px que segue o cursor
(`mask-image: radial-gradient(220px circle at var(--mx) var(--my), #000 0%, transparent 65%)`).

### A.9 Gradiente da marca em SVG (estrelas, ícones com stroke)

```html
<!-- defs global, uma vez por página -->
<svg width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="brand-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop stop-color="#10b981" offset="0%" />
      <stop stop-color="#34d399" offset="100%" />
    </linearGradient>
  </defs>
</svg>
```

```css
/* Alcança o <path> descendente para poder ser aplicada num wrapper */
.fill-brand-gradient, .fill-brand-gradient path { fill: url(#brand-gradient); }

/* Duotone: o corpo da forma (o path com opacity="0.2") assume o acento;
   o contorno segue currentColor */
.icon-duotone path[opacity] {
  fill: var(--icon-duotone-accent);
  opacity: var(--icon-duotone-opacity);
}
```

---

*Gerado a partir do estado real do código (`src/index.css`, `src/components/ui`).
Ao alterar tokens ou componentes, atualize este arquivo junto — o botão de
download no app serve sempre a versão commitada.*
