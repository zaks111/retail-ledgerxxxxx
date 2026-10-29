/* Sales analysis: pure calculations for the Products and Trends pages. */
import { returnedQty, calcSale, addDays, parseISO, r2, owedBy } from "./logic";

export const RANGES = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["year", "This year"], ["custom", "Custom"]];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function rangeFor(key, today, custom) {
  if (key === "today") return { from: today, to: today };
  if (key === "7d") return { from: addDays(today, -6), to: today };
  if (key === "30d") return { from: addDays(today, -29), to: today };
  if (key === "year") return { from: today.slice(0, 4) + "-01-01", to: today };
  const f = (custom && custom.from) || today, t = (custom && custom.to) || today;
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}
export const inRange = (date, r) => date >= r.from && date <= r.to;
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

/* What each product line of a sale really earned: returns removed, the sale's discount shared out. */
export function saleLines(sale) {
  const ret = returnedQty(sale);
  let sub = 0, orig = 0;
  sale.items.forEach((i, k) => { sub += (i.qty - (ret[k] || 0)) * i.price; orig += i.qty * i.price; });
  const disc = orig > 0 ? Math.min(sale.discount || 0, orig) * (sub / orig) : 0;
  const f = sub > 0 ? (sub - disc) / sub : 1;
  return sale.items.map((i, k) => {
    const q = i.qty - (ret[k] || 0), pcs = q * (i.pcs || 1);
    return { pid: i.pid, name: i.name, pcs, revenue: q * i.price * f, cogs: pcs * (i.cost || 0) };
  }).filter((l) => l.pcs > 0);
}

export function productStats(db, range) {
  const m = {};
  db.sales.forEach((s) => {
    if (!inRange(s.date, range)) return;
    const seen = new Set();
    saleLines(s).forEach((l) => {
      const r = (m[l.pid] = m[l.pid] || { pid: l.pid, name: l.name, pcs: 0, revenue: 0, cogs: 0, count: 0 });
      r.pcs += l.pcs; r.revenue += l.revenue; r.cogs += l.cogs;
      if (!seen.has(l.pid)) { seen.add(l.pid); r.count += 1; }
    });
  });
  const prods = {};
  db.products.forEach((p) => { prods[p.id] = p; });
  return Object.values(m).map((r) => {
    const p = prods[r.pid];
    return { ...r, base: p ? p.units[0].name : "pcs", cat: p ? p.cat || "" : "", revenue: r2(r.revenue), cogs: r2(r.cogs), profit: r2(r.revenue - r.cogs), margin: r.revenue > 0 ? (r.revenue - r.cogs) / r.revenue : 0 };
  });
}

export const fastMovers = (stats) => [...stats].sort((a, b) => b.pcs - a.pcs || b.revenue - a.revenue);
export const topProfit = (stats) => [...stats].sort((a, b) => b.profit - a.profit);
export const topMargin = (stats) => stats.filter((s) => s.revenue > 0).sort((a, b) => b.margin - a.margin || b.profit - a.profit);

/* Products still in stock that haven't sold for N days (or never), biggest tied-up money first. */
export function slowMovers(db, days, today) {
  const last = {};
  db.sales.forEach((s) => s.items.forEach((i) => { if (!last[i.pid] || s.date > last[i.pid]) last[i.pid] = s.date; }));
  return db.products.filter((p) => p.qty > 0).map((p) => {
    const ls = last[p.id];
    return { pid: p.id, name: p.name, qty: p.qty, base: p.units[0].name, tied: r2(p.qty * p.cost), lastSold: ls || "", since: ls ? daysBetween(ls, today) : null, age: p.added ? daysBetween(p.added, today) : null };
  }).filter((x) => (x.since === null ? x.age === null || x.age >= days : x.since >= days)).sort((a, b) => b.tied - a.tied);
}

export function categoryStats(stats) {
  const m = {};
  stats.forEach((s) => { const k = s.cat || "No category"; const r = (m[k] = m[k] || { name: k, revenue: 0, profit: 0 }); r.revenue += s.revenue; r.profit += s.profit; });
  return Object.values(m).map((r) => ({ ...r, revenue: r2(r.revenue), profit: r2(r.profit) })).sort((a, b) => b.revenue - a.revenue);
}

/* Sales and profit (before expenses) over time: by hour for one day, by day up to ~2 months, otherwise by month. */
export function trendFor(db, range) {
  const sales = db.sales.filter((s) => inRange(s.date, range));
  const one = range.from === range.to;
  const span = daysBetween(range.from, range.to) + 1;
  const mode = one ? "hour" : span <= 62 ? "day" : "month";
  const keys = [], index = {};
  if (mode === "hour") for (let h = 0; h < 24; h++) { index[h] = keys.length; keys.push({ name: String(h), sales: 0, profit: 0 }); }
  else if (mode === "day") for (let i = 0; i < span; i++) { const d = addDays(range.from, i); index[d] = keys.length; keys.push({ name: d.slice(5), sales: 0, profit: 0 }); }
  else { let d = range.from.slice(0, 7); const end = range.to.slice(0, 7); while (d <= end) { index[d] = keys.length; keys.push({ name: d, sales: 0, profit: 0 }); const [y, m] = d.split("-").map(Number); d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; } }
  let untimed = 0;
  sales.forEach((s) => {
    const c = calcSale(s);
    let k;
    if (mode === "hour") { if (!s.time) { untimed += 1; return; } k = Number(s.time.slice(0, 2)); } else if (mode === "day") k = s.date; else k = s.date.slice(0, 7);
    const b = keys[index[k]]; if (!b) return;
    b.sales += c.revenue; b.profit += c.revenue - c.cogs;
  });
  return { mode, data: keys.map((b) => ({ ...b, sales: r2(b.sales), profit: r2(b.profit) })), untimed, count: sales.length };
}

export function weekdayStats(db, range) {
  const out = DAY_NAMES.map((name) => ({ name, sales: 0, count: 0 }));
  db.sales.forEach((s) => { if (!inRange(s.date, range)) return; const i = (parseISO(s.date).getDay() + 6) % 7; out[i].sales += calcSale(s).revenue; out[i].count += 1; });
  return out.map((o) => ({ ...o, sales: r2(o.sales) }));
}
export function hourStats(db, range) {
  const out = Array.from({ length: 24 }, (_, h) => ({ name: String(h), sales: 0, count: 0 }));
  db.sales.forEach((s) => { if (!inRange(s.date, range) || !s.time) return; const h = Number(s.time.slice(0, 2)); out[h].sales += calcSale(s).revenue; out[h].count += 1; });
  return out.map((o) => ({ ...o, sales: r2(o.sales) }));
}

export function customerStats(db, range) {
  const m = {};
  db.sales.forEach((s) => { if (!s.cid || !inRange(s.date, range)) return; const r = (m[s.cid] = m[s.cid] || { cid: s.cid, name: s.customerName || "Customer", revenue: 0, count: 0 }); r.revenue += calcSale(s).revenue; r.count += 1; });
  return Object.values(m).map((r) => ({ ...r, revenue: r2(r.revenue) })).sort((a, b) => b.revenue - a.revenue);
}
export const topDebtors = (db) => db.customers.map((c) => ({ cid: c.id, name: c.name, owed: owedBy(db.sales, c.id) })).filter((c) => c.owed > 0.004).sort((a, b) => b.owed - a.owed);
