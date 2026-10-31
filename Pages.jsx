import { useState } from "react";
import { Package, Users, Wallet, Truck, Receipt, StickyNote, Plus, Search, Settings, ShieldCheck, ChevronRight, Trash2, Share2, AlertTriangle } from "lucide-react";
import { Sheet, Field, Empty, Chip, Chips, Badge, Avatar } from "./ui";
import { PayForm } from "./Forms";
import { LEDGER_TYPES, calcSale, owedBy, supplierBalance, groupItems, lineDetail, BUSINESS_TYPES, fmtDay, todayISO, addDays, weekStart, trimNum, num } from "./logic";

export { LEDGER_TYPES };
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
const Search_ = ({ value, onChange, placeholder }) => <div className="search"><Search size={18} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>;

/* ---------- home: nothing here shows money figures ---------- */
export function HomePage({ db, openSell, goTab, goView }) {
  const low = db.products.filter((p) => p.qty <= p.reorder).length;
  const hasData = db.sales.length > 0 || db.products.length > 0;
  const ls = db.settings.lastShared;
  const stale = hasData && (!ls || daysSince(ls) >= 7);
  const tiles = [
    ["Products", Package, "#0F766E", () => goTab("products")], ["Customers", Users, "#2563EB", () => goTab("customers")],
    ["Expenses", Wallet, "#D97706", () => goView("expenses")], ["Suppliers", Truck, "#7C3AED", () => goView("suppliers")],
    ["Receipts", Receipt, "#0891B2", () => goTab("sales")], ["Notes", StickyNote, "#DB2777", () => goView("notes")],
  ];
  return (
    <>
      <button className="hero" onClick={openSell}>
        <span className="hb"><Plus size={30} /></span>
        <span><b>New sale</b><span>Tap products, charge, share the receipt</span></span>
      </button>
      {low > 0 && <button className="nudge warn" onClick={() => goTab("products", "low")}><AlertTriangle size={18} /> {low} {low === 1 ? "product is" : "products are"} running low</button>}
      {stale && <button className="nudge" onClick={() => goView("backup")}><ShieldCheck size={18} /> {ls ? `Last copy sent off this phone: ${daysSince(ls)} days ago` : "You haven't sent a backup copy off this phone yet"}. Tap to back up.</button>}
      <div className="tiles">
        {tiles.map(([n, Icon, c, fn]) => <button key={n} className="tile" style={{ "--t": c }} onClick={fn}><i><Icon size={24} /></i>{n}</button>)}
      </div>
      {!db.products.length && <Empty>Start by adding your products under Products, then record your first sale.</Empty>}
    </>
  );
}

/* ---------- sales ---------- */
export function SalesPage({ db, money, openSheet, openSell }) {
  const [f, setF] = useState("today");
  const [q, setQ] = useState("");
  const today = todayISO();
  const ok = (s) => f === "all" || (f === "today" && s.date === today) || (f === "yest" && s.date === addDays(today, -1)) || (f === "week" && weekStart(s.date) === weekStart(today)) || (f === "month" && s.date.slice(0, 7) === today.slice(0, 7));
  const list = db.sales.filter(ok).filter((s) => !q.trim() || (s.no + " " + (s.customerName || "")).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <button className="primary big-btn wide" onClick={openSell}><Plus size={18} /> New sale</button>
      <Chips>{[["today", "Today"], ["yest", "Yesterday"], ["week", "This week"], ["month", "This month"], ["all", "All"]].map(([k, l]) => <Chip key={k} on={f === k} onClick={() => setF(k)}>{l}</Chip>)}</Chips>
      <Search_ value={q} onChange={setQ} placeholder="Search receipts or customers" />
      <p className="muted small">{list.length} {list.length === 1 ? "sale" : "sales"}</p>
      {list.length === 0 ? <Empty>No sales here yet.</Empty> : (
        <div className="card list">{list.map((s) => { const c = calcSale(s); return (
          <button className="row tap" key={s.id} onClick={() => openSheet({ t: "receipt", id: s.id })}>
            <span><b>{s.no}</b><br /><span className="muted small">{s.customerName || "Walk-in"} · {fmtDay(s.date, { month: "short", day: "numeric" })} {s.time}</span></span>
            <span className="right"><b>{money(c.total)}</b>{c.due > 0.004 ? <Badge kind="warn">Owes {money(c.due)}</Badge> : <Badge kind="ok">Paid</Badge>}</span>
          </button>); })}</div>
      )}
    </>
  );
}

export function ReceiptSheet({ sale, money, onClose, A, openSheet }) {
  const [amt, setAmt] = useState("");
  const [method, setMethod] = useState("Cash");
  const [confirm, setConfirm] = useState(false);
  if (!sale) return null;
  const c = calcSale(sale);
  return (
    <Sheet title={sale.no} onClose={onClose}>
      <p className="muted small">{fmtDay(sale.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} {sale.time} · {sale.customerName || "Walk-in"} · {sale.method}</p>
      <div className="card list flat">
        {groupItems(sale).map((g) => <div className="row" key={g.pid}><span>{g.name}<br /><span className="muted small">{lineDetail(g, money)}</span></span><span>{money(g.amount)}</span></div>)}
        {c.disc > 0 && <div className="row"><span>Discount</span><span>-{money(c.disc)}</span></div>}
        {c.tax > 0 && <div className="row"><span>Tax ({sale.taxRate}%)</span><span>{money(c.tax)}</span></div>}
        {c.other > 0 && <div className="row"><span>Other</span><span>{money(c.other)}</span></div>}
        <div className="row"><b>Total</b><b>{money(c.total)}</b></div>
        <div className="row"><span>Paid</span><span>{money(c.paid + c.refunded)}</span></div>
        {c.refunded > 0.004 && <div className="row"><span>Refunded</span><span>-{money(c.refunded)}</span></div>}
        {c.due > 0.004 && <div className="row"><b className="neg">Balance due</b><b className="neg">{money(c.due)}</b></div>}
      </div>
      {c.due > 0.004 && (
        <div className="card form">
          <Field label="Payment received"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={String(c.due)} /></Field>
          <Chips>{["Cash", "Mobile", "Bank"].map((m) => <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{m}</Chip>)}</Chips>
          <div className="split">
            <button className="ghost" onClick={() => { if (num(amt) > 0) { A.paySale(sale.id, Math.min(num(amt), c.due), method); setAmt(""); } }}>Record payment</button>
            <button className="ghost" onClick={() => A.paySale(sale.id, c.due, method)}>Mark paid in full</button>
          </div>
        </div>
      )}
      <button className="primary big-btn" onClick={() => openSheet({ t: "share", sale })}><Share2 size={18} /> Share receipt</button>
      {groupItems(sale).some((g) => g.parts.some((p) => p.orig - p.returned > 0)) && <button className="ghost" onClick={() => openSheet({ t: "return", id: sale.id })}>Return items</button>}
      {!confirm ? <button className="danger" onClick={() => setConfirm(true)}>Void this sale</button> : (
        <div className="card form"><p className="small">Voiding removes the sale and puts the stock back. Continue?</p><div className="split"><button className="danger" onClick={() => A.voidSale(sale.id)}>Yes, void it</button><button className="ghost" onClick={() => setConfirm(false)}>Keep it</button></div></div>
      )}
    </Sheet>
  );
}

export function ShareSheet({ sale, A, onClose }) {
  const [busy, setBusy] = useState("");
  const opts = [["png", "Image (best for WhatsApp)"], ["pdf-small", "PDF · small receipt"], ["pdf-a4", "PDF · A4 invoice"], ["text", "Text message"]];
  const go = async (k) => { setBusy(k); await A.shareReceipt(k, sale); setBusy(""); };
  return (
    <Sheet title="Share receipt" onClose={onClose}>
      <div className="card list">
        {opts.map(([k, l]) => <button key={k} className="row tap" disabled={!!busy} onClick={() => go(k)}><span>{l}</span>{busy === k ? <span className="muted small">Preparing…</span> : <ChevronRight size={18} />}</button>)}
      </div>
      <p className="muted small">PDFs use letters and numbers only. For other alphabets or currency symbols, use the image.</p>
    </Sheet>
  );
}

/* ---------- products ---------- */
export function ProductsPage({ db, money, openSheet, startFilter }) {
  const [q, setQ] = useState("");
  const [low, setLow] = useState(startFilter === "low");
  const [catF, setCatF] = useState("");
  const cats = [...new Set(db.products.map((p) => p.cat).filter(Boolean))];
  const list = db.products.filter((p) => (!low || p.qty <= p.reorder) && (!catF || p.cat === catF) && (p.name + " " + (p.cat || "")).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="split">
        <button className="primary" onClick={() => openSheet({ t: "product" })}><Plus size={18} /> New product</button>
        <button className="ghost" disabled={!db.products.length} onClick={() => openSheet({ t: "receive" })}>Receive stock</button>
      </div>
      <Search_ value={q} onChange={setQ} placeholder="Search products" />
      <Chips><Chip on={!low} onClick={() => setLow(false)}>All ({db.products.length})</Chip><Chip on={low} onClick={() => setLow(true)}>Running low</Chip></Chips>
      {cats.length > 0 && <Chips><Chip on={!catF} onClick={() => setCatF("")}>Any category</Chip>{cats.map((c) => <Chip key={c} on={catF === c} onClick={() => setCatF(c)}>{c}</Chip>)}</Chips>}
      {list.length === 0 ? <Empty>{db.products.length ? "No products match." : "No products yet. Add what you sell, with its cost and prices."}</Empty> : (
        <div className="card list">{list.map((p) => (
          <button className="row tap" key={p.id} onClick={() => openSheet({ t: "product", id: p.id })}>
            <span className="lead"><Avatar p={p} /><span><b>{p.name}</b><br /><span className="muted small">{money(p.units[0].price)} per {p.units[0].name}{p.units.length > 1 ? ` · ${p.units.length - 1} more ${p.units.length === 2 ? "unit" : "units"}` : ""}</span></span></span>
            <span className="right"><b className={p.qty <= p.reorder ? "neg" : ""}>{trimNum(p.qty)}</b><span className="muted small">{p.units[0].name}</span></span>
          </button>))}</div>
      )}
    </>
  );
}

/* ---------- customers ---------- */
export function CustomersPage({ db, money, openSheet }) {
  const [q, setQ] = useState("");
  const list = db.customers.filter((c) => (c.name + " " + (c.phone || "")).toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <button className="primary big-btn wide" onClick={() => openSheet({ t: "customer" })}><Plus size={18} /> Add customer</button>
      <Search_ value={q} onChange={setQ} placeholder="Search customers" />
      {list.length === 0 ? <Empty>{db.customers.length ? "No customers match." : "No customers yet. Add one here, or while recording a sale."}</Empty> : (
        <div className="card list">{list.map((c) => { const owed = owedBy(db.sales, c.id); return (
          <button className="row tap" key={c.id} onClick={() => openSheet({ t: "cust", id: c.id })}>
            <span><b>{c.name}</b><br /><span className="muted small">{c.phone || "No phone"}</span></span>
            {owed > 0.004 ? <Badge kind="warn">Owes {money(owed)}</Badge> : (c.deposit || 0) > 0.004 ? <Badge kind="ok">Deposit {money(c.deposit)}</Badge> : <Badge>Settled</Badge>}
          </button>); })}</div>
      )}
    </>
  );
}

export function CustomerSheet({ cust, db, money, A, onClose, openSheet }) {
  const [paying, setPaying] = useState(false);
  if (!cust) return null;
  const owed = owedBy(db.sales, cust.id);
  const sales = db.sales.filter((s) => s.cid === cust.id);
  const pays = db.custLedger.filter((l) => l.cid === cust.id);
  return (
    <Sheet title={cust.name} onClose={onClose}>
      <div className="grid2">
        <div className="card"><p className="muted small">Owes you</p><p className={"amt " + (owed > 0.004 ? "neg" : "")}>{money(owed)}</p></div>
        <div className="card"><p className="muted small">Deposit held</p><p className="amt">{money(cust.deposit || 0)}</p></div>
      </div>
      {cust.phone && <p className="muted small">Phone {cust.phone}</p>}
      {paying ? <div className="card"><PayForm owed={owed} deposit={cust.deposit || 0} money={money} onSave={(p) => { A.receivePayment(cust.id, p); setPaying(false); }} /></div> : (
        <div className="split"><button className="primary" onClick={() => setPaying(true)}>Receive payment</button><button className="ghost" disabled={owed <= 0.004} onClick={() => A.remind(cust, owed)}>Send reminder</button></div>
      )}
      <button className="ghost" onClick={() => openSheet({ t: "customer", id: cust.id })}>Edit details</button>
      <h2>Sales</h2>
      {sales.length === 0 ? <Empty>No sales yet.</Empty> : <div className="card list flat">{sales.map((s) => { const c = calcSale(s); return (
        <button className="row tap" key={s.id} onClick={() => openSheet({ t: "receipt", id: s.id })}><span><b>{s.no}</b><br /><span className="muted small">{fmtDay(s.date, { month: "short", day: "numeric" })}</span></span><span className="right"><b>{money(c.total)}</b>{c.due > 0.004 ? <Badge kind="warn">Owes {money(c.due)}</Badge> : <Badge kind="ok">Paid</Badge>}</span></button>); })}</div>}
      {pays.length > 0 && <><h2>Payments received</h2><div className="card list flat">{pays.map((l) => <div className="row" key={l.id}><span>{fmtDay(l.date, { month: "short", day: "numeric" })} · {l.method}<br /><span className="muted small">{l.note}</span></span><b className="pos">{money(l.amount)}</b></div>)}</div></>}
    </Sheet>
  );
}

/* ---------- more ---------- */
export function MorePage({ goView }) {
  const items = [
    ["expenses", "Expenses", Wallet], ["suppliers", "Suppliers and what you owe", Truck], ["notes", "Notes and tasks", StickyNote],
    ["settings", "Settings", Settings], ["backup", "Backup and restore", ShieldCheck],
  ];
  return <div className="card list">{items.map(([k, l, Icon]) => <button key={k} className="row tap" onClick={() => goView(k)}><span className="lead"><Icon size={20} /> {l}</span><ChevronRight size={18} /></button>)}</div>;
}

/* ---------- expenses ---------- */
export function ExpensesPage({ db, money, A, openSheet }) {
  return (
    <>
      <button className="primary big-btn wide" onClick={() => openSheet({ t: "expense" })}><Plus size={18} /> Add expense</button>
      {db.expenses.length === 0 ? <Empty>No expenses yet. Record rent, wages, utilities and anything else you pay to run the shop.</Empty> : (
        <div className="card list">{db.expenses.map((e) => (
          <div className="row" key={e.id}>
            <span><b>{e.category}</b><br /><span className="muted small">{fmtDay(e.date, { month: "short", day: "numeric" })}{e.note ? " · " + e.note : ""}</span></span>
            <span className="right"><b>{money(e.amount)}</b><button className="link" onClick={() => A.delExpense(e.id)}>Delete</button></span>
          </div>))}</div>
      )}
    </>
  );
}

/* ---------- suppliers ---------- */
export function SuppliersPage({ db, money, openSheet }) {
  const list = db.suppliers.map((s) => ({ ...s, bal: supplierBalance(db.ledger, s.id, LEDGER_TYPES) }));
  return (
    <>
      <button className="primary big-btn wide" onClick={() => openSheet({ t: "supplier" })}><Plus size={18} /> Add supplier</button>
      {list.length === 0 ? <Empty>No suppliers yet. Add one to track what you owe them or what they owe you.</Empty> : (
        <div className="card list">{list.map((s) => (
          <button className="row tap" key={s.id} onClick={() => openSheet({ t: "sup", id: s.id })}>
            <span><b>{s.name}</b><br /><span className="muted small">{s.phone}</span></span>
            {s.bal > 0.004 ? <Badge kind="warn">You owe {money(s.bal)}</Badge> : s.bal < -0.004 ? <Badge kind="ok">Owes you {money(-s.bal)}</Badge> : <Badge>Settled</Badge>}
          </button>))}</div>
      )}
    </>
  );
}

export function SupplierSheet({ supplier, db, money, onClose, A }) {
  const [type, setType] = useState("paid");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!supplier) return null;
  const entries = db.ledger.filter((l) => l.sid === supplier.id);
  const bal = supplierBalance(db.ledger, supplier.id, LEDGER_TYPES);
  return (
    <Sheet title={supplier.name} onClose={onClose}>
      <div className="card"><p className="muted small">Balance</p><p className={"amt " + (bal > 0.004 ? "neg" : bal < -0.004 ? "pos" : "")}>{bal > 0.004 ? `You owe ${money(bal)}` : bal < -0.004 ? `They owe you ${money(-bal)}` : "Settled"}</p></div>
      <div className="form">
        <Field label="New entry"><select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(LEDGER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <p className="muted small">{LEDGER_TYPES[type].hint}</p>
        <div className="split"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount" /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Note" /></div>
        <button className="primary" onClick={() => { if (num(amount) > 0) { A.addLedger({ sid: supplier.id, date: todayISO(), type, amount: num(amount), note: note.trim() }); setAmount(""); setNote(""); } }}>Save entry</button>
      </div>
      {entries.length === 0 ? <Empty>No entries yet.</Empty> : (
        <div className="card list flat">{entries.map((l) => (
          <div className="row" key={l.id}>
            <span><b>{LEDGER_TYPES[l.type].label}</b><br /><span className="muted small">{fmtDay(l.date, { month: "short", day: "numeric" })}{l.note ? " · " + l.note : ""}</span></span>
            <span className="right"><b className={LEDGER_TYPES[l.type].sign > 0 ? "neg" : "pos"}>{money(l.amount)}</b><button className="link" onClick={() => A.delLedger(l.id)}>Delete</button></span>
          </div>))}</div>
      )}
    </Sheet>
  );
}

/* ---------- notes ---------- */
export function NotesPage({ db, A, openSheet }) {
  return (
    <>
      <button className="primary big-btn wide" onClick={() => openSheet({ t: "note" })}><Plus size={18} /> Add note or task</button>
      {db.notes.length === 0 ? <Empty>No notes yet. Use them for reminders like "call the supplier" or prices to check.</Empty> : (
        <div className="card list">{db.notes.map((n) => (
          <div className="row" key={n.id}>
            <span className="lead">{n.task && <input type="checkbox" style={{ width: "auto" }} checked={!!n.done} onChange={() => A.toggleNote(n.id)} aria-label="Done" />}<span style={n.done ? { textDecoration: "line-through", opacity: 0.6 } : null}>{n.text}<br /><span className="muted small">{fmtDay(n.date, { month: "short", day: "numeric" })}</span></span></span>
            <button className="ico" onClick={() => A.delNote(n.id)} aria-label="Delete note"><Trash2 size={18} /></button>
          </div>))}</div>
      )}
    </>
  );
}

/* ---------- categories ---------- */
export function CategoriesSheet({ db, A, onClose }) {
  const cats = db.settings.categories || [];
  const [name, setName] = useState("");
  const [edit, setEdit] = useState(null);
  const [val, setVal] = useState("");
  const count = (c) => db.products.filter((p) => p.cat === c).length;
  const type = BUSINESS_TYPES[db.settings.bizType];
  const sugg = type ? type.cats.filter((c) => !cats.includes(c)) : [];
  return (
    <Sheet title="Categories" onClose={onClose}>
      <div className="split">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="New category" onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { A.addCategory(name.trim()); setName(""); } }} />
        <button className="primary" style={{ flex: "none" }} onClick={() => { if (name.trim()) { A.addCategory(name.trim()); setName(""); } }}>Add</button>
      </div>
      {cats.length === 0 ? <Empty>No categories yet. Add your own{sugg.length ? " or use the suggestions below" : ""}.</Empty> : (
        <div className="card list">{cats.map((c) => (
          <div className="row" key={c}>
            {edit === c ? (
              <>
                <input value={val} onChange={(e) => setVal(e.target.value)} aria-label={`Rename ${c}`} />
                <button className="ghost" style={{ flex: "none" }} onClick={() => { if (val.trim()) A.renameCategory(c, val.trim()); setEdit(null); }}>Save</button>
              </>
            ) : (
              <>
                <span><b>{c}</b><br /><span className="muted small">{count(c)} {count(c) === 1 ? "product" : "products"}</span></span>
                <span className="split" style={{ flex: "none", gap: 14 }}>
                  <button className="link" onClick={() => { setEdit(c); setVal(c); }}>Rename</button>
                  <button className="link" onClick={() => A.deleteCategory(c)}>Delete</button>
                </span>
              </>
            )}
          </div>))}</div>
      )}
      {sugg.length > 0 && (
        <>
          <h2>Suggested for {type.label}</h2>
          <Chips>{sugg.map((c) => <Chip key={c} onClick={() => A.addCategory(c)}>+ {c}</Chip>)}</Chips>
        </>
      )}
      <p className="muted small">Renaming updates every product in it. Deleting moves its products to "no category".</p>
    </Sheet>
  );
}
