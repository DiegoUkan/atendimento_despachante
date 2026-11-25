"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createOwner } from "@/app/actions/team";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, Input } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase()
      .rpc("needs_setup")
      .then(({ data }) => {
        if (data === false) router.replace("/login");
      });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await createOwner({ name, email, password });
    if (!res.ok) {
      setLoading(false);
      toast.error(res.error);
      return;
    }
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada! Vamos configurar a assistente.");
    router.replace("/");
    router.refresh();
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h1 className="text-2xl font-black">Primeiro acesso</h1>
          <p className="text-sm text-ink-2">Crie a conta do dono. Depois você cadastra a equipe em Configurações.</p>
        </div>
        <Field label="Seu nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Criar conta do dono
        </Button>
      </form>
    </AuthShell>
  );
}
