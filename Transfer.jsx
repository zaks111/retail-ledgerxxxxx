import { useState, useRef } from "react";
import { Sheet, Field, Empty, Chip, Chips } from "./ui";
import { parseBackup } from "./storage";
import { shareFile } from "./receipt";
import { planMerge, applyMerge } from "./merge";
import { readXLSX, parseCSV, mapRows, recordsToDb, writeXLSX, toCSV, utf8ToBase64, exportSheets, KIND_LABEL, TEMPLATES, TEXT_COLS, EXPORTS } from "./tables";
import { calcSale, trimNum, todayISO, addDays } from "./logic";

const KIND_NAMES = { products: "Products", customers: "Customers", suppliers: "Suppliers", sales: "Sales", expenses: "Expenses", ledger: "Supplier entries", custLedger: "Customer payments", purchases: "Stock purchases", stockLog: "Stock changes", notes: "Notes" };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const slug = (s) => String(s || "shop").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "shop";

export function ImportSheet({ db, money, kind: startKind, A, onClose, say }) {
  const [kind, setKind] = useState(startKind === "choose" ? "" : startKind);
  const [parsed, setParsed] = useState(null);
  const [choices, setChoices] = useState({});
  const [useSettings, setUseSettings] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const isBackup = kind === "backup";

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    setBusy(true); setErr(""); setParsed(null); setChoices({});
    try {
      if (isBackup) {
        const raw = parseBackup(await f.text());
        setParsed({ plan: planMerge(db, raw), raw, name: f.name, skipped: [] });
      } else {
        const ext = f.name.toLowerCase().split(".").pop();
        let rows;
        if (ext === "xlsx") {
          const sheets = await readXLSX(await f.arrayBuffer());
          const sh = sheets.find((s) => s.name.toLowerCase() === KIND_LABEL[kind].toLowerCase()) || sheets.find((s) => !mapRows(s.rows, kind).error) || sheets[0];
          rows = sh ? sh.rows : [];
        } else if (ext === "xls") throw new Error("Old .xls files aren't supported. In Excel choose Save As and pick .xlsx or CSV.");
        else rows = parseCSV(await f.text());
        const m = mapRows(rows, kind);
        if (m.error) throw new Error(m.error);
        if (m.records.length > 20000) throw new Error("That file has more than 20,000 rows. Please split it into smaller files.");
        const r = recordsToDb(kind, m.records);
        setParsed({ plan: planMerge(db, r.db), raw: r.db, name: f.name, skipped: r.skipped });
      }
    } catch (x) { setErr(x && x.message ? x.message : "Couldn't read that file."); }
    setBusy(false);
  };

  const template = async () => {
    try { say(await shareFile(`import-template-${kind}.xlsx`, await writeXLSX([{ name: KIND_LABEL[kind], rows: TEMPLATES[kind], textCols: TEXT_COLS[kind] }]), XLSX_MIME, "Import template")); } catch (x) { if (!/cancel/i.test(x && x.message)) say("Couldn't share: " + (x && x.message)); }
  };

  const describe = {
    products: (p) => `${trimNum(p.qty)} ${p.units[0].name} in stock · ${money(p.units[0].price)}`,
    customers: (c) => `${c.phone || "no phone"}${c.deposit ? " · deposit " + money(c.deposit) : ""}`,
    suppliers: (s) => s.phone || "no phone",
    sales: (s) => `${s.no} · ${s.date} ${s.time || ""} · ${money(calcSale(s).total)}`,
    expenses: (e) => `${e.date} · ${e.category} · ${money(e.amount)}`,
  };
  const title = { products: (x) => x.name, customers: (x) => x.name, suppliers: (x) => x.name, sales: (x) => (x.customerName || "Walk-in") + " · " + x.date, expenses: (x) => x.category };
  const setAll = (v) => { const o = {}; parsed.plan.dups.forEach((d) => { o[d.key] = v; }); setChoices(o); };

  const plan = parsed && parsed.plan;
  const nothing = plan && plan.addable === 0 && plan.dups.length === 0;
  const apply = () => {
    const r = applyMerge(db, plan, choices, { useSettings });
    const s = r.summary;
    A.applyImport(r.db, `Import done: ${s.added} added${s.replaced ? ", " + s.replaced + " updated" : ""}${s.skipped ? ", " + s.skipped + " skipped" : ""}`);
  };

  return (
    <Sheet title={isBackup ? "Restore from backup file" : "Import from Excel or CSV"} onClose={onClose}>
      {!kind && (
        <>
          <p className="muted small">What are you importing?</p>
          <Chips>{["products", "customers", "expenses"].map((k) => <Chip key={k} on={false} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}</Chips>
        </>
      )}
      {kind && !parsed && (
        <>
          <p className="muted small">{isBackup ? "Choose a backup file made by this app. Your current data stays; only what's new is added, and you review any duplicates first." : `Choose an Excel (.xlsx) or CSV file of ${KIND_LABEL[kind].toLowerCase()}. Nothing in your app is deleted, and you'll see a preview before anything is added.`}</p>
          <button className="primary big-btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>{busy ? "Reading…" : "Choose file"}</button>
          <input ref={fileRef} type="file" accept={isBackup ? ".json,application/json" : ".xlsx,.csv,.txt,text/csv"} hidden onChange={onFile} />
          {!isBackup && <button className="link" onClick={template}>Get the Excel template</button>}
          {!isBackup && startKind === "choose" && <button className="link" onClick={() => setKind("")}>Pick a different type</button>}
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}

      {plan && (
        <>
          <p className="muted small">File: {parsed.name}</p>
          <div className="card flat">
            {Object.keys(KIND_NAMES).filter((k) => plan.counts[k].total > 0).map((k) => {
              const c = plan.counts[k];
              return <div className="row" key={k}><span>{KIND_NAMES[k]}</span><span className="small"><b>{c.fresh}</b> new{c.same ? ` · ${c.same} already here` : ""}{c.dup ? ` · ${c.dup} possible duplicate${c.dup === 1 ? "" : "s"}` : ""}</span></div>;
            })}
          </div>
          {parsed.skipped.length > 0 && <p className="muted small">{parsed.skipped.length} {parsed.skipped.length === 1 ? "row was" : "rows were"} skipped: {parsed.skipped.slice(0, 3).join("; ")}{parsed.skipped.length > 3 ? "…" : ""}</p>}
          {nothing && <Empty>Nothing new to add. Everything in this file is already in your app.</Empty>}

          {plan.dups.length > 0 && (
            <>
              <h2>Possible duplicates</h2>
              <p className="muted small">These look like things you already have. Your own record is kept unless you choose otherwise.</p>
              <div className="split between"><span className="small">For all of them:</span><Chips><Chip on={false} onClick={() => setAll("skip")}>Keep mine</Chip><Chip on={false} onClick={() => setAll("both")}>Keep both</Chip><Chip on={false} onClick={() => setAll("use")}>Use file</Chip></Chips></div>
              {plan.dups.slice(0, 100).map((d) => {
                const ch = choices[d.key] || "skip";
                return (
                  <div className="card flat form" key={d.key}>
                    <b>{title[d.kind](d.inc)} <span className="muted small">({KIND_NAMES[d.kind].toLowerCase()})</span></b>
                    <span className="small">In your app: {describe[d.kind](d.mine)}</span>
                    <span className="small">In the file: {describe[d.kind](d.inc)}</span>
                    <Chips>{[["skip", "Keep mine"], ["both", "Keep both"], ["use", "Use file"]].map(([v, l]) => <Chip key={v} on={ch === v} onClick={() => setChoices({ ...choices, [d.key]: v })}>{l}</Chip>)}</Chips>
                  </div>
                );
              })}
              {plan.dups.length > 100 && <p className="muted small">Showing the first 100 of {plan.dups.length}. The rest are kept as yours.</p>}
            </>
          )}

          {isBackup && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={useSettings} onChange={(e) => setUseSettings(e.target.checked)} /> Also use this file's shop name, currency, taxes and logo</label>}
          <p className="muted small">A safety copy of your current data is saved first, and you can tap Undo straight after.</p>
          <button className="primary big-btn" onClick={apply} disabled={nothing}>Add to my data</button>
          {isBackup && !confirmReplace && <button className="link" onClick={() => setConfirmReplace(true)}>Replace everything with this file instead</button>}
          {isBackup && confirmReplace && (
            <div className="card form">
              <p className="small"><b>This deletes your current data</b> and puts this file's data in its place. Use it for a new or reset phone.</p>
              <div className="split"><button className="danger" onClick={() => A.replaceAll(parsed.raw)}>Yes, replace everything</button><button className="ghost" onClick={() => setConfirmReplace(false)}>Cancel</button></div>
            </div>
          )}
          <button className="link" onClick={() => { setParsed(null); setChoices({}); }}>Choose a different file</button>
        </>
      )}
    </Sheet>
  );
}

export function ExportSheet({ db, what: startWhat, say, onClose }) {
  const [what, setWhat] = useState(startWhat || "sales");
  const [period, setPeriod] = useState("all");
  const [format, setFormat] = useState("xlsx");
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const ranges = {
    all: { from: "", to: "" },
    month: { from: today.slice(0, 7) + "-01", to: today },
    last: (() => { const first = today.slice(0, 7) + "-01"; const prevEnd = addDays(first, -1); return { from: prevEnd.slice(0, 7) + "-01", to: prevEnd }; })(),
    year: { from: today.slice(0, 4) + "-01-01", to: today },
  };
  const isAll = what === "all";
  const usesDates = ["sales", "items", "expenses", "all"].includes(what);

  const go = async () => {
    setBusy(true);
    try {
      const sheets = exportSheets(db, ranges[usesDates ? period : "all"]);
      const base = `${slug(db.settings.shop)}-${isAll ? "all-data" : what}-${today}`;
      if (isAll || format === "xlsx") {
        const list = (isAll ? EXPORTS : EXPORTS.filter(([k]) => k === what)).map(([k, name]) => ({ name, rows: sheets[k], textCols: k === "customers" ? [1] : [] }));
        say(await shareFile(base + ".xlsx", await writeXLSX(list), XLSX_MIME, "Export"));
      } else say(await shareFile(base + ".csv", utf8ToBase64(toCSV(sheets[what])), "text/csv", "Export"));
    } catch (x) { if (!/cancel/i.test(x && x.message)) say("Couldn't export: " + (x && x.message)); }
    setBusy(false);
  };

  return (
    <Sheet title="Export to Excel or CSV" onClose={onClose}>
      <div className="fld"><span>What to export</span>
        <Chips>{EXPORTS.map(([k, l]) => <Chip key={k} on={what === k} onClick={() => setWhat(k)}>{l}</Chip>)}<Chip on={isAll} onClick={() => setWhat("all")}>Everything</Chip></Chips>
      </div>
      {usesDates && <div className="fld"><span>Period</span><Chips>{[["all", "All time"], ["month", "This month"], ["last", "Last month"], ["year", "This year"]].map(([k, l]) => <Chip key={k} on={period === k} onClick={() => setPeriod(k)}>{l}</Chip>)}</Chips></div>}
      <div className="fld"><span>File type</span><Chips><Chip on={isAll || format === "xlsx"} onClick={() => setFormat("xlsx")}>Excel (.xlsx)</Chip><Chip on={!isAll && format === "csv"} onClick={() => !isAll && setFormat("csv")}>CSV</Chip></Chips></div>
      <p className="muted small">{isAll ? "Everything goes into one Excel file with a sheet for each type." : "Opens in Excel, Google Sheets and similar apps."} You can send it to WhatsApp, email or Drive.</p>
      <button className="primary big-btn" onClick={go} disabled={busy}>{busy ? "Preparing…" : "Export and share"}</button>
    </Sheet>
  );
}
