import { useState } from "react";
import { X, ChevronLeft } from "lucide-react";
import { hashPin } from "./logic";

export function Sheet({ title, onClose, children, full, back }) {
  return (
    <div className="ov" onClick={onClose}>
      <div className={"sheet" + (full ? " full" : "")} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sh-h"><h3>{title}</h3><button className="ico" onClick={onClose} aria-label={back ? "Back" : "Close"}>{back ? <ChevronLeft size={22} /> : <X size={20} />}</button></div>
        {children}
      </div>
    </div>
  );
}
export const Field = ({ label, children, hint }) => <label className="fld"><span>{label}</span>{children}{hint && <em className="hint">{hint}</em>}</label>;
export const Empty = ({ children }) => <p className="empty">{children}</p>;
export const Chip = ({ on, onClick, children }) => <button type="button" className={"chip" + (on ? " on" : "")} onClick={onClick}>{children}</button>;
export const Chips = ({ children }) => <div className="chips">{children}</div>;
export const Badge = ({ kind, children }) => <span className={"badge " + (kind || "")}>{children}</span>;

const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export function Avatar({ p, size = 44 }) {
  const st = { width: size, height: size, fontSize: size * 0.42 };
  if (p.photo) return <img className="av" src={p.photo} alt="" style={st} />;
  return <span className="av" style={{ ...st, background: `hsl(${hue(p.name)} 55% 88%)`, color: `hsl(${hue(p.name)} 45% 28%)` }}>{(p.name || "?").trim().charAt(0).toUpperCase()}</span>;
}

/* Asks for the PIN. Forgetting it can be fixed by typing the business name. */
export function PinPad({ settings, onOk, onReset, note }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);
  const [name, setName] = useState("");
  const go = async () => {
    if ((await hashPin(pin)) === settings.pinHash) { setPin(""); setErr(""); onOk(); } else { setErr("That PIN isn't right."); setPin(""); }
  };
  const reset = () => {
    if (name.trim().toLowerCase() === (settings.shop || "").trim().toLowerCase()) onReset(); else setErr("That isn't the business name.");
  };
  return (
    <div className="card form pin">
      <h3>Enter your PIN</h3>
      <p className="muted small">{note || "These numbers are private."}</p>
      {!forgot ? (
        <>
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="PIN" aria-label="PIN" className="pinin" />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="primary" onClick={go} disabled={pin.length < 4}>Unlock</button>
          <button className="link" onClick={() => { setForgot(true); setErr(""); }}>Forgot PIN?</button>
        </>
      ) : (
        <>
          <p className="small">Type your business name exactly as it appears at the top of the app to remove the PIN.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" aria-label="Business name" />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="primary" onClick={reset}>Remove PIN</button>
          <button className="link" onClick={() => { setForgot(false); setErr(""); }}>Back</button>
        </>
      )}
    </div>
  );
}

export function Gate({ settings, unlocked, onUnlock, onReset, children, note }) {
  if (!settings.pinHash || unlocked) return <>{children}</>;
  return <PinPad settings={settings} onOk={onUnlock} onReset={onReset} note={note} />;
}

const LIGHT = "--bg:#F3F6F5;--card:#FFFFFF;--ink:#142022;--muted:#5F7073;--line:#E1E7E4;--pri:#0F766E;--onpri:#FFFFFF;--soft:#E2F4F0;--in:#0B7A5C;--out:#C2412E;--warn:#FDECE7;--ok:#DDF3EA;--shadow:0 1px 2px rgba(20,32,34,.06),0 8px 22px rgba(20,32,34,.07);";
const DARK = "--bg:#0D1314;--card:#162022;--ink:#E8F0EE;--muted:#93A7A8;--line:#253336;--pri:#2DD4BF;--onpri:#06201D;--soft:#12302D;--in:#43D1A8;--out:#F28C78;--warn:#3A211C;--ok:#143228;--shadow:0 1px 2px rgba(0,0,0,.4);";

export const CSS = `
.app{${LIGHT}font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;max-width:560px;margin:0 auto;font-size:16px;line-height:1.4;font-variant-numeric:tabular-nums;padding-bottom:calc(84px + env(safe-area-inset-bottom))}
.app[data-font="s"]{font-size:14px}.app[data-font="l"]{font-size:18px}
.app[data-theme="dark"]{${DARK}}
@media (prefers-color-scheme:dark){.app[data-theme="auto"]{${DARK}}}
.app *{box-sizing:border-box}
.app p{margin:0}.app h1,.app h2,.app h3{margin:0}
.muted{color:var(--muted)}.small{font-size:.82em}.pos{color:var(--in)}.neg{color:var(--out)}.hint{font-size:.8em;color:var(--muted);font-style:normal}
.top{display:flex;align-items:center;gap:10px;padding:calc(14px + env(safe-area-inset-top)) 16px 8px;position:relative}
.top h1{font-size:1.45em;font-weight:750;letter-spacing:-.015em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top .sub{font-size:.8em;color:var(--muted)}
.top h1.t-sub{font-size:1.2em}
.ico{background:none;border:0;color:var(--ink);padding:8px;border-radius:12px;display:inline-flex;cursor:pointer}
.ico:hover{background:var(--soft)}
.menu{position:absolute;right:12px;top:calc(56px + env(safe-area-inset-top));background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:6px;z-index:15;min-width:230px}
.menu button{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:0;color:var(--ink);padding:11px 12px;border-radius:10px;font:inherit;cursor:pointer}
.menu button:hover{background:var(--soft)}
main{padding:6px 16px 8px;display:flex;flex-direction:column;gap:14px}
h2{font-size:1.02em;font-weight:700}h3{font-size:1.1em;font-weight:700}
.hero{display:flex;align-items:center;gap:14px;width:100%;border:0;border-radius:22px;padding:20px 20px;color:var(--onpri);background:linear-gradient(135deg,var(--pri),color-mix(in srgb,var(--pri) 62%,#001a17));box-shadow:var(--shadow);cursor:pointer;text-align:left;font:inherit}
.hero .hb{background:rgba(255,255,255,.2);border-radius:16px;padding:12px;display:flex}
.hero b{font-size:1.25em;display:block}.hero span{opacity:.85;font-size:.88em}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 6px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--ink);font:inherit;font-size:.92em;font-weight:600;cursor:pointer;box-shadow:var(--shadow)}
.tile i{width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 15%,transparent);color:var(--t)}
.nudge{display:flex;align-items:center;gap:10px;background:var(--soft);border-radius:14px;padding:11px 14px;font-size:.9em;border:0;width:100%;text-align:left;color:var(--ink);font-family:inherit;cursor:pointer}
.nudge.warn{background:var(--warn)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:var(--shadow)}
.card.list{padding:0;overflow:hidden}.card.flat{box-shadow:none}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.amt{font-size:1.3em;font-weight:700;margin-top:2px}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);color:inherit;font:inherit}
.card:not(.list)>.row{padding:8px 0}
.row:last-child{border-bottom:0}
.row .lead{display:flex;align-items:center;gap:12px;min-width:0}.row .lead>span{min-width:0}
.right{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none}
.tap{cursor:pointer}.tap:hover{background:var(--soft)}
.row.sel{background:var(--soft)}
.badge{font-size:.75em;padding:2px 9px;border-radius:99px;background:var(--line);white-space:nowrap;font-weight:600}.badge.warn{background:var(--warn);color:var(--out)}.badge.ok{background:var(--ok);color:var(--in)}
.av{border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;object-fit:cover;flex:none}
.empty{padding:22px 8px;color:var(--muted);text-align:center}
button{font:inherit;cursor:pointer}
.primary,.ghost,.danger{border-radius:14px;padding:13px 16px;font-weight:650;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.primary{background:var(--pri);color:var(--onpri)}.primary:disabled{opacity:.45}
.ghost{background:transparent;border-color:var(--line);color:var(--ink)}.ghost:disabled{opacity:.45}
.danger{background:transparent;border-color:var(--out);color:var(--out)}
.wide{width:100%}.big-btn{padding:16px 18px;font-size:1.05em}
.link{background:none;border:0;color:var(--muted);text-decoration:underline;padding:4px 0;font-size:.9em;text-align:center}
.split{display:flex;gap:10px}.split>*{flex:1;min-width:0}.between{justify-content:space-between;align-items:center}.between>*{flex:none}
.form{display:flex;flex-direction:column;gap:11px}
.fld{display:flex;flex-direction:column;gap:5px;font-size:.84em;color:var(--muted);font-weight:600}
input,select,textarea{font:inherit;font-size:1rem;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 12px;width:100%;min-width:0}
textarea{min-height:90px;resize:vertical}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.pinin{text-align:center;font-size:1.6em;letter-spacing:.4em}
.err{color:var(--out);font-size:.9em}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:8px 14px;font-size:.88em;font-weight:600}
.chip.on{background:var(--pri);color:var(--onpri);border-color:var(--pri)}
.seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:3px;gap:3px}
.seg button{border:0;background:none;color:var(--muted);padding:9px 0;border-radius:11px;font-weight:650}.seg .on{background:var(--pri);color:var(--onpri)}
.search{position:relative}.search input{padding-left:38px}.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted)}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pcard{position:relative;display:flex;flex-direction:column;gap:8px;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px;color:var(--ink);box-shadow:var(--shadow)}
.pcard:disabled{opacity:.5}.pcard .nm{font-weight:650;line-height:1.2}.pcard .pr{color:var(--pri);font-weight:700}
.pcard .qty{position:absolute;top:8px;right:8px;background:var(--pri);color:var(--onpri);border-radius:99px;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85em;padding:0 7px}
.pcard .ph{width:100%;aspect-ratio:4/3;border-radius:12px}
.cartbar{position:sticky;bottom:calc(12px + env(safe-area-inset-bottom));margin-top:auto}
.line{display:flex;flex-direction:column;gap:9px;padding:12px 14px;border-bottom:1px solid var(--line)}
.line:last-child{border-bottom:0}
.step{display:flex;align-items:center;gap:6px}.step button{width:38px;height:38px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:1.2em;display:flex;align-items:center;justify-content:center}
.step input{width:70px;text-align:center}
.sum{border-top:1px solid var(--line);padding-top:4px}.sum .row{padding:6px 0;border:0}
.done{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:10px 0}
.done .ok{width:84px;height:84px;border-radius:99px;background:var(--ok);color:var(--in);display:flex;align-items:center;justify-content:center}
.done .tot{font-size:2.2em;font-weight:750}
.nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:560px;display:grid;grid-template-columns:repeat(5,1fr);background:var(--card);border-top:1px solid var(--line);padding:6px 2px calc(6px + env(safe-area-inset-bottom));z-index:10}
.nav button{background:none;border:0;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.72em;padding:5px 0;font-weight:600}.nav .on{color:var(--pri)}
.ov{position:fixed;inset:0;background:rgba(8,16,18,.55);display:flex;align-items:flex-end;justify-content:center;z-index:20}
.sheet{background:var(--bg);color:var(--ink);width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;padding:14px 16px calc(24px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:13px}
.sheet.full{height:100%;max-height:100%;border-radius:0}
.sh-h{display:flex;justify-content:space-between;align-items:center}
.toast{position:fixed;bottom:calc(92px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:9px 16px;border-radius:99px;font-size:.9em;z-index:40;max-width:90%}
.prow{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--shadow)}
.addrow{display:grid;grid-template-columns:78px 1fr auto;gap:8px;align-items:center}
.block{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow)}
.brow{position:relative;border-radius:12px;overflow:hidden;background:var(--card);border:1px solid var(--line)}
.bfill{position:absolute;top:0;bottom:0;left:0;opacity:.17}
.bcontent{position:relative;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px}
.qp{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:end}.qp .fld{min-width:0}
.part{background:var(--soft);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.sugg{border:1px dashed var(--pri);background:transparent;color:var(--ink);border-radius:12px;padding:10px 12px;text-align:left;font-size:.88em}
.hlogo{width:38px;height:38px;border-radius:11px;object-fit:contain;background:#fff;border:1px solid var(--line);flex:none}
.logo-prev{width:72px;height:72px;border-radius:14px;object-fit:contain;background:#fff;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:.75em;color:var(--muted)}
.toast{display:flex;align-items:center;gap:14px}
.toast button{background:none;border:0;color:inherit;font-weight:700;padding:0;font-size:1em;text-decoration:underline}
.unit{background:var(--soft);border-radius:14px;padding:11px;display:flex;flex-direction:column;gap:8px}
.chart{color:var(--muted)}
.photo{display:flex;align-items:center;gap:12px}
.swatches{display:flex;gap:10px}.sw{width:34px;height:34px;border-radius:99px;border:3px solid transparent}.sw.on{border-color:var(--ink)}
.sw{padding:0}
@media (prefers-reduced-motion:no-preference){.sheet{animation:up .18s ease-out}@keyframes up{from{transform:translateY(22px);opacity:.6}to{transform:none;opacity:1}}}
`;
