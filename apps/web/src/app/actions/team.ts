"use server";

import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false, error: string };

async function requireOwner(): Promise<string> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada. Entre novamente.");
  const { data: profile } = await sb.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile?.active || profile.role !== "owner") throw new Error("Apenas o dono pode gerenciar a equipe.");
  return data.user.id;
}

/** Primeiro acesso: cria a conta do dono (só funciona enquanto não existe ninguém). */
export async function createOwner(input: { name: string; email: string; password: string }): Promise<Result> {
  try {
    const admin = supabaseAdmin();
    const { data: needs } = await admin.rpc("needs_setup");
    if (!needs) return { ok: false, error: "O sistema já foi configurado. Faça login." };
    if (input.password.length < 8) return { ok: false, error: "A senha precisa ter pelo menos 8 caracteres." };
    const { error } = await admin.auth.admin.createUser({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.name.trim() },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function createTeamMember(input: { name: string; email: string; password: string; role: "owner" | "analyst" }): Promise<Result> {
  try {
    await requireOwner();
    if (input.password.length < 8) return { ok: false, error: "A senha precisa ter pelo menos 8 caracteres." };
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.name.trim() },
      app_metadata: { role: input.role, invited: true },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function resetMemberPassword(userId: string, password: string): Promise<Result> {
  try {
    await requireOwner();
    if (password.length < 8) return { ok: false, error: "A senha precisa ter pelo menos 8 caracteres." };
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
