import { useState, useRef } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { Field, Chip, Chips, Avatar } from "./ui";
import { uid, num, r2, todayISO, trimNum, calcSale, groupItems, partsText } from "./logic";

const EXPENSE_CATS = ["Rent", "Wages", "Utilities", "Transport", "Marketing", "Repairs", "Packaging", "Fees", "Other"];
const PRESETS = [["Dozen", 12], ["½ dozen", 6], ["¼ dozen", 3], ["Carton", 24], ["Bundle", 10]];
const METHODS = ["Cash", "Mobile", "Bank"];

export const resizeImage = (file, max = 256, type = "image/jpeg") => new Promise((res, rej) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); res(type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.72));
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Couldn't read that image.")); };
  img.src = url;
});

export function ProductForm({ db, money, product, onSave, onDelete, onReduce, onAddCategory }) {
  const edit = !!product;
  const [photo, setPhoto] = useState(product ? product.photo : "");
  const [name, setName] = useState(product ? product.name : "");
  const [cat, setCat] = useState(product ? product.cat : "");
  const [cost, setCost] = useState(product ? String(product.cost) : "");
  const [qty, setQty] = useState(product ? String(product.qty) : "0");
  const [reorder, setReorder] = useState(product ? String(product.reorder) : "5");
  const [units, setUnits] = useState(
    product ? product.units.map((u) => ({ id: u.id, name: u.name, pcs: String(u.pcs), show: String(u.show || ""), price: String(u.price) }))
      : [{ id: uid(), name: "pcs", pcs: "1", show: "", price: "" }]
  );
  const [err, setErr] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef(null);
  const base = units[0].name.trim() || "pcs";
  const setU = (i, patch) => setUnits((us) => us.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const cats = [...new Set([...(db.settings.categories || []), ...(cat ? [cat] : [])])];

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { setPhoto(await resizeImage(f)); } catch (x) { setErr(x.message); }
  };
  const save = () => {
    if (!name.trim()) return setErr("Give the product a name.");
    const us = units.map((u, i) => ({ id: u.id, name: u.name.trim(), pcs: i === 0 ? 1 : num(u.pcs), show: num(u.show) || num(u.price), price: num(u.price) }));
    if (us.some((u) => !u.name)) return setErr("Every unit needs a name.");
    if (us.some((u, i) => i > 0 && !(u.pcs > 0))) return setErr(`Enter how many ${base} each unit holds.`);
    onSave({ name: name.trim(), cat: cat.trim(), photo, cost: num(cost), qty: num(qty), reorder: num(reorder), units: us });
  };

  return (
    <div className="form">
      <div className="photo">
        <Avatar p={{ name: name || "?", photo }} size={64} />
        <div className="form" style={{ gap: 6 }}>
          <button className="ghost" onClick={() => fileRef.current && fileRef.current.click()}><Camera size={16} /> {photo ? "Change photo" : "Add photo"}</button>
          {photo && <button className="link" onClick={() => setPhoto("")}>Remove photo</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      </div>
      <Field label="Product name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="fld">
        <span>Category (optional)</span>
        <Chips>
          <Chip on={!cat} onClick={() => setCat("")}>None</Chip>
          {cats.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
          <Chip onClick={() => setAddingCat(true)}>+ New</Chip>
        </Chips>
        {addingCat && (
          <div className="split">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name" aria-label="New category name" />
            <button className="ghost" onClick={() => { const n = newCat.trim(); if (n) { onAddCategory(n); setCat(n); } setNewCat(""); setAddingCat(false); }}>Add</button>
          </div>
        )}
      </div>
      <div className="split">
        <Field label={`Cost per ${base}`}><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" /></Field>
        <Field label={`${edit ? "In stock" : "Opening stock"} (${base})`}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      </div>
      <Field label={`Reorder when below (${base})`}><input inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field>

      <h3>Units and prices</h3>
      <p className="muted small">Set a price for each way you sell this. Prices are yours to choose, so a dozen can cost less than 12 single pieces. While selling, the {base} price shows first and you can switch units.</p>
      {units.map((u, i) => {
        const pcs = i === 0 ? 1 : num(u.pcs);
        const price = num(u.price);
        const basePrice = num(units[0].price);
        const costUnit = num(cost) * pcs;
        let hint = "";
        if (price > 0 && num(cost) > 0 && pcs > 0 && price < costUnit - 0.004) hint = `Below cost: you lose ${money(costUnit - price)} on each ${u.name || "unit"}.`;
        else if (i > 0 && pcs > 0 && basePrice > 0 && price > 0 && price < basePrice * pcs - 0.004) hint = `${trimNum(pcs)} at the ${base} price = ${money(basePrice * pcs)}, so the customer saves ${money(basePrice * pcs - price)}.`;
        return (
          <div className="unit" key={u.id}>
            <div className="split">
              <Field label={i === 0 ? "Smallest unit" : "Unit name"}><input value={u.name} onChange={(e) => setU(i, { name: e.target.value })} /></Field>
              {i > 0 ? <Field label={`${base} in it`}><input inputMode="decimal" value={u.pcs} onChange={(e) => setU(i, { pcs: e.target.value })} /></Field> : <Field label="Holds"><input value="1" disabled /></Field>}
            </div>
            <div className="split">
              <Field label="Showing price"><input inputMode="decimal" value={u.show} onChange={(e) => setU(i, { show: e.target.value })} placeholder={u.price || "Same as selling"} /></Field>
              <Field label="Selling price"><input inputMode="decimal" value={u.price} onChange={(e) => setU(i, { price: e.target.value })} placeholder="0" /></Field>
            </div>
            {hint && <p className={"small " + (hint.startsWith("Below") ? "neg" : "muted")}>{hint}</p>}
            {i > 0 && <button className="link" onClick={() => setUnits((us) => us.filter((_, j) => j !== i))}>Remove this unit</button>}
          </div>
        );
      })}
      <Chips>
        {PRESETS.map(([n, p]) => <Chip key={n} onClick={() => setUnits((us) => [...us, { id: uid(), name: n, pcs: String(p), show: "", price: "" }])}>+ {n}</Chip>)}
        <Chip onClick={() => setUnits((us) => [...us, { id: uid(), name: "", pcs: "", show: "", price: "" }])}><Plus size={14} /> Other</Chip>
      </Chips>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={save}>Save product</button>
      {edit && onReduce && <button className="ghost" onClick={onReduce}>Reduce stock (damaged, lost, returned)</button>}
      {edit && onDelete && !confirmDel && <button className="danger" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Delete product</button>}
      {edit && onDelete && confirmDel && (
        <div className="card form"><p className="small">Delete {name || "this product"}? Past sales keep their records.</p><div className="split"><button className="danger" onClick={onDelete}>Yes, delete</button><button className="ghost" onClick={() => setConfirmDel(false)}>Keep it</button></div></div>
      )}
    </div>
  );
}

export function ReceiveForm({ db, money, defaultPid, onSave }) {
  const first = db.products.find((p) => p.id === defaultPid) || db.products[0];
  const [pid, setPid] = useState(first ? first.id : "");
  const p = db.products.find((x) => x.id === pid);
  const [unitId, setUnitId] = useState(p ? p.units[0].id : "");
  const unit = p ? p.units.find((u) => u.id === unitId) || p.units[0] : null;
  const [qty, setQty] = useState("");
  const [uc, setUc] = useState(first && first.cost > 0 ? String(r2(first.cost * first.units[0].pcs)) : "");
  const [sid, setSid] = useState("");
  const [paid, setPaid] = useState("");
  const [err, setErr] = useState("");
  const costFor = (prod, u) => (prod && prod.cost > 0 ? String(r2(prod.cost * u.pcs)) : "");
  const onProduct = (id) => { const np = db.products.find((x) => x.id === id); setPid(id); setUnitId(np.units[0].id); setUc(costFor(np, np.units[0])); };
  const onUnit = (id) => { setUnitId(id); const u = p.units.find((x) => x.id === id); setUc(costFor(p, u)); };
  const total = num(qty) * num(uc);
  const pcs = num(qty) * (unit ? unit.pcs : 1);
  return (
    <div className="form">
      <Field label="Product"><select value={pid} onChange={(e) => onProduct(e.target.value)}>{db.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <div className="split">
        <Field label="Bought in"><select value={unit ? unit.id : ""} onChange={(e) => onUnit(e.target.value)}>{p && p.units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.pcs !== 1 ? ` (${trimNum(u.pcs)})` : ""}</option>)}</select></Field>
        <Field label="Quantity"><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      </div>
      <Field label={`Cost per ${unit ? unit.name : "unit"}`}><input inputMode="decimal" value={uc} onChange={(e) => setUc(e.target.value)} placeholder="0" /></Field>
      {pcs > 0 && <p className="muted small">Adds {trimNum(pcs)} {p.units[0].name} to stock at {money(unit.pcs > 0 ? num(uc) / unit.pcs : 0)} each. Total {money(total)}.</p>}
      <Field label="Supplier"><select value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Paid cash, no supplier account</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {sid && <Field label={`Paid now (total ${money(total)})`} hint="Anything unpaid is added to what you owe this supplier."><input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" /></Field>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (num(qty) > 0 && pid ? onSave({ pid, unitId: unit.id, qty: num(qty), unitCost: num(uc), sid, paid: num(paid) }) : setErr("Enter the quantity received."))}>Add to stock</button>
    </div>
  );
}

export function AdjustForm({ product, money, onSave }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Damaged");
  const [err, setErr] = useState("");
  const base = product.units[0].name;
  const loss = reason !== "Returned to supplier";
  return (
    <div className="form">
      <p className="muted small">{product.name} · {trimNum(product.qty)} {base} in stock</p>
      <Field label={`How many ${base} to remove`}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      <Chips>{["Damaged", "Expired", "Lost", "Returned to supplier", "Other"].map((r) => <Chip key={r} on={reason === r} onClick={() => setReason(r)}>{r}</Chip>)}</Chips>
      <p className="muted small">{loss ? `This counts as a loss of ${money(num(qty) * product.cost)} in your reports.` : "Returned stock isn't counted as a loss. Record any refund under Suppliers."}</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => { const q = num(qty); if (!(q > 0)) return setErr("Enter how many to remove."); if (q > product.qty) return setErr(`You only have ${trimNum(product.qty)} in stock.`); onSave({ pid: product.id, qty: q, reason }); }}>Remove from stock</button>
    </div>
  );
}

export function CustomerForm({ customer, onSave }) {
  const [n, setN] = useState(customer ? customer.name : "");
  const [ph, setPh] = useState(customer ? customer.phone : "");
  const [note, setNote] = useState(customer ? customer.note || "" : "");
  const [err, setErr] = useState("");
  return (
    <div className="form">
      <Field label="Customer name"><input value={n} onChange={(e) => setN(e.target.value)} /></Field>
      <Field label="Phone (optional)"><input inputMode="tel" value={ph} onChange={(e) => setPh(e.target.value)} /></Field>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (n.trim() ? onSave({ name: n.trim(), phone: ph.trim(), note: note.trim() }) : setErr("Enter a name."))}>Save customer</button>
    </div>
  );
}

export function PayForm({ owed, deposit, money, onSave }) {
  const [amt, setAmt] = useState(owed > 0 ? String(owed) : "");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="form">
      <p className="muted small">Owes {money(owed)}{deposit > 0 ? ` · deposit ${money(deposit)}` : ""}</p>
      <Field label="Amount received" hint="Goes to the oldest unpaid sales first. Anything extra is kept as a deposit."><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
      <Chips>{METHODS.map((m) => <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{m}</Chip>)}</Chips>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (num(amt) > 0 ? onSave({ amount: num(amt), method, note: note.trim() }) : setErr("Enter an amount."))}>Record payment</button>
    </div>
  );
}

export function ExpenseForm({ onSave }) {
  const [e, setE] = useState({ date: todayISO(), category: "Rent", amount: "", note: "" });
  const [err, setErr] = useState("");
  const set = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  return (
    <div className="form">
      <div className="split">
        <Field label="Date"><input type="date" value={e.date} onChange={set("date")} /></Field>
        <Field label="Category"><select value={e.category} onChange={set("category")}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Amount"><input inputMode="decimal" value={e.amount} onChange={set("amount")} placeholder="0" /></Field>
      <Field label="Note (optional)"><input value={e.note} onChange={set("note")} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (num(e.amount) > 0 ? onSave({ date: e.date, category: e.category, amount: num(e.amount), note: e.note.trim() }) : setErr("Enter an amount greater than zero."))}>Save expense</button>
    </div>
  );
}

export function SupplierForm({ onSave }) {
  const [n, setN] = useState(""); const [ph, setPh] = useState(""); const [err, setErr] = useState("");
  return (
    <div className="form">
      <Field label="Supplier name"><input value={n} onChange={(e) => setN(e.target.value)} /></Field>
      <Field label="Phone or contact (optional)"><input value={ph} onChange={(e) => setPh(e.target.value)} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (n.trim() ? onSave({ name: n.trim(), phone: ph.trim() }) : setErr("Enter a name."))}>Save supplier</button>
    </div>
  );
}

export function NoteForm({ onSave }) {
  const [text, setText] = useState(""); const [task, setTask] = useState(false); const [err, setErr] = useState("");
  return (
    <div className="form">
      <Chips><Chip on={!task} onClick={() => setTask(false)}>Note</Chip><Chip on={task} onClick={() => setTask(true)}>Task to do</Chip></Chips>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={task ? "What needs doing?" : "Write a note"} aria-label="Note text" />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={() => (text.trim() ? onSave({ text: text.trim(), task }) : setErr("Write something first."))}>Save</button>
    </div>
  );
}

export function ReturnForm({ sale, money, onSave }) {
  const groups = groupItems(sale);
  const [qty, setQty] = useState({});
  const [mode, setMode] = useState("cash");
  const [method, setMethod] = useState("Cash");
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState("");
  const [amt, setAmt] = useState(null);
  const [err, setErr] = useState("");
  const chosen = Object.entries(qty).map(([idx, v]) => ({ idx: Number(idx), qty: num(v) })).filter((x) => x.qty > 0);
  const before = calcSale(sale);
  const after = calcSale({ ...sale, returns: [...(sale.returns || []), { items: chosen, amount: 0 }] });
  const suggest = Math.max(0, r2(before.paid - after.total));
  const refund = amt === null ? suggest : num(amt);
  const save = () => {
    if (!chosen.length) return setErr("Enter how many to return.");
    for (const g of groups) for (const p of g.parts) { const v = num(qty[p.idx]); if (v > p.orig - p.returned + 1e-9) return setErr(`You can return at most ${trimNum(p.orig - p.returned)} ${p.unit} of ${g.name}.`); }
    if (refund > before.paid + 0.004) return setErr(`You can't refund more than was paid (${money(before.paid)}).`);
    onSave({ items: chosen, amount: r2(refund), mode: refund > 0 ? mode : "none", method, restock, note: note.trim() });
  };
  return (
    <div className="form">
      {groups.map((g) => (
        <div className="card flat" key={g.pid}>
          <b>{g.name}</b> <span className="muted small">{partsText(g.parts, g.base)}</span>
          {g.parts.filter((p) => p.orig - p.returned > 0).map((p) => (
            <div className="row" key={p.idx}>
              <span>{p.unit} <span className="muted small">(up to {trimNum(p.orig - p.returned)})</span></span>
              <input style={{ width: 90 }} inputMode="decimal" value={qty[p.idx] || ""} onChange={(e) => setQty({ ...qty, [p.idx]: e.target.value })} placeholder="0" aria-label={`Return ${g.name} ${p.unit}`} />
            </div>
          ))}
        </div>
      ))}
      <div className="card flat">
        <div className="row"><span>New total</span><b>{money(after.total)}</b></div>
        {after.due > 0.004 && <div className="row"><span>Customer still owes</span><b className="neg">{money(after.due)}</b></div>}
      </div>
      <Field label="Money to give back" hint={suggest > 0 ? `Suggested ${money(suggest)} (paid minus the new total)` : "Nothing was paid beyond the new total."}><input inputMode="decimal" value={amt === null ? (suggest ? String(suggest) : "") : amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" aria-label="Money to give back" /></Field>
      {refund > 0 && (
        <>
          <Chips>
            <Chip on={mode === "cash"} onClick={() => setMode("cash")}>Give money back</Chip>
            {sale.cid && <Chip on={mode === "credit"} onClick={() => setMode("credit")}>Keep as customer credit</Chip>}
          </Chips>
          {mode === "cash" && <Chips>{METHODS.map((m) => <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{m}</Chip>)}</Chips>}
        </>
      )}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put the items back in stock</label>
      {!restock && <p className="muted small">Items that aren't restocked are recorded as a loss at cost.</p>}
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" onClick={save}>Record return</button>
    </div>
  );
}
