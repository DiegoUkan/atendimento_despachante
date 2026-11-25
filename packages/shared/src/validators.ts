/**
 * Validadores dos campos estruturados dos casos.
 * A IA preenche campos por ferramenta e recebe o erro de volta para
 * perguntar de novo ao cliente — o .md nunca é a fonte desses dados.
 */

export type FieldType =
  | "text" | "cpf" | "cnpj" | "cpf_cnpj" | "plate" | "renavam" | "chassis" | "date"
  | "phone" | "email" | "money" | "number" | "select" | "boolean";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto",
  cpf: "CPF",
  cnpj: "CNPJ",
  cpf_cnpj: "CPF ou CNPJ",
  plate: "Placa",
  renavam: "Renavam",
  chassis: "Chassi",
  date: "Data",
  phone: "Telefone",
  email: "E-mail",
  money: "Valor (R$)",
  number: "Número",
  select: "Lista de opções",
  boolean: "Sim/Não",
};

const digits = (s: string) => (s ?? "").replace(/\D+/g, "");

export function isValidCPF(value: string): boolean {
  const c = digits(value);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export function isValidCNPJ(value: string): boolean {
  const c = digits(value);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

/** "abc-1d23" → "ABC1D23" */
export function normalizePlate(value: string): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23) */
export function isValidPlate(value: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(value));
}

/** "ABC1D23" → "ABC-1D23" (só exibição) */
export function formatPlate(value: string | null | undefined): string {
  const p = normalizePlate(value ?? "");
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

export function isValidRenavam(value: string): boolean {
  let r = digits(value);
  if (r.length === 9 || r.length === 10) r = r.padStart(11, "0"); // renavams antigos
  if (r.length !== 11) return false;
  const base = r.slice(0, 10).split("").reverse().map(Number);
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const sum = base.reduce((acc, n, i) => acc + n * weights[i], 0);
  let dv = 11 - (sum % 11);
  if (dv >= 10) dv = 0;
  return dv === Number(r[10]);
}

export function isValidChassis(value: string): boolean {
  const c = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(c);
}

/** aceita dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd → "aaaa-mm-dd" */
export function parseDateBR(value: string): string | null {
  const s = (value ?? "").trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
    if (y < 100) y += y > 50 ? 1900 : 2000;
  } else if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseMoneyBR(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = (value ?? "").replace(/[R$\s]/gi, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "a confirmar";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatCpfCnpj(value: string | null | undefined): string {
  const d = digits(value ?? "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value ?? "";
}

export type FieldValidation = { ok: true; value: string } | { ok: false; error: string };

export function validateField(
  type: FieldType | string,
  raw: unknown,
  options: string[] = [],
): FieldValidation {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "Valor vazio." };
  switch (type) {
    case "cpf":
      return isValidCPF(value) ? { ok: true, value: digits(value) } : { ok: false, error: "CPF inválido (confira os dígitos)." };
    case "cnpj":
      return isValidCNPJ(value) ? { ok: true, value: digits(value) } : { ok: false, error: "CNPJ inválido (confira os dígitos)." };
    case "cpf_cnpj": {
      const d = digits(value);
      if (d.length === 11) return isValidCPF(d) ? { ok: true, value: d } : { ok: false, error: "CPF inválido (confira os dígitos)." };
      if (d.length === 14) return isValidCNPJ(d) ? { ok: true, value: d } : { ok: false, error: "CNPJ inválido (confira os dígitos)." };
      return { ok: false, error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." };
    }
    case "plate":
      return isValidPlate(value)
        ? { ok: true, value: normalizePlate(value) }
        : { ok: false, error: "Placa inválida. Formatos aceitos: ABC1234 ou ABC1D23." };
    case "renavam":
      return isValidRenavam(value)
        ? { ok: true, value: digits(value).padStart(11, "0") }
        : { ok: false, error: "Renavam inválido (11 dígitos, confira o número no documento)." };
    case "chassis":
      return isValidChassis(value)
        ? { ok: true, value: value.toUpperCase().replace(/[^A-Z0-9]/g, "") }
        : { ok: false, error: "Chassi inválido (17 caracteres, sem I, O ou Q)." };
    case "date": {
      const d = parseDateBR(value);
      return d ? { ok: true, value: d } : { ok: false, error: "Data inválida. Use dd/mm/aaaa." };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? { ok: true, value: value.toLowerCase() }
        : { ok: false, error: "E-mail inválido." };
    case "phone": {
      const d = digits(value);
      return d.length >= 10 ? { ok: true, value: d } : { ok: false, error: "Telefone inválido (inclua o DDD)." };
    }
    case "money": {
      const n = parseMoneyBR(value);
      return n !== null ? { ok: true, value: n.toFixed(2) } : { ok: false, error: "Valor inválido." };
    }
    case "number":
      return Number.isFinite(Number(value.replace(",", ".")))
        ? { ok: true, value: value.replace(",", ".") }
        : { ok: false, error: "Número inválido." };
    case "boolean": {
      const v = value.toLowerCase();
      if (["sim", "s", "true", "yes", "1"].includes(v)) return { ok: true, value: "sim" };
      if (["não", "nao", "n", "false", "no", "0"].includes(v)) return { ok: true, value: "não" };
      return { ok: false, error: "Responda sim ou não." };
    }
    case "select": {
      if (!options.length) return { ok: true, value };
      const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
      const found = options.find((o) => norm(o) === norm(value)) ?? options.find((o) => norm(o).includes(norm(value)));
      return found ? { ok: true, value: found } : { ok: false, error: `Escolha uma opção: ${options.join(", ")}.` };
    }
    default:
      return { ok: true, value };
  }
}

/** Exibição amigável de um valor já normalizado */
export function displayFieldValue(type: string, value: string | null | undefined): string {
  if (!value) return "—";
  switch (type) {
    case "cpf":
    case "cnpj":
    case "cpf_cnpj":
      return formatCpfCnpj(value);
    case "plate":
      return formatPlate(value);
    case "date": {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
    }
    case "money":
      return formatMoney(Number(value));
    default:
      return value;
  }
}
