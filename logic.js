/* Pure helpers: dates, money maths, migration. No UI code here, so it can be tested on its own. */
export const uid = () => Math.random().toString(36).slice(2, 9);
export const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const weekStart = (s) => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };
export const keyFor = (s, mode) => mode === "day" ? s : mode === "week" ? weekStart(s) : mode === "month" ? s.slice(0, 7) : s.slice(0, 4);
export const fmtDay = (s, o) => parseISO(s).toLocaleDateString(undefined, o);
export const labelFor = (k, mode) => {
  if (mode === "year") return k;
  if (mode === "month") return parseISO(k + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (mode === "week") return "Week of " + fmtDay(k, { month: "short", day: "numeric", year: "numeric" });
  return fmtDay(k, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};
export const shortFor = (k, mode) => mode === "year" ? k : mode === "month" ? parseISO(k + "-01").toLocaleDateString(undefined, { month: "short" }) : fmtDay(k, { month: "short", day: "numeric" });
export const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
export const trimNum = (n) => String(Math.round(n * 1000) / 1000);
export const makeMoney = (cur) => (n) => (n < -0.004 ? "-" : "") + cur + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const isLatin = (s) => /^[\x20-\x7E\u00A0-\u00FF]*$/.test(s || "");

export async function hashPin(pin) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("retail-ledger:" + pin));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return "plain:" + pin; }
}

export const DEFAULT_SETTINGS = {
  shop: "My shop", phone: "", address: "", cur: "$", curCode: "", saleTax: 0, incomeTax: 0,
  theme: "auto", font: "m", pinHash: "", receiptColor: "#0F766E", footer: "Thank you for your business",
  showEstimate: false, valueBasis: "cautious", setupDone: false, lastShared: "",
};
export const freshDb = () => ({
  v: 2, products: [], customers: [], custLedger: [], sales: [], expenses: [], suppliers: [], ledger: [],
  purchases: [], stockLog: [], notes: [], seq: 1, settings: { ...DEFAULT_SETTINGS },
});
const LISTS = ["products", "customers", "custLedger", "sales", "expenses", "suppliers", "ledger", "purchases", "stockLog", "notes"];

/* Brings data saved by the first trial version (or a backup of it) up to the current shape. */
export function migrate(raw) {
  const base = freshDb();
  if (!raw || typeof raw !== "object") return base;
  const d = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } };
  LISTS.forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
  if ((raw.v || 1) < 2) d.settings.setupDone = true;
  d.products = d.products.map((p) => ({
    cat: "", photo: "", reorder: 5, cost: 0, qty: 0, ...p,
    units: p.units && p.units.length ? p.units : [{ id: uid(), name: "pcs", pcs: 1, show: p.price || 0, price: p.price || 0 }],
  }));
  d.sales = d.sales.map((s) => ({
    cid: "", customerName: s.customer || "", discount: 0, other: 0, method: "Cash", fromDeposit: 0, time: "", taxRate: 0, paid: 0, ...s,
    items: (s.items || []).map((i) => ({ unit: "pcs", pcs: 1, show: i.price, ...i })),
  }));
  d.v = 2;
  return d;
}

export function calcSale(s) {
  let sub = 0, showTotal = 0, cogs = 0;
  for (const i of s.items || []) {
    sub += i.qty * i.price;
    showTotal += i.qty * (i.show == null ? i.price : i.show);
    cogs += i.qty * (i.pcs || 1) * (i.cost || 0);
  }
  const disc = Math.min(s.discount || 0, sub);
  const other = s.other || 0;
  const base = sub - disc;
  const tax = (base * (s.taxRate || 0)) / 100;
  const total = r2(base + tax + other);
  const paid = s.paid || 0;
  return { sub: r2(sub), disc: r2(disc), other, base: r2(base), tax: r2(tax), total, revenue: r2(base + other), cogs: r2(cogs), paid, due: Math.max(0, r2(total - paid)), concession: r2(showTotal - sub + disc) };
}

export const stockUse = (items) => {
  const m = {};
  items.forEach((i) => { m[i.pid] = (m[i.pid] || 0) + i.qty * (i.pcs || 1); });
  return m;
};

export function summarize(sales, expenses, losses, incomeTax) {
  let revenue = 0, tax = 0, cogs = 0, concession = 0;
  sales.forEach((s) => { const c = calcSale(s); revenue += c.revenue; tax += c.tax; cogs += c.cogs; concession += c.concession; });
  const exp = expenses.reduce((a, e) => a + e.amount, 0);
  const loss = (losses || []).reduce((a, l) => a + l.cost, 0);
  const gross = revenue - cogs;
  const net = gross - exp - loss;
  const estTax = (Math.max(0, net) * incomeTax) / 100;
  return { revenue, tax, cogs, exp, loss, gross, net, estTax, after: net - estTax, concession, count: sales.length };
}

export function periodsFor(db, mode, today) {
  const m = {};
  const slot = (k) => (m[k] = m[k] || { sales: [], exp: [], loss: [] });
  db.sales.forEach((s) => slot(keyFor(s.date, mode)).sales.push(s));
  db.expenses.forEach((e) => slot(keyFor(e.date, mode)).exp.push(e));
  db.stockLog.forEach((l) => { if (l.loss) slot(keyFor(l.date, mode)).loss.push(l); });
  slot(keyFor(today, mode));
  return Object.keys(m).sort().reverse().map((k) => ({ k, ...summarize(m[k].sales, m[k].exp, m[k].loss, db.settings.incomeTax) }));
}

export function stockValues(products) {
  let cost = 0, cautious = 0, retail = 0, showing = 0;
  for (const p of products) {
    const q = Math.max(0, p.qty);
    cost += q * p.cost;
    const base = p.units[0];
    if (base) { retail += q * base.price; showing += q * (base.show || base.price); }
    const per = p.units.filter((u) => u.pcs > 0 && u.price > 0).map((u) => u.price / u.pcs);
    cautious += q * (per.length ? Math.min(...per) : 0);
  }
  return { cost: r2(cost), cautious: r2(cautious), retail: r2(retail), showing: r2(showing) };
}

export const supplierBalance = (ledger, sid, types) => ledger.filter((l) => l.sid === sid).reduce((a, l) => a + types[l.type].sign * l.amount, 0);
export const owedBy = (sales, cid) => r2(sales.filter((s) => s.cid === cid).reduce((a, s) => a + calcSale(s).due, 0));

/* Spreads a customer's payment over their oldest unpaid sales; anything left over becomes a deposit. */
export function allocatePayment(sales, cid, amount) {
  const out = sales.map((s) => ({ ...s }));
  const key = (i) => (out[i].date || "") + (out[i].time || "");
  const idx = out.map((_, i) => i).filter((i) => out[i].cid === cid && calcSale(out[i]).due > 0.004)
    .sort((a, b) => key(a).localeCompare(key(b)) || b - a);
  let left = r2(amount);
  for (const i of idx) {
    if (left <= 0) break;
    const pay = Math.min(calcSale(out[i]).due, left);
    out[i].paid = r2((out[i].paid || 0) + pay);
    left = r2(left - pay);
  }
  return { sales: out, leftover: left };
}

export const addUnitCostPerPcs = (unitCost, unit) => (unit.pcs > 0 ? unitCost / unit.pcs : unitCost);
export function receiveCost(product, addPcs, costPerPcs) {
  const have = Math.max(0, product.qty);
  const total = have + addPcs;
  return total > 0 ? (have * product.cost + addPcs * costPerPcs) / total : costPerPcs;
}
