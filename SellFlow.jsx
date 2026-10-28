import { useState, useMemo } from "react";
import { Search, Plus, Minus, Trash2, CheckCircle2, Share2 } from "lucide-react";
import { Sheet, Field, Empty, Chip, Chips, Avatar } from "./ui";
import { uid, num, r2, todayISO, nowTime, trimNum, calcSale, fmtDay } from "./logic";

const METHODS = ["Cash", "Mobile", "Bank", "Mixed"];

export default function SellFlow({ db, money, onSave, onClose, onShare, onThanks, onAddProduct }) {
  const { products, customers, settings } = db;
  const [step, setStep] = useState("pick");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState([]);
  const [custId, setCustId] = useState("");
  const [newCust, setNewCust] = useState(null);
  const [more, setMore] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [disc, setDisc] = useState("");
  const [taxPct, setTaxPct] = useState(String(settings.saleTax || 0));
  const [other, setOther] = useState("");
  const [method, setMethod] = useState("Cash");
  const [paidStr, setPaidStr] = useState("");
  const [useDep, setUseDep] = useState(true);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(null);
  const [change, setChange] = useState(0);

  const popular = useMemo(() => {
    const m = {};
    db.sales.forEach((s) => s.items.forEach((i) => { m[i.pid] = (m[i.pid] || 0) + i.qty * (i.pcs || 1); }));
    return m;
  }, [db.sales]);
  const list = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (popular[b.id] || 0) - (popular[a.id] || 0) || a.name.localeCompare(b.name)),
    [products, q, popular]
  );

  const getP = (id) => products.find((p) => p.id === id);
  const rows = lines.map((l) => { const p = getP(l.pid); const unit = p ? p.units.find((u) => u.id === l.unitId) || p.units[0] : null; return { l, p, unit }; }).filter((r) => r.p);
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (p) => {
    const baseId = p.units[0].id;
    const ex = lines.find((l) => l.pid === p.id && l.unitId === baseId);
    if (ex) setLine(ex.key, { qty: trimNum(num(ex.qty) + 1) });
    else setLines((ls) => [...ls, { key: uid(), pid: p.id, unitId: baseId, qty: "1", price: String(p.units[0].price) }]);
  };
  const changeUnit = (key, p, unitId) => { const u = p.units.find((x) => x.id === unitId) || p.units[0]; setLine(key, { unitId: u.id, price: String(u.price) }); };

  const sub = rows.reduce((a, r) => a + num(r.l.qty) * num(r.l.price), 0);
  const discount = Math.min(num(disc), sub);
  const base = sub - discount;
  const tax = (base * num(taxPct)) / 100;
  const total = r2(base + tax + num(other));
  const cust = customers.find((c) => c.id === custId);
  const dep = cust ? cust.deposit || 0 : 0;
  const depUse = useDep && dep > 0 ? Math.min(dep, total) : 0;
  const remaining = r2(total - depUse);
  const received = paidStr === "" ? remaining : num(paidStr);
  const paid = r2(depUse + Math.min(received, remaining));
  const dueAmt = r2(total - paid);
  const changeAmt = Math.max(0, r2(received - remaining));
  const use = {};
  rows.forEach((r) => { use[r.p.id] = (use[r.p.id] || 0) + num(r.l.qty) * r.unit.pcs; });
  const over = rows.find((r) => use[r.p.id] > r.p.qty + 1e-9);

  const save = () => {
    if (!rows.length) return setErr("Add at least one item.");
    for (const r of rows) if (!(num(r.l.qty) > 0)) return setErr(`Enter a quantity for ${r.p.name}.`);
    if (over) return setErr(`Only ${trimNum(over.p.qty)} ${over.p.units[0].name} of ${over.p.name} in stock.`);
    const newName = newCust ? newCust.name.trim() : "";
    if (dueAmt > 0.004 && !cust && !newName) return setErr("Choose or add a customer so you can track what they owe.");
    const items = rows.map(({ l, p, unit }) => ({ pid: p.id, name: p.name, unit: unit.name, pcs: unit.pcs, qty: num(l.qty), price: num(l.price), show: unit.show || unit.price, cost: p.cost }));
    const sale = onSave({
      date, time: nowTime(), cid: cust ? cust.id : "", customerName: cust ? cust.name : newName,
      newCustomer: newName ? { name: newName, phone: (newCust.phone || "").trim() } : null,
      items, discount: r2(discount), other: num(other), taxRate: num(taxPct), method, paid, fromDeposit: depUse,
    });
    setChange(changeAmt); setSaved(sale); setStep("done"); setErr("");
  };
  const reset = () => {
    setLines([]); setStep("pick"); setSaved(null); setPaidStr(""); setDisc(""); setOther(""); setCustId(""); setNewCust(null);
    setMore(false); setMethod("Cash"); setErr(""); setUseDep(true); setDate(todayISO()); setQ("");
  };

  if (step === "done" && saved) {
    const c = calcSale(saved);
    return (
      <Sheet title="Sale completed" onClose={onClose} full>
        <div className="done">
          <div className="ok"><CheckCircle2 size={44} /></div>
          <p className="muted">{saved.no} · {fmtDay(saved.date, { month: "short", day: "numeric", year: "numeric" })} {saved.time}</p>
          <p className="tot">{money(c.total)}</p>
          {c.due > 0.004 ? <p className="neg"><b>Balance due {money(c.due)}</b> from {saved.customerName}</p> : <p className="pos"><b>Paid in full</b></p>}
          {change > 0.004 && <p><b>Change to give: {money(change)}</b></p>}
        </div>
        <button className="primary big-btn" onClick={() => onShare(saved)}><Share2 size={18} /> Share receipt</button>
        <button className="ghost" onClick={onThanks}>Send a thank-you card</button>
        <div className="split"><button className="primary" onClick={reset}><Plus size={18} /> New sale</button><button className="ghost" onClick={onClose}>Go home</button></div>
      </Sheet>
    );
  }

  if (step === "cart") {
    return (
      <Sheet title="Review sale" onClose={() => setStep("pick")} back full>
        <div className="card list">
          {rows.map(({ l, p, unit }) => (
            <div className="line" key={l.key}>
              <div className="split between"><b>{p.name}</b><button className="ico" aria-label={"Remove " + p.name} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={18} /></button></div>
              <select value={unit.id} onChange={(e) => changeUnit(l.key, p, e.target.value)} aria-label="Unit">
                {p.units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.pcs !== 1 ? ` (${trimNum(u.pcs)} ${p.units[0].name})` : ""} · {money(u.price)}</option>)}
              </select>
              <div className="split between">
                <div className="step">
                  <button aria-label="Less" onClick={() => setLine(l.key, { qty: trimNum(Math.max(0, num(l.qty) - 1)) })}><Minus size={16} /></button>
                  <input inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Quantity" />
                  <button aria-label="More" onClick={() => setLine(l.key, { qty: trimNum(num(l.qty) + 1) })}><Plus size={16} /></button>
                </div>
                <Field label="Selling price"><input inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} /></Field>
              </div>
              <div className="split between"><span className="muted small">Showing price {money(unit.show || unit.price)}</span><b>{money(num(l.qty) * num(l.price))}</b></div>
            </div>
          ))}
        </div>
        <button className="ghost" onClick={() => setStep("pick")}><Plus size={16} /> Add more items</button>

        <div className="card form">
          <Field label="Customer (optional)">
            <select value={custId} onChange={(e) => { setCustId(e.target.value); setNewCust(null); }}>
              <option value="">Walk-in customer</option>
              {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {!newCust ? <button className="link" onClick={() => { setNewCust({ name: "", phone: "" }); setCustId(""); }}>+ New customer</button> : (
            <div className="split">
              <input placeholder="Name" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} aria-label="New customer name" />
              <input placeholder="Phone" inputMode="tel" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} aria-label="New customer phone" />
            </div>
          )}
          <button className="link" onClick={() => setMore(!more)}>{more ? "Hide" : "Add"} discount, tax, other charges, date</button>
          {more && (
            <>
              <div className="split">
                <Field label="Discount"><input inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" /></Field>
                <Field label="Tax %"><input inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} /></Field>
                <Field label="Other"><input inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" /></Field>
              </div>
              <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </>
          )}
        </div>

        <div className="card form">
          <div className="sum">
            <div className="row"><span>Items</span><span>{money(sub)}</span></div>
            {discount > 0 && <div className="row"><span>Discount</span><span>-{money(discount)}</span></div>}
            {tax > 0 && <div className="row"><span>Tax ({taxPct}%)</span><span>{money(tax)}</span></div>}
            {num(other) > 0 && <div className="row"><span>Other</span><span>{money(num(other))}</span></div>}
            <div className="row"><b>Total</b><b>{money(total)}</b></div>
          </div>
          <Chips>{METHODS.map((m) => <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{m}</Chip>)}</Chips>
          {dep > 0 && <label className="chk" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={useDep} onChange={(e) => setUseDep(e.target.checked)} /> Use customer deposit ({money(dep)})</label>}
          {remaining > 0.004 && (
            <>
              <Field label="Amount paid"><input inputMode="decimal" value={paidStr} onChange={(e) => setPaidStr(e.target.value)} placeholder={String(remaining)} /></Field>
              <Chips><Chip on={paidStr === ""} onClick={() => setPaidStr("")}>Exact amount</Chip><Chip on={paidStr === "0"} onClick={() => setPaidStr("0")}>Pay later</Chip></Chips>
            </>
          )}
          {changeAmt > 0.004 && <p><b>Change to give: {money(changeAmt)}</b></p>}
          {dueAmt > 0.004 && <p className="neg"><b>Customer will owe {money(dueAmt)}</b></p>}
          {over && <p className="err">Only {trimNum(over.p.qty)} {over.p.units[0].name} of {over.p.name} in stock.</p>}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="primary big-btn" onClick={save} disabled={!rows.length}>Charge {money(total)}</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="New sale" onClose={onClose} full>
      {!products.length ? (
        <>
          <Empty>Add your products first, then you can sell them here.</Empty>
          <button className="primary" onClick={onAddProduct}>Add a product</button>
        </>
      ) : (
        <>
          <div className="search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" /></div>
          <div className="pgrid">
            {list.map((p) => {
              const inCart = lines.filter((l) => l.pid === p.id).reduce((a, l) => a + num(l.qty), 0);
              return (
                <button key={p.id} className="pcard" disabled={p.qty <= 0} onClick={() => add(p)}>
                  {inCart > 0 && <span className="qty">{trimNum(inCart)}</span>}
                  <Avatar p={p} size={56} />
                  <span className="nm">{p.name}</span>
                  <span className="pr">{money(p.units[0].price)}</span>
                  <span className={"small " + (p.qty <= p.reorder ? "neg" : "muted")}>{p.qty <= 0 ? "Out of stock" : `${trimNum(p.qty)} ${p.units[0].name} left`}</span>
                </button>
              );
            })}
          </div>
          {!list.length && <Empty>No products match.</Empty>}
          {rows.length > 0 && <button className="primary big-btn wide cartbar" onClick={() => setStep("cart")}>Review sale · {rows.length} {rows.length === 1 ? "item" : "items"} · {money(sub)}</button>}
        </>
      )}
    </Sheet>
  );
}
