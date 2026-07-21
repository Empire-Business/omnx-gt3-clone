import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Code, Copy, Check, Server, Webhook, Key,
  ChevronDown, ChevronRight, Terminal, FileJson, AlertCircle,
  Send, Clock, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Dados da documentação da API
const API_BASE_URL = "https://[seu-tenant].supabase.co/functions/v1/api";

const ENDPOINTS = [
  {
    category: "Colaboradores",
    description: "Gerenciamento de colaboradores (employees)",
    endpoints: [
      {
        method: "GET",
        path: "/api/employees",
        description: "Lista todos os colaboradores do tenant",
        params: [
          { name: "page", type: "number", required: false, default: "1", description: "Número da página" },
          { name: "limit", type: "number", required: false, default: "20", description: "Itens por página (max: 100)" },
          { name: "area_id", type: "uuid", required: false, description: "Filtrar por área" },
          { name: "subarea_id", type: "uuid", required: false, description: "Filtrar por subárea" },
          { name: "position_id", type: "uuid", required: false, description: "Filtrar por cargo" },
          { name: "status", type: "string", required: false, description: "Filtrar por status (active, inactive, on_leave)" },
          { name: "search", type: "string", required: false, description: "Busca por nome ou email" },
        ],
        response: `{
  "data": [
    {
      "id": "uuid",
      "full_name": "João Silva",
      "email": "joao@empresa.com",
      "position_title": "Desenvolvedor",
      "area_name": "Tecnologia",
      "status": "active",
      "active_projects": 3,
      "pending_tasks": 5
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}`,
      },
      {
        method: "POST",
        path: "/api/employees",
        description: "Cria um novo colaborador (requer Admin)",
        body: `{
  "full_name": "João Silva",
  "email": "joao@empresa.com",
  "position_id": "uuid",
  "phone": "(11) 99999-9999",
  "role": "member"
}`,
        response: `{
  "id": "uuid",
  "full_name": "João Silva",
  "email": "joao@empresa.com",
  "status": "active",
  "created_at": "2026-02-21T18:41:57Z"
}`,
      },
      {
        method: "GET",
        path: "/api/employees/:id",
        description: "Obtém detalhes de um colaborador específico",
        response: `{
  "id": "uuid",
  "full_name": "João Silva",
  "email": "joao@empresa.com",
  "position_title": "Desenvolvedor",
  "area_name": "Tecnologia",
  "subarea_name": "Engenharia",
  "manager_id": "uuid",
  "status": "active",
  "active_projects": 3,
  "pending_tasks": 5,
  "tasks_completed_this_week": 12,
  "positions": [...]
}`,
      },
      {
        method: "PUT",
        path: "/api/employees/:id",
        description: "Atualiza um colaborador (requer Admin ou próprio)",
        body: `{
  "full_name": "João Silva",
  "phone": "(11) 99999-9999",
  "status": "active"
}`,
      },
      {
        method: "DELETE",
        path: "/api/employees/:id",
        description: "Remove um colaborador (requer Admin)",
      },
    ],
  },
  {
    category: "Projetos",
    description: "Gerenciamento de projetos",
    endpoints: [
      {
        method: "GET",
        path: "/api/projects",
        description: "Lista todos os projetos",
        params: [
          { name: "page", type: "number", required: false, default: "1" },
          { name: "limit", type: "number", required: false, default: "20" },
          { name: "status", type: "string", required: false, description: "planning, active, on_hold, completed, cancelled" },
          { name: "priority", type: "string", required: false, description: "low, medium, high, urgent" },
          { name: "area_id", type: "uuid", required: false, description: "Filtrar por área dos membros" },
        ],
        response: `{
  "data": [
    {
      "id": "uuid",
      "name": "Novo Sistema",
      "status": "active",
      "priority": "high",
      "progress": 75,
      "members_count": 5,
      "task_count": 24,
      "done_task_count": 18
    }
  ],
  "meta": { ... }
}`,
      },
      {
        method: "POST",
        path: "/api/projects",
        description: "Cria um novo projeto",
        body: `{
  "name": "Novo Sistema",
  "description": "Descrição do projeto",
  "priority": "high",
  "status": "planning",
  "start_date": "2026-02-21",
  "end_date": "2026-06-30"
}`,
      },
      {
        method: "GET",
        path: "/api/projects/:id",
        description: "Obtém detalhes de um projeto",
        response: `{
  "id": "uuid",
  "name": "Novo Sistema",
  "members": [...],
  "task_count": 24,
  "done_task_count": 18,
  "progress": 75
}`,
      },
      {
        method: "PUT",
        path: "/api/projects/:id",
        description: "Atualiza um projeto",
      },
      {
        method: "DELETE",
        path: "/api/projects/:id",
        description: "Remove um projeto",
      },
    ],
  },
  {
    category: "Tarefas",
    description: "Gerenciamento de tarefas (Kanban)",
    endpoints: [
      {
        method: "GET",
        path: "/api/tasks",
        description: "Lista todas as tarefas",
        params: [
          { name: "project_id", type: "uuid", required: false },
          { name: "assignee_id", type: "uuid", required: false },
          { name: "status", type: "string", required: false, description: "backlog, todo, doing, review, done" },
          { name: "priority", type: "string", required: false },
        ],
      },
      {
        method: "POST",
        path: "/api/tasks",
        description: "Cria uma nova tarefa",
        body: `{
  "title": "Implementar login",
  "description": "...",
  "project_id": "uuid",
  "assignee_id": "uuid",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-02-28T18:00:00Z"
}`,
      },
      {
        method: "PUT",
        path: "/api/tasks/:id",
        description: "Atualiza uma tarefa (incluindo mover no Kanban)",
        body: `{
  "status": "doing",
  "assignee_id": "uuid"
}`,
      },
      {
        method: "DELETE",
        path: "/api/tasks/:id",
        description: "Remove uma tarefa",
      },
    ],
  },
  {
    category: "Processos",
    description: "Gerenciamento de processos",
    endpoints: [
      {
        method: "GET",
        path: "/api/processes",
        description: "Lista todos os processos",
        params: [
          { name: "area_id", type: "uuid", required: false },
          { name: "subarea_id", type: "uuid", required: false },
          { name: "position_id", type: "uuid", required: false },
          { name: "status", type: "string", required: false, description: "draft, active, archived" },
        ],
      },
      {
        method: "POST",
        path: "/api/processes",
        description: "Cria um novo processo",
        body: `{
  "name": "Onboarding",
  "description": "...",
  "position_id": "uuid",
  "process_markdown": "# Processo...",
  "flow_data": { ... }
}`,
      },
      {
        method: "GET",
        path: "/api/processes/:id",
        description: "Obtém detalhes de um processo",
      },
      {
        method: "PUT",
        path: "/api/processes/:id",
        description: "Atualiza um processo",
      },
      {
        method: "DELETE",
        path: "/api/processes/:id",
        description: "Remove um processo",
      },
    ],
  },
];

const WEBHOOK_EVENTS = [
  { event: "employee.created", description: "Novo colaborador criado" },
  { event: "employee.updated", description: "Colaborador atualizado" },
  { event: "employee.deleted", description: "Colaborador removido" },
  { event: "project.created", description: "Novo projeto criado" },
  { event: "project.updated", description: "Projeto atualizado" },
  { event: "project.deleted", description: "Projeto removido" },
  { event: "task.created", description: "Nova tarefa criada" },
  { event: "task.updated", description: "Tarefa atualizada" },
  { event: "task.moved", description: "Tarefa movida no Kanban" },
  { event: "task.deleted", description: "Tarefa removida" },
  { event: "process.created", description: "Novo processo criado" },
  { event: "process.updated", description: "Processo atualizado" },
  { event: "process.deleted", description: "Processo removido" },
];

export default function ApiDocs() {
  const navigate = useNavigate();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["Colaboradores"]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    toast.success("Copiado para a área de transferência!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Code className="w-6 h-6 text-primary" />
            Documentação da API
          </h1>
          <p className="text-sm text-muted-foreground">
            API REST completa para integrações externas
          </p>
        </div>
      </div>

      <Tabs defaultValue="rest" className="w-full">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="rest" className="gap-1 flex-1">
            <Server className="w-4 h-4" /> API REST
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-1 flex-1">
            <Webhook className="w-4 h-4" /> Webhooks
          </TabsTrigger>
          <TabsTrigger value="auth" className="gap-1 flex-1">
            <Key className="w-4 h-4" /> Autenticação
          </TabsTrigger>
        </TabsList>

        {/* API REST Tab */}
        <TabsContent value="rest" className="mt-6 space-y-6">
          {/* Intro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Base URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                {API_BASE_URL}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Substitua <code>[seu-tenant]</code> pelo ID do seu projeto Supabase.
                Todos os endpoints retornam JSON e requerem autenticação via Bearer Token.
              </p>
            </CardContent>
          </Card>

          {/* Rate Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Rate Limits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">100</div>
                  <div className="text-sm text-muted-foreground">req/min por usuário</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">1000</div>
                  <div className="text-sm text-muted-foreground">req/hora por tenant</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">10k</div>
                  <div className="text-sm text-muted-foreground">req/dia por tenant</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Endpoints */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Endpoints</h2>
            
            {ENDPOINTS.map((category) => (
              <Card key={category.category}>
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleCategory(category.category)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {expandedCategories.includes(category.category) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        {category.category}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {category.description}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {category.endpoints.length} endpoints
                    </Badge>
                  </div>
                </CardHeader>
                
                {expandedCategories.includes(category.category) && (
                  <CardContent className="space-y-4">
                    {category.endpoints.map((endpoint, idx) => (
                      <div key={idx} className="border border-border/50 rounded-lg overflow-hidden">
                        {/* Endpoint Header */}
                        <div className="flex items-center gap-3 p-3 bg-muted/30 border-b border-border/50">
                          <Badge 
                            variant={endpoint.method === "GET" ? "default" : endpoint.method === "POST" ? "secondary" : endpoint.method === "DELETE" ? "destructive" : "outline"}
                            className="font-mono text-xs"
                          >
                            {endpoint.method}
                          </Badge>
                          <code className="text-sm font-mono">{endpoint.path}</code>
                        </div>
                        
                        {/* Endpoint Details */}
                        <div className="p-4 space-y-4">
                          <p className="text-sm text-muted-foreground">
                            {endpoint.description}
                          </p>

                          {/* Params */}
                          {endpoint.params && endpoint.params.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                                Query Parameters
                              </h4>
                              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                {endpoint.params.map((param, pidx) => (
                                  <div key={pidx} className="flex items-start gap-2 text-sm">
                                    <code className="text-primary font-mono">{param.name}</code>
                                    <span className="text-muted-foreground text-xs">
                                      ({param.type}{param.required === false && ", optional"}{param.default && `, default: ${param.default}`})
                                    </span>
                                    {param.description && (
                                      <span className="text-muted-foreground">— {param.description}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Request Body */}
                          {endpoint.body && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                  Request Body
                                </h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(endpoint.body!, `${category.category}-${idx}-body`)}
                                >
                                  {copiedCode === `${category.category}-${idx}-body` ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                              <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
                                {endpoint.body}
                              </pre>
                            </div>
                          )}

                          {/* Response */}
                          {endpoint.response && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                  Response
                                </h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(endpoint.response!, `${category.category}-${idx}-response`)}
                                >
                                  {copiedCode === `${category.category}-${idx}-response` ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                              <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
                                {endpoint.response}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Webhook className="w-5 h-5" />
                Eventos Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((evt) => (
                  <div 
                    key={evt.event}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                  >
                    <code className="text-xs font-mono text-primary">{evt.event}</code>
                    <span className="text-sm text-muted-foreground">— {evt.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileJson className="w-5 h-5" />
                Formato do Payload
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto">
{`{
  "event": "task.created",
  "timestamp": "2026-02-21T18:41:57.273Z",
  "tenant_id": "uuid-do-tenant",
  "data": {
    "id": "uuid",
    "title": "Nome da tarefa",
    "status": "todo",
    "assignee_id": "uuid",
    "project_id": "uuid",
    ...
  }
}`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Assinatura de Segurança (HMAC)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cada webhook inclui um header <code>X-Webhook-Signature</code> que permite verificar 
                a autenticidade da requisição.
              </p>
              
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Verificação (Node.js)
                </h4>
                <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto">
{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(\`sha256=\${expected}\`)
  );
}`}
                </pre>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Retry Policy
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>3 tentativas em caso de falha</li>
                  <li>Backoff exponencial: 1s, 2s, 4s</li>
                  <li>Timeout de 30 segundos por requisição</li>
                  <li>HTTP 200-299 considerado sucesso</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auth Tab */}
        <TabsContent value="auth" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="w-5 h-5" />
                Autenticação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A API usa autenticação Bearer Token. Você precisa de um JWT válido do Supabase Auth.
              </p>

              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Header de Autenticação
                </h4>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                  Authorization: Bearer {'<seu-jwt-token>'}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Exemplo (cURL)
                </h4>
                <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto">
{`curl -X GET \\
  '${API_BASE_URL}/employees' \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...' \\
  -H 'Content-Type: application/json'`}
                </pre>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Exemplo (JavaScript)
                </h4>
                <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto">
{`const response = await fetch(
  'https://[tenant].supabase.co/functions/v1/api/employees',
  {
    headers: {
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json'
    }
  }
);
const data = await response.json();`}
                </pre>
              </div>

              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-warning">Importante</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tokens JWT expiram após 1 hora. Renove o token usando o fluxo de refresh 
                      do Supabase Auth ou solicite um novo login.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-5 h-5" />
                Postman Collection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Baixe nossa coleção do Postman com todos os endpoints pré-configurados.
              </p>
              <Button variant="outline" className="gap-2">
                <FileJson className="w-4 h-4" />
                Download Collection (em breve)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
