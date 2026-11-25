function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`\n❌ Variável de ambiente ${name} não definida. Veja apps/worker/.env.example\n`);
    process.exit(1);
  }
  return v;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  port: Number(process.env.PORT ?? 8787),
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  pollMs: Number(process.env.WORKER_POLL_MS ?? 1200),
  /** segredo opcional para webhooks (Evolution, futuramente) */
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
};
