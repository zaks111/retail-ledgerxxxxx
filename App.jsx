import { useState, useEffect, useMemo, useRef } from "react";
import { loadDb, saveDb, backupNow, shareBackup, parseBackup } from "./storage";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { Home, Receipt, Wallet, Package, Truck, BarChart3, Plus, X } from "lucide-react";

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const weekStart = (s) => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };
const keyFor = (s, mode) => mode === "day" ? s : mode === "week" ? weekStart(s) : mode === "month" ? s.slice(0, 7) : s.slice(0, 4);
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtDay = (s, o) => parseISO(s).toLocaleDateString(undefined, o);
const labelFor = (k, mode) => {
  if (mode === "year") return k;
  if (mode === "month") return parseISO(k + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (mode === "week") return "Week of " + fmtDay(k, { month: "short", day: "numeric", year: "numeric" });
  return fmtDay(k, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};
const shortFor = (k, mode) => mode === "year" ? k : mode === "month" ? parseISO(k + "-01").toLocaleDateString(undefined, { month: "short" }) : fmtDay(k, { month: "short", day: "numeric" });

const EMPTY = {
  products: [], sales: [], expenses: [], suppliers: [], ledger: [], seq: 1,
  settings: { shop: "My shop", cur: "$", saleTax: 0, incomeTax: 0 },
};
const EXPENSE_CATS = ["Rent", "Wages", "Utilities", "Transport", "Marketing", "Repairs", "Packaging", "Fees", "Other"];
const LEDGER_TYPES = {
  bought: { label: "Bought on credit", sign: 1, hint: "You owe more" },
  paid: { label: "I paid them", sign: -1, hint: "You owe less" },
  theyowe: { label: "They owe me", sign: -1, hint: "Returns, advance, or overpayment" },
  repaid: { label: "They paid me back", sign: 1, hint: "Clears what they owed you" },
};

const calcSale = (s) => {
  const sub = s.items.reduce((a, i) => a + i.qty * i.price, 0);
  const tax = (sub * s.taxRate) / 100;
  const cogs = s.items.reduce((a, i) => a + i.qty * i.cost, 0);
  const total = sub + tax;
  return { sub, tax, total, cogs, due: Math.max(0, total - s.paid) };
};
const summarize = (sales, expenses, incomeTax) => {
  let revenue = 0, tax = 0, cogs = 0;
  sales.forEach((s) => { const c = calcSale(s); revenue += c.sub; tax += c.tax; cogs += c.cogs; });
  const exp = expenses.reduce((a, e) => a + e.amount, 0);
  const gross = revenue - cogs, net = gross - exp;
  const estTax = Math.max(0, net) * incomeTax / 100;
  return { revenue, tax, cogs, exp, gross, net, estTax, after: net - estTax, count: sales.length };
};
const balanceOf = (ledger, sid) => ledger.filter((l) => l.sid === sid).reduce((a, l) => a + LEDGER_TYPES[l.type].sign * l.amount, 0);

/* ---------- small UI ---------- */
function Sheet({ title, onClose, children }) {
  return (
    <div className="ov" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sh-h"><h3>{title}</h3><button className="ico" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => <label className="fld"><span>{label}</span>{children}</label>;
const Empty = ({ children }) => <p className="empty">{children}</p>;

/* ---------- app ---------- */
export default function RetailLedger() {
  const [db, setDb] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await loadDb();
        if (d) setDb({ ...EMPTY, ...d, settings: { ...EMPTY.settings, ...d.settings } });
      } catch (e) { /* nothing saved yet */ }
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    saveDb(db);
  }, [db, loaded]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); } }, [toast]);

  const cur = db.settings.cur || "$";
  const money = (n) => (n < -0.004 ? "-" : "") + cur + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const close = () => setSheet(null);
  const say = (m) => setToast(m);
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); say("Copied"); } catch (e) { say("Copy isn't available here"); } };

  /* actions */
  const addSale = (sale) => {
    setDb((d) => {
      const no = "INV-" + String(d.seq).padStart(4, "0");
      const products = d.products.map((p) => { const used = sale.items.filter((i) => i.pid === p.id).reduce((a, i) => a + i.qty, 0); return used ? { ...p, qty: p.qty - used } : p; });
      return { ...d, products, sales: [{ ...sale, no }, ...d.sales], seq: d.seq + 1 };
    });
    close(); say("Sale saved");
  };
  const voidSale = (id) => {
    setDb((d) => {
      const s = d.sales.find((x) => x.id === id); if (!s) return d;
      const products = d.products.map((p) => { const back = s.items.filter((i) => i.pid === p.id).reduce((a, i) => a + i.qty, 0); return back ? { ...p, qty: p.qty + back } : p; });
      return { ...d, products, sales: d.sales.filter((x) => x.id !== id) };
    });
    close(); say("Sale voided, stock restored");
  };
  const paySale = (id, amt) => {
    setDb((d) => ({ ...d, sales: d.sales.map((s) => (s.id === id ? { ...s, paid: Math.min(calcSale(s).total, s.paid + amt) } : s)) }));
    say("Payment recorded");
  };
  const addExpense = (e) => { setDb((d) => ({ ...d, expenses: [{ id: uid(), ...e }, ...d.expenses] })); close(); say("Expense saved"); };
  const delExpense = (id) => setDb((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));
  const addProduct = (p) => { setDb((d) => ({ ...d, products: [...d.products, { id: uid(), ...p }] })); close(); say("Product added"); };
  const updProduct = (id, patch) => { setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })); close(); say("Product updated"); };
  const delProduct = (id) => { setDb((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) })); close(); };
  const receiveStock = ({ pid, qty, cost, sid, paid }) => {
    setDb((d) => {
      const products = d.products.map((p) => {
        if (p.id !== pid) return p;
        const q = p.qty + qty;
        const avg = q > 0 ? (Math.max(p.qty, 0) * p.cost + qty * cost) / (Math.max(p.qty, 0) + qty) : cost;
        return { ...p, qty: q, cost: avg };
      });
      let ledger = d.ledger;
      if (sid) {
        const name = d.products.find((p) => p.id === pid)?.name || "stock";
        const entries = [{ id: uid(), sid, date: todayISO(), type: "bought", amount: qty * cost, note: `${qty} × ${name}` }];
        if (paid > 0) entries.push({ id: uid(), sid, date: todayISO(), type: "paid", amount: Math.min(paid, qty * cost), note: "Paid on delivery" });
        ledger = [...entries, ...ledger];
      }
      return { ...d, products, ledger };
    });
    close(); say("Stock received");
  };
  const addSupplier = (s) => { setDb((d) => ({ ...d, suppliers: [...d.suppliers, { id: uid(), ...s }] })); close(); say("Supplier added"); };
  const addLedger = (e) => { setDb((d) => ({ ...d, ledger: [{ id: uid(), ...e }, ...d.ledger] })); say("Entry saved"); };
  const delLedger = (id) => setDb((d) => ({ ...d, ledger: d.ledger.filter((l) => l.id !== id) }));
  const saveSettings = (s) => { setDb((d) => ({ ...d, settings: s })); say("Settings saved"); };
  const restoreDb = (d) => { setDb({ ...EMPTY, ...d, settings: { ...EMPTY.settings, ...d.settings } }); say("Backup restored"); };

  /* derived */
  const today = todayISO();
  const monthSales = db.sales.filter((s) => s.date.slice(0, 7) === today.slice(0, 7));
  const monthExp = db.expenses.filter((e) => e.date.slice(0, 7) === today.slice(0, 7));
  const month = summarize(monthSales, monthExp, db.settings.incomeTax);
  const todayTotal = summarize(db.sales.filter((s) => s.date === today), [], 0).revenue;
  const receivable = db.sales.reduce((a, s) => a + calcSale(s).due, 0);
  const balances = db.suppliers.map((s) => ({ ...s, bal: balanceOf(db.ledger, s.id) }));
  const youOwe = balances.filter((b) => b.bal > 0.004).reduce((a, b) => a + b.bal, 0);
  const owedToYou = balances.filter((b) => b.bal < -0.004).reduce((a, b) => a - b.bal, 0);
  const stockValue = db.products.reduce((a, p) => a + Math.max(0, p.qty) * p.cost, 0);

  const tabs = [
    ["home", "Home", Home], ["sales", "Sales", Receipt], ["exp", "Expenses", Wallet],
    ["stock", "Stock", Package], ["sup", "Suppliers", Truck], ["rep", "Reports", BarChart3],
  ];

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="top"><h1>{db.settings.shop || "My shop"}</h1><span className="muted small">{loaded ? "Saved on this phone" : "Loading…"}</span></header>

      <main>
        {tab === "home" && (
          <>
            <section className="hero">
              <p className="muted">Net profit this month</p>
              <p className={"big " + (month.net < 0 ? "neg" : "pos")}>{money(month.net)}</p>
              <p className="small muted">Sales {money(month.revenue)} · today {money(todayTotal)}</p>
            </section>
            <div className="grid2">
              <div className="card"><p className="muted small">Customers owe you</p><p className="amt">{money(receivable)}</p></div>
              <div className="card"><p className="muted small">Stock on hand (at cost)</p><p className="amt">{money(stockValue)}</p></div>
              <div className="card"><p className="muted small">You owe suppliers</p><p className="amt neg">{money(youOwe)}</p></div>
              <div className="card"><p className="muted small">Suppliers owe you</p><p className="amt pos">{money(owedToYou)}</p></div>
            </div>
            <h2>Running low</h2>
            {db.products.filter((p) => p.qty <= p.reorder).length === 0 ? <Empty>{db.products.length ? "Nothing is below its reorder level." : "Add products under Stock to start tracking inventory."}</Empty> :
              <div className="card list">{db.products.filter((p) => p.qty <= p.reorder).map((p) => (
                <div className="row" key={p.id}><span>{p.name}</span><span className="neg">{p.qty} left</span></div>))}</div>}
            <h2>Shop settings</h2>
            <SettingsForm settings={db.settings} onSave={saveSettings} />
            <h2>Backup and restore</h2>
            <BackupCard db={db} onRestore={restoreDb} />
          </>
        )}

        {tab === "sales" && (
          <>
            <button className="primary wide" onClick={() => setSheet({ t: "sale" })}><Plus size={18} /> New sale</button>
            {db.sales.length === 0 ? <Empty>No sales yet. Add products under Stock, then record your first sale.</Empty> :
              <div className="card list">{db.sales.map((s) => { const c = calcSale(s); return (
                <button className="row tap" key={s.id} onClick={() => setSheet({ t: "receipt", id: s.id })}>
                  <span><b>{s.no}</b> <span className="muted small">{s.customer || "Walk-in"} · {fmtDay(s.date, { month: "short", day: "numeric" })}</span></span>
                  <span className="right"><b>{money(c.total)}</b>{c.due > 0.004 ? <span className="badge warn">Owes {money(c.due)}</span> : <span className="badge ok">Paid</span>}</span>
                </button>); })}</div>}
          </>
        )}

        {tab === "exp" && (
          <>
            <button className="primary wide" onClick={() => setSheet({ t: "expense" })}><Plus size={18} /> Add expense</button>
            <div className="card"><p className="muted small">Spent this month</p><p className="amt neg">{money(month.exp)}</p></div>
            {db.expenses.length === 0 ? <Empty>No expenses yet. Record rent, wages, utilities and anything else you pay to run the shop.</Empty> :
              <div className="card list">{db.expenses.map((e) => (
                <div className="row" key={e.id}>
                  <span><b>{e.category}</b> <span className="muted small">{fmtDay(e.date, { month: "short", day: "numeric" })}{e.note ? " · " + e.note : ""}</span></span>
                  <span className="right"><b>{money(e.amount)}</b><button className="link" onClick={() => delExpense(e.id)}>Delete</button></span>
                </div>))}</div>}
          </>
        )}

        {tab === "stock" && (
          <>
            <div className="split">
              <button className="primary" onClick={() => setSheet({ t: "product" })}><Plus size={18} /> New product</button>
              <button className="ghost" disabled={!db.products.length} onClick={() => setSheet({ t: "receive" })}>Receive stock</button>
            </div>
            {db.products.length === 0 ? <Empty>No products yet. Add what you sell, with its cost and selling price.</Empty> :
              <div className="card list">{db.products.map((p) => (
                <button className="row tap" key={p.id} onClick={() => setSheet({ t: "edit", id: p.id })}>
                  <span><b>{p.name}</b><br /><span className="muted small">Cost {money(p.cost)} · Price {money(p.price)}</span></span>
                  <span className="right"><b className={p.qty <= p.reorder ? "neg" : ""}>{p.qty}</b><span className="muted small">in stock</span></span>
                </button>))}</div>}
          </>
        )}

        {tab === "sup" && (
          <>
            <button className="primary wide" onClick={() => setSheet({ t: "supplier" })}><Plus size={18} /> Add supplier</button>
            {balances.length === 0 ? <Empty>No suppliers yet. Add one to track what you owe them or what they owe you.</Empty> :
              <div className="card list">{balances.map((s) => (
                <button className="row tap" key={s.id} onClick={() => setSheet({ t: "supplier-detail", id: s.id })}>
                  <span><b>{s.name}</b><br /><span className="muted small">{s.phone}</span></span>
                  {s.bal > 0.004 ? <span className="badge warn">You owe {money(s.bal)}</span> : s.bal < -0.004 ? <span className="badge ok">Owes you {money(-s.bal)}</span> : <span className="badge">Settled</span>}
                </button>))}</div>}
          </>
        )}

        {tab === "rep" && <Reports db={db} money={money} copy={copy} />}
      </main>

      <nav className="nav">
        {tabs.map(([k, l, Icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} aria-current={tab === k}><Icon size={20} /><span>{l}</span></button>
        ))}
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}

      {sheet?.t === "sale" && <Sheet title="New sale" onClose={close}><SaleForm db={db} money={money} onSave={addSale} /></Sheet>}
      {sheet?.t === "receipt" && <ReceiptSheet sale={db.sales.find((s) => s.id === sheet.id)} db={db} money={money} onClose={close} onPay={paySale} onVoid={voidSale} copy={copy} />}
      {sheet?.t === "expense" && <Sheet title="Add expense" onClose={close}><ExpenseForm onSave={addExpense} /></Sheet>}
      {sheet?.t === "product" && <Sheet title="New product" onClose={close}><ProductForm onSave={addProduct} /></Sheet>}
      {sheet?.t === "edit" && <Sheet title="Edit product" onClose={close}><ProductForm product={db.products.find((p) => p.id === sheet.id)} onSave={(p) => updProduct(sheet.id, p)} onDelete={() => delProduct(sheet.id)} /></Sheet>}
      {sheet?.t === "receive" && <Sheet title="Receive stock" onClose={close}><ReceiveForm db={db} money={money} onSave={receiveStock} /></Sheet>}
      {sheet?.t === "supplier" && <Sheet title="Add supplier" onClose={close}><SupplierForm onSave={addSupplier} /></Sheet>}
      {sheet?.t === "supplier-detail" && <SupplierSheet supplier={db.suppliers.find((s) => s.id === sheet.id)} db={db} money={money} onClose={close} onAdd={addLedger} onDel={delLedger} />}
    </div>
  );
}

/* ---------- forms ---------- */
function SettingsForm({ settings, onSave }) {
  const [s, setS] = useState({ shop: settings.shop, cur: settings.cur, saleTax: String(settings.saleTax), incomeTax: String(settings.incomeTax) });
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  return (
    <div className="card form">
      <Field label="Shop name"><input value={s.shop} onChange={set("shop")} /></Field>
      <div className="split">
        <Field label="Currency symbol"><input value={s.cur} onChange={set("cur")} maxLength={4} /></Field>
        <Field label="Sales tax %"><input inputMode="decimal" value={s.saleTax} onChange={set("saleTax")} /></Field>
      </div>
      <Field label="Income tax estimate % (on net profit)"><input inputMode="decimal" value={s.incomeTax} onChange={set("incomeTax")} /></Field>
      <p className="muted small">Sales tax applies to new sales only. Past invoices keep the rate they were issued with.</p>
      <button className="primary" onClick={() => onSave({ shop: s.shop, cur: s.cur, saleTax: num(s.saleTax), incomeTax: num(s.incomeTax) })}>Save settings</button>
    </div>
  );
}

function SaleForm({ db, money, onSave }) {
  const { products, settings } = db;
  const [date, setDate] = useState(todayISO());
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState([{ pid: "", qty: "1", price: "" }]);
  const [full, setFull] = useState(true);
  const [recv, setRecv] = useState("");
  const [err, setErr] = useState("");
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i, pid) => { const p = products.find((x) => x.id === pid); setLine(i, { pid, price: p ? String(p.price) : "" }); };
  const valid = lines.filter((l) => l.pid && num(l.qty) > 0);
  const sub = valid.reduce((a, l) => a + num(l.qty) * num(l.price), 0);
  const tax = (sub * settings.saleTax) / 100;
  const total = sub + tax;
  const save = () => {
    if (!valid.length) return setErr("Add at least one item with a quantity.");
    for (const l of valid) {
      const p = products.find((x) => x.id === l.pid);
      const used = valid.filter((x) => x.pid === l.pid).reduce((a, x) => a + num(x.qty), 0);
      if (used > p.qty) return setErr(`Only ${p.qty} of ${p.name} in stock. Receive more stock first.`);
    }
    const items = valid.map((l) => { const p = products.find((x) => x.id === l.pid); return { pid: p.id, name: p.name, qty: num(l.qty), price: num(l.price), cost: p.cost }; });
    onSave({ id: uid(), date, customer: customer.trim(), items, taxRate: settings.saleTax, paid: full ? total : Math.min(total, num(recv)) });
  };
  if (!products.length) return <Empty>Add a product under Stock before recording a sale.</Empty>;
  return (
    <div className="form">
      <div className="split">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Customer (optional)"><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" /></Field>
      </div>
      {lines.map((l, i) => (
        <div className="line" key={i}>
          <select value={l.pid} onChange={(e) => pick(i, e.target.value)} aria-label="Product">
            <option value="">Choose product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.qty})</option>)}
          </select>
          <input inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantity" placeholder="Qty" />
          <input inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} aria-label="Unit price" placeholder="Price" />
          {lines.length > 1 && <button className="ico" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><X size={16} /></button>}
        </div>
      ))}
      <button className="ghost" onClick={() => setLines([...lines, { pid: "", qty: "1", price: "" }])}>Add another item</button>
      <div className="sum">
        <div className="row"><span>Subtotal</span><span>{money(sub)}</span></div>
        {settings.saleTax > 0 && <div className="row"><span>Sales tax ({settings.saleTax}%)</span><span>{money(tax)}</span></div>}
        <div className="row"><b>Total</b><b>{money(total)}</b></div>
      </div>
      <label className="chk"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Customer paid in full</label>
      {!full && <Field label="Amount received now"><input inputMode="decimal" value={recv} onChange={(e) => setRecv(e.target.value)} placeholder="0.00" /></Field>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={save}>Save sale</button>
    </div>
  );
}

function ReceiptSheet({ sale, db, money, onClose, onPay, onVoid, copy }) {
  const [amt, setAmt] = useState("");
  if (!sale) return null;
  const c = calcSale(sale);
  const text = [`${db.settings.shop} — ${sale.no}`, `${sale.date}${sale.customer ? " · " + sale.customer : ""}`, "",
    ...sale.items.map((i) => `${i.qty} × ${i.name} @ ${money(i.price)} = ${money(i.qty * i.price)}`), "",
    `Subtotal ${money(c.sub)}`, c.tax ? `Tax (${sale.taxRate}%) ${money(c.tax)}` : null, `Total ${money(c.total)}`, `Paid ${money(sale.paid)}`, c.due > 0.004 ? `Balance due ${money(c.due)}` : "Paid in full"].filter((x) => x !== null).join("\n");
  return (
    <Sheet title={sale.no} onClose={onClose}>
      <p className="muted small">{fmtDay(sale.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {sale.customer || "Walk-in"}</p>
      <div className="card list flat">
        {sale.items.map((i, k) => <div className="row" key={k}><span>{i.qty} × {i.name}</span><span>{money(i.qty * i.price)}</span></div>)}
        <div className="row"><span>Subtotal</span><span>{money(c.sub)}</span></div>
        {c.tax > 0 && <div className="row"><span>Tax ({sale.taxRate}%)</span><span>{money(c.tax)}</span></div>}
        <div className="row"><b>Total</b><b>{money(c.total)}</b></div>
        <div className="row"><span>Paid</span><span>{money(sale.paid)}</span></div>
        {c.due > 0.004 && <div className="row"><b className="neg">Balance due</b><b className="neg">{money(c.due)}</b></div>}
      </div>
      {c.due > 0.004 && (
        <div className="form">
          <div className="split">
            <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount received" aria-label="Amount received" />
            <button className="ghost" onClick={() => { if (num(amt) > 0) { onPay(sale.id, num(amt)); setAmt(""); } }}>Record payment</button>
          </div>
          <button className="ghost" onClick={() => onPay(sale.id, c.due)}>Mark paid in full</button>
        </div>
      )}
      <div className="split">
        <button className="primary" onClick={() => copy(text)}>Copy receipt</button>
        <button className="danger" onClick={() => onVoid(sale.id)}>Void sale</button>
      </div>
    </Sheet>
  );
}

function ExpenseForm({ onSave }) {
  const [e, setE] = useState({ date: todayISO(), category: "Rent", amount: "", note: "" });
  const [err, setErr] = useState("");
  const set = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  return (
    <div className="form">
      <div className="split">
        <Field label="Date"><input type="date" value={e.date} onChange={set("date")} /></Field>
        <Field label="Category"><select value={e.category} onChange={set("category")}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Amount"><input inputMode="decimal" value={e.amount} onChange={set("amount")} placeholder="0.00" /></Field>
      <Field label="Note (optional)"><input value={e.note} onChange={set("note")} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (num(e.amount) > 0 ? onSave({ date: e.date, category: e.category, amount: num(e.amount), note: e.note.trim() }) : setErr("Enter an amount greater than zero."))}>Save expense</button>
    </div>
  );
}

function ProductForm({ product, onSave, onDelete }) {
  const [p, setP] = useState({ name: product?.name || "", cost: product ? String(product.cost) : "", price: product ? String(product.price) : "", qty: product ? String(product.qty) : "0", reorder: product ? String(product.reorder) : "5" });
  const [err, setErr] = useState("");
  const set = (k) => (ev) => setP({ ...p, [k]: ev.target.value });
  return (
    <div className="form">
      <Field label="Product name"><input value={p.name} onChange={set("name")} /></Field>
      <div className="split">
        <Field label="Cost per unit"><input inputMode="decimal" value={p.cost} onChange={set("cost")} /></Field>
        <Field label="Selling price"><input inputMode="decimal" value={p.price} onChange={set("price")} /></Field>
      </div>
      <div className="split">
        <Field label={product ? "Quantity in stock" : "Opening quantity"}><input inputMode="decimal" value={p.qty} onChange={set("qty")} /></Field>
        <Field label="Reorder at"><input inputMode="decimal" value={p.reorder} onChange={set("reorder")} /></Field>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (p.name.trim() ? onSave({ name: p.name.trim(), cost: num(p.cost), price: num(p.price), qty: num(p.qty), reorder: num(p.reorder) }) : setErr("Give the product a name."))}>Save product</button>
      {onDelete && <button className="danger" onClick={onDelete}>Delete product</button>}
    </div>
  );
}

function ReceiveForm({ db, money, onSave }) {
  const [pid, setPid] = useState(db.products[0]?.id || "");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(String(db.products[0]?.cost ?? ""));
  const [sid, setSid] = useState("");
  const [paid, setPaid] = useState("");
  const [err, setErr] = useState("");
  const total = num(qty) * num(cost);
  return (
    <div className="form">
      <Field label="Product"><select value={pid} onChange={(e) => { setPid(e.target.value); setCost(String(db.products.find((p) => p.id === e.target.value)?.cost ?? "")); }}>{db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <div className="split">
        <Field label="Quantity received"><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Cost per unit"><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      </div>
      <Field label="Supplier"><select value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Paid cash, no supplier account</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {sid && <Field label={`Paid now (total ${money(total)})`}><input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0.00" /></Field>}
      {sid && <p className="muted small">Anything unpaid is added to what you owe this supplier.</p>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (num(qty) > 0 && pid ? onSave({ pid, qty: num(qty), cost: num(cost), sid, paid: num(paid) }) : setErr("Enter the quantity received."))}>Add to stock</button>
    </div>
  );
}

function SupplierForm({ onSave }) {
  const [n, setN] = useState(""); const [ph, setPh] = useState("");
  return (
    <div className="form">
      <Field label="Supplier name"><input value={n} onChange={(e) => setN(e.target.value)} /></Field>
      <Field label="Phone or contact (optional)"><input value={ph} onChange={(e) => setPh(e.target.value)} /></Field>
      <button className="primary" onClick={() => n.trim() && onSave({ name: n.trim(), phone: ph.trim() })}>Save supplier</button>
    </div>
  );
}

function SupplierSheet({ supplier, db, money, onClose, onAdd, onDel }) {
  const [type, setType] = useState("paid");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!supplier) return null;
  const entries = db.ledger.filter((l) => l.sid === supplier.id);
  const bal = balanceOf(db.ledger, supplier.id);
  return (
    <Sheet title={supplier.name} onClose={onClose}>
      <div className="hero small-hero">
        <p className="muted small">Balance</p>
        <p className={"big " + (bal > 0.004 ? "neg" : bal < -0.004 ? "pos" : "")}>{bal > 0.004 ? `You owe ${money(bal)}` : bal < -0.004 ? `They owe you ${money(-bal)}` : "Settled"}</p>
      </div>
      <div className="form">
        <Field label="New entry"><select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(LEDGER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <p className="muted small">{LEDGER_TYPES[type].hint}</p>
        <div className="split">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Note" />
        </div>
        <button className="primary" onClick={() => { if (num(amount) > 0) { onAdd({ sid: supplier.id, date: todayISO(), type, amount: num(amount), note: note.trim() }); setAmount(""); setNote(""); } }}>Save entry</button>
      </div>
      {entries.length === 0 ? <Empty>No entries yet.</Empty> : (
        <div className="card list flat">{entries.map((l) => (
          <div className="row" key={l.id}>
            <span><b>{LEDGER_TYPES[l.type].label}</b><br /><span className="muted small">{fmtDay(l.date, { month: "short", day: "numeric" })}{l.note ? " · " + l.note : ""}</span></span>
            <span className="right"><b className={LEDGER_TYPES[l.type].sign > 0 ? "neg" : "pos"}>{money(l.amount)}</b><button className="link" onClick={() => onDel(l.id)}>Delete</button></span>
          </div>))}</div>
      )}
    </Sheet>
  );
}

function BackupCard({ db, onRestore }) {
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);
  const run = async (fn) => { try { setMsg(await fn()); } catch (e) { setMsg("That didn't work: " + (e && e.message ? e.message : e)); } };
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { setPending({ name: f.name, data: parseBackup(await f.text()) }); setMsg(""); } catch (err) { setMsg(err.message); }
  };
  return (
    <div className="card form">
      <p className="muted small">Your records are stored inside this app. Every change is also saved as a file in Documents/RetailLedger on your phone, so they survive clearing the browser or reinstalling.</p>
      <div className="split">
        <button className="primary" onClick={() => run(() => backupNow(db))}>Back up now</button>
        <button className="ghost" onClick={() => run(() => shareBackup(db))}>Send a copy</button>
      </div>
      <button className="ghost" onClick={() => fileRef.current && fileRef.current.click()}>Restore from file</button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={pick} />
      {pending && (
        <div className="card form">
          <p className="small">Replace everything in the app with <b>{pending.name}</b>? This can't be undone, so back up first if unsure.</p>
          <div className="split">
            <button className="danger" onClick={() => { onRestore(pending.data); setPending(null); }}>Replace my data</button>
            <button className="ghost" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}

/* ---------- reports ---------- */
function Reports({ db, money, copy }) {
  const [mode, setMode] = useState("month");
  const [sel, setSel] = useState(null);
  const { periods, map } = useMemo(() => {
    const m = {};
    const slot = (k) => (m[k] = m[k] || { sales: [], exp: [] });
    db.sales.forEach((s) => slot(keyFor(s.date, mode)).sales.push(s));
    db.expenses.forEach((e) => slot(keyFor(e.date, mode)).exp.push(e));
    slot(keyFor(todayISO(), mode));
    const ps = Object.keys(m).sort().reverse().map((k) => ({ k, ...summarize(m[k].sales, m[k].exp, db.settings.incomeTax) }));
    return { periods: ps, map: m };
  }, [db, mode]);
  const cur = keyFor(todayISO(), mode);
  const active = periods.find((p) => p.k === (sel || cur)) || periods[0];
  const chart = periods.slice(0, 12).reverse().map((p) => ({ name: shortFor(p.k, mode), profit: Math.round(p.net * 100) / 100 }));
  const csv = () => copy(["Period,Sales,Cost of goods,Expenses,Net profit,Sales tax collected,Est. income tax", ...periods.map((p) => [labelFor(p.k, mode), p.revenue, p.cogs, p.exp, p.net, p.tax, p.estTax].map((v) => (typeof v === "number" ? v.toFixed(2) : `"${v}"`)).join(","))].join("\n"));
  const modes = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Annual"]];
  return (
    <>
      <div className="seg" role="tablist">{modes.map(([k, l]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setSel(null); }}>{l}</button>)}</div>
      {active && (
        <div className="card">
          <h2 className="tight">{labelFor(active.k, mode)}</h2>
          <div className="row"><span>Sales (before tax)</span><span>{money(active.revenue)}</span></div>
          <div className="row"><span>Cost of goods sold</span><span>-{money(active.cogs).replace("-", "")}</span></div>
          <div className="row"><b>Gross profit</b><b>{money(active.gross)}</b></div>
          <div className="row"><span>Expenses</span><span>-{money(active.exp).replace("-", "")}</span></div>
          <div className="row"><b>Net profit</b><b className={active.net < 0 ? "neg" : "pos"}>{money(active.net)}</b></div>
          <div className="row"><span>Estimated income tax</span><span>{money(active.estTax)}</span></div>
          <div className="row"><b>Profit after tax</b><b>{money(active.after)}</b></div>
          <div className="row"><span>Sales tax collected (to remit)</span><span>{money(active.tax)}</span></div>
          <p className="muted small">{active.count} {active.count === 1 ? "sale" : "sales"} in this period. Estimates are for planning, so check them with your accountant.</p>
        </div>
      )}
      {chart.length > 0 && (
        <div className="card chart">
          <p className="muted small">Net profit, last {chart.length} periods</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="profit" radius={[3, 3, 0, 0]}>{chart.map((d, i) => <Cell key={i} fill={d.profit < 0 ? "var(--out)" : "var(--in)"} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="split between"><h2 className="tight">All periods</h2><button className="link" onClick={csv}>Copy as CSV</button></div>
      <div className="card list">
        {periods.map((p) => (
          <button className={"row tap col " + ((sel || cur) === p.k ? "sel" : "")} key={p.k} onClick={() => setSel(p.k)}>
            <span className="pl"><b>{labelFor(p.k, mode)}</b><b className={p.net < 0 ? "neg" : "pos"}>{money(p.net)}</b></span>
            <span className="pm small muted"><span>Sales {money(p.revenue)}</span><span>Cost {money(p.cogs)}</span><span>Expenses {money(p.exp)}</span></span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- styles ---------- */
const CSS = `
.app{--bg:#EEF1EE;--card:#fff;--ink:#17262B;--muted:#5E6E70;--line:#D5DCD8;--in:#0E7C66;--out:#B3412E;--pri:#17414A;--onpri:#fff;--warn:#FBE9E4;--ok:#DDF1EA;
 font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding-bottom:84px;max-width:560px;margin:0 auto;font-variant-numeric:tabular-nums;line-height:1.4}
@media (prefers-color-scheme:dark){.app{--bg:#0F1618;--card:#172125;--ink:#E6EEEC;--muted:#93A5A6;--line:#263338;--in:#3CC4A5;--out:#F08A74;--pri:#3CC4A5;--onpri:#0F1618;--warn:#3A211C;--ok:#16332B}}
.app *{box-sizing:border-box}
.top{display:flex;align-items:baseline;justify-content:space-between;padding:calc(18px + env(safe-area-inset-top)) 16px 6px}
.top h1{font-size:22px;margin:0;font-weight:700;letter-spacing:-.01em}
main{padding:8px 16px;display:flex;flex-direction:column;gap:12px}
h2{font-size:16px;margin:10px 0 0;font-weight:650}h2.tight{margin:0 0 6px}h3{margin:0;font-size:18px}
p{margin:0}.muted{color:var(--muted)}.small{font-size:13px}.pos{color:var(--in)}.neg{color:var(--out)}
.hero{padding:16px 4px 4px}.small-hero{padding:0 0 8px}
.big{font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1.1}.small-hero .big{font-size:26px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.card.list{padding:0;overflow:hidden}.card.flat{border-radius:10px}
.amt{font-size:20px;font-weight:650;margin-top:2px}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);color:inherit;font:inherit}
.card:not(.list) > .row{padding:7px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.right{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.tap{cursor:pointer}.tap:hover{background:color-mix(in srgb,var(--ink) 5%,transparent)}.tap:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.row.col{flex-direction:column;align-items:stretch;gap:2px}.row.sel{background:color-mix(in srgb,var(--pri) 10%,transparent)}
.pl{display:flex;justify-content:space-between}.pm{display:flex;gap:12px;flex-wrap:wrap}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--line);white-space:nowrap}.badge.warn{background:var(--warn);color:var(--out)}.badge.ok{background:var(--ok);color:var(--in)}
.empty{padding:18px 8px;color:var(--muted);text-align:center}
button{font:inherit;cursor:pointer}
.primary,.ghost,.danger{border-radius:10px;padding:12px 16px;font-weight:600;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.primary{background:var(--pri);color:var(--onpri)}.ghost{background:transparent;border-color:var(--line);color:var(--ink)}.ghost:disabled{opacity:.45}
.danger{background:transparent;border-color:var(--out);color:var(--out)}
.wide{width:100%}.link{background:none;border:0;color:var(--muted);font-size:13px;text-decoration:underline;padding:0}
.ico{background:none;border:0;color:var(--ink);padding:6px;border-radius:8px;display:inline-flex}
.split{display:flex;gap:10px}.split>*{flex:1;min-width:0}.split.between{justify-content:space-between;align-items:center}.split.between>*{flex:none}
.form{display:flex;flex-direction:column;gap:10px}
.fld{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
input,select{font:inherit;font-size:16px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:10px 11px;width:100%;min-width:0}
.line{display:grid;grid-template-columns:1fr 64px 84px auto;gap:6px;align-items:center}
.chk{display:flex;gap:8px;align-items:center;font-size:15px}.chk input{width:auto}
.sum{border-top:1px solid var(--line);padding-top:4px}.sum .row{padding:5px 0;border:0}
.err{color:var(--out);font-size:14px}
.seg{display:grid;grid-template-columns:repeat(4,1fr);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:3px;gap:3px}
.seg button{border:0;background:none;color:var(--muted);padding:8px 0;border-radius:7px;font-weight:600}.seg .on{background:var(--pri);color:var(--onpri)}
.chart{color:var(--muted)}
.nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:560px;display:grid;grid-template-columns:repeat(6,1fr);background:var(--card);border-top:1px solid var(--line);padding:6px 2px calc(6px + env(safe-area-inset-bottom))}
.nav button{background:none;border:0;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;padding:4px 0}.nav .on{color:var(--pri);font-weight:700}
.ov{position:fixed;inset:0;background:rgba(10,20,22,.5);display:flex;align-items:flex-end;justify-content:center;z-index:20}
.sheet{background:var(--bg);color:var(--ink);width:100%;max-width:560px;max-height:90vh;overflow:auto;border-radius:18px 18px 0 0;padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px}
.sh-h{display:flex;justify-content:space-between;align-items:center}
.toast{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:99px;font-size:14px;z-index:30}
@media (prefers-reduced-motion:no-preference){.sheet{animation:up .18s ease-out}@keyframes up{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}}
`;
