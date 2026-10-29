import { useState, useMemo, useEffect } from "react";
import { Search, Plus, Minus, Trash2, CheckCircle2, Share2 } from "lucide-react";
import { Sheet, Field, Empty, Chip, Chips, Avatar } from "./ui";
import { uid, num, r2, todayISO, nowTime, trimNum, calcSale, fmtDay, partsText, bestPack } from "./logic";

const METHODS = ["Cash", "Mobile", "Bank", "Mixed"];
const unitLabel = (u) => u.name + (u.pcs !== 1 ? ` (${trimNum(u.pcs)})` : "");

export default function SellFlow({ db, money, onSave, onClose, onShare, onThanks, onAddProduct, registerBack }) {
  const { products, customers, settings } = db;
  const [step, setStep] = useState("pick");
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState("");
  const [draft, setDraft] = useState({});
  const [cart, setCart] = useState([]);
  const [custId, setCustId] = useState("");
  const [newCust, setNewCust] = useState(null);
  const [more, setMore] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [disc, setDisc] = useState("");
  const [discMode, setDiscMode] = useState("amount");
  const [taxPct, setTaxPct] = useState(String(settings.saleTax || 0));
  const [other, setOther] = useState("");
  const [method, setMethod] = useState("Cash");
  const [paidStr, setPaidStr] = useState("");
  const [useDep, setUseDep] = useState(true);
  const [err, setErr] = useState("");
  const [pickErr, setPickErr] = useState("");
  const [ack, setAck] = useState("");
  const [saved, setSaved] = useState(null);
  const [change, setChange] = useState(0);

  useEffect(() => {
    if (!registerBack) return undefined;
    registerBack(() => { if (step === "cart") { setStep("pick"); return true; } onClose(); return true; });
    return () => registerBack(null);
  }, [step, registerBack, onClose]);

  const popular = useMemo(() => {
    const m = {};
    db.sales.forEach((s) => s.items.forEach((i) => { m[i.pid] = (m[i.pid] || 0) + i.qty * (i.pcs || 1); }));
    return m;
  }, [db.sales]);
  const cats = [...new Set(products.map((p) => p.cat).filter(Boolean))];
  const list = useMemo(
    () => products.filter((p) => (!catF || p.cat === catF) && p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (popular[b.id] || 0) - (popular[a.id] || 0) || a.name.localeCompare(b.name)),
    [products, q, catF, popular]
  );
  const getP = (id) => products.find((p) => p.id === id);
  const unitOf = (p, id) => p.units.find((u) => u.id === id) || p.units[0];
  const blocks = cart.map((c) => ({ c, p: getP(c.pid) })).filter((b) => b.p);
  const pcsIn = (p, parts) => parts.reduce((a, pt) => a + num(pt.qty) * unitOf(p, pt.unitId).pcs, 0);
  const describe = (p, parts) => partsText(parts.map((pt) => { const u = unitOf(p, pt.unitId); return { unit: u.name, pcsPer: u.pcs, qty: num(pt.qty) }; }), p.units[0].name);

  const setDraftFor = (pid, patch) => setDraft((d) => ({ ...d, [pid]: { ...(d[pid] || {}), ...patch } }));
  const setPart = (pid, key, patch) => setCart((cs) => cs.map((c) => (c.pid === pid ? { ...c, parts: c.parts.map((pt) => (pt.key === key ? { ...pt, ...patch } : pt)) } : c)));

  const addTo = (p) => {
    const d = draft[p.id] || {};
    const qty = num(d.qty);
    const unit = unitOf(p, d.unitId);
    if (!(qty > 0)) return;
    const entry = cart.find((c) => c.pid === p.id);
    const already = entry ? pcsIn(p, entry.parts) : 0;
    if (already + qty * unit.pcs > p.qty + 1e-9) return setPickErr(`Only ${trimNum(p.qty)} ${p.units[0].name} of ${p.name} in stock.`);
    setPickErr("");
    setCart((cs) => {
      const ex = cs.find((c) => c.pid === p.id);
      if (!ex) return [...cs, { pid: p.id, parts: [{ key: uid(), unitId: unit.id, qty: trimNum(qty), price: String(unit.price) }] }];
      return cs.map((c) => {
        if (c.pid !== p.id) return c;
        const same = c.parts.find((pt) => pt.unitId === unit.id);
        return same ? { ...c, parts: c.parts.map((pt) => (pt === same ? { ...pt, qty: trimNum(num(pt.qty) + qty) } : pt)) } : { ...c, parts: [...c.parts, { key: uid(), unitId: unit.id, qty: trimNum(qty), price: String(unit.price) }] };
      });
    });
    setDraftFor(p.id, { qty: "" });
  };
  const changeUnit = (pid, key, p, unitId) => { const u = unitOf(p, unitId); setPart(pid, key, { unitId: u.id, price: String(u.price) }); };
  const addPart = (p, c) => {
    const free = p.units.find((u) => !c.parts.some((pt) => pt.unitId === u.id)) || p.units[0];
    setCart((cs) => cs.map((x) => (x.pid === p.id ? { ...x, parts: [...x.parts, { key: uid(), unitId: free.id, qty: "1", price: String(free.price) }] } : x)));
  };
  const removePart = (pid, key) => setCart((cs) => cs.map((c) => (c.pid === pid ? { ...c, parts: c.parts.filter((pt) => pt.key !== key) } : c)).filter((c) => c.parts.length));
  const applyBest = (p, bp) => setCart((cs) => cs.map((c) => (c.pid === p.id ? { ...c, parts: bp.parts.map((x) => ({ key: uid(), unitId: x.unitId, qty: String(x.qty), price: String(x.price) })) } : c)));

  const sub = blocks.reduce((a, { c }) => a + c.parts.reduce((b, pt) => b + num(pt.qty) * num(pt.price), 0), 0);
  const discount = Math.min(discMode === "percent" ? (sub * num(disc)) / 100 : num(disc), sub);
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
  const over = blocks.find(({ c, p }) => pcsIn(p, c.parts) > p.qty + 1e-9);
  const below = [];
  blocks.forEach(({ c, p }) => c.parts.forEach((pt) => { const u = unitOf(p, pt.unitId); if (num(pt.price) < p.cost * u.pcs - 0.004) below.push(`${p.name} (${u.name})`); }));
  const belowSig = below.join("|");

  const save = () => {
    if (!blocks.length) return setErr("Add at least one product.");
    for (const { c, p } of blocks) for (const pt of c.parts) if (!(num(pt.qty) > 0)) return setErr(`Enter a quantity for ${p.name}.`);
    if (over) return setErr(`Only ${trimNum(over.p.qty)} ${over.p.units[0].name} of ${over.p.name} in stock.`);
    const newName = newCust ? newCust.name.trim() : "";
    if (dueAmt > 0.004 && !cust && !newName) return setErr("Choose or add a customer so you can track what they owe.");
    if (below.length && ack !== belowSig) { setAck(belowSig); return setErr("Some items are priced below cost. Tap Charge again to confirm."); }
    const items = [];
    blocks.forEach(({ c, p }) => c.parts.forEach((pt) => { const u = unitOf(p, pt.unitId); items.push({ pid: p.id, name: p.name, unit: u.name, pcs: u.pcs, base: p.units[0].name, qty: num(pt.qty), price: num(pt.price), show: u.show || u.price, cost: p.cost }); }));
    const sale = onSave({
      date, time: nowTime(), cid: cust ? cust.id : "", customerName: cust ? cust.name : newName,
      newCustomer: newName ? { name: newName, phone: (newCust.phone || "").trim() } : null,
      items, discount: r2(discount), discountPct: discMode === "percent" ? num(disc) : 0, other: num(other), taxRate: num(taxPct), method, paid, fromDeposit: depUse,
    });
    setChange(changeAmt); setSaved(sale); setStep("done"); setErr("");
  };
  const reset = () => {
    setCart([]); setDraft({}); setStep("pick"); setSaved(null); setPaidStr(""); setDisc(""); setDiscMode("amount"); setOther(""); setCustId(""); setNewCust(null);
    setMore(false); setMethod("Cash"); setErr(""); setPickErr(""); setAck(""); setUseDep(true); setDate(todayISO()); setQ("");
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
        {blocks.map(({ c, p }) => {
          const totalPcs = pcsIn(p, c.parts);
          const amount = c.parts.reduce((a, pt) => a + num(pt.qty) * num(pt.price), 0);
          const listTotal = c.parts.reduce((a, pt) => a + num(pt.qty) * unitOf(p, pt.unitId).price, 0);
          const bp = bestPack(p.units, totalPcs);
          const showBest = bp && bp.price < listTotal - 0.004;
          return (
            <div className="block" key={p.id}>
              <div className="split between">
                <span className="lead"><Avatar p={p} size={40} /><span><b>{p.name}</b><br /><span className="muted small">{describe(p, c.parts)}</span></span></span>
                <button className="ico" aria-label={"Remove " + p.name} onClick={() => setCart((cs) => cs.filter((x) => x.pid !== p.id))}><Trash2 size={18} /></button>
              </div>
              {c.parts.map((pt) => {
                const u = unitOf(p, pt.unitId);
                return (
                  <div className="part" key={pt.key}>
                    <div className="split">
                      <select value={u.id} onChange={(e) => changeUnit(p.id, pt.key, p, e.target.value)} aria-label={`Unit for ${p.name}`}>{p.units.map((x) => <option key={x.id} value={x.id}>{unitLabel(x)}</option>)}</select>
                      {c.parts.length > 1 && <button className="ico" style={{ flex: "none" }} aria-label="Remove this unit" onClick={() => removePart(p.id, pt.key)}><Trash2 size={16} /></button>}
                    </div>
                    <div className="qp">
                      <div className="step">
                        <button aria-label="Less" onClick={() => setPart(p.id, pt.key, { qty: trimNum(Math.max(0, num(pt.qty) - 1)) })}><Minus size={16} /></button>
                        <input inputMode="decimal" value={pt.qty} onChange={(e) => setPart(p.id, pt.key, { qty: e.target.value })} aria-label={`Quantity of ${p.name} ${u.name}`} />
                        <button aria-label="More" onClick={() => setPart(p.id, pt.key, { qty: trimNum(num(pt.qty) + 1) })}><Plus size={16} /></button>
                      </div>
                      <Field label={`Price per ${u.name}`}><input inputMode="decimal" value={pt.price} onChange={(e) => setPart(p.id, pt.key, { price: e.target.value })} aria-label={`Price of ${p.name} ${u.name}`} /></Field>
                    </div>
                    <div className="split between"><span className="muted small">Showing price {money(u.show || u.price)}</span><b>{money(num(pt.qty) * num(pt.price))}</b></div>
                  </div>
                );
              })}
              <div className="split between">
                <button className="link" onClick={() => addPart(p, c)} disabled={p.units.length < 2}>+ Add another unit</button>
                <span><span className="muted small">{trimNum(totalPcs)} {p.units[0].name} · </span><b>{money(amount)}</b></span>
              </div>
              {showBest && (
                <button className="sugg" onClick={() => applyBest(p, bp)}>
                  Best price: {partsText(bp.parts.map((x) => { const u = unitOf(p, x.unitId); return { unit: u.name, pcsPer: u.pcs, qty: x.qty }; }), p.units[0].name)} = {money(bp.price)}, saves {money(listTotal - bp.price)}. Tap to use.
                </button>
              )}
            </div>
          );
        })}
        <button className="ghost" onClick={() => setStep("pick")}><Plus size={16} /> Add more products</button>

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
              <Field label="Discount">
                <div className="split">
                  <input inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" aria-label="Discount value" />
                  <Chips><Chip on={discMode === "amount"} onClick={() => setDiscMode("amount")}>Amount</Chip><Chip on={discMode === "percent"} onClick={() => setDiscMode("percent")}>Percent %</Chip></Chips>
                </div>
              </Field>
              <div className="split">
                <Field label="Tax %"><input inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} /></Field>
                <Field label="Other charge"><input inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" /></Field>
              </div>
              <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </>
          )}
        </div>

        <div className="card form">
          <div className="sum">
            <div className="row"><span>Items</span><span>{money(sub)}</span></div>
            {discount > 0 && <div className="row"><span>Discount{discMode === "percent" ? ` (${disc}%)` : ""}</span><span>-{money(discount)}</span></div>}
            {tax > 0 && <div className="row"><span>Tax ({taxPct}%)</span><span>{money(tax)}</span></div>}
            {num(other) > 0 && <div className="row"><span>Other</span><span>{money(num(other))}</span></div>}
            <div className="row"><b>Total</b><b>{money(total)}</b></div>
          </div>
          <Chips>{METHODS.map((m) => <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{m}</Chip>)}</Chips>
          {dep > 0 && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={useDep} onChange={(e) => setUseDep(e.target.checked)} /> Use customer deposit ({money(dep)})</label>}
          {remaining > 0.004 && (
            <>
              <Field label="Amount paid"><input inputMode="decimal" value={paidStr} onChange={(e) => setPaidStr(e.target.value)} placeholder={String(remaining)} /></Field>
              <Chips><Chip on={paidStr === ""} onClick={() => setPaidStr("")}>Exact amount</Chip><Chip on={paidStr === "0"} onClick={() => setPaidStr("0")}>Pay later</Chip></Chips>
            </>
          )}
          {changeAmt > 0.004 && <p><b>Change to give: {money(changeAmt)}</b></p>}
          {dueAmt > 0.004 && <p className="neg"><b>Customer will owe {money(dueAmt)}</b></p>}
          {below.length > 0 && <p className="neg small">Below cost: {below.join(", ")}</p>}
          {over && <p className="err">Only {trimNum(over.p.qty)} {over.p.units[0].name} of {over.p.name} in stock.</p>}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="primary big-btn" onClick={save} disabled={!blocks.length}>{below.length && ack === belowSig ? "Charge anyway " : "Charge "}{money(total)}</button>
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
          {cats.length > 0 && <Chips><Chip on={!catF} onClick={() => setCatF("")}>All</Chip>{cats.map((c) => <Chip key={c} on={catF === c} onClick={() => setCatF(c)}>{c}</Chip>)}</Chips>}
          {pickErr && <p className="err" role="alert">{pickErr}</p>}
          {list.map((p) => {
            const d = draft[p.id] || {};
            const unit = unitOf(p, d.unitId);
            const entry = cart.find((c) => c.pid === p.id);
            return (
              <div className="prow" key={p.id}>
                <div className="split between">
                  <span className="lead"><Avatar p={p} size={46} /><span><b>{p.name}</b><br /><span className="muted small">{money(unit.price)} per {unit.name}</span></span></span>
                  <span className={"small " + (p.qty <= p.reorder ? "neg" : "muted")} style={{ textAlign: "right" }}>{p.qty <= 0 ? "Out of stock" : `${trimNum(p.qty)} ${p.units[0].name} left`}</span>
                </div>
                {entry && <p className="small pos">In cart: {describe(p, entry.parts)}</p>}
                <div className="addrow">
                  <input inputMode="decimal" placeholder="Qty" value={d.qty || ""} onChange={(e) => setDraftFor(p.id, { qty: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addTo(p)} aria-label={`Quantity of ${p.name}`} disabled={p.qty <= 0} />
                  <select value={unit.id} onChange={(e) => setDraftFor(p.id, { unitId: e.target.value })} aria-label={`Unit for ${p.name}`}>{p.units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}</select>
                  <button className="primary" disabled={p.qty <= 0 || !(num(d.qty) > 0)} onClick={() => addTo(p)} aria-label={`Add ${p.name}`}>Add</button>
                </div>
              </div>
            );
          })}
          {!list.length && <Empty>No products match.</Empty>}
          {blocks.length > 0 && <button className="primary big-btn wide cartbar" onClick={() => { setErr(""); setStep("cart"); }}>Review sale · {blocks.length} {blocks.length === 1 ? "product" : "products"} · {money(sub)}</button>}
        </>
      )}
    </Sheet>
  );
}
