# PRD: GT3 - Sistema de Gestão Organizacional Completo

| Campo | Valor |
|-------|-------|
| **One-liner** | Plataforma visual para CEOs e gestores enxergarem toda a empresa, projetos e processos em tempo real através de um organograma interativo |
| **Owner** | [Definir] |
| **Status** | V6.2 - Produção |
| **Data** | 2026-02-28 |
| **Versão** | 6.2.0 |

---

## 1. Resumo para Leigos

### O que é
Um sistema que mostra a estrutura completa da empresa em formato de organograma visual e interativo. Cada pessoa aparece como um "card" com foto, nome, cargo e ícones de status. Ao clicar, você vê tudo sobre ela: projetos, processos, metas, tempo na empresa e mais.

### Para quem é
- **CEOs e donos de empresa** que querem ver tudo "de um olhar"
- **Gerentes** que precisam acompanhar suas equipes
- **Gerentes de projetos** que querem saber quem está no quê
- **Funcionários** que querem entender a estrutura e processos da empresa

### Qual problema resolve
Hoje, projetos e processos estão espalhados em várias ferramentas, mal documentados, ou nem documentados. Não existe um lugar único onde você consegue visualizar TUDO que está acontecendo na empresa e quem é responsável pelo quê.

**Exemplo:**
> "Carlos, CEO de uma empresa de 30 pessoas, perde horas toda semana perguntando 'quem está cuidando do projeto X?' e 'em que pé está o processo de onboarding?'. As respostas estão espalhadas entre Excel, Notion, Trello e na cabeça das pessoas."

### Como funciona (passo a passo simples)
1. Você faz login e vê o organograma da empresa inteira na tela
2. Cada "carinha" no organograma mostra ícones de status (tarefas pendentes, projetos ativos, alertas)
3. Você clica em uma pessoa e a tela desliza abrindo um painel lateral
4. No painel, você vê: cargo, tempo na empresa, funções, metas, projetos entregues, processos associados
5. Clicando em cada item (projeto ou processo), você entra nos detalhes
6. **(NOVO)** Você pode exportar processos como imagem, PDF ou Markdown
7. **(NOVO)** Você pode usar IA para editar processos (texto e diagrama)

### O que o usuário consegue fazer
- [x] Visualizar o organograma completo da empresa
- [x] Ver status de cada pessoa (tarefas pendentes, projetos ativos, alertas)
- [x] Clicar em uma pessoa e ver seu perfil completo com projetos e tarefas visuais
- [x] Ver descrição de cargo, tempo na empresa, funções e metas
- [x] Listar projetos entregues e em andamento de cada pessoa com progresso visual
- [x] Ver processos associados a cada cargo/pessoa com vínculo a áreas/subáreas
- [x] Clicar em projetos/processos para ver detalhes
- [x] Navegar visualmente pela estrutura hierárquica
- [x] Filtrar colaboradores, projetos e processos por área, subárea e cargo
- [x] Usar API REST e webhooks para integrações externas
- [x] Visualizar documentos Markdown formatados profissionalmente
- [x] Experiência de carregamento fluida com skeletons inteligentes
- [x] Processos classificáveis por múltiplas áreas, subáreas e cargos simultaneamente
- **[x] Exportar diagrama de processos como imagem (PNG/JPEG) ou PDF**
- **[x] Exportar documentação de processo em Markdown**
- **[x] Editar processos (texto e diagrama) com assistência de IA**
- **[x] Visualizar e editar diagrama de processos em modo tela cheia**
- **[x] Visualizar Áreas & Cargos em layout de árvore tipo organograma (v5.6)**
- **[x] Clicar em um cargo e ver: Job Description, Responsabilidades, Metas, Subordinação, Processos Vinculados (v5.9)**
- **[x] Etapa de aprovação/prévia antes de gerar processo com IA (v5.8)**

### O que NÃO faz (importante!)
- [ ] Folha de pagamento / cálculo de salários
- [ ] Controle de ponto / registro de horas
- [ ] Gestão financeira
- [ ] CRM / vendas
- [ ] Comunicação interna (chat)
- [ ] Customização de cores por tenant (design fixo, apenas nome + logo claro/escuro configurável)

### Benefícios
**Para o usuário:**
- Ver TUDO em um único lugar
- Economia de tempo (não precisa perguntar, caçar informações)
- Clareza visual e didática
- Velocidade na tomada de decisão
- Experiência fluida sem percepção de espera
- **Exportar e compartilhar processos facilmente (NOVO)**
- **Editar processos com ajuda de IA (NOVO)**

**Para o negócio:**
- Processos finalmente documentados e visíveis
- Menos gargalos de comunicação
- Onboarding mais rápido de novos funcionários
- Visibilidade real de quem faz o quê
- Design profissional e consistente
- **Integração facilitada com outras ferramentas via API/Webhooks (NOVO)**

---

## 2. Contexto e Problema

### Dor do Usuário
- Informações espalhadas em múltiplas ferramentas (Trello, Notion, Excel, etc.)
- Processos não documentados ou documentados em lugares diferentes
- Impossibilidade de ter uma "visão geral" da empresa
- Tempo perdido em reuniões de status
- Gargalos invisíveis até virarem crises
- Interfaces lentas e carregamentos frustrantes
- Experiência visual inconsistente entre páginas
- **Dificuldade em exportar e compartilhar processos (NOVO)**
- **Limitações na edição de processos (NOVO)**

### Impacto
- **Quantitativo:** Estimativa de 2-4 horas/semana perdidas por gestor em buscas de informação
- **Qualitativo:** Frustração, decisões atrasadas, retrabalho, onboarding lento de novos funcionários

### Por que agora?
- Equipes remotas e híbridas aumentaram a dispersão de informações
- Ferramentas atuais são verticais (focam em UM aspecto: projetos OU pessoas OU processos)
- Crescimento das empresas exige visualização clara da estrutura
- Usuários esperam experiências fluidas e profissionais
- **Necessidade de integrações e automações (NOVO)**

---

## 3. Objetivos, Não-Objetivos e Definição de Sucesso

### Objetivos
1. Criar uma visualização interativa do organograma empresarial
2. Integrar informações de pessoas, cargos, projetos e processos em um único lugar
3. Permitir navegação visual rápida (clique para detalhes)
4. Reduzir tempo de busca por informações de 30+ minutos para < 2 minutos
5. Fornecer API REST e webhooks para integrações externas
6. Oferecer visualização profissional de documentos Markdown
7. Garantir carregamento rápido (< 2s) e experiência fluida
8. Aplicar design system consistente em 100% da aplicação
9. Implementar skeletons inteligentes que mascaram percepção de espera
10. Processos com classificação flexível por múltiplas dimensões organizacionais
11. **(NOVO)** Permitir exportação de processos em múltiplos formatos (imagem, PDF, Markdown)
12. **(NOVO)** Oferecer edição inteligente de processos com assistência de IA
13. **(NOVO)** Sistema completo de APIs e Webhooks para integrações

### Não-Objetivos (explicitamente fora de escopo)
1. Folha de pagamento e cálculos salariais
2. Controle de ponto e registro de horas
3. Sistema de comunicação/chat interno
4. CRM e gestão de vendas
5. Gestão financeira/orçamentária
6. Customização de cores/themes por tenant (design fixo — paleta Indigo universal)
7. White-label de cores (apenas nome + logo modo claro + logo modo escuro configuráveis)

### Definição de Sucesso
| Métrica | Baseline | Meta | Como medir |
|---------|----------|------|------------|
| Tempo para encontrar informação de projeto/pessoa | ~30 min | < 2 min | Feedback de usuários |
| % do organograma preenchido | 0% | 100% | Contagem de cards com dados |
| Frequência de uso semanal | 0 | 3+ vezes/semana | Analytics do sistema |
| Satisfação do usuário (NPS) | N/A | > 50 | Pesquisa após 30 dias |
| Uso da API/Webhooks | 0 | 5+ integrações ativas | Logs de webhooks |
| Tempo de carregamento inicial (LCP) | > 4s | < 2s | Lighthouse |
| Tempo de interatividade (TTI) | > 5s | < 3s | Lighthouse |
| Percepção de fluidez | - | > 4.5/5 | Pesquisa de UX |
| Consistência visual | 60% | 100% | Audit de design tokens |
| **(NOVO)** Taxa de exportação de processos | 0% | 30% dos processos | Analytics |
| **(NOVO)** Uso de IA para edição | 0% | 20% das edições | Analytics |

---

## 4. Funcionalidades Principais

### 4.1 Exportação de Processos (NOVO)

#### 4.1.1 Exportação do Diagrama Visual

**Formatos Suportados:**
- PNG (transparência opcional)
- JPEG (qualidade ajustável)
- SVG (vetorial, escalável)
- PDF (documento completo)

**Opções de Exportação:**
| Opção | Descrição |
|-------|-----------|
| Qualidade | Baixa / Média / Alta / Máxima |
| Background | Transparente / Branco / Tema atual |
| Tamanho | Ajustar à tela / Tamanho real / Customizado |
| Margem | Nenhuma / Pequena / Média / Grande |

**Fluxo de Exportação:**
```
Usuário clica em "Exportar Diagrama"
├── Seleciona formato (PNG/JPEG/SVG/PDF)
├── Ajusta opções (qualidade, background, margem)
├── Preview em tempo real
├── Confirma exportação
└── Download automático
```

**Tecnologias:**
- `html-to-image` (PNG/JPEG/SVG) - biblioteca moderna, melhor que html2canvas
- `jspdf` + `html-to-image` para PDF
- `react-to-pdf` como alternativa simplificada

#### 4.1.2 Exportação da Documentação Markdown

**Formatos Suportados:**
- Markdown (.md) - arquivo original
- PDF formatado
- HTML estático
- Word (.docx) via conversão

**Conteúdo Exportado:**
- Título do processo
- Descrição completa
- Documentação Markdown formatada
- Metadados (autor, data, versão)
- Diagrama visual (opcional, embedado)

---

### 4.2 Edição com IA (NOVO)

#### 4.2.1 Editor IA de Markdown

**Funcionalidades:**
- **Adicionar**: Expandir seções existentes, adicionar novos tópicos
- **Remover**: Eliminar seções obsoletas, condensar conteúdo
- **Atualizar**: Modernizar linguagem, atualizar informações
- **Reescrever**: Reformular mantendo significado
- **Simplificar**: Reduzir complexidade do texto
- **Expandir**: Adicionar mais detalhes

**Interface:**
```
ProcessoEditor
├── Toolbar
│   ├── Botão "Editar com IA"
│   └── Toggle modo IA: [Texto] [Diagrama] [Ambos]
├── Editor Markdown (Split view)
│   ├── Painel esquerdo: Editor
│   └── Painel direito: Preview
├── Painel de Comandos IA (overlay)
│   ├── Campo de instrução natural
│   ├── Sugestões rápidas (chips)
│   │   ├── "Adicionar mais detalhes"
│   │   ├── "Simplificar linguagem"
│   │   ├── "Adicionar exemplos"
│   │   └── "Reorganizar estrutura"
│   └── Histórico de alterações
└── Ações
    ├── Aplicar mudanças
    ├── Descartar
    └── Comparar (diff)
```

**Comandos de Voz/Texto Naturais:**
- "Adicione uma seção sobre segurança da informação"
- "Remova o passo 3 pois está obsoleto"
- "Reescreva de forma mais técnica"
- "Adicione checklists para cada etapa"
- "Crie um sumário executivo"

#### 4.2.2 Editor IA de Diagrama Visual

**Funcionalidades:**
- **Adicionar nós**: Criar novos passos, decisões, subprocessos
- **Remover nós**: Eliminar etapas desnecessárias
- **Reorganizar**: Reordenar fluxo, mover conexões
- **Otimizar**: Simplificar caminhos redundantes
- **Expandir**: Detalhar passo em subprocesso
- **Unificar**: Combinar passos similares

**Interface:**
```
DiagramaEditor
├── Toolbar
│   ├── Botão "Editar com IA"
│   ├── Ferramentas manuais padrão
│   └── Modo: [Manual] [Assistente IA]
├── Canvas React Flow
│   ├── Nós selecionáveis
│   └── Conexões editáveis
├── Painel IA (sidebar direita)
│   ├── Instrução natural
│   ├── Sugestões contextuais
│   │   ├── "Adicionar etapa de aprovação"
│   │   ├── "Este passo pode ser dividido em 3"
│   │   ├── "Simplificar este fluxo"
│   │   └── "Adicionar caminho alternativo"
│   └── Preview de mudanças
└── Ações
    ├── Aplicar ao diagrama
    ├── Salvar como versão
    └── Comparar com original
```

**Comandos Naturais:**
- "Adicione uma etapa de revisão após o passo 2"
- "Este processo precisa de um caminho de exceção"
- "Divida o passo 'Validação' em 'Validação Técnica' e 'Validação de Negócio'"
- "Remova o loop redundante entre etapas 4 e 5"
- "Adicione um gateway de decisão após a análise"

**Integração Markdown ↔ Diagrama:**
- Alterações no texto atualizam automaticamente labels no diagrama
- Alterações no diagrama sincronizam descrições no markdown
- Modo "Sincronização Inteligente" mantém consistência

---

### 4.3 Visualização e Edição do Diagrama (NOVO)

#### 4.3.1 Modo Visualização (Ver)

**Funcionalidades do botão "Ver":**
- Abre diagrama em modo tela cheia (fullscreen)
- Navegação fluida (pan e zoom)
- Mini-map para orientação
- Legenda de símbolos
- Informações ao hover (tooltip detalhado)
- Fit-to-screen automático
- Zoom controls (+/-)
- Reset view

**Interface:**
```
DiagramaViewer (Fullscreen)
├── Header
│   ├── Título do processo
│   ├── Botão fechar
│   └── Ações: [Exportar] [Editar]
├── Canvas
│   ├── React Flow interativo (read-only)
│   ├── Mini-map (canto inferior direito)
│   └── Controls (zoom, fit, reset)
├── Sidebar Info (colapsável)
│   ├── Detalhes do nó selecionado
│   ├── Lista de etapas
│   └── Navegação rápida
└── Legend (canto inferior esquerdo)
    └── Tipos de nós e significados
```

#### 4.3.2 Modo Edição (Editar)

**Funcionalidades do botão "Editar":**
- Abre editor de diagrama em tela cheia
- Toolbar completa de edição
- Paleta de elementos (arrastar e soltar)
- Propriedades do nó selecionado
- Undo/Redo (histórico)
- Auto-save
- Validação de fluxo
- Snap-to-grid

**Interface:**
```
DiagramaEditor (Fullscreen)
├── Header
│   ├── Título do processo
│   ├── Undo/Redo
│   ├── Botão salvar
│   └── Botão fechar
├── Toolbar Esquerda (Paleta)
│   ├── Nó de Início/Fim
│   ├── Nó de Processo
│   ├── Nó de Decisão
│   ├── Nó de Subprocesso
│   ├── Nó de Documento
│   └── Conector
├── Canvas Central
│   ├── React Flow editável
│   ├── Context menu (clique direito)
│   └── Multi-select
├── Sidebar Direita (Propriedades)
│   ├── Label do nó
│   ├── Descrição
│   ├── Cor/Estilo
│   ├── Responsável
│   └── Metadados
└── Status Bar
    ├── Contador de nós
    ├── Último salvamento
    └── Validações
```

---

### 4.4 Design System GT3 V2 (REDESIGN TOTAL — PLANEJADO)

> Referência: `docs/DESIGN-SYSTEM-NOVO.md`
> O design anterior será 100% substituído. Paleta base: Indigo (`#6366F1`).

#### Fundamentos

**Tokens de Design — Arquitetura de 3 Camadas (Obrigatórios)**

| Camada | Propósito | Exemplo |
|--------|-----------|---------|
| **Global (Primitivos)** | Valores absolutos, NUNCA usados diretamente no código | `gray-50: #F8FAFC`, `indigo-500: #6366F1` |
| **Semantic (Agnósticos)** | Dão significado — é o que o código consome | `bg-canvas`, `bg-surface`, `text-primary`, `action-primary` |
| **Component** | Específicos de componentes quando necessário | `--card-hover-shadow`, `--node-start-bg` |

**Tokens Semânticos Obrigatórios:**
```css
--bg-canvas: Fundo principal da aplicação
--bg-surface: Cards e painéis
--bg-surface-elevated: Modais, dropdowns, popovers
--border-subtle: Divisores de layout estrutural
--text-primary: Texto alta ênfase (títulos, valores)
--text-muted: Texto baixa ênfase (labels, metadados)
--action-primary: Botões primários, links ativos (Indigo)
--action-focus-ring: Acessibilidade: anel de foco via teclado
```

**Elevação Diferenciada:**
- **Light mode**: Sombra matemática (`box-shadow`)
- **Dark mode**: Luminosidade da superfície + Glassmorphism (backdrop-blur 8px, 80% opacidade)
- **Dark canvas**: `#0B0F19` (deep blue-tinted black, sem pretos puros)

**Grade Espacial (8-Point Grid)**
- Micro: 4px, 8px, 12px (componentes internos)
- Macro: 16px, 24px, 32px, 48px (estrutura)
- **Regra**: Padding ≥ Gap interno

**Tipografia**
| Token | Tamanho | Peso | Line-Height | Uso |
|-------|---------|------|-------------|-----|
| text-display | 36px (2.25rem) | 700 | 1.1 | Dashboards, números focais |
| text-h1 | 24px (1.5rem) | 600 | 1.2 | Títulos de página |
| text-body | 14px (0.875rem) | 400 | 1.5 | Conteúdo, inputs |
| text-caption | 12px (0.75rem) | 500 | 1.4 | Tags, badges, dicas |

**Cinética**
- Hover/Active: 150-200ms
- Montagem/Desmontagem: 300ms
- Easing entrada: `cubic-bezier(0, 0, 0.2, 1)` (ease-out)
- Easing saída: `cubic-bezier(0.4, 0, 1, 1)` (ease-in)

#### Componentes Universais (Entity Cards)

**Entity Card — Anatomia obrigatória:**
```
┌──────────────────────────────────┐
│ HEADER: Avatar + Título + Badges │
├──────────────────────────────────┤
│ BODY: Descrição / Key-Value pairs│
├──────────────── border-subtle ───┤
│ FOOTER: Metadados (data, resp.)  │
└──────────────────────────────────┘
```

- Hover: `translateY(-2px)` + sombra Nível 2 (não mudança abrupta de cor)
- Aplica-se a: Colaboradores, Projetos, Processos, Tarefas

#### Branding Simplificado (PLANEJADO)

| O que pode configurar | O que NÃO pode mais |
|----------------------|---------------------|
| Nome da empresa | Cores primárias/secundárias |
| Logo modo claro | Paleta customizada |
| Logo modo escuro | Temas por tenant |

- Novo campo: `logo_dark_url` na tabela `tenants`
- Exibição automática do logo correto baseado no tema ativo
- Campos removidos/deprecated: `primary_color`, `primary_color_dark`, `secondary_color`, `secondary_color_dark`

#### Skeletons Inteligentes (PLANEJADO)

- Skeletons devem imitar a estrutura real da página (não barras genéricas)
- Animação shimmer premium (gradiente sutil, não pulse)
- Transição suave skeleton → conteúdo real (fade-crossover, sem flash)
- Skeletons específicos: Dashboard, Listagem, Detalhe

#### Acessibilidade WCAG AA

- Contraste mínimo 4.5:1 entre `text-muted` e `bg-surface`
- Focus rings: 2px sólido + 2px offset em `action-focus-ring`
- Touch targets: mínimo 44x44px em mobile

---

### 4.5 Diagrama de Processos - Design Aprimorado (NOVO)

> **Atualização v8.29.0 (2026-07-15):** o fluxograma virou um construtor visual mais completo. As cores dos nós agora usam **tokens semânticos** do design system (`primary/success/warning/danger/info/neutral`), não mais hex fixo — cada nó tem cor configurável. Novos tipos de elemento além de início/fim/processo/decisão: **subprocesso, documento, dados, evento e nota**. O editor ganhou **drag-and-drop** da paleta, **undo/redo**, **edição de conexões** (rótulo, estilo da linha, animada) e **swim-lanes com faixa desenhada**. A exportação passou a capturar o **diagrama completo** de forma confiável (PNG/JPEG/SVG/PDF) e há **"Copiar imagem"** para a área de transferência. A tabela de cores abaixo descreve a referência histórica; a implementação atual segue os tokens do `DESIGN-SYSTEM.md §12.6`.

> Baseado no design de referência em `/docs/Captura de Tela 2026-02-21 às 21.53.51.png`

O diagrama de referência mostra um fluxo de processo de contratação/onboarding com:
- Nó inicial amarelo: "O funcionário acerta o visto"
- Vários nós de processo em sequência horizontal
- Nó de decisão (losango): "O funcionário é adaptável?"
- Caminhos alternativos com labels "Sim" e "NÃO"
- Nó final amarelo: "Introdução do funcionário na equipe"

#### Especificações Visuais

**Tipos de Nós (conforme imagem de referência):**
| Tipo | Forma | Cor de Fundo | Borda | Uso |
|------|-------|--------------|-------|-----|
| **Início** | Retângulo arredondado | `#F5E6C8` (amarelo/bege claro) | `#D4C4A0` | Ponto de início do processo |
| **Fim** | Retângulo arredondado | `#F5E6C8` (amarelo/bege claro) | `#D4C4A0` | Ponto de término do processo |
| **Processo** | Retângulo arredondado | `bg-surface` (branco/cinza claro) | `#334155` | Atividades executadas |
| **Decisão** | Losango (diamond) | `bg-surface` (branco) | `#334155` | Pontos de decisão com caminhos Sim/Não |

**Especificações de Tamanho:**
| Tipo | Largura | Altura | Border Radius |
|------|---------|--------|---------------|
| Início/Fim | 140px | auto | 12px |
| Processo | 180-280px | auto | 12px |
| Decisão | 160px | 100px | 8px (no losango) |

**Estilos de Conexões (Arestas):**
- **Cor**: `#1a1a1a` (preto escuro)
- **Espessura**: 2.5px
- **Tipo**: `smoothstep` (curvas suaves)
- **Seta**: ArrowClosed na ponta
- **Labels**: Fundo branco com borda preta para "Sim"/"NÃO"

**Layout:**
- **Orientação**: Horizontal (esquerda para direita)
- **Organização**: Em camadas/linhas quando necessário
- **Espaçamento**: 40-60px entre nós
- **Alinhamento**: Centralizado verticalmente na linha

**Interações:**
- **Hover**: Sombra suave (`shadow-float`) + cursor pointer
- **Click**: Ring azul (`ring-primary`) + seleção ativa
- **Drag**: Ghost preview semi-transparente
- **Double-click**: Edição inline do label
- **Right-click**: Context menu com ações

**Features Visuais:**
- Grid de fundo sutil pontilhado (snap opcional)
- Mini-map de navegação (canto inferior direito)
- Controls de zoom (canto inferior esquerdo)
- Zoom range: 0.5x a 2x
- Animações suaves de 200ms
- Handles de conexão visíveis (3x3px)

---

### 4.6 Sistema de APIs e Webhooks Funcional (ATUALIZADO)

#### 4.6.1 API REST Completa

**Base URL:** `https://[tenant].supabase.co/functions/v1/api`

**Autenticação:**
- Bearer Token (Supabase anon key + JWT)
- API Keys de aplicação
- OAuth 2.0 (futuro)

**Endpoints Disponíveis:**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api` | Documentação auto-gerada |
| GET | `/api/employees` | Lista colaboradores |
| POST | `/api/employees` | Cria colaborador |
| GET | `/api/employees/:id` | Detalhes do colaborador |
| PUT | `/api/employees/:id` | Atualiza colaborador |
| DELETE | `/api/employees/:id` | Remove colaborador |
| GET | `/api/projects` | Lista projetos |
| POST | `/api/projects` | Cria projeto |
| GET | `/api/projects/:id` | Detalhes do projeto |
| PUT | `/api/projects/:id` | Atualiza projeto |
| DELETE | `/api/projects/:id` | Remove projeto |
| GET | `/api/tasks` | Lista tarefas |
| POST | `/api/tasks` | Cria tarefa |
| GET | `/api/tasks/:id` | Detalhes da tarefa |
| PUT | `/api/tasks/:id` | Atualiza tarefa |
| DELETE | `/api/tasks/:id` | Remove tarefa |
| GET | `/api/processes` | Lista processos |
| POST | `/api/processes` | Cria processo |
| GET | `/api/processes/:id` | Detalhes do processo |
| PUT | `/api/processes/:id` | Atualiza processo |
| DELETE | `/api/processes/:id` | Remove processo |
| **GET** | **`/api/processes/:id/export`** | **Exporta processo (NOVO)** |
| GET | `/api/areas` | Lista áreas |
| GET | `/api/subareas` | Lista subáreas |
| GET | `/api/positions` | Lista cargos |
| **POST** | **`/api/webhooks`** | **Registra webhook (NOVO)** |
| **GET** | **`/api/webhooks`** | **Lista webhooks (NOVO)** |
| **DELETE** | **`/api/webhooks/:id`** | **Remove webhook (NOVO)** |

**Rate Limiting:**
- 100 requisições/minuto por API key
- 1000 requisições/hora por tenant
- Headers de rate limit incluídos em todas respostas

#### 4.6.2 Sistema de Webhooks

**Eventos Disponíveis:**

| Evento | Descrição | Payload |
|--------|-----------|---------|
| `employee.created` | Novo colaborador criado | Dados do colaborador |
| `employee.updated` | Colaborador atualizado | Dados atualizados |
| `employee.deleted` | Colaborador removido | ID do colaborador |
| `project.created` | Novo projeto criado | Dados do projeto |
| `project.updated` | Projeto atualizado | Dados atualizados |
| `project.deleted` | Projeto removido | ID do projeto |
| `task.created` | Nova tarefa criada | Dados da tarefa |
| `task.updated` | Tarefa atualizada | Dados atualizados |
| `task.moved` | Tarefa movida no Kanban | status, sort_order |
| `task.deleted` | Tarefa removida | ID da tarefa |
| `process.created` | Novo processo criado | Dados do processo |
| `process.updated` | Processo atualizado | Dados atualizados |
| `process.deleted` | Processo removido | ID do processo |
| **(NOVO)** `process.exported` | Processo exportado | formato, usuario |

**UI de Configuração:**
```
WebhookConfig
├── Lista de Webhooks
│   ├── URL
│   ├── Eventos selecionados
│   ├── Status (ativo/inativo)
│   └── Última entrega
├── Form de Criação
│   ├── URL do endpoint
│   ├── Seleção de eventos
│   ├── Secret (HMAC)
│   ├── Headers customizados
│   └── Teste de entrega
└── Logs de Entrega
    ├── Timestamp
    ├── Evento
    ├── Status HTTP
    ├── Response body
    └── Retry attempts
```

---

### 4.7 Central de Integrações — features condicionadas à chave (Fase 1)

> Referência técnica: `docs/ARQUITETURA.md` → "Ativação de features por integração".

**Regra de negócio:** Funcionalidades que dependem de integração externa **só aparecem quando a respectiva chave de API está conectada no ambiente**; caso contrário ficam **ocultas** (não quebradas/desabilitadas). **Transcrição/IA e gravação são opcionais e não bloqueiam a reunião ao vivo.**

- **Regra de ativação:** `visível = (chave presente E saudável) E NOT desligada_manualmente`.
- **Fail-open:** em dúvida, erro ou enquanto o status carrega, a feature é mostrada — para não perturbar clones que já têm as chaves configuradas.
- **Override manual:** um admin pode desligar manualmente uma feature mesmo com a chave presente (aba "Integrações" em Configurações).

| Feature | Depende de | O que fica gated |
|---------|-----------|------------------|
| Reuniões | LiveKit | Aba/rotas de reunião e huddles (raiz do módulo) |
| IA / Transcrição | OpenRouter | Transcrição de áudio, resumo de reunião, assistentes CAMI/omnx-bot |
| Gravação | S3 | Gravação MP4 |
| E-mail | Resend | Digest de e-mail |
| Push | VAPID | Web push |

**Fase 2 (planejada):** conexão da chave pela própria UI via Supabase Vault.

---

## 5. Requisitos Funcionais Detalhados

### FR-001 a FR-012: (Mantidos da versão anterior)

### FR-013: Exportação de Diagrama (NOVO)

**Descrição:**
Permitir exportação do diagrama de processos em múltiplos formatos.

**Regras de negócio:**
- RN1: Suporte a PNG, JPEG, SVG e PDF
- RN2: Opções de qualidade configuráveis
- RN3: Preview antes da exportação
- RN4: Download automático ou envio por email
- RN5: Manter proporção e legibilidade

### FR-014: Exportação de Markdown (NOVO)

**Descrição:**
Permitir exportação da documentação do processo em Markdown.

**Regras de negócio:**
- RN1: Exportar em .md, .pdf, .html, .docx
- RN2: Incluir metadados do processo
- RN3: Formatação preservada
- RN4: Opcionalmente embedar diagrama

### FR-015: Edição com IA - Markdown (NOVO)

**Descrição:**
Assistência de IA para edição de documentação em Markdown.

**Regras de negócio:**
- RN1: Comandos em linguagem natural
- RN2: Preview de alterações antes de aplicar
- RN3: Histórico de versões
- RN4: Capacidade de desfazer
- RN5: Sugestões contextuais

### FR-016: Edição com IA - Diagrama (NOVO)

**Descrição:**
Assistência de IA para edição do diagrama visual.

**Regras de negócio:**
- RN1: Modificações via comandos naturais
- RN2: Preview estrutural antes de aplicar
- RN3: Validação de integridade do fluxo
- RN4: Sincronização com Markdown
- RN5: Sugestões de otimização

### FR-017: Visualização do Diagrama (NOVO)

**Descrição:**
Botão "Ver" funcional para visualização em tela cheia.

**Regras de negócio:**
- RN1: Abrir em modal fullscreen
- RN2: Navegação pan/zoom fluída
- RN3: Mini-map para orientação
- RN4: Tooltips informativos
- RN5: Exportar direto da visualização

### FR-018: Edição do Diagrama (NOVO)

**Descrição:**
Botão "Editar" funcional para edição em tela cheia.

**Regras de negócio:**
- RN1: Abrir editor fullscreen
- RN2: Toolbar completa de edição
- RN3: Paleta de elementos
- RN4: Propriedades do nó
- RN5: Undo/Redo
- RN6: Auto-save

### FR-019: APIs e Webhooks Funcionais (NOVO)

**Descrição:**
Sistema completo de APIs REST e Webhooks para integrações.

**Regras de negócio:**
- RN1: Todos endpoints funcionais
- RN2: Rate limiting ativo
- RN3: Documentação interativa
- RN4: Webhooks com retry
- RN5: Logs completos
- RN6: UI de configuração

---

## 6. Histórico de Versões

| Versão | Data | Mudanças |
|--------|------|----------|
| 1.0.0 | 2026-02-19 | Versão inicial MVP |
| 2.0.0 | 2026-02-20 | V2: Áreas, Kanban, Permissões, RH |
| 2.1.0 | 2026-02-21 | Processos vinculados, Filtros hierárquicos, API/Webhooks |
| 3.0.0 | 2026-02-21 | Redesign completo Aurora OS, Performance, Skeletons |
| **3.1.0** | **2026-02-22** | **Exportação de processos, Edição com IA, APIs/Webhooks funcionais, Design System GT3** |
| **3.2.0** | **2026-02-22** | **UX & Polish: Dashboard com saudação e KPI de processos, Busca global com dados reais, Correções de versão** |
| **3.3.0** | **2026-02-22** | **Navegação & Exportação: Breadcrumbs, CSV export de dados, Header interativo com badge** |
| **3.4.0** | **2026-02-22** | **Produtividade: Atalhos de teclado (G+tecla), Scroll-to-top, CSV Processos** |
| **3.5.0** | **2026-02-22** | **Confirmações: AlertDialog para exclusões, CSV Tarefas, Subtítulos de página** |
| **3.6.0** | **2026-02-22** | **Polish: NotFound redesign, KPI tooltips, ErrorBoundary no layout** |
| **3.7.0** | **2026-02-22** | **Consistência: Skeletons padronizados, PageTitle completo, Aria-labels** |
| **3.8.0** | **2026-02-22** | **Refinamentos: Dashboard Skeleton, Perfil state sync, PageTitle dinâmico** |
| **3.9.0** | **2026-02-22** | **UX Final & SEO: Focus-visible global, Auth animation, Meta descriptions** |
| **4.0.0** | **2026-02-22** | **Animações & Mobile: AnimatedList stagger, Dashboard responsive, cards animados** |
| **4.1.0** | **2026-02-22** | **Acessibilidade & Performance: Reduced motion, Print styles, Canonical URLs** |
| **PLAN** | **2026-02-22** | **PLANEJAMENTO V5: Redesign Total (novo DS), Processos multi-dimensional, Organograma proporcional, Funcionalidades pendentes** |
| **5.6.0** | **2026-02-24** | **Áreas & Cargos como organograma: CEO no topo, conectores visuais, zoom, busca** |
| **5.7.0** | **2026-02-24** | **Cargos colapsáveis, CEO como cargo genérico** |
| **5.8.0** | **2026-02-24** | **Etapa de aprovação/prévia antes de criar processos com IA** |
| **5.9.0** | **2026-02-24** | **Modal de detalhes do cargo: job description, responsabilidades, metas, subordinação, processos vinculados** |
| **5.10.0** | **2026-02-27** | **Unificação visual cards Áreas & Cargos** |
| **5.11.0** | **2026-02-27** | **Modal cargo como painel lateral + Gestão T3 na sidebar** |
| **6.0.0** | **2026-02-28** | **Sistema de Documentos de Processos: pastas/subpastas hierárquicas, editor Notion-like Markdown, upload de imagens/arquivos inline, importação em massa (arquivos + pastas inteiras), exportação MD/PDF/ZIP, compartilhamento público via link com token, página pública read-only** |
| **6.1.0** | **2026-03-09** | **Hierarquia Cargo-Cargo: migração de organograma pessoa-pessoa (manager_id) para cargo-cargo (reports_to_id), suporte a cargos vagos no organograma, seletor de "reporta para" no cadastro de cargos, prevenção de ciclos via trigger** |
| **7.9.5** | **2026-04-13** | **Ingestao de webhooks GoHighLevel: Edge Function publica com token por fonte e tabelas para armazenar payload bruto, headers sanitizados e metadados por tenant** |
