/**
 * Telefones brasileiros → formato canônico "55DDNNNNNNNNN" (sem "+").
 *
 * O WhatsApp às vezes entrega celulares antigos SEM o 9º dígito
 * (ex.: 554188887777 em vez de 5541988887777). Sempre normalizamos
 * para a versão COM o 9 e usamos `phoneVariants` para procurar as duas.
 */

const onlyDigits = (s: string) => (s ?? "").replace(/\D+/g, "");

export function normalizePhone(raw: string | null | undefined, defaultDdd = "41"): string | null {
  let d = onlyDigits(String(raw ?? "").split("@")[0]); // aceita JIDs "5541...@s.whatsapp.net"
  if (!d) return null;

  // remove prefixos de operadora / zero (ex.: 0 41 99999-8888, 0xx41...)
  d = d.replace(/^0+/, "");

  // número internacional que não é do Brasil: mantém como veio
  if (d.length > 13 || (d.length >= 11 && !d.startsWith("55") && d.length !== 11)) {
    return d;
  }

  if (!d.startsWith("55") || d.length <= 11) {
    // sem DDI
    if (d.length === 8 || d.length === 9) d = defaultDdd + d; // sem DDD
    if (d.length === 10 || d.length === 11) d = "55" + d;
  }

  if (!d.startsWith("55")) return d;

  const ddd = d.slice(2, 4);
  let num = d.slice(4);

  // celular sem o 9º dígito (8 dígitos começando com 6-9) → adiciona o 9
  if (num.length === 8 && /^[6-9]/.test(num)) num = "9" + num;

  if (num.length !== 8 && num.length !== 9) return d;
  return `55${ddd}${num}`;
}

/** Variações para busca: com e sem o 9º dígito. */
export function phoneVariants(canonical: string): string[] {
  const out = new Set<string>([canonical]);
  if (/^55\d{2}9\d{8}$/.test(canonical)) out.add(canonical.slice(0, 4) + canonical.slice(5));
  if (/^55\d{2}[6-9]\d{7}$/.test(canonical)) out.add(canonical.slice(0, 4) + "9" + canonical.slice(4));
  return [...out];
}

/** "5541999998888" → "(41) 99999-8888" */
export function formatPhone(canonical: string | null | undefined): string {
  const d = onlyDigits(canonical ?? "");
  if (/^55\d{10,11}$/.test(d)) {
    const ddd = d.slice(2, 4);
    const n = d.slice(4);
    return n.length === 9
      ? `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}`
      : `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
  }
  return canonical ?? "";
}
