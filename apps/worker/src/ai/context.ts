/**
 * Carrega TUDO que a IA precisa saber sobre uma conversa — a partir de dados
 * estruturados (fase, checklist, campos) e das notas .md. A fase e o checklist
 * vêm do banco; a IA não precisa "adivinhar" lendo texto livre.
 */
import { businessStatus, type BusinessHours, type Holiday, type OpenStatus } from "@despachante/shared";
import { db, getSettings, must, type Row } from "../db";

export type ServiceFull = {
  service: Row<"services">;
  stages: Row<"service_stages">[];
  fields: Row<"service_fields">[];
  documents: Row<"service_documents">[];
  prices: Row<"service_prices">[];
  docs: Row<"knowledge_docs">[];
};

export type CaseFull = Row<"cases"> & {
  service: Row<"services">;
  stage: Row<"service_stages">;
  vehicle: Row<"vehicles"> | null;
  documents: Row<"case_documents">[];
  client: Row<"clients"> | null;
};

export type ClientLink = {
  client: Row<"clients">;
  relation: string;
  verified: boolean;
  is_primary: boolean;
};

export type ConversationContext = {
  settings: Row<"settings">;
  conversation: Row<"conversations">;
  contact: Row<"contacts">;
  channel: Row<"channels"> | null;
  links: ClientLink[];
  cases: CaseFull[];
  activeCase: CaseFull | null;
  activeService: ServiceFull | null;
  catalog: Row<"services">[];
  globalDocs: Row<"knowledge_docs">[];
  status: OpenStatus;
};

export async function loadServiceFull(serviceId: string): Promise<ServiceFull> {
  const [service, stages, fields, documents, prices, docs] = await Promise.all([
    db.from("services").select("*").eq("id", serviceId).single(),
    db.from("service_stages").select("*").eq("service_id", serviceId).order("sort_order"),
    db.from("service_fields").select("*").eq("service_id", serviceId).order("sort_order"),
    db.from("service_documents").select("*").eq("service_id", serviceId).order("sort_order"),
    db.from("service_prices").select("*").eq("service_id", serviceId).eq("active", true).order("sort_order"),
    db.from("knowledge_docs").select("*").eq("service_id", serviceId).eq("active", true).order("created_at"),
  ]);
  return {
    service: must(service, "serviço"),
    stages: stages.data ?? [],
    fields: fields.data ?? [],
    documents: documents.data ?? [],
    prices: prices.data ?? [],
    docs: docs.data ?? [],
  };
}

export async function findServiceBySlug(slugOrName: string): Promise<Row<"services"> | null> {
  const q = slugOrName.trim().toLowerCase();
  const { data } = await db.from("services").select("*").eq("active", true);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return (
    data?.find((s) => s.slug === q) ??
    data?.find((s) => norm(s.name) === norm(q)) ??
    data?.find((s) => norm(s.name).includes(norm(q)) || norm(q).includes(s.slug)) ??
    null
  );
}

export async function loadCases(where: { contactId: string; clientIds: string[] }): Promise<CaseFull[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const filters = [`contact_id.eq.${where.contactId}`];
  if (where.clientIds.length) filters.push(`client_id.in.(${where.clientIds.join(",")})`);
  const { data, error } = await db
    .from("cases")
    .select("*, service:services(*), stage:service_stages(*), vehicle:vehicles(*), documents:case_documents(*), client:clients(*)")
    .or(filters.join(","))
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`casos: ${error.message}`);
  // abertos + encerrados nos últimos 30 dias
  return ((data ?? []) as unknown as CaseFull[])
    .filter((c) => !c.closed_at || c.closed_at >= since)
    .slice(0, 15);
}

export async function loadContext(conversationId: string): Promise<ConversationContext> {
  const settings = await getSettings();
  const conversation = must(await db.from("conversations").select("*").eq("id", conversationId).single(), "conversa");
  const contact = must(await db.from("contacts").select("*").eq("id", conversation.contact_id).single(), "contato");

  const [channelRes, linksRes, catalogRes, globalDocsRes] = await Promise.all([
    conversation.last_channel_id
      ? db.from("channels").select("*").eq("id", conversation.last_channel_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("contact_clients").select("relation, verified, is_primary, client:clients(*)").eq("contact_id", contact.id),
    db.from("services").select("*").eq("active", true).order("sort_order"),
    db.from("knowledge_docs").select("*").eq("scope", "global").eq("active", true).eq("always_include", true).order("created_at"),
  ]);

  const links: ClientLink[] = ((linksRes.data ?? []) as unknown as Array<{
    relation: string; verified: boolean; is_primary: boolean; client: Row<"clients">;
  }>)
    .filter((l) => l.client)
    .map((l) => ({ client: l.client, relation: l.relation, verified: l.verified, is_primary: l.is_primary }));

  const verifiedClientIds = links.filter((l) => l.verified).map((l) => l.client.id);
  const cases = await loadCases({ contactId: contact.id, clientIds: verifiedClientIds });

  let activeCase = cases.find((c) => c.id === conversation.active_case_id) ?? null;
  if (!activeCase) {
    const open = cases.filter((c) => !c.closed_at);
    if (open.length === 1) activeCase = open[0];
  }
  const activeService = activeCase ? await loadServiceFull(activeCase.service_id) : null;

  const status = businessStatus(
    new Date(),
    settings.business_hours as BusinessHours,
    (settings.holidays as Holiday[]) ?? [],
    settings.timezone,
  );

  return {
    settings,
    conversation,
    contact,
    channel: (channelRes.data as Row<"channels"> | null) ?? null,
    links,
    cases,
    activeCase,
    activeService,
    catalog: catalogRes.data ?? [],
    globalDocs: globalDocsRes.data ?? [],
    status,
  };
}
