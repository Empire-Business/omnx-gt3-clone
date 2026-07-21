import { useState, useMemo } from "react";
import { Search, BookOpen, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { usePageTitle } from "@/hooks/usePageTitle";
import { MarkdownViewer } from "@/components/shared/MarkdownViewer";

interface Tutorial {
  id: string;
  title: string;
  category: string;
  content: string;
}

const TUTORIALS: Tutorial[] = [
  {
    id: "criar-processo",
    title: "Como criar um processo com IA",
    category: "Processos",
    content: `# Como criar um processo com IA

## Passo a passo

### 1. Acesse a página de Processos
Navegue até **Gestão → Processos** no menu lateral.

### 2. Clique em "Novo Processo com IA"
O botão aparece no canto superior direito (requer permissão de administrador).

### 3. Preencha os campos
- **Nome do processo:** Um título claro e descritivo
- **Descrição:** Detalhe todas as etapas, responsáveis, prazos e regras

> **Dica:** Quanto mais detalhada a descrição, melhor o resultado da IA. Inclua nomes de cargos, tempos estimados, documentos necessários e critérios de decisão.

### 4. Clique em "Gerar com IA"
A inteligência artificial irá processar sua descrição e gerar:
- Um **documento estruturado** em Markdown
- Um **diagrama BPM visual** com todas as etapas

### 5. Revise e edite
Após a geração, você pode:
- Editar o documento na aba "Documento"
- Visualizar o diagrama na aba "Diagrama"
- Reprocessar o diagrama após editar o documento

## Exemplo de descrição

\`\`\`
O processo de onboarding começa quando o RH recebe a aprovação da contratação.

Etapa 1: RH prepara documentação (1 dia útil)
Etapa 2: TI configura acesso ao sistema (2 horas)
Etapa 3: Gestor direto agenda reunião de boas-vindas (30 minutos)
Etapa 4: Treinamento inicial com a equipe (3 dias)

Decisão: Se o colaborador é de nível sênior, pular etapa 4 e ir direto para a etapa 5.

Etapa 5: Avaliação após 30 dias pelo gestor
\`\`\`
`,
  },
  {
    id: "editar-processo",
    title: "Como editar o documento de processo",
    category: "Processos",
    content: `# Como editar o documento de processo

## Editando manualmente

1. Abra o processo desejado clicando no card
2. Na aba **Documento**, clique em **"Editar documento"**
3. O editor abre com duas colunas:
   - **Esquerda:** Editor de texto em Markdown
   - **Direita:** Preview em tempo real
4. Faça suas alterações
5. Clique em **"Salvar"**

## Formato Markdown

O documento usa Markdown padrão com suporte a:
- **Negrito** e *itálico*
- Listas numeradas e com marcadores
- Tabelas
- Blocos de citação
- Cabeçalhos (## e ###)

## Reprocessando o diagrama

Após editar o documento, clique em **"Reprocessar diagrama"** para que a IA gere um novo diagrama visual baseado no documento atualizado.
`,
  },
  {
    id: "acrescentar-ia",
    title: "Como acrescentar conteúdo com IA",
    category: "Processos",
    content: `# Como acrescentar conteúdo com IA

## Passo a passo

1. Abra o processo desejado
2. Clique em **"Acrescentar com IA"**
3. Descreva o que deseja adicionar ou alterar
4. A IA incorporará as mudanças ao documento existente
5. O diagrama será atualizado automaticamente

## Exemplos de uso

- "Adicionar uma etapa de aprovação do diretor antes da etapa 3"
- "Incluir um ponto de decisão: se o valor for acima de R$ 10.000, precisa de aprovação da diretoria"
- "Detalhar melhor a etapa de treinamento, incluindo materiais necessários"
- "Adicionar métricas de sucesso para o processo"
`,
  },
  {
    id: "kanban-tarefas",
    title: "Como usar o Kanban de tarefas",
    category: "Tarefas",
    content: `# Como usar o Kanban de tarefas

## Visão geral

O Kanban organiza suas tarefas em colunas que representam o status:
- **Backlog** — Tarefas planejadas
- **A Fazer** — Prontas para início
- **Em Progresso** — Em andamento
- **Revisão** — Aguardando revisão
- **Concluído** — Finalizadas

## Ações disponíveis

### Criar tarefa
Clique em **"+ Nova Tarefa"** no topo da página.

### Mover tarefa
Arraste e solte o card da tarefa entre as colunas.

### Editar tarefa
Clique no card para abrir os detalhes.

### Filtrar
Use a barra de busca para filtrar por título.
`,
  },
  {
    id: "organograma",
    title: "Como navegar o organograma",
    category: "Organograma",
    content: `# Como navegar o organograma

## Visualização

O organograma mostra a estrutura hierárquica da empresa com:
- **Cards** de cada colaborador com nome, cargo e área
- **Linhas** conectando gestores e subordinados
- **Cores** por área da empresa

## Interações

- **Clique** em um card para ver detalhes do colaborador
- **Zoom** com scroll do mouse ou controles
- **Arraste** para mover a visualização
- **Filtros** por área para focar em departamentos específicos
`,
  },
  {
    id: "branding",
    title: "Como configurar branding",
    category: "Configurações",
    content: `# Como configurar branding da empresa

## Acesso

Navegue até **Conta → Configurações** no menu lateral.

## Opções disponíveis

### Logo
Faça upload do logo da empresa. Formatos aceitos: PNG, JPG, SVG.

### Cores
Configure as cores primária e secundária para modo claro e escuro.

### Favicon
Faça upload do ícone que aparece na aba do navegador.

### Nome
Altere o nome da empresa exibido no sistema.

## Dicas

- Use imagens de alta qualidade para o logo
- Teste as cores em ambos os modos (claro/escuro)
- O favicon deve ser quadrado, idealmente 32x32 ou 64x64 pixels
`,
  },
  {
    id: "projetos",
    title: "Como gerenciar projetos",
    category: "Projetos",
    content: `# Como gerenciar projetos

## Criar projeto

1. Acesse **Gestão → Projetos**
2. Clique em **"Novo Projeto"**
3. Preencha nome, descrição, datas e prioridade
4. Adicione membros da equipe

## Status dos projetos

| Status | Descrição |
|--------|-----------|
| Planejamento | Projeto em fase de planejamento |
| Ativo | Em andamento |
| Em Espera | Temporariamente pausado |
| Concluído | Finalizado com sucesso |
| Cancelado | Descontinuado |

## Detalhes do projeto

Clique em um projeto para ver:
- Informações gerais e progresso
- Membros da equipe
- Tarefas vinculadas
`,
  },
  {
    id: "api-rest",
    title: "Como usar a API REST",
    category: "API & Integrações",
    content: `# Como usar a API REST

## Autenticação

Todas as requisições precisam de um token JWT no header:

\`\`\`bash
Authorization: Bearer SEU_TOKEN_JWT
\`\`\`

## Endpoints disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/employees | Listar colaboradores |
| GET | /api/projects | Listar projetos |
| GET | /api/tasks | Listar tarefas |
| GET | /api/processes | Listar processos |
| POST | /api/{recurso} | Criar novo registro |
| PATCH | /api/{recurso}/:id | Atualizar registro |
| DELETE | /api/{recurso}/:id | Excluir registro |

## Paginação

Use \`?limit=20&offset=0\` para paginar resultados.

## Rate Limiting

A API permite **100 requisições por minuto** por IP. Os headers de resposta incluem:

- \`X-RateLimit-Limit\`: Limite total
- \`X-RateLimit-Remaining\`: Requisições restantes
- \`X-RateLimit-Reset\`: Timestamp de reset

## Exemplo

\`\`\`bash
curl -H "Authorization: Bearer TOKEN" \\
  https://opbdoulspzlabxzevffc.supabase.co/functions/v1/api/projects?limit=10
\`\`\`
`,
  },
  {
    id: "webhooks",
    title: "Como configurar webhooks",
    category: "API & Integrações",
    content: `# Como configurar webhooks

## O que são webhooks?

Webhooks permitem que o OMNX GT3 envie notificações automáticas para sistemas externos quando eventos acontecem.

## Configurando

1. Acesse **Conta → Configurações → Webhooks**
2. Clique em **"Novo Webhook"**
3. Preencha:
   - **Nome:** Identificação do webhook
   - **URL:** Endpoint que receberá as notificações
   - **Eventos:** Quais eventos disparam o webhook
   - **Secret (opcional):** Chave para assinatura HMAC-SHA256

## Eventos disponíveis

- \`employee.created\`, \`employee.updated\`, \`employee.deleted\`
- \`project.created\`, \`project.updated\`, \`project.deleted\`
- \`task.created\`, \`task.updated\`, \`task.deleted\`
- \`process.created\`, \`process.updated\`, \`process.deleted\`

## Segurança (HMAC)

Se configurado um secret, cada requisição inclui o header \`X-Webhook-Signature\` com a assinatura HMAC-SHA256 do payload.

## Logs

Acesse os logs de entrega em **Configurações → Webhook Logs** para monitorar entregas e identificar falhas.
`,
  },
];

const CATEGORIES = [...new Set(TUTORIALS.map((t) => t.category))];

export default function FAQ() {
  usePageTitle("FAQ & Tutoriais");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);

  const filtered = useMemo(() => {
    return TUTORIALS.filter((t) => {
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, selectedCategory]);

  if (selectedTutorial) {
    return (
      <div className="flex flex-col gap-6 animate-fade-in max-w-4xl mx-auto">
        <button
          onClick={() => setSelectedTutorial(null)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Voltar aos tutoriais
        </button>
        <div className="rounded-xl border border-border/50 bg-card p-6">
          <MarkdownViewer
            content={selectedTutorial.content}
            enableTOC={true}
            variant="default"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> FAQ & Tutoriais
        </h1>
        <p className="text-sm text-muted-foreground">
          Guias completos de uso do sistema.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar tutoriais..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={selectedCategory === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            Todos
          </Badge>
          {CATEGORIES.map((cat) => (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum tutorial encontrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer entity-card-hover border-border/50"
              onClick={() => setSelectedTutorial(t)}
            >
              <CardContent className="p-4">
                <Badge variant="outline" className="mb-2 text-xs">{t.category}</Badge>
                <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {t.content.split("\n").find((l) => l && !l.startsWith("#"))?.trim() || ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
