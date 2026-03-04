// Validação local de Inscrição Estadual por UF (27 unidades)
// Regras baseadas em algoritmos oficiais/SEFAZ. Aceita "ISENTO" (case-insensitive).

type ValidatorFn = (ie: string) => boolean;

const onlyDigits = (v: string) => (v || '').replace(/\D+/g, '');

const mod11 = (weights: number[], digits: string) => {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += parseInt(digits.charAt(i), 10) * weights[i];
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
};

// --- Validadores por UF ---
const validators: Record<string, ValidatorFn> = {
  AC: (ie) => {
    if (!/^01\d{11}$/.test(ie)) return false;
    const d = ie;
    const p1 = mod11([4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], d.slice(0, 11));
    if (p1 !== parseInt(d.charAt(11), 10)) return false;
    const p2 = mod11([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], d.slice(0, 12));
    return p2 === parseInt(d.charAt(12), 10);
  },
  AL: (ie) => /^24\d{7}$/.test(ie) && '02481357'.includes(ie.charAt(2)),
  AP: (ie) => {
    if (!/^03\d{7}$/.test(ie)) return false;
    const p = parseInt(ie, 10);
    let b = 0;
    let c = 0;
    if (p >= 3000001 && p <= 3017000) {
      b = 5;
      c = 0;
    } else if (p >= 3017001 && p <= 3019022) {
      b = 9;
      c = 1;
    } else if (p >= 3019023 && p <= 3019999) {
      b = 0;
      c = 0;
    } else {
      return false;
    }
    const weights = [9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 8; i += 1) {
      sum += parseInt(ie.charAt(i), 10) * weights[i];
    }
    sum += b;
    let dv = 11 - (sum % 11);
    if (dv === 10) dv = 0;
    if (dv === 11) dv = c;
    return dv === parseInt(ie.charAt(8), 10);
  },
  AM: (ie) => {
    if (!/^\d{9}$/.test(ie)) return false;
    const weights = [9, 8, 7, 6, 5, 4, 3, 2];
    const dv = mod11(weights, ie);
    return dv === parseInt(ie.charAt(8), 10);
  },
  BA: (ie) => {
    if (!/^\d{8,9}$/.test(ie)) return false;
    const is9 = ie.length === 9;
    const body = ie.slice(0, ie.length - 2);
    const dv1Pos = ie.length - 2;
    const dv2Pos = ie.length - 1;
    const calc = (m: number, pos: number) => {
      const weights = is9 ? [8, 7, 6, 5, 4, 3, 2] : [7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < weights.length; i += 1) {
        sum += parseInt(ie.charAt(i), 10) * weights[i];
      }
      const r = sum % 10;
      const dv = m === 10 ? (r === 0 ? 0 : 10 - r) : (r <= 1 ? 0 : 11 - r);
      return dv === parseInt(ie.charAt(pos), 10);
    };
    return calc(10, dv1Pos) && calc(11, dv2Pos);
  },
  CE: (ie) => {
    if (!/^\d{9}$/.test(ie)) return false;
    const dv = mod11([9, 8, 7, 6, 5, 4, 3, 2], ie);
    return dv === parseInt(ie.charAt(8), 10);
  },
  DF: (ie) => {
    if (!/^07\d{11}$/.test(ie)) return false;
    const p1 = mod11([4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], ie.slice(0, 11));
    if (p1 !== parseInt(ie.charAt(11), 10)) return false;
    const p2 = mod11([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], ie.slice(0, 12));
    return p2 === parseInt(ie.charAt(12), 10);
  },
  ES: (ie) => {
    if (!/^\d{9}$/.test(ie)) return false;
    const dv = mod11([9, 8, 7, 6, 5, 4, 3, 2], ie);
    return dv === parseInt(ie.charAt(8), 10);
  },
  GO: (ie) => {
    if (!/^(10|11|15)\d{7}$/.test(ie)) return false;
    const n = parseInt(ie.slice(0, 8), 10);
    const dvCalc = () => {
      const dv = mod11([9, 8, 7, 6, 5, 4, 3, 2], ie);
      if (dv === 10) {
        if (n >= 10103105 && n <= 10119997) return 1;
        return 0;
      }
      return dv;
    };
    return dvCalc() === parseInt(ie.charAt(8), 10);
  },
  MA: (ie) => /^12\d{8}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  MT: (ie) => {
    if (!/^\d{11}$/.test(ie)) return false;
    const dv = mod11([3, 2, 9, 8, 7, 6, 5, 4, 3, 2], ie);
    return dv === parseInt(ie.charAt(10), 10);
  },
  MS: (ie) => /^28\d{7}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  MG: (ie) => {
    if (!/^\d{13}$/.test(ie)) return false;
    const body = ie.slice(0, 11);
    const add = body
      .split('')
      .map((n, i) => parseInt(n, 10) * (i % 2 === 0 ? 1 : 2))
      .map((n) => n.toString())
      .join('');
    const sum1 = add.split('').reduce((acc, n) => acc + parseInt(n, 10), 0);
    const dv1 = (Math.floor(sum1 / 10) + 1) * 10 - sum1;
    const weights = [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const dv2 = mod11(weights, ie.slice(0, 12));
    return dv1 === parseInt(ie.charAt(11), 10) && dv2 === parseInt(ie.charAt(12), 10);
  },
  PA: (ie) => /^15\d{7}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  PB: (ie) => /^\d{9}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  PE: (ie) => {
    if (!/^\d{9,14}$/.test(ie)) return false;
    const digits = ie.slice(0, ie.length - 1);
    let sum = 0;
    const weights = [8, 7, 6, 5, 4, 3, 2, 1];
    const start = weights.length - digits.length;
    for (let i = 0; i < digits.length; i += 1) {
      sum += parseInt(digits.charAt(i), 10) * weights[start + i];
    }
    const dv = 11 - (sum % 11);
    return (dv === 10 ? 0 : dv === 11 ? 0 : dv) === parseInt(ie.charAt(ie.length - 1), 10);
  },
  PI: (ie) => /^\d{9}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  PR: (ie) => {
    if (!/^\d{10}$/.test(ie)) return false;
    const dv1 = mod11([3, 2, 7, 6, 5, 4, 3, 2], ie.slice(0, 8));
    if (dv1 !== parseInt(ie.charAt(8), 10)) return false;
    const dv2 = mod11([4, 3, 2, 7, 6, 5, 4, 3, 2], ie.slice(0, 9));
    return dv2 === parseInt(ie.charAt(9), 10);
  },
  RJ: (ie) => /^\d{8}$/.test(ie) && mod11([2, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(7), 10),
  RN: (ie) => {
    if (!/^20\d{7,8}$/.test(ie)) return false;
    const digits = ie.length === 9 ? ie : ie.slice(0, 8);
    const weights = [9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
      sum += parseInt(digits.charAt(i), 10) * weights[i];
    }
    const dv = (sum * 10) % 11 % 10;
    return dv === parseInt(ie.charAt(ie.length - 1), 10);
  },
  RO: (ie) => {
    if (/^\d{14}$/.test(ie)) {
      const dv = mod11([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], ie);
      return dv === parseInt(ie.charAt(13), 10);
    }
    if (!/^\d{9}$/.test(ie)) return false;
    const dv = mod11([6, 5, 4, 3, 2, 9, 8, 7], ie);
    return dv === parseInt(ie.charAt(8), 10);
  },
  RR: (ie) => /^24\d{7}$/.test(ie) && (ie.split('').reduce((s, n) => s + parseInt(n, 10), 0) % 9) === parseInt(ie.charAt(8), 10),
  RS: (ie) => {
    if (!/^\d{10}$/.test(ie)) return false;
    const dv = 11 - ((parseInt(ie.slice(0, 9), 10) % 11) % 11);
    return (dv === 10 ? 0 : dv) === parseInt(ie.charAt(9), 10);
  },
  SC: (ie) => /^\d{9}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  SE: (ie) => /^\d{9}$/.test(ie) && mod11([9, 8, 7, 6, 5, 4, 3, 2], ie) === parseInt(ie.charAt(8), 10),
  SP: (ie) => {
    if (!/^\d{12}$/.test(ie)) return false;
    const body = ie.slice(0, 8);
    const weights1 = [1, 3, 4, 5, 6, 7, 8, 10];
    let sum = 0;
    for (let i = 0; i < 8; i += 1) {
      sum += parseInt(body.charAt(i), 10) * weights1[i];
    }
    let dv1 = sum % 11;
    dv1 = dv1 === 10 ? 0 : dv1;
    if (dv1 !== parseInt(ie.charAt(8), 10)) return false;

    const body2 = ie.slice(0, 11);
    const weights2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const dv2 = mod11(weights2, body2);
    return dv2 === parseInt(ie.charAt(11), 10);
  },
  TO: (ie) => {
    if (!/^\d{11}$/.test(ie)) return false;
    const body = ie.slice(0, 2) + ie.slice(4, 10);
    const weights = [9, 8, 7, 6, 5, 4, 3, 2];
    const dv = mod11(weights, body + ie.charAt(10));
    return dv === parseInt(ie.charAt(10), 10);
  }
};

export function isValidIE(raw: string, uf: string, isExempt = false): boolean {
  if (isExempt) return true;
  if (!raw) return false;
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === 'ISENTO') return true;
  const digits = onlyDigits(trimmed);
  const key = (uf || '').toUpperCase();
  const fn = validators[key];
  if (!fn) return false;
  return fn(digits);
}

export function formatIE(raw: string, uf: string): string {
  const digits = onlyDigits(raw);
  const key = (uf || '').toUpperCase();
  switch (key) {
    case 'SP':
      if (/^P\d{8}$/.test(raw.toUpperCase())) return `P${digits.slice(1, 9)}-${digits.slice(9, 10)}`;
      if (digits.length === 12) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}.${digits.slice(9, 12)}`;
      break;
    case 'MG':
      if (digits.length === 13) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}.${digits.slice(9, 11)}-${digits.slice(11)}`;
      break;
    case 'PR':
    case 'RS':
    case 'SC':
    case 'RJ':
    case 'ES':
    case 'BA':
    case 'CE':
    case 'PB':
    case 'PE':
    case 'PI':
    case 'RN':
    case 'SE':
      if (digits.length === 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
      break;
    case 'AC':
    case 'DF':
    case 'MT':
      if (digits.length === 13) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 11)}-${digits.slice(11)}`;
      break;
    case 'RO':
      if (digits.length === 14) return `${digits.slice(0, 3)}.${digits.slice(3, 8)}.${digits.slice(8, 13)}-${digits.slice(13)}`;
      break;
    default:
      break;
  }
  return raw;
}
