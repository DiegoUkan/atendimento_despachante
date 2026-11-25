# Despacha · Atendimento inteligente para despachantes

Sistema de atendimento de WhatsApp com IA + CRM, feito para um despachante de Campo Largo-PR.

- Junta **vários números de WhatsApp** numa caixa de entrada única, organizada por cliente (o cliente é identificado pelo telefone).
- A **IA responde** seguindo processos cadastrados (serviços → fases → dados → documentos → preços).
- O **CRM** guarda cada caso com dados estruturados e notas em markdown.
- Cada decisão da IA tem um **Raio-X**: por que fez, o que consultou, quais ações tomou.
- Os donos **ensinam a IA conversando**. O Instrutor propõe mudanças com antes/depois e alguém aprova.

```
┌──────────────────────┐        ┌───────────────────────────────┐
│ Vercel               │        │ Supabase                      │
│ apps/web (Next.js 16)│◄──────►│ Postgres + Auth + Storage     │
│ painel de gestão     │        │ + Realtime + Vault (chaves IA)│
└──────────────────────┘        └───────────────▲───────────────┘
┌───────────────────────────────────────────┐   │
│ Seu servidor — apps/worker (Docker)       │───┘
│ • fila de tarefas no próprio Postgres     │
│ • agente de atendimento (OpenAI-compat.)  │──► seu newapi (Claude, GPT, Gemini…)
│ • instrutor, cenários de teste, avisos    │
│ • canais: Simulador (hoje) / Evolution    │
└───────────────────────────────────────────┘
```

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/web` | Painel (Next.js 16 + Tailwind 4). Vai para a **Vercel**. |
| `apps/worker` | Worker Node/TypeScript. Vai para o **seu servidor** via Docker. |
| `packages/shared` | Tipos do banco, validadores (CPF/CNPJ/placa/Renavam), telefones, horário comercial, regras de modo. |
| `supabase/migrations` | Todo o banco: tabelas, RLS, gatilhos, fila e conteúdo inicial (8 serviços do Detran-PR). |

## Rodando localmente

1. **Chave secreta do Supabase.** Em *Supabase → Project Settings → API Keys*, copie a chave **secret** (`sb_secret_…`, ou a `service_role` legada). Cole nos dois arquivos abaixo. **Não** cole em chat nem em repositório.
   - `apps/web/.env.local` → `SUPABASE_SERVICE_ROLE_KEY=`
   - `apps/worker/.env` → `SUPABASE_SERVICE_ROLE_KEY=`
2. Instale e suba os dois processos, cada um em um terminal:
   ```bash
   npm install
   npm run dev:web      # http://localhost:3000
   npm run dev:worker   # http://localhost:8787/health
   ```
3. Abra o painel. Na primeira vez ele mostra **Primeiro acesso**: crie a conta do dono.
4. Vá em **Configurações → Inteligência Artificial**:
   - Cadastre o provedor: URL do seu newapi (geralmente termina em `/v1`) e a chave. A chave fica criptografada no Supabase Vault.
   - Clique em **Testar conexão**. Isso carrega a lista de modelos.
   - Escolha um modelo por tarefa. *Atendimento* precisa suportar tool calling. Visão, transcrição de áudio e embeddings são opcionais.
5. Abra o **Simulador** e converse como se fosse um cliente.

## Deploy

### Painel na Vercel

1. Importe `DiegoUkan/atendimento_despachante` como projeto **Next.js**, com a branch de produção `main`.
2. Em **Root Directory**, selecione `apps/web` e deixe habilitada a opção **Include source files outside of the Root Directory** para incluir `packages/shared` e o lockfile da raiz. Mantenha os comandos de instalação, build e diretório de saída nos padrões da Vercel.
3. Em **Environment Variables**, cadastre as três variáveis em **Production**. Configure **Preview** apenas se quiser usar o painel nos deploys de prévia.

   | Variável | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://izlctgakeabmrlkfoenm.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable em **Supabase → Project Settings → API Keys** |
   | `SUPABASE_SERVICE_ROLE_KEY` | Chave secret (`sb_secret_…`) ou `service_role` legada da mesma página. Marque como **Sensitive** na Vercel. |

4. Faça o deploy. Em **Supabase → Authentication → URL Configuration**, defina **Site URL** com a URL de produção do painel.

### Worker no CasaOS

O [workflow do worker](.github/workflows/worker-image.yml) compila e publica `ghcr.io/diegoukan/atendimento-despachante-worker:latest` para `linux/amd64` e `linux/arm64`. Ele roda quando o worker ou suas dependências mudam na `main` e pode ser disparado manualmente em **Actions**. Cada build também recebe a tag `sha-<commit>`.

Use [docker-compose.casaos.yml](apps/worker/docker-compose.casaos.yml). Em uma cópia local, substitua `COLE_A_CHAVE_SECRETA_AQUI` pela chave `sb_secret_…` ou `service_role` do Supabase. Guarde essa cópia no servidor, fora do Git.

- **Imagem pública:** no CasaOS, abra **Instalar um aplicativo personalizado → Importar**, cole o YAML preenchido e instale.
- **Imagem privada:** o primeiro pacote no GHCR nasce privado. No terminal do CasaOS, autentique-se com `sudo docker login ghcr.io -u DiegoUkan` e use um token clássico do GitHub com `read:packages` como senha. Na pasta da cópia preenchida, rode `sudo docker compose -f docker-compose.casaos.yml up -d --pull always`.

O Compose do CasaOS mantém a porta de saúde dentro do contêiner. Confira com `sudo docker exec atendimento-despachante-worker wget -qO- http://127.0.0.1:8787/health`.

### Worker compilado localmente

```bash
cd apps/worker
cp .env.example .env    # preencha a SUPABASE_SERVICE_ROLE_KEY
docker compose up -d --build
curl http://localhost:8787/health
```
O worker não precisa de porta pública enquanto não houver Evolution API: ele só **consulta** o Supabase. Se ele cair, o painel mostra "⚠️ O worker parece parado".

## Como a IA decide (o modelo híbrido)

Cada caso tem três camadas:

1. **Fase** (estruturada): define o que a IA pode fazer, se ela **pode avançar sozinha**, se **exige checklist** completo e se o cliente **é avisado** ao entrar na fase (automático, com aprovação ou não avisa).
2. **Dados e documentos** (estruturados e validados): placa, Renavam, CPF… Cada um tem status (pendente, recebido, validado, recusado).
3. **Notas em markdown** (nuances): *Notas da equipe* são escritas só por humanos. *Notas da IA* são mantidas pela própria IA.

A IA lê um resumo montado pelo **código** a partir dessas camadas, então não depende de "entender" um .md. Tudo o que ela grava passa por **ferramentas** com regras:
- não avança fase sem checklist;
- só cita preços da tabela;
- só envia o PIX depois do aceite do orçamento;
- vínculo de telefone não verificado = nada de dados do caso para esse número.

**Modo efetivo** (do mais específico para o mais geral): conversa › fase › serviço › número › padrão da empresa.
- *Automático*: a IA envia sozinha, a menos que a confiança fique abaixo do mínimo; aí a resposta vira rascunho.
- *Copiloto*: a IA escreve um rascunho e alguém aprova.
- *Manual*: a IA não responde.

**Agrupamento:** o cliente manda várias mensagens seguidas; o worker espera alguns segundos de silêncio e responde tudo junto. Se chegar mensagem nova enquanto a IA pensa, a resposta é descartada e refeita.

## Fila de tarefas (sem Redis)

A tabela `jobs` e as funções `enqueue_job_internal` / `claim_jobs` (com `FOR UPDATE SKIP LOCKED`) cuidam de:
- agrupamento de mensagens (`dedupe_key` + `run_at`);
- uma conversa processada por vez;
- novas tentativas com espera crescente;
- recuperação de tarefas de um worker que caiu.

Gatilhos do banco criam as tarefas sozinhos: mensagem nova, rascunho aprovado, mudança de fase, mensagem no "Ensinar".

## Banco de dados

- As migrations estão em `supabase/migrations`. Já foram aplicadas no projeto `atendimento-despachante` (ref `izlctgakeabmrlkfoenm`).
- **Projeto novo:** rode os arquivos em ordem no SQL Editor, ou use `supabase db push`. Depois regenere `packages/shared/src/database.types.ts`.
- **Mudar de conta/organização:** o Supabase faz *Project Transfer* em *Settings → General*. A URL e as chaves continuam as mesmas. Requisitos:
  - ser dono da organização de origem e membro da de destino;
  - sem integração com GitHub e sem log drains;
  - se o destino for o plano grátis, ele precisa ter vaga.

## Segurança

- **RLS em todas as tabelas.** Só membros **ativos** da equipe leem e escrevem. Configurações, IA, conexões e equipe só podem ser alteradas pelo **dono**.
- **Contas novas fora do painel** ficam bloqueadas até o dono ativar.
- **Chaves de IA** ficam no Supabase Vault. Só o worker (service role) consegue ler.
- **Avisos restantes do Security Advisor** são funções chamáveis de propósito, e todas checam permissão por dentro:
  - `is_staff`/`is_owner` são usadas pelas regras de RLS;
  - `needs_setup` só diz se já existe dono;
  - `enqueue_job`, `run_job_now`, `restore_version` e `set_provider_key` validam equipe/dono e os tipos de tarefa permitidos.

## Integração com a Evolution API (próximo passo)

A interface já está pronta:
- `apps/worker/src/channels/index.ts`: implementar `send` do adaptador `evolution`.
- `apps/worker/src/channels/ingest.ts`: `ingestInbound()` já identifica o cliente pelo telefone (com e sem o 9º dígito), cria contato e conversa e guarda a mídia.
- `apps/worker/src/index.ts`: rota `/webhooks/evolution` (hoje responde 501) para converter o evento e chamar `ingestInbound()`.
- Painel → Conexões: habilitar o tipo "Evolution API" (URL, chave, instância, QR Code).
