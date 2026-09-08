// Smoke test da `task-voice-ai` — roda SEM CHAVE e SEM REDE.
//
//   deno run --allow-net --allow-env --allow-read supabase/functions/task-voice-ai/smoke-test.ts
//
// Por que existe: esta função só e exercitada em producao, gravando audio pelo
// celular — o que torna caro descobrir que um modelo desobedeceu o schema. Aqui
// o `Deno.serve` e capturado e o `fetch` e interceptado, entao da para simular
// a resposta do modelo (inclusive as respostas ERRADAS que ele costuma dar) e
// conferir o que a funcao devolveria ao usuario.
//
// O foco e a `description`: a montagem dela e o que impede a tarefa de sair
// resumida (reclamacao de 2026-08-31: "ele deixa de escrever na descricao para
// botar no checklist").

const SUPA = "https://exemplo.supabase.co";
Deno.env.set("OPENROUTER_API_KEY", "fake-key");
Deno.env.set("SUPABASE_URL", SUPA);
Deno.env.set("SUPABASE_ANON_KEY", "fake-anon");

let respostaCrua = "";

const fetchOriginal = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (b: unknown) =>
    Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  if (url.includes("openrouter.ai")) return json({ choices: [{ message: { content: respostaCrua } }] });
  if (url.includes("/auth/v1/user")) return json({ id: "user-1", aud: "authenticated", role: "authenticated" });
  if (url.includes("/rest/v1/profiles")) return json({ tenant_id: "t1", full_name: "Bruno Rodrigues Guzela" });
  if (url.includes("/rest/v1/organograma_view"))
    return json([
      { employee_id: "emp-davi", full_name: "Davi Nogueira", tenant_id: "t1", status: "active" },
      { employee_id: "emp-gil", full_name: "Gildásio Brito", tenant_id: "t1", status: "active" },
    ]);
  if (url.includes("/rest/v1/projects")) return json([{ id: "p1", name: "Curso Online" }]);
  return fetchOriginal(input as never, init);
}) as typeof fetch;

let handler: ((r: Request) => Response | Promise<Response>) | null = null;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (r: Request) => Response | Promise<Response>) => {
  handler = h;
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
};
await import("./index.ts");

// deno-lint-ignore no-explicit-any
async function chamar(cru: string): Promise<any> {
  respostaCrua = cru;
  const res = await handler!(
    new Request("https://x/task-voice-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({ audio_base64: "AAAA".repeat(10), mime: "audio/webm" }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

let falhas = 0;
function checa(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? "  OK  " : " FALHA"} | ${nome} → ${detalhe}`);
  if (!ok) falhas++;
}

// 1. Modelo embrulha em cerca de código markdown (desobediência clássica)
{
  const r = await chamar("```json\n" + JSON.stringify({
    title: "Ajustar relatório", objective: "Deixar o relatório correto",
    context: "O relatório está saindo com número errado.", priority: "high",
  }) + "\n```");
  checa("cerca de markdown ```json", r.status === 200 && r.body.title === "Ajustar relatório",
    `HTTP ${r.status}, título="${r.body.title ?? r.body.error}"`);
}

// 2. Modelo manda steps como STRINGS em vez de {title, detail}
{
  const r = await chamar(JSON.stringify({
    title: "Organizar o estoque", objective: "Estoque conferido",
    context: "Ninguém sabe o que tem em estoque.",
    steps: ["Contar as caixas", "Lançar na planilha", "Conferir divergências"],
  }));
  const temPassos = (r.body.description || "").includes("Contar as caixas");
  checa("steps como strings soltas", r.body.steps?.length === 3 && temPassos,
    `${r.body.steps?.length} passos, aparecem na descrição: ${temPassos}`);
}

// 3. Checklist vazia mas com steps → deve derivar dos passos
{
  const r = await chamar(JSON.stringify({
    title: "Fechar o mês", objective: "Mês fechado",
    context: "Fechamento contábil mensal.",
    steps: [{ title: "Conciliar contas", detail: "" }, { title: "Emitir relatório", detail: "" }],
    checklist_items: [],
  }));
  checa("checklist vazia deriva dos steps", r.body.checklist_items?.length === 2,
    `${r.body.checklist_items?.length} itens: ${JSON.stringify(r.body.checklist_items?.map((c: {text: string}) => c.text))}`);
}

// 4. Modelo ignora o schema novo e manda só `description` (comportamento antigo)
{
  const r = await chamar(JSON.stringify({
    title: "Comprar café", description: "Comprar café para o escritório.",
  }));
  checa("fallback p/ description quando não há campos estruturados",
    r.body.description === "Comprar café para o escritório.",
    `"${r.body.description}"`);
}

// 5. Valores inválidos: prioridade inventada, data mal formada, nome inexistente
{
  const r = await chamar(JSON.stringify({
    title: "Teste de saneamento", objective: "x", context: "y",
    priority: "URGENTÍSSIMO", due_date: "sexta que vem",
    assignee_names: ["Davi", "Fulano Que Não Existe"],
    project_name: "Projeto Inexistente",
  }));
  checa("prioridade inválida → medium", r.body.priority === "medium", r.body.priority);
  checa("data não-ISO → null", r.body.due_date === null, String(r.body.due_date));
  checa("casa quem existe", JSON.stringify(r.body.assignee_ids) === '["emp-davi"]', JSON.stringify(r.body.assignee_ids));
  checa("avisa quem não casou", JSON.stringify(r.body.unmatched_assignees) === '["Fulano Que Não Existe"]',
    JSON.stringify(r.body.unmatched_assignees));
  checa("projeto inexistente → null", r.body.project_id === null, String(r.body.project_id));
}

// 6. Modelo devolve texto que não é JSON → erro tratado, não 500 cru
{
  const r = await chamar("Desculpe, não consegui entender o áudio.");
  checa("resposta não-JSON → erro tratado", r.status === 502 && !!r.body.error,
    `HTTP ${r.status}: ${String(r.body.error).slice(0, 60)}`);
}

// 7. Sem título → 422 com mensagem para o usuário
{
  const r = await chamar(JSON.stringify({ objective: "algo", context: "algo" }));
  checa("sem título → 422 explicado", r.status === 422 && !!r.body.error, `HTTP ${r.status}: ${r.body.error}`);
}

// 8. Injeção de markdown na descrição (o front renderiza texto puro)
{
  const r = await chamar(JSON.stringify({
    title: "Teste", objective: "**negrito** e ## título", context: "com `código`",
  }));
  const desc = r.body.description || "";
  checa("markdown do modelo passa como texto literal (front não interpreta)",
    desc.includes("**negrito**"), "preservado como veio — front usa whitespace-pre-wrap");
}

console.log("\n" + "=".repeat(60));
console.log(falhas === 0 ? "TODOS OS CASOS DE BORDA PASSARAM" : `${falhas} FALHA(S)`);
Deno.exit(falhas === 0 ? 0 : 1);
