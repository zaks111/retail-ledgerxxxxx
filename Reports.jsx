import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { Chip, Chips } from "./ui";
import { LEDGER_TYPES } from "./Pages";
import { ProductsAnalysis, TrendsAnalysis, RangePicker } from "./Analysis";
import { rangeFor } from "./analysis";
import { summarize, periodsFor, stockValues, supplierBalance, labelFor, shortFor, todayISO, addDays, calcSale, r2 } from "./logic";

export default function PerfPage({ db, money, copy, onHide, hasPin }) {
  const today = todayISO();
  const [mode, setMode] = useState("month");
  const [sel, setSel] = useState(null);
  const [basis, setBasis] = useState(db.settings.valueBasis || "cautious");
  const [page, setPage] = useState("overview");
  const [rk, setRk] = useState("30d");
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const range = rangeFor(rk, today, custom);
  const tax = db.settings.incomeTax;
  const losses = db.stockLog.filter((l) => l.loss);
  const day = summarize(db.sales.filter((s) => s.date === today), db.expenses.filter((e) => e.date === today), losses.filter((l) => l.date === today), tax);
  const mon = summarize(db.sales.filter((s) => s.date.slice(0, 7) === today.slice(0, 7)), db.expenses.filter((e) => e.date.slice(0, 7) === today.slice(0, 7)), losses.filter((l) => l.date.slice(0, 7) === today.slice(0, 7)), tax);

  const customersOwe = r2(db.sales.reduce((a, s) => a + calcSale(s).due, 0));
  const deposits = r2(db.customers.reduce((a, c) => a + (c.deposit || 0), 0));
  const bals = db.suppliers.map((s) => supplierBalance(db.ledger, s.id, LEDGER_TYPES));
  const youOwe = r2(bals.filter((b) => b > 0.004).reduce((a, b) => a + b, 0));
  const theyOwe = r2(bals.filter((b) => b < -0.004).reduce((a, b) => a - b, 0));
  const sv = stockValues(db.products);
  const selling = basis === "retail" ? sv.retail : sv.cautious;

  const periods = useMemo(() => periodsFor(db, mode, today), [db, mode, today]);
  const curKey = periods.find((p) => p.k === (sel || "")) ? sel : periods[0].k;
  const active = periods.find((p) => p.k === curKey) || periods[0];
  const chart = periods.slice(0, 12).reverse().map((p) => ({ name: shortFor(p.k, mode), profit: Math.round(p.net * 100) / 100 }));
  const csv = () => copy(["Period,Sales,Cost of goods,Expenses,Stock losses,Net profit,Sales tax collected,Est. income tax", ...periods.map((p) => [`"${labelFor(p.k, mode)}"`, p.revenue, p.cogs, p.exp, p.loss, p.net, p.tax, p.estTax].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join(","))].join("\n"));
  const modes = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Annual"]];

  return (
    <>
      <div className="split between"><p className="muted small">{hasPin ? "Private. It locks again when you leave." : "Set a PIN in Settings to keep this private."}</p><button className="ghost" onClick={onHide}>Hide</button></div>
      <div className="seg" role="tablist">{[["overview", "Overview"], ["products", "Products"], ["trends", "Trends"]].map(([k, l]) => <button key={k} role="tab" aria-selected={page === k} className={page === k ? "on" : ""} onClick={() => setPage(k)}>{l}</button>)}</div>
      {page !== "overview" && <RangePicker rk={rk} setRk={setRk} custom={custom} setCustom={setCustom} />}
      {page === "products" && <ProductsAnalysis db={db} money={money} range={range} today={today} />}
      {page === "trends" && <TrendsAnalysis db={db} money={money} range={range} />}
      {page === "overview" && (
      <>
      <div className="grid2">
        <div className="card"><p className="muted small">Profit today</p><p className={"amt " + (day.net < 0 ? "neg" : "pos")}>{money(day.net)}</p><p className="muted small">Sales {money(day.revenue)}</p></div>
        <div className="card"><p className="muted small">Profit this month</p><p className={"amt " + (mon.net < 0 ? "neg" : "pos")}>{money(mon.net)}</p><p className="muted small">Sales {money(mon.revenue)}</p></div>
      </div>

      <h2>Money position</h2>
      <div className="card">
        <div className="row"><span>Customers owe you</span><b>{money(customersOwe)}</b></div>
        <div className="row"><span>Customer deposits you hold</span><b>{money(deposits)}</b></div>
        <div className="row"><span>You owe suppliers</span><b className={youOwe > 0 ? "neg" : ""}>{money(youOwe)}</b></div>
        <div className="row"><span>Suppliers owe you</span><b className={theyOwe > 0 ? "pos" : ""}>{money(theyOwe)}</b></div>
      </div>

      <h2>Stock value</h2>
      <div className="card">
        <div className="row"><span>At purchase cost</span><b>{money(sv.cost)}</b></div>
        <div className="row"><span>At selling price</span><b>{money(selling)}</b></div>
        <div className="row"><span>Potential profit in stock</span><b className={selling - sv.cost < 0 ? "neg" : "pos"}>{money(selling - sv.cost)}</b></div>
        {db.settings.showEstimate && <div className="row"><span>At showing price</span><b>{money(sv.showing)}</b></div>}
        <Chips><Chip on={basis === "cautious"} onClick={() => setBasis("cautious")}>Lowest unit price</Chip><Chip on={basis === "retail"} onClick={() => setBasis("retail")}>Single-piece price</Chip></Chips>
        <p className="muted small">Cost is the official figure. Selling values are estimates of what the stock could bring in.</p>
      </div>

      <h2>Reports</h2>
      <div className="seg">{modes.map(([k, l]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setSel(null); }}>{l}</button>)}</div>
      <div className="card">
        <h2 style={{ marginBottom: 6 }}>{labelFor(active.k, mode)}</h2>
        <div className="row"><span>Sales (before tax)</span><span>{money(active.revenue)}</span></div>
        <div className="row"><span>Cost of goods sold</span><span>{money(-active.cogs)}</span></div>
        <div className="row"><b>Gross profit</b><b>{money(active.gross)}</b></div>
        <div className="row"><span>Expenses</span><span>{money(-active.exp)}</span></div>
        {active.loss > 0 && <div className="row"><span>Stock losses</span><span>{money(-active.loss)}</span></div>}
        <div className="row"><b>Net profit</b><b className={active.net < 0 ? "neg" : "pos"}>{money(active.net)}</b></div>
        <div className="row"><span>Estimated income tax</span><span>{money(active.estTax)}</span></div>
        <div className="row"><b>Profit after tax</b><b>{money(active.after)}</b></div>
        <div className="row"><span>Sales tax collected (to pass on)</span><span>{money(active.tax)}</span></div>
        <div className="row"><span>Price cuts and discounts given</span><span>{money(active.concession)}</span></div>
        <p className="muted small">{active.count} {active.count === 1 ? "sale" : "sales"} in this period. Estimates are for planning, so check them with your accountant.</p>
      </div>
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
      <div className="split between"><h2>All periods</h2><button className="link" onClick={csv}>Copy as CSV</button></div>
      <div className="card list">
        {periods.map((p) => (
          <button className={"row tap " + (p.k === active.k ? "sel" : "")} key={p.k} onClick={() => setSel(p.k)}>
            <span><b>{labelFor(p.k, mode)}</b><br /><span className="muted small">Sales {money(p.revenue)} · Cost {money(p.cogs)} · Expenses {money(p.exp)}</span></span>
            <b className={p.net < 0 ? "neg" : "pos"}>{money(p.net)}</b>
          </button>
        ))}
      </div>
      </>
      )}
    </>
  );
}
