"use client";

import type { Row } from "@despachante/shared";
import { supabase } from "./supabase/client";

type Proposal = Row<"knowledge_proposals">;

const uniqueKey = async (table: "service_fields" | "service_documents", serviceId: string, key: string) => {
  const { data } = await supabase().from(table).select("key").eq("service_id", serviceId);
  const keys = new Set((data ?? []).map((r) => r.key));
  let k = key;
  let i = 2;
  while (keys.has(k)) k = `${key}_${i++}`;
  return k;
};

/** Aplica uma proposta do Instrutor (com a sessão do usuário; o RLS decide se pode). */
export async function applyProposal(p: Proposal, fromCorrection: boolean): Promise<string | null> {
  const sb = supabase();
  const after = (p.after ?? {}) as Record<string, unknown>;
  let error: { message: string } | null = null;

  switch (p.action) {
    case "doc.create":
      ({ error } = await sb.from("knowledge_docs").insert({ ...(after as Partial<Row<"knowledge_docs">>), title: String(after.title), source: fromCorrection ? "correcao" : "ensinar" }));
      break;
    case "doc.update":
      ({ error } = await sb.from("knowledge_docs").update({ title: after.title as string, content_md: after.content_md as string }).eq("id", p.target_id!));
      break;
    case "service.update":
      ({ error } = await sb.from("services").update(after as Partial<Row<"services">>).eq("id", p.target_id!));
      break;
    case "stage.update":
      ({ error } = await sb.from("service_stages").update(after as Partial<Row<"service_stages">>).eq("id", p.target_id!));
      break;
    case "document.create": {
      const serviceId = String(after.service_id);
      const key = await uniqueKey("service_documents", serviceId, String(after.key));
      const { count } = await sb.from("service_documents").select("id", { count: "exact", head: true }).eq("service_id", serviceId);
      ({ error } = await sb.from("service_documents").insert({ ...(after as Partial<Row<"service_documents">>), service_id: serviceId, key, label: String(after.label), sort_order: (count ?? 0) + 1 }));
      break;
    }
    case "field.create": {
      const serviceId = String(after.service_id);
      const key = await uniqueKey("service_fields", serviceId, String(after.key));
      const { count } = await sb.from("service_fields").select("id", { count: "exact", head: true }).eq("service_id", serviceId);
      ({ error } = await sb.from("service_fields").insert({ ...(after as Partial<Row<"service_fields">>), service_id: serviceId, key, label: String(after.label), sort_order: (count ?? 0) + 1 }));
      break;
    }
    case "document.update":
      ({ error } = await sb.from("service_documents").update(after as Partial<Row<"service_documents">>).eq("id", p.target_id!));
      break;
    case "field.update":
      ({ error } = await sb.from("service_fields").update(after as Partial<Row<"service_fields">>).eq("id", p.target_id!));
      break;
    case "price.update":
      ({ error } = await sb.from("service_prices").update(after as Partial<Row<"service_prices">>).eq("id", p.target_id!));
      break;
    case "price.create":
      ({ error } = await sb.from("service_prices").insert({ ...(after as Partial<Row<"service_prices">>), service_id: String(after.service_id), label: String(after.label) }));
      break;
    case "settings.update":
      ({ error } = await sb.from("settings").update(after as Partial<Row<"settings">>).eq("id", 1));
      break;
    default:
      return `Ação desconhecida: ${p.action}`;
  }

  const { data: user } = await sb.auth.getUser();
  if (error) {
    await sb.from("knowledge_proposals").update({ status: "erro", error: error.message }).eq("id", p.id);
    return error.message.includes("row-level security") ? "Sem permissão (algumas alterações são só para o dono)." : error.message;
  }
  await sb.from("knowledge_proposals").update({ status: "aplicada", decided_by: user.user?.id, decided_at: new Date().toISOString() }).eq("id", p.id);
  return null;
}

export async function rejectProposal(p: Proposal) {
  const { data: user } = await supabase().auth.getUser();
  await supabase().from("knowledge_proposals").update({ status: "recusada", decided_by: user.user?.id, decided_at: new Date().toISOString() }).eq("id", p.id);
}
