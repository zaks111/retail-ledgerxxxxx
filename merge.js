/* Adding imported data to what's already in the app, without deleting anything, and flagging likely duplicates. */
import { uid, r2, migrate, calcSale } from "./logic";

export const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
const digits = (s) => String(s == null ? "" : s).replace(/\D/g, "");

const sameProduct = (a, b) => norm(a.name) === norm(b.name);
const sameCustomer = (a, b) => {
  const pa = digits(a.phone), pb = digits(b.phone);
  if (pa.length >= 6 && pb.length >= 6) return pa === pb;
  return norm(a.name) === norm(b.name) && (!pa || !pb || pa === pb);
};
const sameSupplier = (a, b) => norm(a.name) === norm(b.name);
const sameSale = (a, b) => a.date === b.date && calcSale(a).total === calcSale(b).total && norm(a.customerName) === norm(b.customerName) && (a.items || []).length === (b.items || []).length && (a.time && b.time ? a.time === b.time : true);
const sameExpense = (a, b) => a.date === b.date && r2(a.amount) === r2(b.amount) && norm(a.category) === norm(b.category) && norm(a.note) === norm(b.note);

export const DUP_KINDS = ["products", "customers", "suppliers", "sales", "expenses"];
const MATCH = { products: sameProduct, customers: sameCustomer, suppliers: sameSupplier, sales: sameSale, expenses: sameExpense };
const AUTO = ["ledger", "custLedger", "purchases", "stockLog", "notes"];
const ALL = [...DUP_KINDS, ...AUTO];

/* Looks at the incoming data and the current data; changes nothing. */
export function planMerge(cur, incomingRaw) {
  const inc = migrate(incomingRaw);
  const counts = {}, dups = [];
  ALL.forEach((k) => { counts[k] = { total: inc[k].length, fresh: 0, same: 0, dup: 0 }; });
  DUP_KINDS.forEach((k) => {
    const ids = new Set(cur[k].map((x) => x.id));
    inc[k].forEach((x) => {
      if (ids.has(x.id)) { counts[k].same++; return; }
      const mine = cur[k].find((y) => MATCH[k](y, x));
      if (mine) { counts[k].dup++; dups.push({ key: `${k}:${x.id}`, kind: k, inc: x, mine }); } else counts[k].fresh++;
    });
  });
  AUTO.forEach((k) => {
    const ids = new Set(cur[k].map((x) => x.id));
    inc[k].forEach((x) => { if (ids.has(x.id)) counts[k].same++; else counts[k].fresh++; });
  });
  const addable = ALL.reduce((a, k) => a + counts[k].fresh, 0);
  return { inc, counts, dups, addable };
}

/* choices: { "products:<id>": "skip" | "both" | "use" } for flagged duplicates (default skip). */
export function applyMerge(cur, plan, choices = {}, opts = {}) {
  const inc = plan.inc;
  const db = { ...cur, settings: { ...cur.settings } };
  ALL.forEach((k) => { db[k] = [...cur[k]]; });
  const idMap = { products: {}, customers: {}, suppliers: {} };
  const out = {};
  ALL.forEach((k) => { out[k] = { added: 0, same: 0, skipped: 0, replaced: 0 }; });
  const taken = new Set();
  ALL.forEach((k) => cur[k].forEach((x) => taken.add(x.id)));
  const fresh = (id) => { let n = id; while (taken.has(n)) n = uid(); taken.add(n); return n; };
  const choice = (k, id) => choices[`${k}:${id}`] || "skip";

  /* products, customers, suppliers */
  const simple = {
    products: { replace: (x, p) => ({ ...x, name: p.name, cat: p.cat, photo: p.photo || x.photo, cost: p.cost, qty: p.qty, reorder: p.reorder, units: p.units }), both: (p) => ({ name: p.name + " (2)" }) },
    customers: { replace: (x, p) => ({ ...x, name: p.name, phone: p.phone || x.phone, note: p.note || x.note }), both: () => ({}) },
    suppliers: { replace: (x, p) => ({ ...x, name: p.name, phone: p.phone || x.phone }), both: () => ({}) },
  };
  Object.keys(simple).forEach((k) => {
    const ids = new Set(cur[k].map((x) => x.id));
    inc[k].forEach((p) => {
      if (ids.has(p.id)) { idMap[k][p.id] = p.id; out[k].same++; return; }
      const mine = cur[k].find((y) => MATCH[k](y, p));
      if (mine) {
        const ch = choice(k, p.id);
        if (ch === "use") { db[k] = db[k].map((x) => (x.id === mine.id ? simple[k].replace(x, p) : x)); idMap[k][p.id] = mine.id; out[k].replaced++; return; }
        if (ch !== "both") { idMap[k][p.id] = mine.id; out[k].skipped++; return; }
        const np = { ...p, ...simple[k].both(p), id: fresh(p.id) }; db[k].push(np); idMap[k][p.id] = np.id; out[k].added++; return;
      }
      const np = { ...p, id: fresh(p.id) }; db[k].push(np); idMap[k][p.id] = np.id; out[k].added++;
    });
  });
  const mapId = (kind, id) => (idMap[kind][id] !== undefined ? idMap[kind][id] : id);

  /* sales: new receipt numbers, stock is never touched */
  const sid = new Set(cur.sales.map((s) => s.id));
  let seq = cur.seq;
  const chrono = [...inc.sales].sort((a, b) => ((a.date || "") + (a.time || "")).localeCompare((b.date || "") + (b.time || "")));
  const remap = (s) => ({ ...s, cid: s.cid && (idMap.customers[s.cid] !== undefined || db.customers.some((c) => c.id === s.cid)) ? mapId("customers", s.cid) : "", fromDeposit: 0, items: s.items.map((i) => ({ ...i, pid: mapId("products", i.pid) })) });
  chrono.forEach((s) => {
    if (sid.has(s.id)) { out.sales.same++; return; }
    const mine = cur.sales.find((y) => sameSale(y, s));
    if (mine) {
      const ch = choice("sales", s.id);
      if (ch === "use") { db.sales = db.sales.map((x) => (x.id === mine.id ? { ...remap(s), id: mine.id, no: mine.no } : x)); out.sales.replaced++; return; }
      if (ch !== "both") { out.sales.skipped++; return; }
    }
    const ns = { ...remap(s), id: fresh(s.id), origNo: s.no, no: "INV-" + String(seq++).padStart(4, "0") };
    db.sales.push(ns); out.sales.added++;
  });
  db.sales.sort((a, b) => ((b.date || "") + (b.time || "")).localeCompare((a.date || "") + (a.time || "")));
  db.seq = seq;

  /* expenses */
  const eid = new Set(cur.expenses.map((e) => e.id));
  inc.expenses.forEach((e) => {
    if (eid.has(e.id)) { out.expenses.same++; return; }
    const mine = cur.expenses.find((y) => sameExpense(y, e));
    if (mine) {
      const ch = choice("expenses", e.id);
      if (ch === "use") { db.expenses = db.expenses.map((x) => (x.id === mine.id ? { ...e, id: mine.id } : x)); out.expenses.replaced++; return; }
      if (ch !== "both") { out.expenses.skipped++; return; }
    }
    db.expenses.push({ ...e, id: fresh(e.id) }); out.expenses.added++;
  });
  db.expenses.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  /* history records: added unless already here */
  const auto = {
    ledger: { map: (x) => ({ ...x, sid: mapId("suppliers", x.sid) }), key: (x) => [x.sid, x.date, x.type, r2(x.amount), norm(x.note)].join("|") },
    custLedger: { map: (x) => ({ ...x, cid: mapId("customers", x.cid) }), key: (x) => [x.cid, x.date, r2(x.amount), x.method, norm(x.note)].join("|") },
    purchases: { map: (x) => ({ ...x, pid: mapId("products", x.pid), sid: x.sid ? mapId("suppliers", x.sid) : x.sid }), key: (x) => [x.date, x.pid, x.qty, r2(x.total)].join("|") },
    stockLog: { map: (x) => ({ ...x, pid: mapId("products", x.pid) }), key: (x) => [x.date, x.pid, x.qty, x.reason, r2(x.cost)].join("|") },
    notes: { map: (x) => x, key: (x) => [x.date, norm(x.text)].join("|") },
  };
  AUTO.forEach((k) => {
    const ids = new Set(cur[k].map((x) => x.id)), keys = new Set(cur[k].map(auto[k].key));
    inc[k].forEach((x) => {
      if (ids.has(x.id)) { out[k].same++; return; }
      const m = auto[k].map(x);
      if (keys.has(auto[k].key(m))) { out[k].skipped++; return; }
      db[k].push({ ...m, id: fresh(x.id) }); out[k].added++;
    });
  });

  /* categories always combine; shop settings only if asked, and never the PIN */
  const cats = [...(cur.settings.categories || []), ...(inc.settings.categories || []), ...db.products.map((p) => p.cat).filter(Boolean)];
  db.settings.categories = [...new Set(cats)];
  if (opts.useSettings) ["shop", "phone", "address", "cur", "curCode", "saleTax", "incomeTax", "receiptColor", "footer", "bizType", "logo"].forEach((f) => { if (inc.settings[f] !== undefined && inc.settings[f] !== "") db.settings[f] = inc.settings[f]; });
  const summary = ALL.reduce((a, k) => ({ added: a.added + out[k].added, replaced: a.replaced + out[k].replaced, skipped: a.skipped + out[k].skipped, same: a.same + out[k].same }), { added: 0, replaced: 0, skipped: 0, same: 0 });
  return { db, out, summary };
}
