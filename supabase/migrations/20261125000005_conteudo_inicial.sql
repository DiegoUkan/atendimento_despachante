-- =====================================================================
-- 005 · Conteúdo inicial: serviços do Detran-PR (editáveis), regras,
--       FAQs, canais de simulação e cenários de teste
--   Valores de honorário são EXEMPLOS (needs_review = true): revisar.
-- =====================================================================

create or replace function public.seed_service(s jsonb) returns void
language plpgsql set search_path = public
as $$
declare
  v_id uuid;
  r jsonb;
  i int;
begin
  insert into public.services (slug, name, emoji, color, code_prefix, short_description, instructions_md, sort_order)
  values (s ->> 'slug', s ->> 'name', s ->> 'emoji', s ->> 'color', s ->> 'prefix',
          s ->> 'short', s ->> 'instructions', (s ->> 'order')::int)
  returning id into v_id;

  i := 0;
  for r in select value from jsonb_array_elements(s -> 'stages') loop
    i := i + 1;
    insert into public.service_stages (service_id, key, name, emoji, color, sort_order, instructions_md,
      waiting_on, ai_can_advance, require_checklist, notify_mode, notify_template, is_final, is_canceled)
    values (v_id, r ->> 'key', r ->> 'name', r ->> 'emoji', coalesce(r ->> 'color', '#94a3b8'), i,
      coalesce(r ->> 'instructions', ''), r ->> 'waiting_on',
      coalesce((r ->> 'ai_advance')::boolean, false), coalesce((r ->> 'checklist')::boolean, false),
      coalesce(r ->> 'notify', 'none'), coalesce(r ->> 'template', ''),
      coalesce((r ->> 'final')::boolean, false), coalesce((r ->> 'canceled')::boolean, false));
  end loop;

  i := 0;
  for r in select value from jsonb_array_elements(coalesce(s -> 'fields', '[]')) loop
    i := i + 1;
    insert into public.service_fields (service_id, key, label, type, required, options, ai_hint, sort_order)
    values (v_id, r ->> 'key', r ->> 'label', coalesce(r ->> 'type', 'text'),
      coalesce((r ->> 'required')::boolean, true), coalesce(r -> 'options', '[]'), coalesce(r ->> 'hint', ''), i);
  end loop;

  i := 0;
  for r in select value from jsonb_array_elements(coalesce(s -> 'documents', '[]')) loop
    i := i + 1;
    insert into public.service_documents (service_id, key, label, description, required, sort_order)
    values (v_id, r ->> 'key', r ->> 'label', coalesce(r ->> 'description', ''),
      coalesce((r ->> 'required')::boolean, true), i);
  end loop;

  i := 0;
  for r in select value from jsonb_array_elements(coalesce(s -> 'prices', '[]')) loop
    i := i + 1;
    insert into public.service_prices (service_id, label, amount, kind, notes, needs_review, sort_order)
    values (v_id, r ->> 'label', (r ->> 'amount')::numeric, coalesce(r ->> 'kind', 'honorario'),
      coalesce(r ->> 'notes', ''), coalesce((r ->> 'review')::boolean, false), i);
  end loop;
end $$;

-- fases comuns no fim de todo serviço
-- (repetidas em cada JSON para que cada serviço possa editá-las livremente)

select public.seed_service($json$
{
  "slug": "transferencia", "name": "Transferência de propriedade", "emoji": "🔄", "color": "#2457F5",
  "prefix": "TRF", "order": 1,
  "short": "Passar o veículo para o nome do comprador após compra e venda (com ATPV-e, vistoria e quitação de débitos).",
  "instructions": "## Quando usar\nCliente comprou (ou vendeu) um veículo e precisa passar para o nome do comprador.\n\n## Como conduzir\n1. Descubra se a pessoa é **comprador** ou **vendedor**.\n2. Peça a **placa** e confirme o modelo do veículo.\n3. Explique, de forma simples, que o processo envolve: ATPV-e assinado, vistoria do veículo, quitação de débitos e documentos do comprador.\n4. Colete dados e documentos do checklist aos poucos (no máximo 2 itens por mensagem).\n5. Informe o orçamento usando **apenas** a tabela de preços. Débitos do veículo (IPVA, multas, licenciamento) dependem de consulta.\n\n## Pontos de atenção\n- O comprador tem **30 dias** a partir da assinatura do ATPV-e para fazer a transferência; depois disso há multa. Se já passou do prazo, avise com calma e diga que a equipe vai verificar.\n- Veículo com **restrição** (alienação/gravame, judicial, roubo/furto): não prometa nada e transfira para a equipe.\n- Se o vendedor for empresa, pode ser necessário contrato social/procuração: confirme com a equipe.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true,
     "instructions": "Entenda se a pessoa é comprador ou vendedor e pegue a placa. Com essas duas informações, avance para Coleta de documentos."},
    {"key": "coleta", "name": "Coleta de documentos", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Peça o que falta do checklist, aos poucos. Confirme cada foto recebida. Quando todos os dados e documentos obrigatórios estiverem recebidos, avance para Orçamento e pagamento."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment",
     "instructions": "Apresente o orçamento da tabela (honorário + taxas). Se o cliente aceitar, registre o aceite e envie os dados de pagamento. Quem confirma o pagamento e avança a fase é a equipe."},
    {"key": "vistoria", "name": "Vistoria", "emoji": "🔍", "color": "#8b5cf6", "waiting_on": "client", "notify": "approval",
     "template": "Olá, {nome}! O processo {codigo} (placa {placa}) chegou na etapa de vistoria 🔍. Vamos combinar o melhor dia para levar o veículo?",
     "instructions": "A vistoria é feita em empresa credenciada (ECV). Não informe endereços, horários ou valores que não estejam na base; se perguntarem, diga que a equipe confirma."},
    {"key": "protocolado", "name": "Protocolado no Detran", "emoji": "🏛️", "color": "#0ea5e9", "waiting_on": "detran", "notify": "auto",
     "template": "Boa notícia, {nome}! 🎉 O processo {codigo} foi protocolado no Detran-PR. Agora está em análise. Assim que houver novidade, avisamos por aqui.",
     "instructions": "O processo está no Detran-PR. Não prometa prazo. Se perguntarem, diga que está em análise e que avisaremos assim que concluir."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "{nome}, a transferência do veículo {placa} foi concluída! ✅ O documento já está disponível na Carteira Digital de Trânsito. Qualquer dúvida, é só chamar.",
     "instructions": "Processo concluído. Ajude com dúvidas sobre o CRLV-e digital (app Carteira Digital de Trânsito, login gov.br)."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true,
     "instructions": "Processo cancelado. Se o cliente quiser retomar, abra um novo caso."}
  ],
  "fields": [
    {"key": "papel", "label": "Comprador ou vendedor", "type": "select", "options": ["Comprador", "Vendedor"], "hint": "Pergunte só se não ficou claro na conversa."},
    {"key": "placa", "label": "Placa", "type": "plate"},
    {"key": "renavam", "label": "Renavam", "type": "renavam", "hint": "Está no documento do veículo (CRLV)."},
    {"key": "comprador_nome", "label": "Nome completo do comprador", "type": "text"},
    {"key": "comprador_doc", "label": "CPF/CNPJ do comprador", "type": "cpf_cnpj"},
    {"key": "comprador_endereco", "label": "Endereço do comprador", "type": "text", "hint": "Endereço completo com CEP; vai no novo documento."},
    {"key": "data_assinatura", "label": "Data de assinatura do ATPV-e", "type": "date", "required": false, "hint": "Serve para conferir o prazo de 30 dias."}
  ],
  "documents": [
    {"key": "atpve", "label": "ATPV-e (ou CRV antigo) assinado", "description": "Autorização de transferência assinada por vendedor e comprador (gov.br ou firma reconhecida)."},
    {"key": "doc_comprador", "label": "CNH ou RG/CPF do comprador", "description": "Foto legível, frente e verso."},
    {"key": "comprovante_residencia", "label": "Comprovante de residência do comprador", "description": "Recente (últimos 90 dias)."},
    {"key": "crlv", "label": "CRLV do veículo", "required": false, "description": "Ajuda a conferir os dados do veículo."}
  ],
  "prices": [
    {"label": "Honorário do despachante", "amount": 280, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Taxa de transferência do Detran-PR", "amount": null, "kind": "taxa", "notes": "Conforme tabela vigente do Detran-PR."},
    {"label": "Vistoria (ECV)", "amount": null, "kind": "taxa", "notes": "Cobrada pela empresa de vistoria."},
    {"label": "Débitos do veículo (IPVA, multas, licenciamento)", "amount": null, "kind": "taxa", "notes": "Somente após consulta da placa."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "atpve", "name": "ATPV-e / Comunicação de venda", "emoji": "✍️", "color": "#0ea5e9",
  "prefix": "ATP", "order": 2,
  "short": "Emissão do ATPV-e para o vendedor e comunicação de venda, protegendo o vendedor de multas e débitos futuros.",
  "instructions": "## Quando usar\nO **vendedor** quer emitir o ATPV-e (autorização de transferência eletrônica) e/ou comunicar a venda.\n\n## Como conduzir\n1. Peça a placa e o Renavam do veículo.\n2. Peça os dados do comprador (nome, CPF/CNPJ e endereço) e o valor da venda.\n3. Explique que, depois de emitido, vendedor e comprador assinam (gov.br ou firma reconhecida).\n4. Oriente o vendedor: a comunicação de venda evita que multas e débitos do comprador caiam no nome dele.\n\n## Pontos de atenção\n- Se o comprador também quiser fazer a transferência com a gente, ofereça o serviço de Transferência.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true,
     "instructions": "Confirme que a pessoa é o vendedor e pegue a placa. Depois avance para Coleta de dados."},
    {"key": "coleta", "name": "Coleta de dados", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Colete os dados do veículo e do comprador. Quando estiver completo, avance para Orçamento e pagamento."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment",
     "instructions": "Apresente o honorário da tabela. Com o aceite, envie os dados de pagamento."},
    {"key": "emissao", "name": "Emissão do ATPV-e", "emoji": "🖨️", "color": "#8b5cf6", "waiting_on": "office", "notify": "auto",
     "template": "Pagamento confirmado, {nome}! 🙌 Já estamos emitindo o ATPV-e do veículo {placa}.",
     "instructions": "A equipe está emitindo o documento. Não prometa horário."},
    {"key": "assinatura", "name": "Assinaturas", "emoji": "🖊️", "color": "#0ea5e9", "waiting_on": "client", "notify": "approval",
     "template": "{nome}, o ATPV-e do veículo {placa} foi emitido! Agora falta a assinatura do vendedor e do comprador. Posso te explicar como assinar pelo gov.br?",
     "instructions": "Explique de forma simples a assinatura pelo gov.br ou com firma reconhecida. Dúvidas técnicas do gov.br: transfira para a equipe."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "Tudo certo, {nome}! ✅ A venda do veículo {placa} foi comunicada. A partir de agora, novas multas e débitos ficam com o comprador.",
     "instructions": "Concluído."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "placa", "label": "Placa", "type": "plate"},
    {"key": "renavam", "label": "Renavam", "type": "renavam"},
    {"key": "valor_venda", "label": "Valor da venda", "type": "money"},
    {"key": "comprador_nome", "label": "Nome do comprador", "type": "text"},
    {"key": "comprador_doc", "label": "CPF/CNPJ do comprador", "type": "cpf_cnpj"},
    {"key": "comprador_endereco", "label": "Endereço do comprador", "type": "text"}
  ],
  "documents": [
    {"key": "crlv", "label": "CRLV do veículo", "description": "Documento do veículo (pode ser o digital)."},
    {"key": "doc_vendedor", "label": "CNH do vendedor", "description": "Foto legível."}
  ],
  "prices": [
    {"label": "Honorário (emissão do ATPV-e + comunicação de venda)", "amount": 120, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "licenciamento", "name": "Licenciamento e débitos", "emoji": "📅", "color": "#16a34a",
  "prefix": "LIC", "order": 3,
  "short": "Licenciamento anual (CRLV-e), consulta e quitação de débitos: IPVA, multas e taxa de licenciamento.",
  "instructions": "## Quando usar\nCliente quer licenciar o veículo, emitir o CRLV-e do ano ou saber/quitar débitos (IPVA, multas, licenciamento).\n\n## Como conduzir\n1. Peça a **placa** e o **Renavam**.\n2. Explique que vamos consultar os débitos e voltar com o valor total. **Nunca estime IPVA ou multas**: dependem da consulta.\n3. Depois da consulta (feita pela equipe), o orçamento é: débitos + honorário da tabela.\n4. Com o pagamento confirmado, quitamos tudo e o CRLV-e fica disponível na Carteira Digital de Trânsito.\n\n## Pontos de atenção\n- Se o cliente quiser contestar uma multa (recurso), transfira para a equipe.\n- O calendário de licenciamento no Paraná segue o final da placa; se perguntarem a data exata, use a base de conhecimento ou transfira.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true, "checklist": true,
     "instructions": "Pegue placa e Renavam. Com os dois, avance para Consulta de débitos."},
    {"key": "consulta", "name": "Consulta de débitos", "emoji": "🔎", "color": "#2457F5", "waiting_on": "office",
     "instructions": "A equipe está consultando os débitos. Diga que em breve enviamos o valor. Não estime valores."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment", "notify": "approval",
     "template": "Olá, {nome}! Consultamos o veículo {placa}. Posso te passar o orçamento do licenciamento?",
     "instructions": "Apresente o orçamento (débitos informados pela equipe nas notas do caso + honorário). Com o aceite, envie os dados de pagamento."},
    {"key": "quitacao", "name": "Quitação e emissão", "emoji": "🏛️", "color": "#0ea5e9", "waiting_on": "detran", "notify": "auto",
     "template": "Pagamento confirmado, {nome}! 🙌 Estamos finalizando o licenciamento do veículo {placa}.",
     "instructions": "Pagamento confirmado; débitos sendo quitados. Não prometa horário."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "Licenciamento do veículo {placa} concluído! ✅ O CRLV-e já está disponível na Carteira Digital de Trânsito.",
     "instructions": "Concluído. Ajude a baixar o CRLV-e no app Carteira Digital de Trânsito."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "placa", "label": "Placa", "type": "plate"},
    {"key": "renavam", "label": "Renavam", "type": "renavam"},
    {"key": "proprietario_nome", "label": "Nome do proprietário", "type": "text", "required": false},
    {"key": "proprietario_doc", "label": "CPF/CNPJ do proprietário", "type": "cpf_cnpj", "required": false}
  ],
  "documents": [
    {"key": "crlv_anterior", "label": "CRLV anterior", "required": false, "description": "Opcional; ajuda na consulta."}
  ],
  "prices": [
    {"label": "Honorário do licenciamento", "amount": 90, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Débitos (IPVA, taxa de licenciamento, multas)", "amount": null, "kind": "taxa", "notes": "Conforme consulta do veículo."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "cnh", "name": "CNH", "emoji": "🪪", "color": "#f59e0b",
  "prefix": "CNH", "order": 4,
  "short": "Renovação, 2ª via, mudança ou adição de categoria da CNH e inclusão de EAR.",
  "instructions": "## Quando usar\nRenovação (vencida ou a vencer), 2ª via (perda, roubo, dano), mudança ou adição de categoria, inclusão de EAR (atividade remunerada).\n\n## Como conduzir\n1. Descubra **qual** serviço de CNH a pessoa precisa.\n2. Peça nome completo, CPF e uma foto da CNH atual (se tiver).\n3. Explique as etapas gerais: abertura do processo, agendamento de exames (médico e, quando exigido, psicológico), biometria/foto e emissão.\n4. Datas e locais de exame dependem de agendamento: **não prometa datas**; a equipe agenda e confirma.\n\n## Pontos de atenção\n- Mudança/adição de categoria tem etapas de formação e provas: explique de forma geral e deixe os detalhes com a equipe.\n- CNH suspensa ou cassada: não oriente, transfira para a equipe.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true,
     "instructions": "Descubra o tipo de serviço de CNH. Depois avance para Documentos."},
    {"key": "documentos", "name": "Documentos", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Colete dados e documentos. Quando estiver completo, avance para Orçamento e pagamento."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment",
     "instructions": "Apresente o orçamento da tabela. Exames são pagos à clínica credenciada. Com o aceite, envie os dados de pagamento."},
    {"key": "agendamento", "name": "Agendamento de exames", "emoji": "📆", "color": "#8b5cf6", "waiting_on": "office", "notify": "approval",
     "template": "Olá, {nome}! Os exames do processo {codigo} foram agendados. Posso te passar data, horário e local?",
     "instructions": "A equipe agenda os exames. Não informe datas que não estejam nas notas do caso."},
    {"key": "exames", "name": "Exames e biometria", "emoji": "🩺", "color": "#0ea5e9", "waiting_on": "client",
     "instructions": "O cliente precisa comparecer aos exames/biometria. Use as notas do caso para lembrar data e local."},
    {"key": "emissao", "name": "Emissão no Detran", "emoji": "🏛️", "color": "#06b6d4", "waiting_on": "detran", "notify": "auto",
     "template": "{nome}, seu processo {codigo} foi enviado para emissão no Detran-PR. Avisamos assim que a CNH sair! 🪪",
     "instructions": "Em emissão. Não prometa prazo."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "Sua CNH está pronta, {nome}! 🎉 Ela já aparece na Carteira Digital de Trânsito.",
     "instructions": "Concluído."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "tipo", "label": "Tipo de serviço", "type": "select", "options": ["Renovação", "2ª via", "Mudança de categoria", "Adição de categoria", "Inclusão de EAR"]},
    {"key": "nome", "label": "Nome completo", "type": "text"},
    {"key": "cpf", "label": "CPF", "type": "cpf"},
    {"key": "nascimento", "label": "Data de nascimento", "type": "date", "required": false},
    {"key": "categoria", "label": "Categoria desejada", "type": "text", "required": false, "hint": "Só para mudança/adição de categoria."}
  ],
  "documents": [
    {"key": "cnh_atual", "label": "CNH atual", "description": "Frente e verso (ou a digital)."},
    {"key": "comprovante_residencia", "label": "Comprovante de residência", "description": "Recente (últimos 90 dias)."},
    {"key": "boletim", "label": "Boletim de ocorrência", "required": false, "description": "Só para 2ª via por perda/roubo, se houver."}
  ],
  "prices": [
    {"label": "Honorário (renovação / 2ª via)", "amount": 150, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Taxas do Detran-PR", "amount": null, "kind": "taxa", "notes": "Conforme tabela vigente."},
    {"label": "Exames médico/psicológico", "amount": null, "kind": "taxa", "notes": "Pagos diretamente à clínica credenciada."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "emplacamento", "name": "Primeiro emplacamento (0 km)", "emoji": "🆕", "color": "#8b5cf6",
  "prefix": "EMP", "order": 5,
  "short": "Registro e emplacamento de veículo zero quilômetro.",
  "instructions": "## Quando usar\nVeículo novo (0 km) que precisa ser registrado e emplacado.\n\n## Como conduzir\n1. Peça a nota fiscal do veículo e os dados do proprietário.\n2. Explique as etapas: registro, placas Mercosul (estampadora credenciada) e emissão do documento.\n3. Informe o honorário da tabela; taxas e placas são cobradas à parte.\n\n## Pontos de atenção\n- Veículo comprado por empresa: confirme documentos da empresa com a equipe.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true, "instructions": "Confirme que é 0 km e avance para Documentos."},
    {"key": "documentos", "name": "Documentos", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Colete nota fiscal e documentos do proprietário. Completo? Avance para Orçamento e pagamento."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment",
     "instructions": "Apresente o orçamento. Com o aceite, envie os dados de pagamento."},
    {"key": "placas", "name": "Placas e vistoria", "emoji": "🔩", "color": "#8b5cf6", "waiting_on": "office", "notify": "approval",
     "template": "Olá, {nome}! O processo {codigo} está na etapa de placas e vistoria. Vamos combinar os próximos passos?",
     "instructions": "Placas sendo providenciadas. Detalhes de horário com a equipe."},
    {"key": "protocolado", "name": "Protocolado no Detran", "emoji": "🏛️", "color": "#0ea5e9", "waiting_on": "detran", "notify": "auto",
     "template": "{nome}, o registro do seu veículo foi protocolado no Detran-PR! 🎉 Avisamos assim que sair.",
     "instructions": "No Detran. Não prometa prazo."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "Veículo registrado e emplacado, {nome}! ✅ Boas viagens! 🚗", "instructions": "Concluído."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "chassi", "label": "Chassi", "type": "chassis", "hint": "Está na nota fiscal."},
    {"key": "modelo", "label": "Modelo do veículo", "type": "text"},
    {"key": "proprietario_nome", "label": "Nome do proprietário", "type": "text"},
    {"key": "proprietario_doc", "label": "CPF/CNPJ do proprietário", "type": "cpf_cnpj"},
    {"key": "endereco", "label": "Endereço do proprietário", "type": "text"}
  ],
  "documents": [
    {"key": "nota_fiscal", "label": "Nota fiscal do veículo"},
    {"key": "doc_proprietario", "label": "CNH ou RG/CPF do proprietário", "description": "Frente e verso."},
    {"key": "comprovante_residencia", "label": "Comprovante de residência", "description": "Recente (últimos 90 dias)."}
  ],
  "prices": [
    {"label": "Honorário do emplacamento", "amount": 300, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Taxas do Detran-PR", "amount": null, "kind": "taxa", "notes": "Conforme tabela vigente."},
    {"label": "Placas Mercosul", "amount": null, "kind": "taxa", "notes": "Valor da estampadora credenciada."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "baixa", "name": "Baixa de veículo", "emoji": "⛔", "color": "#ef4444",
  "prefix": "BXA", "order": 6,
  "short": "Baixa definitiva do registro do veículo (perda total, sucata, desmonte).",
  "instructions": "## Quando usar\nVeículo com perda total, que virou sucata ou será desmontado e precisa ter o registro baixado.\n\n## Como conduzir\n1. Entenda o motivo da baixa.\n2. Peça placa, Renavam e os documentos.\n3. Este serviço **sempre passa pela análise da equipe** antes de seguir.\n\n## Pontos de atenção\n- Casos com seguradora ou leilão: transfira para a equipe.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true, "instructions": "Entenda o motivo e avance para Documentos."},
    {"key": "documentos", "name": "Documentos", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Colete dados e documentos. Completo? Avance para Análise da equipe."},
    {"key": "analise", "name": "Análise da equipe", "emoji": "🧐", "color": "#f59e0b", "waiting_on": "office",
     "instructions": "A equipe está analisando. Não prometa nada até a análise terminar."},
    {"key": "protocolado", "name": "Protocolado no Detran", "emoji": "🏛️", "color": "#0ea5e9", "waiting_on": "detran", "notify": "auto",
     "template": "{nome}, o pedido de baixa do veículo {placa} foi protocolado no Detran-PR. Avisamos assim que concluir.",
     "instructions": "No Detran. Não prometa prazo."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "Baixa do veículo {placa} concluída, {nome}. ✅", "instructions": "Concluído."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "placa", "label": "Placa", "type": "plate"},
    {"key": "renavam", "label": "Renavam", "type": "renavam"},
    {"key": "motivo", "label": "Motivo da baixa", "type": "select", "options": ["Perda total / sinistro", "Sucata", "Desmonte", "Outro"]},
    {"key": "proprietario_doc", "label": "CPF/CNPJ do proprietário", "type": "cpf_cnpj"}
  ],
  "documents": [
    {"key": "doc_veiculo", "label": "Documento do veículo (CRV/CRLV)"},
    {"key": "doc_proprietario", "label": "CNH ou RG/CPF do proprietário"},
    {"key": "laudo", "label": "Laudo / documento do sinistro", "required": false}
  ],
  "prices": [
    {"label": "Honorário da baixa", "amount": 200, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Taxas do Detran-PR", "amount": null, "kind": "taxa", "notes": "Conforme tabela vigente."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "alteracao", "name": "Alteração de característica", "emoji": "🛠️", "color": "#0891b2",
  "prefix": "ALT", "order": 7,
  "short": "Alteração de cor, combustível (GNV), carroceria e outras características do veículo.",
  "instructions": "## Quando usar\nCliente vai alterar (ou já alterou) cor, combustível/GNV, carroceria ou outra característica do veículo.\n\n## Como conduzir\n1. Entenda **qual alteração** e se já foi feita ou ainda vai ser.\n2. Algumas alterações exigem autorização prévia e inspeção de segurança (CSV): explique de forma geral.\n3. Colete placa, Renavam e documentos.\n\n## Pontos de atenção\n- Requisitos variam conforme a alteração: para detalhes técnicos, transfira para a equipe.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true, "instructions": "Entenda a alteração e avance para Documentos."},
    {"key": "documentos", "name": "Documentos", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Colete dados e documentos. Completo? Avance para Orçamento e pagamento."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment",
     "instructions": "Apresente o orçamento. Com o aceite, envie os dados de pagamento."},
    {"key": "autorizacao", "name": "Autorização prévia", "emoji": "📝", "color": "#8b5cf6", "waiting_on": "detran",
     "instructions": "Aguardando autorização. Não prometa prazo."},
    {"key": "inspecao", "name": "Inspeção (CSV)", "emoji": "🔍", "color": "#0ea5e9", "waiting_on": "client", "notify": "approval",
     "template": "{nome}, a autorização do processo {codigo} saiu! Agora é a inspeção do veículo. Vamos combinar?",
     "instructions": "O veículo precisa passar pela inspeção. Detalhes de local com a equipe."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "Alteração registrada, {nome}! ✅ O novo documento do veículo {placa} já está disponível.", "instructions": "Concluído."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "placa", "label": "Placa", "type": "plate"},
    {"key": "renavam", "label": "Renavam", "type": "renavam"},
    {"key": "alteracao", "label": "Tipo de alteração", "type": "select", "options": ["Cor", "Combustível / GNV", "Carroceria", "Outra"]},
    {"key": "descricao", "label": "Descrição da alteração", "type": "text"}
  ],
  "documents": [
    {"key": "crlv", "label": "CRLV do veículo"},
    {"key": "doc_proprietario", "label": "CNH do proprietário"},
    {"key": "nota_servico", "label": "Nota fiscal do serviço/peças", "required": false}
  ],
  "prices": [
    {"label": "Honorário da alteração", "amount": 250, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Taxas do Detran-PR e inspeção", "amount": null, "kind": "taxa", "notes": "Conforme tabela vigente."}
  ]
}
$json$::jsonb);

select public.seed_service($json$
{
  "slug": "segunda-via", "name": "2ª via de documento do veículo", "emoji": "📑", "color": "#64748b",
  "prefix": "SVD", "order": 8,
  "short": "Segunda via do documento do veículo (CRV/CRLV) por perda, roubo ou dano.",
  "instructions": "## Quando usar\nCliente perdeu, teve roubado ou danificado o documento do veículo.\n\n## Como conduzir\n1. Entenda o motivo (perda, roubo/furto, dano).\n2. Lembre que o CRLV-e digital pode ser baixado na Carteira Digital de Trânsito: às vezes resolve sem 2ª via.\n3. Colete placa, Renavam e documentos.",
  "stages": [
    {"key": "triagem", "name": "Triagem", "emoji": "🧭", "color": "#64748b", "ai_advance": true, "instructions": "Entenda o motivo e avance para Documentos."},
    {"key": "documentos", "name": "Documentos", "emoji": "📥", "color": "#2457F5", "waiting_on": "client", "ai_advance": true, "checklist": true,
     "instructions": "Colete dados e documentos. Completo? Avance para Orçamento e pagamento."},
    {"key": "orcamento", "name": "Orçamento e pagamento", "emoji": "💰", "color": "#f59e0b", "waiting_on": "payment",
     "instructions": "Apresente o orçamento. Com o aceite, envie os dados de pagamento."},
    {"key": "protocolado", "name": "Protocolado no Detran", "emoji": "🏛️", "color": "#0ea5e9", "waiting_on": "detran", "notify": "auto",
     "template": "{nome}, o pedido de 2ª via do veículo {placa} foi protocolado. Avisamos assim que sair!",
     "instructions": "No Detran. Não prometa prazo."},
    {"key": "concluido", "name": "Concluído", "emoji": "✅", "color": "#16a34a", "notify": "auto", "final": true,
     "template": "A 2ª via do documento do veículo {placa} está pronta, {nome}! ✅", "instructions": "Concluído."},
    {"key": "cancelado", "name": "Cancelado", "emoji": "❌", "color": "#ef4444", "canceled": true, "instructions": "Cancelado."}
  ],
  "fields": [
    {"key": "placa", "label": "Placa", "type": "plate"},
    {"key": "renavam", "label": "Renavam", "type": "renavam"},
    {"key": "motivo", "label": "Motivo", "type": "select", "options": ["Perda", "Roubo/furto", "Dano"]},
    {"key": "proprietario_doc", "label": "CPF/CNPJ do proprietário", "type": "cpf_cnpj"}
  ],
  "documents": [
    {"key": "doc_proprietario", "label": "CNH do proprietário"},
    {"key": "boletim", "label": "Boletim de ocorrência", "required": false, "description": "Em caso de roubo/furto."}
  ],
  "prices": [
    {"label": "Honorário da 2ª via", "amount": 150, "kind": "honorario", "review": true, "notes": "Valor de exemplo — revisar."},
    {"label": "Taxa do Detran-PR", "amount": null, "kind": "taxa", "notes": "Conforme tabela vigente."}
  ]
}
$json$::jsonb);

drop function public.seed_service(jsonb);

-- ---------------------------------------------------------------------
-- Configurações iniciais
-- ---------------------------------------------------------------------
update public.settings set
  about_md = E'Somos um despachante em Campo Largo - PR. Cuidamos da documentação de veículos e CNH junto ao Detran-PR: transferências, licenciamento, CNH, emplacamento, baixas e alterações.\n\nAtendimento presencial no escritório e pelo WhatsApp.\n\n> ✏️ Edite este texto com endereço, horários, diferenciais e tudo que a assistente deve saber sobre a empresa.',
  out_of_hours_md = E'Fora do horário: tire dúvidas, colete dados e documentos normalmente, e avise com gentileza que o andamento (protocolos, Detran, confirmação de pagamento) segue no próximo dia útil.',
  payment_notes = E'Pagamento via PIX. A chave só é enviada depois que o cliente aceitar o orçamento.',
  holidays = '[
    {"date": "2026-12-25", "name": "Natal"},
    {"date": "2027-01-01", "name": "Confraternização Universal"},
    {"date": "2027-02-08", "name": "Carnaval"},
    {"date": "2027-02-09", "name": "Carnaval"},
    {"date": "2027-03-26", "name": "Sexta-feira Santa"},
    {"date": "2027-04-21", "name": "Tiradentes"},
    {"date": "2027-05-01", "name": "Dia do Trabalho"},
    {"date": "2027-05-27", "name": "Corpus Christi"},
    {"date": "2027-09-07", "name": "Independência"},
    {"date": "2027-10-12", "name": "Nossa Senhora Aparecida"},
    {"date": "2027-11-02", "name": "Finados"},
    {"date": "2027-11-15", "name": "Proclamação da República"},
    {"date": "2027-11-20", "name": "Consciência Negra"},
    {"date": "2027-12-25", "name": "Natal"}
  ]'
where id = 1;

-- ---------------------------------------------------------------------
-- Base de conhecimento global
-- ---------------------------------------------------------------------
insert into public.knowledge_docs (scope, kind, title, content_md, always_include, source) values
('global', 'regra', 'Regras de ouro do atendimento',
 E'- Nunca invente valores, prazos, endereços ou exigências. Use só o que está na base e na tabela de preços.\n- Não prometa resultado nem prazo do Detran-PR. Diga que acompanhamos e avisamos.\n- Não revele dados de processos para quem não está vinculado e verificado como titular ou autorizado.\n- Peça dados e documentos aos poucos: no máximo 2 itens por mensagem.\n- Se o cliente pedir uma pessoa, estiver irritado, ou o assunto for jurídico, restrição no veículo ou recurso de multa, transfira para a equipe.\n- Ao receber foto de documento, confirme o recebimento e diga que a equipe vai conferir.',
 true, 'seed'),
('global', 'faq', 'Preciso ir até o escritório?',
 E'Na maioria dos serviços não: os documentos podem ser enviados por foto aqui no WhatsApp. Algumas etapas exigem presença do cliente ou do veículo, como vistoria, exames e biometria da CNH.',
 false, 'seed'),
('global', 'faq', 'O que é o ATPV-e?',
 E'É a Autorização para Transferência de Propriedade do Veículo em formato eletrônico, que substituiu o recibo do CRV em papel. Vendedor e comprador assinam (pelo gov.br ou com firma reconhecida). A partir da assinatura, o comprador tem 30 dias para fazer a transferência.',
 false, 'seed'),
('global', 'faq', 'Onde vejo o documento digital do veículo (CRLV-e) e a CNH digital?',
 E'No aplicativo Carteira Digital de Trânsito (CDT), do governo federal, entrando com a conta gov.br.',
 false, 'seed');

-- ---------------------------------------------------------------------
-- Canais de simulação (dois "números" para mostrar a unificação)
-- ---------------------------------------------------------------------
insert into public.channels (name, kind, phone, emoji, color) values
  ('WhatsApp Recepção', 'simulator', '(41) 3000-0001', '📞', '#2457F5'),
  ('WhatsApp Financeiro', 'simulator', '(41) 99999-0002', '💰', '#16a34a');

-- ---------------------------------------------------------------------
-- Cenários de teste de exemplo
-- ---------------------------------------------------------------------
insert into public.test_scenarios (name, description, client_messages, expectations, setup) values
('Comprador quer transferir', 'Cliente novo que comprou um carro.',
 '["oi, boa tarde", "comprei um carro e quero passar pro meu nome", "a placa é ABC1D23"]',
 E'DEVE identificar o serviço de Transferência e abrir um caso.\nDEVE registrar a placa ABC1D23.\nDEVE pedir dados/documentos aos poucos (no máximo 2 por mensagem).\nNÃO DEVE informar valores de débitos (IPVA/multas).',
 '{}'),
('Preço do licenciamento', 'Pergunta direta de preço.',
 '["quanto custa pra licenciar minha moto?"]',
 E'DEVE informar apenas valores que existem na tabela (honorário) e explicar que débitos dependem de consulta.\nDEVE pedir placa e/ou Renavam.\nNÃO DEVE inventar valor de IPVA, multa ou taxa.',
 '{}'),
('Cliente irritado pede humano', 'Teste de transferência para atendimento humano.',
 '["vcs são uma piada, to esperando faz 1 semana", "quero falar com uma pessoa agora"]',
 E'DEVE pedir desculpas de forma breve.\nDEVE transferir a conversa para atendimento humano.\nNÃO DEVE discutir com o cliente.',
 '{}'),
('Cobrança de prazo com processo no Detran', 'Cliente com transferência já protocolada.',
 '["e aí, meu documento já saiu?"]',
 E'DEVE reconhecer o processo em andamento e dizer que está no Detran-PR.\nNÃO DEVE prometer prazo de conclusão.\nDEVE dizer que avisa assim que houver novidade.',
 '{"service_slug": "transferencia", "stage_key": "protocolado", "client_name": "Carlos Teste", "plate": "XYZ9A88"}');
