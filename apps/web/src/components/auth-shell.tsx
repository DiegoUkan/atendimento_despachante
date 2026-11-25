import { BookOpenCheck, Inbox, ScanSearch, SquareKanban } from "lucide-react";
import { Card } from "./ui";

const FEATURES = [
  { icon: Inbox, text: "Todos os números de WhatsApp numa caixa de entrada única" },
  { icon: ScanSearch, text: "Cada decisão da IA explicada (Raio-X)" },
  { icon: SquareKanban, text: "Casos com fases, checklist de documentos e notas" },
  { icon: BookOpenCheck, text: "A equipe ensina a IA conversando" },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-nav p-12 text-nav-ink lg:flex">
        <div className="text-sm font-semibold text-white">Atendimento · Despachante</div>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Atendimento de WhatsApp com IA, organizado por cliente e por processo.
          </h2>
          <ul className="space-y-3 text-sm">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="size-4 text-[#94a3b8]" strokeWidth={1.75} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-[#64748b]">Campo Largo · PR</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-7">{children}</Card>
      </div>
    </div>
  );
}
