import { useState, useRef } from "react";
import { Field, Chip, Chips, PinPad } from "./ui";
import { resizeImage } from "./Forms";
import { hashPin, num, BUSINESS_TYPES } from "./logic";
import { backupNow, shareBackup } from "./storage";

const COLORS = ["#0F766E", "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#334155"];

export function SettingsPage({ db, A, openSheet }) {
  const s = db.settings;
  const [f, setF] = useState({ shop: s.shop, phone: s.phone, address: s.address, cur: s.cur, curCode: s.curCode, saleTax: String(s.saleTax), incomeTax: String(s.incomeTax), footer: s.footer });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const logoRef = useRef(null);
  const [logoErr, setLogoErr] = useState("");
  const pickLogo = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { A.saveSettings({ logo: await resizeImage(f, 300, "image/png") }, "Logo saved"); setLogoErr(""); } catch (x) { setLogoErr(x.message); }
  };
  const [pinStep, setPinStep] = useState(null); // null | "verify-change" | "verify-remove" | "new"
  const [p1, setP1] = useState(""); const [p2, setP2] = useState(""); const [pe, setPe] = useState("");

  const savePin = async () => {
    if (p1.length < 4) return setPe("Use at least 4 digits.");
    if (p1 !== p2) return setPe("The two PINs don't match.");
    A.saveSettings({ pinHash: await hashPin(p1) }, "PIN saved");
    setP1(""); setP2(""); setPe(""); setPinStep(null);
  };

  return (
    <>
      <div className="card form">
        <h2>Business</h2>
        <Field label="Business name"><input value={f.shop} onChange={set("shop")} /></Field>
        <div className="split">
          <Field label="Phone"><input inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Address"><input value={f.address} onChange={set("address")} /></Field>
        </div>
        <div className="split">
          <Field label="Currency symbol"><input value={f.cur} onChange={set("cur")} maxLength={4} /></Field>
          <Field label="Code for PDFs" hint="e.g. NGN, GHS, INR"><input value={f.curCode} onChange={set("curCode")} maxLength={4} /></Field>
        </div>
        <div className="split">
          <Field label="Sales tax %"><input inputMode="decimal" value={f.saleTax} onChange={set("saleTax")} /></Field>
          <Field label="Income tax estimate %"><input inputMode="decimal" value={f.incomeTax} onChange={set("incomeTax")} /></Field>
        </div>
        <Field label="Receipt footer"><input value={f.footer} onChange={set("footer")} /></Field>
        <button className="primary" onClick={() => A.saveSettings({ shop: f.shop.trim() || "My shop", phone: f.phone.trim(), address: f.address.trim(), cur: f.cur, curCode: f.curCode.trim().toUpperCase(), saleTax: num(f.saleTax), incomeTax: num(f.incomeTax), footer: f.footer.trim() }, "Settings saved")}>Save</button>
        <p className="muted small">The sales tax applies to new sales only. Past receipts keep the rate they were issued with.</p>
      </div>

      <div className="card form">
        <h2>Business logo</h2>
        <div className="photo">
          {s.logo ? <img className="logo-prev" src={s.logo} alt="Your logo" /> : <span className="logo-prev empty-logo">No logo</span>}
          <div className="form" style={{ gap: 6 }}>
            <button className="ghost" onClick={() => logoRef.current && logoRef.current.click()}>{s.logo ? "Change logo" : "Upload logo"}</button>
            {s.logo && <button className="link" onClick={() => A.saveSettings({ logo: "" }, "Logo removed")}>Remove logo</button>}
          </div>
          <input ref={logoRef} type="file" accept="image/*" hidden onChange={pickLogo} />
        </div>
        {logoErr && <p className="err" role="alert">{logoErr}</p>}
        <p className="muted small">It appears on Home, receipts and the thank-you card.</p>
      </div>

      <div className="card form">
        <h2>Business type and categories</h2>
        <Chips>{Object.entries(BUSINESS_TYPES).map(([k, v]) => <Chip key={k} on={s.bizType === k} onClick={() => A.saveSettings({ bizType: k })}>{v.label}</Chip>)}</Chips>
        <button className="ghost" onClick={() => openSheet({ t: "categories" })}>Manage categories ({(s.categories || []).length})</button>
      </div>

      <div className="card form">
        <h2>Receipt colour</h2>
        <div className="swatches">{COLORS.map((c) => <button key={c} className={"sw" + (s.receiptColor === c ? " on" : "")} style={{ background: c }} aria-label={"Colour " + c} onClick={() => A.saveSettings({ receiptColor: c })} />)}</div>
      </div>

      <div className="card form">
        <h2>Appearance</h2>
        <Chips>{[["auto", "Match phone"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => <Chip key={k} on={s.theme === k} onClick={() => A.saveSettings({ theme: k })}>{l}</Chip>)}</Chips>
        <Chips>{[["s", "Small text"], ["m", "Normal text"], ["l", "Large text"]].map(([k, l]) => <Chip key={k} on={s.font === k} onClick={() => A.saveSettings({ font: k })}>{l}</Chip>)}</Chips>
      </div>

      <div className="card form">
        <h2>Stock value</h2>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={s.showEstimate} onChange={(e) => A.saveSettings({ showEstimate: e.target.checked })} /> Also show an estimate at showing prices</label>
        <Chips><Chip on={s.valueBasis === "cautious"} onClick={() => A.saveSettings({ valueBasis: "cautious" })}>Lowest unit price</Chip><Chip on={s.valueBasis === "retail"} onClick={() => A.saveSettings({ valueBasis: "retail" })}>Single-piece price</Chip></Chips>
      </div>

      <div className="card form">
        <h2>Privacy PIN</h2>
        {!s.pinHash && pinStep !== "new" && <><p className="muted small">A PIN hides your profit, debts and reports from customers or staff who pick up the phone. It doesn't encrypt the data.</p><button className="primary" onClick={() => setPinStep("new")}>Set a PIN</button></>}
        {s.pinHash && !pinStep && <><p className="small">PIN is on.</p><div className="split"><button className="ghost" onClick={() => setPinStep("verify-change")}>Change PIN</button><button className="danger" onClick={() => setPinStep("verify-remove")}>Remove PIN</button></div></>}
        {pinStep === "verify-change" && <PinPad settings={s} note="Enter your current PIN first." onOk={() => setPinStep("new")} onReset={() => { A.saveSettings({ pinHash: "" }, "PIN removed"); setPinStep(null); }} />}
        {pinStep === "verify-remove" && <PinPad settings={s} note="Enter your PIN to remove it." onOk={() => { A.saveSettings({ pinHash: "" }, "PIN removed"); setPinStep(null); }} onReset={() => { A.saveSettings({ pinHash: "" }, "PIN removed"); setPinStep(null); }} />}
        {pinStep === "new" && (
          <>
            <Field label="New PIN (4 to 8 digits)"><input type="password" inputMode="numeric" value={p1} maxLength={8} onChange={(e) => setP1(e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Repeat PIN"><input type="password" inputMode="numeric" value={p2} maxLength={8} onChange={(e) => setP2(e.target.value.replace(/\D/g, ""))} /></Field>
            {pe && <p className="err" role="alert">{pe}</p>}
            <div className="split"><button className="primary" onClick={savePin}>Save PIN</button><button className="ghost" onClick={() => { setPinStep(null); setP1(""); setP2(""); setPe(""); }}>Cancel</button></div>
          </>
        )}
      </div>
    </>
  );
}

export function BackupPage({ db, A, openSheet }) {
  const [msg, setMsg] = useState("");
  const run = async (fn) => { try { setMsg(await fn()); } catch (e) { setMsg("That didn't work: " + (e && e.message ? e.message : e)); } };
  return (
    <>
      <div className="card form">
        <h2>Back up</h2>
        <p className="muted small">Your records are stored inside this app. Every change is also saved as a file in Documents/RetailLedger on your phone. If the phone is lost, broken or reset, those files go with it, so send a copy somewhere else regularly.</p>
        <div className="split">
          <button className="ghost" onClick={() => run(() => backupNow(db))}>Back up now</button>
          <button className="primary" onClick={() => run(async () => { const m = await shareBackup(db); A.markShared(); return m; })}>Send a copy</button>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </div>
      <div className="card form">
        <h2>Import and export</h2>
        <p className="muted small">Importing only adds to what you have. Nothing is deleted, and likely duplicates are flagged for you to decide.</p>
        <button className="ghost" onClick={() => openSheet({ t: "import", kind: "backup" })}>Restore from a backup file</button>
        <button className="ghost" onClick={() => openSheet({ t: "import", kind: "choose" })}>Import from Excel or CSV</button>
        <button className="ghost" onClick={() => openSheet({ t: "export", what: "sales" })}>Export to Excel or CSV</button>
      </div>
    </>
  );
}
