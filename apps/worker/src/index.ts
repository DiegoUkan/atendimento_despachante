/**
 * Worker do atendimento — roda em Docker no seu servidor.
 *  • consome a fila (tabela jobs) no Postgres do Supabase
 *  • executa IA, envios, avisos de fase, ensino e cenários
 *  • expõe /health (e, no futuro, o webhook da Evolution API)
 */
import http from "node:http";
import { env } from "./env";
import { db, log } from "./db";
import { cleanupOldJobs, handlers, NonRetryableError, type Job } from "./handlers";

let running = 0;
let stopping = false;
let processed = 0;
let lastError: string | null = null;
const startedAt = new Date();

async function runJob(job: Job) {
  const handler = handlers[job.type];
  const t0 = Date.now();
  try {
    if (!handler) throw new NonRetryableError(`Tipo de tarefa desconhecido: ${job.type}`);
    const result = await handler(job);
    await db.rpc("complete_job", { p_id: job.id, p_result: (result ?? null) as never });
    log.info(`✔ ${job.type} #${job.id} (${Date.now() - t0}ms)`);
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    lastError = `${job.type}: ${message}`;
    if (e instanceof NonRetryableError) {
      await db.rpc("complete_job", { p_id: job.id, p_result: { error: message } as never });
      log.warn(`■ ${job.type} #${job.id}: ${message}`);
    } else {
      await db.rpc("fail_job", { p_id: job.id, p_error: message.slice(0, 2000), p_retry_in_seconds: 15 });
      log.error(`✖ ${job.type} #${job.id} (tentativa ${job.attempts}/${job.max_attempts}): ${message}`);
    }
  } finally {
    running--;
    processed++;
  }
}

async function loop() {
  while (!stopping) {
    const free = env.concurrency - running;
    let claimed = 0;
    if (free > 0) {
      const { data, error } = await db.rpc("claim_jobs", { p_worker: env.workerId, p_limit: free, p_lock_seconds: 300 });
      if (error) {
        log.error("Falha ao buscar tarefas:", error.message);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      for (const job of (data ?? []) as Job[]) {
        running++;
        claimed++;
        void runJob(job);
      }
    }
    await new Promise((r) => setTimeout(r, claimed > 0 ? 200 : env.pollMs));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, worker: env.workerId, running, processed, lastError, startedAt }));
    return;
  }
  if (url.pathname.startsWith("/webhooks/evolution")) {
    // TODO(Evolution): validar env.webhookSecret, converter o evento e chamar ingestInbound()
    res.writeHead(501, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Integração com a Evolution API ainda não ativada." }));
    return;
  }
  res.writeHead(404).end();
});

async function main() {
  log.info(`🚀 Worker ${env.workerId} iniciando (concorrência ${env.concurrency})`);
  const { error } = await db.from("settings").select("id").eq("id", 1).single();
  if (error) {
    log.error("Não consegui acessar o Supabase. Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.", error.message);
    process.exit(1);
  }
  server.listen(env.port, () => log.info(`🩺 /health em http://localhost:${env.port}/health`));
  setInterval(() => void cleanupOldJobs(), 60 * 60 * 1000);
  void cleanupOldJobs();
  await loop();
}

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info(`${signal} recebido — aguardando ${running} tarefa(s) em andamento…`);
  server.close();
  const started = Date.now();
  const timer = setInterval(() => {
    if (running === 0 || Date.now() - started > 25_000) {
      clearInterval(timer);
      process.exit(0);
    }
  }, 250);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

void main();
