/** Pure helpers behind the Utilities module: calculator, unit conversion and time zones. */

// ── Calculator ───────────────────────────────────────────────────────────────────────────────────

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: '(' } | { t: ')' };
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4, neg: 3 };
const FNS: Record<string, (x: number) => number> = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const s = src.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error('Invalid number');
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/i.test(ch)) {
      const m = /^[a-z]+/i.exec(s.slice(i))![0].toLowerCase();
      if (m === 'pi') out.push({ t: 'num', v: Math.PI });
      else if (m === 'e') out.push({ t: 'num', v: Math.E });
      else if (FNS[m]) out.push({ t: 'fn', v: m });
      else throw new Error(`Unknown name “${m}”`);
      i += m.length;
    } else if ('+-*/^%'.includes(ch)) {
      const prev = out[out.length - 1];
      const unary = ch === '-' && (!prev || prev.t === 'op' || prev.t === '(' || prev.t === 'fn');
      out.push({ t: 'op', v: unary ? 'neg' : ch });
      i++;
    } else if (ch === '(' || ch === ')') {
      out.push({ t: ch });
      i++;
    } else throw new Error(`Unexpected “${ch}”`);
  }
  return out;
}

/** Evaluate an arithmetic expression without `eval` (shunting-yard). Throws an Error with a readable message. */
export function evaluate(expression: string): number {
  const output: number[] = [];
  const ops: Tok[] = [];
  const apply = (tok: Tok) => {
    if (tok.t === 'fn') {
      if (!output.length) throw new Error('Missing value');
      output.push(FNS[tok.v](output.pop()!));
    } else if (tok.t === 'op') {
      if (tok.v === 'neg') {
        if (!output.length) throw new Error('Missing value');
        output.push(-output.pop()!);
        return;
      }
      const b = output.pop();
      const a = output.pop();
      if (a === undefined || b === undefined) throw new Error('Incomplete expression');
      output.push(tok.v === '+' ? a + b : tok.v === '-' ? a - b : tok.v === '*' ? a * b : tok.v === '/' ? a / b : tok.v === '%' ? a % b : a ** b);
    }
  };
  for (const tok of tokenize(expression)) {
    if (tok.t === 'num') output.push(tok.v);
    else if (tok.t === 'fn' || tok.t === '(') ops.push(tok);
    else if (tok.t === ')') {
      while (ops.length && ops[ops.length - 1].t !== '(') apply(ops.pop()!);
      if (!ops.length) throw new Error('Unbalanced brackets');
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === 'fn') apply(ops.pop()!);
    } else {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t !== 'op') break;
        const rightAssoc = tok.v === '^' || tok.v === 'neg';
        if (PREC[top.v] > PREC[tok.v] || (PREC[top.v] === PREC[tok.v] && !rightAssoc)) apply(ops.pop()!);
        else break;
      }
      ops.push(tok);
    }
  }
  while (ops.length) {
    const tok = ops.pop()!;
    if (tok.t === '(') throw new Error('Unbalanced brackets');
    apply(tok);
  }
  if (output.length !== 1) throw new Error('Incomplete expression');
  if (!Number.isFinite(output[0])) throw new Error('Result is not a finite number');
  return Math.round(output[0] * 1e12) / 1e12;
}

// ── Units ────────────────────────────────────────────────────────────────────────────────────────

/** Factor = how many base units one unit equals. Temperature is handled separately. */
export const UNITS: Record<string, { label: string; units: Record<string, number> }> = {
  length: { label: 'Length', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
  mass: { label: 'Weight', units: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 } },
  volume: { label: 'Volume', units: { ml: 0.001, l: 1, 'm³': 1000, tsp: 0.00492892, tbsp: 0.0147868, cup: 0.24, 'fl oz': 0.0295735, gal: 3.78541 } },
  area: { label: 'Area', units: { 'cm²': 0.0001, 'm²': 1, 'km²': 1_000_000, 'ft²': 0.09290304, acre: 4046.8564224, ha: 10_000 } },
  speed: { label: 'Speed', units: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444 } },
  data: { label: 'Data', units: { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } },
  time: { label: 'Time', units: { s: 1, min: 60, h: 3600, day: 86_400, week: 604_800 } },
  temperature: { label: 'Temperature', units: { '°C': 1, '°F': 1, K: 1 } },
};

export function convertUnit(value: number, from: string, to: string, category: string): number {
  if (category === 'temperature') {
    const celsius = from === '°F' ? ((value - 32) * 5) / 9 : from === 'K' ? value - 273.15 : value;
    return to === '°F' ? (celsius * 9) / 5 + 32 : to === 'K' ? celsius + 273.15 : celsius;
  }
  const units = UNITS[category]?.units;
  if (!units || !(from in units) || !(to in units)) return NaN;
  return (value * units[from]) / units[to];
}

export const fmtNumber = (n: number): string => (Number.isFinite(n) ? (Math.abs(n) >= 1e9 || (Math.abs(n) < 1e-4 && n !== 0) ? n.toExponential(4) : String(Math.round(n * 1e6) / 1e6)) : '—');

// ── Time zones ───────────────────────────────────────────────────────────────────────────────────

export const COMMON_ZONES = ['Asia/Kolkata', 'UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'America/Sao_Paulo', 'Africa/Johannesburg', 'Asia/Shanghai', 'Pacific/Auckland'];

/** Minutes that `zone` is ahead of UTC at the given instant. */
export function zoneOffset(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The instant at which the wall clock in `zone` reads the given date and time ("2026-11-10", "09:30"). */
export function zonedTimeToInstant(date: string, time: string, zone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h || 0, min || 0);
  const first = new Date(guess - zoneOffset(new Date(guess), zone) * 60_000);
  // second pass settles daylight-saving boundaries
  return new Date(guess - zoneOffset(first, zone) * 60_000);
}

export function timeInZone(instant: Date, zone: string, hour12 = true): { time: string; day: string; offset: string } {
  const offset = zoneOffset(instant, zone);
  const sign = offset >= 0 ? '+' : '−';
  return {
    time: instant.toLocaleTimeString(undefined, { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12 }),
    day: instant.toLocaleDateString(undefined, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }),
    offset: `UTC${sign}${Math.floor(Math.abs(offset) / 60)}${Math.abs(offset) % 60 ? `:${String(Math.abs(offset) % 60).padStart(2, '0')}` : ''}`,
  };
}

// ── Percentages & dates ──────────────────────────────────────────────────────────────────────────

export const percentOf = (pct: number, of: number) => (pct / 100) * of;
export const percentChange = (from: number, to: number) => (from === 0 ? NaN : ((to - from) / Math.abs(from)) * 100);
export const whatPercent = (part: number, whole: number) => (whole === 0 ? NaN : (part / whole) * 100);
