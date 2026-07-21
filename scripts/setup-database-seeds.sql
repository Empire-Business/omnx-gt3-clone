-- =============================================================================
-- EMPIRE MANAGER — Seeds de Demonstração (OPCIONAL)
-- =============================================================================
-- ATENÇÃO: Este script insere dados de demonstração (empresa fictícia,
-- colaboradores, projetos, tarefas, processos).
--
-- PRÉ-REQUISITOS:
-- • O schema já deve estar criado (rode setup-database-schema.sql primeiro)
-- • Os usuários de demo devem existir em auth.users OU as FKs devem
--   permitir NULL em created_by
--
-- SE FALHAR: Não se preocupe. Os seeds são apenas para demonstração.
-- O app funciona perfeitamente sem eles — basta criar uma conta real.
-- =============================================================================

-- Envolve em bloco seguro: se falhar, não quebra nada
DO $$
BEGIN
  RAISE NOTICE 'Iniciando seeds de demonstracao...';
END $$;

DO $$
BEGIN
  -- Seed data completo

-- ═══════════════════════════════════════════════
-- SEED DATA for tenant Empire Manager
-- ═══════════════════════════════════════════════

DO $$
DECLARE
  _tid UUID := '42e95844-c632-4d8a-8e44-9c645ac813bf';
  
  -- Area IDs
  _area_acq UUID := '438c1581-e986-446e-bf1b-02f66b938a19'; -- Aquisição (exists)
  _area_del UUID := '1b75fa98-fb0f-491b-ada2-1b818b6a4e28'; -- Entrega (exists)
  _area_ops UUID := '38a6183e-35fd-491c-8e12-f83d2917b2b7'; -- Operação (exists)
  
  -- New subarea IDs
  _sub_vendas UUID := gen_random_uuid();
  _sub_cs UUID := gen_random_uuid();
  _sub_dev UUID := gen_random_uuid();
  _sub_design UUID := gen_random_uuid();
  _sub_rh UUID := gen_random_uuid();
  _sub_financeiro UUID := gen_random_uuid();
  
  -- New position IDs
  _pos_dir_vendas UUID := gen_random_uuid();
  _pos_vendedor UUID := gen_random_uuid();
  _pos_cs_lead UUID := gen_random_uuid();
  _pos_cs_analyst UUID := gen_random_uuid();
  _pos_tech_lead UUID := gen_random_uuid();
  _pos_dev_sr UUID := gen_random_uuid();
  _pos_dev_pl UUID := gen_random_uuid();
  _pos_designer UUID := gen_random_uuid();
  _pos_rh_coord UUID := gen_random_uuid();
  _pos_fin_coord UUID := gen_random_uuid();
  
  -- Employee IDs (existing)
  _emp_ceo UUID := 'c3399166-ed81-4c85-a9a8-524c491e857c';
  _emp_bruno UUID := '33bbd906-3c6c-4707-af3d-dcbc3ed64914';
  _emp_teste UUID := 'fe809ca4-5272-46de-aa6d-22fe8227d8b3';
  
  -- Project IDs
  _proj1 UUID := gen_random_uuid();
  _proj2 UUID := gen_random_uuid();
  _proj3 UUID := gen_random_uuid();
  _proj4 UUID := gen_random_uuid();
  
  -- Process IDs
  _proc1 UUID := gen_random_uuid();
  _proc2 UUID := gen_random_uuid();
  _proc3 UUID := gen_random_uuid();

BEGIN
  -- ── SUBAREAS ──
  INSERT INTO subareas (id, area_id, tenant_id, name, color, sort_order) VALUES
    (_sub_vendas, _area_acq, _tid, 'Vendas', '#3b82f6', 1),
    (_sub_cs, _area_acq, _tid, 'Customer Success', '#06b6d4', 2),
    (_sub_dev, _area_del, _tid, 'Desenvolvimento', '#8b5cf6', 1),
    (_sub_design, _area_del, _tid, 'Design & UX', '#ec4899', 2),
    (_sub_rh, _area_ops, _tid, 'Recursos Humanos', '#f59e0b', 1),
    (_sub_financeiro, _area_ops, _tid, 'Financeiro', '#10b981', 2)
  ON CONFLICT DO NOTHING;

  -- ── POSITIONS ──
  INSERT INTO positions (id, tenant_id, subarea_id, title, description, level, sort_order, responsibilities, goals) VALUES
    (_pos_dir_vendas, _tid, _sub_vendas, 'Diretor de Vendas', 'Lidera a estratégia comercial e gestão do time de vendas', 3, 1, 
     ARRAY['Definir metas trimestrais de receita', 'Gerenciar pipeline de vendas', 'Treinar e desenvolver vendedores', 'Analisar métricas de conversão'],
     ARRAY['Aumentar receita em 30% ao ano', 'Manter taxa de conversão acima de 25%', 'Reduzir ciclo de vendas para 45 dias']),
    (_pos_vendedor, _tid, _sub_vendas, 'Executivo de Vendas', 'Responsável por prospecção e fechamento de negócios', 1, 2,
     ARRAY['Prospectar novos clientes via outbound', 'Realizar demos do produto', 'Negociar contratos', 'Manter CRM atualizado'],
     ARRAY['Fechar R$50k/mês em novos contratos', 'Realizar 20 demos por mês']),
    (_pos_cs_lead, _tid, _sub_cs, 'Líder de Customer Success', 'Coordena equipe de CS e define estratégias de retenção', 2, 1,
     ARRAY['Definir playbooks de onboarding', 'Monitorar health score dos clientes', 'Gerenciar renovações', 'Identificar oportunidades de upsell'],
     ARRAY['Manter churn abaixo de 3%', 'NPS acima de 70']),
    (_pos_cs_analyst, _tid, _sub_cs, 'Analista de CS', 'Acompanha carteira de clientes e garante sucesso na adoção', 1, 2,
     ARRAY['Realizar onboarding de novos clientes', 'Acompanhar métricas de uso', 'Conduzir QBRs', 'Escalar problemas técnicos'],
     ARRAY['Manter 90% de adoção na carteira', 'Realizar 8 QBRs por mês']),
    (_pos_tech_lead, _tid, _sub_dev, 'Tech Lead', 'Lidera arquitetura técnica e mentoria do time de desenvolvimento', 3, 1,
     ARRAY['Definir arquitetura de sistemas', 'Code review e padrões de código', 'Mentoria técnica do time', 'Planejar sprints e roadmap técnico'],
     ARRAY['Zero downtime em produção', 'Manter cobertura de testes acima de 80%']),
    (_pos_dev_sr, _tid, _sub_dev, 'Desenvolvedor Sênior', 'Implementa features complexas e contribui para arquitetura', 2, 2,
     ARRAY['Desenvolver features críticas', 'Escrever testes automatizados', 'Documentar decisões técnicas', 'Participar de design reviews'],
     ARRAY['Entregar 90% dos story points planejados', 'Contribuir para redução de bugs em 20%']),
    (_pos_dev_pl, _tid, _sub_dev, 'Desenvolvedor Pleno', 'Desenvolve features e corrige bugs com autonomia crescente', 1, 3,
     ARRAY['Implementar features do backlog', 'Corrigir bugs reportados', 'Escrever testes unitários', 'Participar de code reviews'],
     ARRAY['Completar tasks dentro do prazo estimado', 'Reduzir bugs de regressão']),
    (_pos_designer, _tid, _sub_design, 'UI/UX Designer', 'Cria interfaces intuitivas e conduz pesquisas com usuários', 2, 1,
     ARRAY['Criar protótipos no Figma', 'Conduzir testes de usabilidade', 'Manter design system atualizado', 'Colaborar com devs na implementação'],
     ARRAY['Melhorar NPS de usabilidade em 15 pontos', 'Reduzir tickets de suporte de UX em 25%']),
    (_pos_rh_coord, _tid, _sub_rh, 'Coordenador de RH', 'Gerencia processos de people, recrutamento e cultura', 2, 1,
     ARRAY['Coordenar processos seletivos', 'Gerenciar onboarding de novos colaboradores', 'Conduzir pesquisas de clima', 'Administrar benefícios'],
     ARRAY['Preencher vagas em até 30 dias', 'Manter eNPS acima de 60']),
    (_pos_fin_coord, _tid, _sub_financeiro, 'Coordenador Financeiro', 'Gerencia fluxo de caixa, orçamento e relatórios financeiros', 2, 1,
     ARRAY['Controlar contas a pagar e receber', 'Elaborar relatórios financeiros mensais', 'Gerenciar orçamento por área', 'Preparar DRE e balanço'],
     ARRAY['Manter inadimplência abaixo de 2%', 'Entregar fechamento até dia 5'])
  ON CONFLICT DO NOTHING;

  -- ── EMPLOYEE POSITIONS (assign CEO to no specific position, others already have) ──
  -- Bruno already has Diretor de operações, teste already has Gerente de marketing

  -- ── PROJECTS ──
  INSERT INTO projects (id, tenant_id, name, description, status, priority, start_date, end_date, progress, created_by) VALUES
    (_proj1, _tid, 'Redesign do Portal do Cliente', 
     'Reformulação completa do portal self-service para melhorar experiência do cliente e reduzir tickets de suporte em 40%', 
     'active', 'high', '2026-01-15', '2026-04-30', 35, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proj2, _tid, 'Expansão Comercial - Região Sul', 
     'Abertura de operação comercial nos estados PR, SC e RS com meta de 50 novos clientes no primeiro semestre', 
     'active', 'high', '2026-02-01', '2026-07-31', 15, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proj3, _tid, 'Implantação de OKRs', 
     'Implementar metodologia de OKRs em toda a empresa, começando pelo nível diretoria e cascateando para times', 
     'planning', 'medium', '2026-03-01', '2026-06-30', 0, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proj4, _tid, 'Migração para Cloud AWS', 
     'Migrar infraestrutura on-premise para AWS, incluindo banco de dados, APIs e serviços de background', 
     'on_hold', 'medium', '2026-04-01', '2026-09-30', 5, '954be1c6-a4df-4f45-bc14-d268a5ac3513')
  ON CONFLICT DO NOTHING;

  -- ── EMPLOYEE_PROJECTS ──
  INSERT INTO employee_projects (employee_id, project_id, tenant_id, role_in_project) VALUES
    (_emp_ceo, _proj1, _tid, 'sponsor'),
    (_emp_bruno, _proj1, _tid, 'lead'),
    (_emp_teste, _proj1, _tid, 'member'),
    (_emp_ceo, _proj2, _tid, 'sponsor'),
    (_emp_teste, _proj2, _tid, 'member'),
    (_emp_ceo, _proj3, _tid, 'lead'),
    (_emp_bruno, _proj3, _tid, 'member'),
    (_emp_bruno, _proj4, _tid, 'lead')
  ON CONFLICT DO NOTHING;

  -- ── TASKS for Project 1: Redesign Portal ──
  INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by,
    labels, checklist_items) VALUES
    (_tid, _proj1, 'Pesquisa com usuários do portal', 
     'Realizar entrevistas com 15 clientes ativos para mapear dores e necessidades do portal atual', 
     'done', 'high', _emp_teste, '2026-02-10', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["research", "ux"]'::jsonb, '[{"text":"Selecionar 15 clientes","checked":true},{"text":"Agendar entrevistas","checked":true},{"text":"Consolidar insights","checked":true}]'::jsonb),
    (_tid, _proj1, 'Wireframes das páginas principais', 
     'Criar wireframes de baixa fidelidade para Dashboard, Faturas, Suporte e Configurações', 
     'done', 'high', _emp_teste, '2026-02-20', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["design", "ux"]'::jsonb, '[{"text":"Dashboard","checked":true},{"text":"Faturas","checked":true},{"text":"Suporte","checked":true},{"text":"Configurações","checked":false}]'::jsonb),
    (_tid, _proj1, 'Protótipo de alta fidelidade', 
     'Desenvolver protótipo interativo no Figma com o novo design system aplicado', 
     'doing', 'high', _emp_teste, '2026-03-05', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["design"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'Implementar novo Dashboard do cliente', 
     'Desenvolver frontend do novo dashboard com gráficos de uso, faturas pendentes e tickets abertos', 
     'todo', 'high', _emp_bruno, '2026-03-20', 4, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["dev", "frontend"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'API de métricas de uso', 
     'Criar endpoints REST para fornecer dados de uso do produto ao novo dashboard', 
     'todo', 'medium', _emp_bruno, '2026-03-15', 5, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["dev", "backend"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'Testes de usabilidade do protótipo', 
     'Conduzir 8 sessões de teste de usabilidade com clientes beta', 
     'backlog', 'medium', _emp_teste, '2026-03-25', 6, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["research", "ux"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'Migração de dados do portal legado', 
     'Criar scripts de migração para histórico de faturas e tickets do portal antigo', 
     'backlog', 'high', _emp_bruno, '2026-04-10', 7, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["dev", "data"]'::jsonb, '[]'::jsonb);

  -- ── TASKS for Project 2: Expansão Sul ──
  INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by,
    labels) VALUES
    (_tid, _proj2, 'Mapeamento de mercado PR/SC/RS', 
     'Levantar TAM, SAM e SOM para cada estado. Identificar 200 leads qualificados iniciais', 
     'doing', 'high', _emp_teste, '2026-03-01', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["comercial", "research"]'::jsonb),
    (_tid, _proj2, 'Definir modelo de go-to-market', 
     'Escolher entre escritório próprio, representantes ou inside sales remoto para a região', 
     'todo', 'high', _emp_ceo, '2026-03-15', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["estratégia"]'::jsonb),
    (_tid, _proj2, 'Contratar 2 vendedores regionais', 
     'Abrir vagas e contratar executivos de vendas com experiência no mercado local', 
     'backlog', 'medium', NULL, '2026-04-15', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["rh", "comercial"]'::jsonb),
    (_tid, _proj2, 'Material de vendas localizado', 
     'Adaptar apresentações, cases e propostas para o contexto do Sul', 
     'backlog', 'low', _emp_teste, '2026-04-30', 4, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["marketing"]'::jsonb),
    (_tid, _proj2, 'Primeiros 10 clientes piloto', 
     'Fechar os primeiros 10 contratos na região com desconto de early-adopter', 
     'backlog', 'high', NULL, '2026-06-30', 5, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["comercial"]'::jsonb);

  -- ── TASKS for Project 3: OKRs ──
  INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by) VALUES
    (_tid, _proj3, 'Treinamento de OKRs para liderança', 
     'Workshop de 4h com todos os diretores e coordenadores sobre metodologia OKR', 
     'todo', 'high', _emp_ceo, '2026-03-10', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, _proj3, 'Definir OKRs da empresa Q2', 
     'Facilitar sessão de planejamento para definir 3-5 OKRs corporativos do Q2 2026', 
     'todo', 'high', _emp_ceo, '2026-03-20', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, _proj3, 'Escolher ferramenta de acompanhamento', 
     'Avaliar e selecionar ferramenta para tracking de OKRs (Weekdone, Gtmhub, Notion)', 
     'backlog', 'medium', _emp_bruno, '2026-03-30', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513');

  -- ── TASKS without project (general) ──
  INSERT INTO tasks (tenant_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by) VALUES
    (_tid, 'Atualizar política de home office', 
     'Revisar e atualizar a política de trabalho remoto com base no feedback da pesquisa de clima', 
     'todo', 'medium', _emp_ceo, '2026-03-01', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, 'Renovar contrato de benefícios', 
     'Negociar renovação do plano de saúde e vale-refeição para o próximo ciclo', 
     'doing', 'urgent', _emp_bruno, '2026-02-28', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, 'Auditoria de segurança da informação', 
     'Contratar empresa terceira para auditoria anual de segurança e compliance LGPD', 
     'backlog', 'high', NULL, '2026-04-30', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513');

  -- ── PROCESSES ──
  INSERT INTO processes (id, tenant_id, name, description, status, position_id, created_by) VALUES
    (_proc1, _tid, 'Onboarding de Novo Cliente', 
     'Processo completo de onboarding desde a assinatura do contrato até a ativação total do cliente na plataforma', 
     'active', _pos_cs_lead, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proc2, _tid, 'Ciclo de Contratação', 
     'Fluxo de recrutamento e seleção desde a abertura da vaga até o primeiro dia do novo colaborador', 
     'active', _pos_rh_coord, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proc3, _tid, 'Deploy em Produção', 
     'Processo de deploy de novas versões do produto, incluindo testes, aprovação e rollback', 
     'draft', _pos_tech_lead, '954be1c6-a4df-4f45-bc14-d268a5ac3513')
  ON CONFLICT DO NOTHING;

  -- ── PROCESS STEPS ──
  INSERT INTO process_steps (tenant_id, process_id, title, description, responsible_position_id, estimated_time, sort_order, checklist_items) VALUES
    -- Onboarding de Cliente
    (_tid, _proc1, 'Kickoff com o cliente', 'Reunião inicial para alinhar expectativas, cronograma e equipe do projeto', _pos_cs_lead, 60, 1,
     ARRAY['Enviar convite da reunião', 'Preparar apresentação de onboarding', 'Confirmar participantes do cliente']),
    (_tid, _proc1, 'Configuração do ambiente', 'Criar workspace do cliente, configurar integrações e importar dados iniciais', _pos_dev_sr, 120, 2,
     ARRAY['Criar tenant no sistema', 'Configurar SSO se aplicável', 'Importar base de dados do cliente', 'Testar integrações']),
    (_tid, _proc1, 'Treinamento dos usuários', 'Sessões de treinamento para admins e usuários finais do cliente', _pos_cs_analyst, 180, 3,
     ARRAY['Agendar sessões de treinamento', 'Preparar materiais', 'Realizar treinamento admins', 'Realizar treinamento usuários', 'Enviar gravações']),
    (_tid, _proc1, 'Go-live e acompanhamento', 'Ativação em produção com acompanhamento intensivo na primeira semana', _pos_cs_analyst, 480, 4,
     ARRAY['Confirmar checklist de go-live', 'Ativar ambiente de produção', 'Monitorar uso diário', 'Reunião de check-in D+3', 'Reunião de check-in D+7']),
    
    -- Ciclo de Contratação
    (_tid, _proc2, 'Abertura da vaga', 'Definir perfil da vaga, competências necessárias e faixa salarial', _pos_rh_coord, 30, 1,
     ARRAY['Preencher formulário de requisição', 'Aprovar com gestor da área', 'Publicar nas plataformas']),
    (_tid, _proc2, 'Triagem de candidatos', 'Analisar currículos e realizar entrevistas iniciais por telefone', _pos_rh_coord, 60, 2,
     ARRAY['Triar currículos recebidos', 'Realizar screening calls', 'Selecionar shortlist de 5-8 candidatos']),
    (_tid, _proc2, 'Entrevistas técnicas', 'Entrevistas aprofundadas com gestor da área e teste técnico quando aplicável', NULL, 120, 3,
     ARRAY['Agendar entrevistas', 'Aplicar teste técnico', 'Coletar feedback dos entrevistadores', 'Selecionar finalistas']),
    (_tid, _proc2, 'Proposta e contratação', 'Enviar proposta, negociar e processar admissão', _pos_rh_coord, 60, 4,
     ARRAY['Preparar proposta salarial', 'Enviar carta proposta', 'Coletar documentação', 'Cadastrar no sistema']),
    (_tid, _proc2, 'Onboarding do colaborador', 'Integração do novo colaborador na primeira semana', _pos_rh_coord, 240, 5,
     ARRAY['Preparar kit de boas-vindas', 'Configurar acessos e equipamentos', 'Apresentar para o time', 'Reunião com gestor direto', 'Treinamento institucional']),

    -- Deploy em Produção
    (_tid, _proc3, 'Code freeze e QA', 'Congelar branch de release e executar testes de regressão completos', _pos_tech_lead, 120, 1,
     ARRAY['Criar branch de release', 'Executar testes automatizados', 'Realizar testes manuais de smoke', 'Verificar migrations pendentes']),
    (_tid, _proc3, 'Review de segurança', 'Verificar vulnerabilidades e compliance antes do deploy', _pos_dev_sr, 60, 2,
     ARRAY['Rodar scan de dependências', 'Verificar OWASP top 10', 'Validar permissões e RLS']),
    (_tid, _proc3, 'Deploy e monitoramento', 'Executar deploy com zero downtime e monitorar métricas pós-deploy', _pos_tech_lead, 60, 3,
     ARRAY['Executar deploy blue-green', 'Monitorar error rate por 30min', 'Verificar métricas de performance', 'Comunicar time de CS sobre mudanças']);

  -- ── Update existing project "teste" with better data ──
  UPDATE projects 
  SET name = 'Automação de Relatórios Financeiros',
      description = 'Automatizar geração de DRE, fluxo de caixa e relatórios gerenciais que hoje são feitos manualmente em planilhas',
      status = 'completed',
      priority = 'low',
      start_date = '2025-11-01',
      end_date = '2026-01-31',
      progress = 100
  WHERE id = '99ce1224-af2a-43fd-a5c5-180a4655cde3';

  -- ── Update existing process "teste" with better data ──
  UPDATE processes 
  SET name = 'Fechamento Financeiro Mensal',
      description = 'Processo de fechamento contábil e financeiro realizado até o 5º dia útil de cada mês',
      status = 'active',
      position_id = _pos_fin_coord
  WHERE id = '384bec18-3a3b-4c2c-8b34-3a09f07ddfff';

  -- ── Update employee names to be more realistic ──
  UPDATE profiles SET full_name = 'Ricardo Mendes' WHERE user_id = 'f93dfa95-1be7-411b-b412-34306858ceb5';
  UPDATE profiles SET full_name = 'Mariana Costa Silva' WHERE user_id = '954be1c6-a4df-4f45-bc14-d268a5ac3513';

  -- ── Set manager hierarchy: CEO manages both employees ──
  UPDATE employees SET manager_id = _emp_ceo WHERE id IN (_emp_bruno, _emp_teste);

  -- ── Update existing tasks with better titles ──
  UPDATE tasks SET title = 'Configurar dashboard de métricas', description = 'Implementar dashboard com KPIs de vendas, churn e MRR usando Recharts', priority = 'high', status = 'review' WHERE id = 'b14b0e13-9f02-4097-a774-71dc335a04d6';
  UPDATE tasks SET title = 'Revisar contratos de parceiros', description = 'Analisar e renegociar termos dos contratos com 5 parceiros estratégicos', priority = 'medium', status = 'doing' WHERE id = '26349136-10cc-4a50-b013-3cf2f9a51f74';
  UPDATE tasks SET title = 'Documentar APIs internas', description = 'Criar documentação Swagger/OpenAPI para todas as APIs internas do produto', priority = 'low', status = 'backlog' WHERE id = '1afeae1a-2c85-4270-86c7-745bf88d43fe';

END $$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Seed de demo falhou (esperado se usuarios nao existem): %', SQLERRM;
END $$;
