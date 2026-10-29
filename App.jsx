import { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Home, ShoppingBag, Package, Users, MoreHorizontal, MoreVertical, ChevronLeft, Lock, Settings, ShieldCheck, BarChart3, Plus, Tags } from "lucide-react";
import { CSS, Sheet, Gate, Field, Chip, Chips } from "./ui";
import {
  uid, num, r2, todayISO, nowTime, makeMoney, migrate, freshDb, stockUse, allocatePayment, addUnitCostPerPcs, receiveCost, calcSale, groupItems, BUSINESS_TYPES,
} from "./logic";
import { loadDb, saveDb } from "./storage";
import { receiptModel, receiptText, receiptPNG, receiptPDF, thankYouPNG, shareFile, shareText, pdfSymbol } from "./receipt";
import SellFlow from "./SellFlow";
import { ProductForm, ReceiveForm, AdjustForm, CustomerForm, ExpenseForm, SupplierForm, NoteForm, ReturnForm } from "./Forms";
import { HomePage, SalesPage, ReceiptSheet, ShareSheet, ProductsPage, CustomersPage, CustomerSheet, MorePage, ExpensesPage, SuppliersPage, SupplierSheet, NotesPage, CategoriesSheet } from "./Pages";
import PerfPage from "./Reports";
import { SettingsPage, BackupPage } from "./Settings";

const TABS = [["home", "Home", Home], ["sales", "Sales", ShoppingBag], ["products", "Products", Package], ["customers", "Customers", Users], ["more", "More", MoreHorizontal]];
const VIEW_TITLES = { expenses: "Expenses", suppliers: "Suppliers", notes: "Notes and tasks", perf: "Performance and reports", settings: "Settings", backup: "Backup and restore" };
const native = Capacitor.isNativePlatform();

const SAMPLES = [
  { name: "Sample soda", cat: "Drinks", cost: 1, qty: 48, reorder: 6, units: [{ name: "pcs", pcs: 1, show: 1.5, price: 1.5 }, { name: "Dozen", pcs: 12, show: 18, price: 16 }, { name: "Carton", pcs: 24, show: 34, price: 30 }] },
  { name: "Sample biscuits", cat: "Snacks", cost: 0.5, qty: 60, reorder: 10, units: [{ name: "pcs", pcs: 1, show: 0.8, price: 0.8 }, { name: "½ dozen", pcs: 6, show: 4.5, price: 4 }] },
];

function Setup({ onDone }) {
  const [shop, setShop] = useState("");
  const [cur, setCur] = useState("$");
  const [tax, setTax] = useState("0");
  const [type, setType] = useState("general");
  const [sample, setSample] = useState(true);
  const t = BUSINESS_TYPES[type];
  return (
    <main style={{ paddingTop: "calc(40px + env(safe-area-inset-top))" }}>
      <h1 style={{ fontSize: "1.8em" }}>Welcome</h1>
      <p className="muted">Let's set up your shop. You can change all of this later in Settings.</p>
      <div className="card form">
        <Field label="Business name"><input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="My shop" /></Field>
        <div className="fld"><span>What kind of shop is it?</span><Chips>{Object.entries(BUSINESS_TYPES).map(([k, v]) => <Chip key={k} on={type === k} onClick={() => setType(k)}>{v.label}</Chip>)}</Chips></div>
        {t.cats.length > 0 && <p className="muted small">Starter categories: {t.cats.join(", ")}. You can change them any time.</p>}
        <div className="split">
          <Field label="Currency symbol"><input value={cur} onChange={(e) => setCur(e.target.value)} maxLength={4} /></Field>
          <Field label="Sales tax %"><input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={sample} onChange={(e) => setSample(e.target.checked)} /> Add two sample products so I can try it</label>
        <button className="primary big-btn" onClick={() => onDone({ shop: shop.trim() || "My shop", cur: cur || "$", saleTax: num(tax), sample, bizType: type })}>Start</button>
      </div>
    </main>
  );
}

export default function App() {
  const [db, setDb] = useState(freshDb());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [tabArg, setTabArg] = useState(null);
  const [view, setView] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [sell, setSell] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState(null);
  const rootRef = useRef(null);
  const pendingRef = useRef(null);
  const stateRef = useRef({});
  const backRef = useRef(() => {});
  const sellBackRef = useRef(null);

  useEffect(() => { (async () => { try { const d = await loadDb(); if (d) setDb(migrate(d)); } catch (e) { /* start fresh */ } setLoaded(true); })(); }, []);
  useEffect(() => { if (loaded) saveDb(db); }, [db, loaded]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); } return undefined; }, [toast]);
  useEffect(() => { if (view !== "perf") setUnlocked(false); }, [view]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setUnlocked(false); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => { if (unlocked) { const t = setTimeout(() => setUnlocked(false), 120000); return () => clearTimeout(t); } return undefined; }, [unlocked]);
  useEffect(() => {
    if (!rootRef.current) return;
    const bg = getComputedStyle(rootRef.current).getPropertyValue("--bg").trim();
    if (bg) { document.body.style.background = bg; document.documentElement.style.background = bg; }
  }, [db.settings.theme, loaded]);

  /* Undo: remember the data from before an action; offer to restore it until anything else changes. */
  useEffect(() => {
    const p = pendingRef.current;
    if (!p) return;
    if (!p.after) { p.after = db; setUndo({ msg: p.msg }); } else if (db !== p.after) { pendingRef.current = null; setUndo(null); }
  }, [db]);
  useEffect(() => { if (undo) { const t = setTimeout(() => { pendingRef.current = null; setUndo(null); }, 5000); return () => clearTimeout(t); } return undefined; }, [undo]);
  const act = (msg, fn, kind) => {
    pendingRef.current = { snap: db, after: null, msg, kind };
    setTimeout(() => { if (pendingRef.current && !pendingRef.current.after) pendingRef.current = null; }, 1500);
    return fn();
  };
  const doUndo = () => {
    const p = pendingRef.current;
    if (p && p.after === db) { setDb(p.snap); if (p.kind === "sale") setSell(false); setSheet(null); setToast("Undone"); }
    pendingRef.current = null; setUndo(null);
  };

  const s = db.settings;
  const money = makeMoney(s.cur || "$");
  const pdfMoney = makeMoney(pdfSymbol(s));
  const say = (m) => setToast(m);
  const closeSheet = () => setSheet(null);
  const goTab = (t, arg) => { setTab(t); setView(null); setTabArg(arg || null); setMenu(false); window.scrollTo(0, 0); };
  const goView = (v) => { setView(v); setMenu(false); window.scrollTo(0, 0); };
  const lastErr = (e) => (e && e.message ? e.message : "cancelled");

  const A = {
    saveSettings: (patch, msg) => { setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } })); if (msg) say(msg); },
    markShared: () => setDb((d) => ({ ...d, settings: { ...d.settings, lastShared: todayISO() } })),
    restoreDb: (raw) => { setDb(migrate(raw)); say("Backup restored"); },

    saveSale: (draft) => act("Sale saved", () => {
      const no = "INV-" + String(db.seq).padStart(4, "0");
      const { newCustomer, ...rest } = draft;
      const nc = newCustomer ? { id: uid(), name: newCustomer.name, phone: newCustomer.phone, note: "", deposit: 0 } : null;
      const sale = { ...rest, cid: nc ? nc.id : draft.cid, id: uid(), no };
      setDb((d) => {
        const use = stockUse(sale.items);
        const products = d.products.map((p) => (use[p.id] ? { ...p, qty: r2(p.qty - use[p.id]) } : p));
        let customers = nc ? [...d.customers, nc] : d.customers;
        if (sale.fromDeposit > 0) customers = customers.map((c) => (c.id === sale.cid ? { ...c, deposit: r2((c.deposit || 0) - sale.fromDeposit) } : c));
        return { ...d, products, customers, sales: [sale, ...d.sales], seq: d.seq + 1 };
      });
      return sale;
    }, "sale"),
    voidSale: (id) => act("Sale voided", () => {
      setDb((d) => {
        const sl = d.sales.find((x) => x.id === id); if (!sl) return d;
        const ret = {}; (sl.returns || []).forEach((r) => r.items.forEach((it) => { ret[it.idx] = (ret[it.idx] || 0) + it.qty; }));
        const live = sl.items.map((i, k) => ({ ...i, qty: i.qty - (ret[k] || 0) }));
        const use = stockUse(live);
        const products = d.products.map((p) => (use[p.id] ? { ...p, qty: r2(p.qty + use[p.id]) } : p));
        const customers = sl.fromDeposit > 0 ? d.customers.map((c) => (c.id === sl.cid ? { ...c, deposit: r2((c.deposit || 0) + sl.fromDeposit) } : c)) : d.customers;
        return { ...d, products, customers, sales: d.sales.filter((x) => x.id !== id) };
      });
      closeSheet();
    }),
    paySale: (id, amt, method) => act("Payment recorded", () => {
      setDb((d) => {
        const sl = d.sales.find((x) => x.id === id); if (!sl) return d;
        const pay = Math.min(amt, calcSale(sl).due);
        const sales = d.sales.map((x) => (x.id === id ? { ...x, paid: r2((x.paid || 0) + pay) } : x));
        const custLedger = sl.cid ? [{ id: uid(), cid: sl.cid, date: todayISO(), amount: pay, method, note: sl.no }, ...d.custLedger] : d.custLedger;
        return { ...d, sales, custLedger };
      });
    }),
    receivePayment: (cid, { amount, method, note }) => act("Payment recorded", () => {
      setDb((d) => {
        const r = allocatePayment(d.sales, cid, amount);
        const customers = d.customers.map((c) => (c.id === cid ? { ...c, deposit: r2((c.deposit || 0) + r.leftover) } : c));
        return { ...d, sales: r.sales, customers, custLedger: [{ id: uid(), cid, date: todayISO(), amount, method, note }, ...d.custLedger] };
      });
    }),
    returnItems: (id, { items, amount, mode, method, restock, note }) => act("Return recorded", () => {
      setDb((d) => {
        const sl = d.sales.find((x) => x.id === id); if (!sl) return d;
        const ret = { id: uid(), date: todayISO(), time: nowTime(), items, amount, mode, method, restock, note };
        const sales = d.sales.map((x) => (x.id === id ? { ...x, returns: [...(x.returns || []), ret] } : x));
        const back = items.map((it) => ({ ...sl.items[it.idx], qty: it.qty }));
        let products = d.products, stockLog = d.stockLog;
        if (restock) {
          const use = stockUse(back);
          products = d.products.map((p) => (use[p.id] ? { ...p, qty: r2(p.qty + use[p.id]) } : p));
        } else {
          const lost = back.map((i) => ({ id: uid(), date: todayISO(), pid: i.pid, name: i.name, qty: i.qty * (i.pcs || 1), reason: "Returned, not restocked", cost: r2(i.qty * (i.pcs || 1) * (i.cost || 0)), loss: true }));
          stockLog = [...lost, ...d.stockLog];
        }
        const customers = mode === "credit" && amount > 0 ? d.customers.map((c) => (c.id === sl.cid ? { ...c, deposit: r2((c.deposit || 0) + amount) } : c)) : d.customers;
        return { ...d, sales, products, stockLog, customers };
      });
      closeSheet();
    }),
    addCustomer: (c) => act("Customer added", () => { setDb((d) => ({ ...d, customers: [...d.customers, { id: uid(), deposit: 0, ...c }] })); closeSheet(); }),
    updCustomer: (id, patch) => act("Customer updated", () => { setDb((d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) })); closeSheet(); }),
    remind: async (cust, owed) => {
      try { say(await shareText(`Hello ${cust.name}, this is a friendly reminder that ${money(owed)} is still due at ${s.shop}. Thank you.`, "Payment reminder")); } catch (e) { if (!/cancel/i.test(lastErr(e))) say("Couldn't share: " + lastErr(e)); }
    },

    addExpense: (e) => act("Expense saved", () => { setDb((d) => ({ ...d, expenses: [{ id: uid(), ...e }, ...d.expenses] })); closeSheet(); }),
    delExpense: (id) => act("Expense deleted", () => setDb((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }))),

    addProduct: (p) => act("Product added", () => { setDb((d) => ({ ...d, products: [...d.products, { id: uid(), added: todayISO(), ...p }] })); closeSheet(); }),
    updProduct: (id, patch) => act("Product updated", () => { setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })); closeSheet(); }),
    delProduct: (id) => act("Product deleted", () => { setDb((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) })); closeSheet(); }),
    receiveStock: ({ pid, unitId, qty, unitCost, sid, paid }) => act("Stock received", () => {
      setDb((d) => {
        const p = d.products.find((x) => x.id === pid); if (!p) return d;
        const unit = p.units.find((u) => u.id === unitId) || p.units[0];
        const addPcs = qty * unit.pcs, costPcs = addUnitCostPerPcs(unitCost, unit);
        const products = d.products.map((x) => (x.id === pid ? { ...x, qty: r2(x.qty + addPcs), cost: receiveCost(x, addPcs, costPcs) } : x));
        const total = r2(qty * unitCost);
        let ledger = d.ledger;
        if (sid && total > 0) {
          const e = [{ id: uid(), sid, date: todayISO(), type: "bought", amount: total, note: `${qty} ${unit.name} of ${p.name}` }];
          if (paid > 0) e.push({ id: uid(), sid, date: todayISO(), type: "paid", amount: Math.min(paid, total), note: "Paid on delivery" });
          ledger = [...e, ...ledger];
        }
        const purchases = [{ id: uid(), date: todayISO(), pid, name: p.name, unit: unit.name, qty, unitCost, total, sid }, ...d.purchases];
        return { ...d, products, ledger, purchases };
      });
      closeSheet();
    }),
    reduceStock: ({ pid, qty, reason }) => act("Stock reduced", () => {
      setDb((d) => {
        const p = d.products.find((x) => x.id === pid); if (!p) return d;
        const entry = { id: uid(), date: todayISO(), pid, name: p.name, qty, reason, cost: r2(qty * p.cost), loss: reason !== "Returned to supplier" };
        return { ...d, products: d.products.map((x) => (x.id === pid ? { ...x, qty: r2(x.qty - qty) } : x)), stockLog: [entry, ...d.stockLog] };
      });
      closeSheet();
    }),

    addCategory: (name) => setDb((d) => ((d.settings.categories || []).includes(name) ? d : { ...d, settings: { ...d.settings, categories: [...(d.settings.categories || []), name] } })),
    renameCategory: (from, to) => act("Category renamed", () => setDb((d) => ({
      ...d,
      settings: { ...d.settings, categories: [...new Set((d.settings.categories || []).map((c) => (c === from ? to : c)))] },
      products: d.products.map((p) => (p.cat === from ? { ...p, cat: to } : p)),
    }))),
    deleteCategory: (name) => act("Category deleted", () => setDb((d) => ({
      ...d,
      settings: { ...d.settings, categories: (d.settings.categories || []).filter((c) => c !== name) },
      products: d.products.map((p) => (p.cat === name ? { ...p, cat: "" } : p)),
    }))),

    addSupplier: (x) => act("Supplier added", () => { setDb((d) => ({ ...d, suppliers: [...d.suppliers, { id: uid(), ...x }] })); closeSheet(); }),
    addLedger: (e) => act("Entry saved", () => setDb((d) => ({ ...d, ledger: [{ id: uid(), ...e }, ...d.ledger] }))),
    delLedger: (id) => act("Entry deleted", () => setDb((d) => ({ ...d, ledger: d.ledger.filter((l) => l.id !== id) }))),

    addNote: ({ text, task }) => { setDb((d) => ({ ...d, notes: [{ id: uid(), date: todayISO(), text, task, done: false }, ...d.notes] })); closeSheet(); },
    toggleNote: (id) => setDb((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, done: !n.done } : n)) })),
    delNote: (id) => act("Note deleted", () => setDb((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }))),

    shareReceipt: async (kind, sale) => {
      try {
        let msg;
        if (kind === "text") msg = await shareText(receiptText(receiptModel(sale, s, money)), "Receipt " + sale.no);
        else if (kind === "png") msg = await shareFile(`receipt-${sale.no}.png`, await receiptPNG(receiptModel(sale, s, money)), "image/png", "Receipt " + sale.no);
        else msg = await shareFile(`receipt-${sale.no}${kind === "pdf-a4" ? "-a4" : ""}.pdf`, await receiptPDF(receiptModel(sale, s, pdfMoney), kind === "pdf-a4" ? "a4" : "small"), "application/pdf", "Receipt " + sale.no);
        say(msg);
      } catch (e) { if (!/cancel/i.test(lastErr(e))) say("Couldn't share: " + lastErr(e)); }
    },
    thanks: async () => {
      try { say(await shareFile("thank-you.png", await thankYouPNG(s), "image/png", "Thank you")); } catch (e) { if (!/cancel/i.test(lastErr(e))) say("Couldn't share: " + lastErr(e)); }
    },
    finishSetup: ({ shop, cur, saleTax, sample, bizType }) => {
      setDb((d) => {
        const cats = [...BUSINESS_TYPES[bizType].cats];
        if (sample) SAMPLES.forEach((x) => { if (!cats.includes(x.cat)) cats.push(x.cat); });
        return {
          ...d,
          settings: { ...d.settings, shop, cur, saleTax, bizType, categories: cats, setupDone: true },
          products: sample && !d.products.length ? SAMPLES.map((x) => ({ id: uid(), photo: "", added: todayISO(), ...x, units: x.units.map((u) => ({ id: uid(), ...u })) })) : d.products,
        };
      });
    },
  };

  /* The phone's back button: close the top-most thing, then step back, and leave the app only from Home. */
  stateRef.current = { sheet, sell, view, tab, menu };
  backRef.current = () => {
    const st = stateRef.current;
    if (st.menu) setMenu(false);
    else if (st.sheet) setSheet(null);
    else if (st.sell) { if (sellBackRef.current) sellBackRef.current(); else setSell(false); }
    else if (st.view) setView(null);
    else if (st.tab !== "home") setTab("home");
    else CapApp.exitApp();
  };
  useEffect(() => {
    if (typeof window !== "undefined" && window.__RL_TEST__) window.__appBack = () => backRef.current();
    if (!native) return undefined;
    const h = CapApp.addListener("backButton", () => backRef.current());
    return () => { Promise.resolve(h).then((x) => x && x.remove && x.remove()); };
  }, []);

  const hasPin = !!s.pinHash;
  const find = (list, id) => list.find((x) => x.id === id);
  const renderSheet = () => {
    if (!sheet) return null;
    switch (sheet.t) {
      case "product": { const p = sheet.id ? find(db.products, sheet.id) : null;
        return <Sheet title={p ? "Edit product" : "New product"} onClose={closeSheet}><ProductForm key={p ? p.id : "new"} db={db} money={money} product={p} onAddCategory={A.addCategory} onSave={(x) => (p ? A.updProduct(p.id, x) : A.addProduct(x))} onDelete={p ? () => A.delProduct(p.id) : null} onReduce={p ? () => setSheet({ t: "reduce", id: p.id }) : null} /></Sheet>; }
      case "reduce": { const p = find(db.products, sheet.id); return p ? <Sheet title="Reduce stock" onClose={closeSheet}><AdjustForm product={p} money={money} onSave={A.reduceStock} /></Sheet> : null; }
      case "receive": return <Sheet title="Receive stock" onClose={closeSheet}><ReceiveForm db={db} money={money} defaultPid={sheet.pid} onSave={A.receiveStock} /></Sheet>;
      case "customer": { const c = sheet.id ? find(db.customers, sheet.id) : null;
        return <Sheet title={c ? "Edit customer" : "Add customer"} onClose={closeSheet}><CustomerForm customer={c} onSave={(x) => (c ? A.updCustomer(c.id, x) : A.addCustomer(x))} /></Sheet>; }
      case "cust": return <CustomerSheet cust={find(db.customers, sheet.id)} db={db} money={money} A={A} onClose={closeSheet} openSheet={setSheet} />;
      case "receipt": return <ReceiptSheet sale={find(db.sales, sheet.id)} money={money} A={A} onClose={closeSheet} openSheet={setSheet} />;
      case "return": { const sl = find(db.sales, sheet.id); return sl ? <Sheet title={"Return items · " + sl.no} onClose={closeSheet}><ReturnForm sale={sl} money={money} onSave={(x) => A.returnItems(sl.id, x)} /></Sheet> : null; }
      case "share": return <ShareSheet sale={sheet.sale} A={A} onClose={closeSheet} />;
      case "categories": return <CategoriesSheet db={db} A={A} onClose={closeSheet} />;
      case "expense": return <Sheet title="Add expense" onClose={closeSheet}><ExpenseForm onSave={A.addExpense} /></Sheet>;
      case "supplier": return <Sheet title="Add supplier" onClose={closeSheet}><SupplierForm onSave={A.addSupplier} /></Sheet>;
      case "sup": return <SupplierSheet supplier={find(db.suppliers, sheet.id)} db={db} money={money} onClose={closeSheet} A={A} />;
      case "note": return <Sheet title="Add note" onClose={closeSheet}><NoteForm onSave={A.addNote} /></Sheet>;
      default: return null;
    }
  };

  /* Each page shows a ⋮ menu only when it has actions of its own. */
  let menuItems = [];
  if (!view && tab === "home") {
    menuItems = [
      { label: "Performance and reports", Icon: BarChart3, fn: () => goView("perf") },
      { label: "Settings", Icon: Settings, fn: () => goView("settings") },
      { label: "Backup and restore", Icon: ShieldCheck, fn: () => goView("backup") },
    ];
    if (hasPin && unlocked) menuItems.push({ label: "Lock now", Icon: Lock, fn: () => { setUnlocked(false); setMenu(false); } });
  } else if (!view && tab === "products") {
    menuItems = [
      ...(db.products.length ? [{ label: "Receive stock", Icon: Package, fn: () => { setMenu(false); setSheet({ t: "receive" }); } }] : []),
      { label: "Categories", Icon: Tags, fn: () => { setMenu(false); setSheet({ t: "categories" }); } },
    ];
  }

  const title = view ? VIEW_TITLES[view] : TABS.find((t) => t[0] === tab)[1];
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="app" data-theme={s.theme} data-font={s.font} ref={rootRef}>
      <style>{CSS}</style>
      {!loaded && <p className="empty">Loading…</p>}
      {loaded && !s.setupDone && <Setup onDone={A.finishSetup} />}
      {loaded && s.setupDone && (
        <>
          <header className="top">
            {view && <button className="ico" onClick={() => goView(null)} aria-label="Back"><ChevronLeft size={24} /></button>}
            {!view && s.logo && <img className="hlogo" src={s.logo} alt="" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className={view ? "t-sub" : undefined}>{view ? title : s.shop}</h1>
              {!view && <p className="sub">{tab === "home" ? dateLine : title}</p>}
            </div>
            {menuItems.length > 0 && <button className="ico" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}><MoreVertical size={22} /></button>}
            {menu && menuItems.length > 0 && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 14 }} onClick={() => setMenu(false)} />
                <div className="menu" role="menu">
                  {menuItems.map(({ label, Icon, fn }) => <button key={label} onClick={fn}><Icon size={18} /> {label}</button>)}
                </div>
              </>
            )}
          </header>

          <main>
            {!view && tab === "home" && <HomePage db={db} openSell={() => setSell(true)} goTab={goTab} goView={goView} />}
            {!view && tab === "sales" && <SalesPage db={db} money={money} openSheet={setSheet} openSell={() => setSell(true)} />}
            {!view && tab === "products" && <ProductsPage key={tabArg || "all"} db={db} money={money} openSheet={setSheet} startFilter={tabArg} />}
            {!view && tab === "customers" && <CustomersPage db={db} money={money} openSheet={setSheet} />}
            {!view && tab === "more" && <MorePage goView={goView} />}
            {view === "expenses" && <ExpensesPage db={db} money={money} A={A} openSheet={setSheet} />}
            {view === "suppliers" && <SuppliersPage db={db} money={money} openSheet={setSheet} />}
            {view === "notes" && <NotesPage db={db} A={A} openSheet={setSheet} />}
            {view === "settings" && <SettingsPage db={db} A={A} openSheet={setSheet} />}
            {view === "backup" && <BackupPage db={db} A={A} />}
            {view === "perf" && (
              <Gate settings={s} unlocked={unlocked} onUnlock={() => setUnlocked(true)} onReset={() => A.saveSettings({ pinHash: "" }, "PIN removed")} note="Your profit, debts and reports are private.">
                <PerfPage db={db} money={money} hasPin={hasPin} copy={async (t) => { try { await navigator.clipboard.writeText(t); say("Copied"); } catch (e) { say("Copying isn't available here"); } }} onHide={() => { setUnlocked(false); goView(null); }} />
              </Gate>
            )}
          </main>

          <nav className="nav">
            {TABS.map(([k, l, Icon]) => <button key={k} className={!view && tab === k ? "on" : ""} onClick={() => goTab(k)} aria-current={!view && tab === k ? "page" : undefined}><Icon size={22} /><span>{l}</span></button>)}
          </nav>

          {sell && <SellFlow db={db} money={money} onSave={A.saveSale} onClose={() => setSell(false)} registerBack={(fn) => { sellBackRef.current = fn; }} onShare={(sale) => setSheet({ t: "share", sale })} onThanks={A.thanks} onAddProduct={() => { setSell(false); setSheet({ t: "product" }); }} />}
          {renderSheet()}
        </>
      )}
      {undo ? <div className="toast" role="status"><span>{undo.msg}</span><button onClick={doUndo}>Undo</button></div> : toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
