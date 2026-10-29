import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { Chip, Chips, Empty } from "./ui";
import { trimNum, fmtDay } from "./logic";
import { RANGES, productStats, fastMovers, topProfit, topMargin, slowMovers, categoryStats, trendFor, weekdayStats, hourStats, customerStats, topDebtors } from "./analysis";

function BarRow({ label, sub, value, max, right, tone }) {
  const w = max > 0 ? Math.max(3, (Math.max(0, value) / max) * 100) : 0;
  return (
    <div className="brow">
      <div className="bfill" style={{ width: w + "%", background: tone === "bad" ? "var(--out)" : "var(--pri)" }} />
      <div className="bcontent">
        <span style={{ minWidth: 0 }}><b>{label}</b>{sub && <><br /><span className="muted small">{sub}</span></>}</span>
        <b style={{ flex: "none" }}>{right}</b>
      </div>
    </div>
  );
}

export function RangePicker({ rk, setRk, custom, setCustom }) {
  return (
    <>
      <Chips>{RANGES.map(([k, l]) => <Chip key={k} on={rk === k} onClick={() => setRk(k)}>{l}</Chip>)}</Chips>
      {rk === "custom" && (
        <div className="split">
          <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From date" />
          <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To date" />
        </div>
      )}
    </>
  );
}

const rangeText = (r) => (r.from === r.to ? fmtDay(r.from, { month: "short", day: "numeric", year: "numeric" }) : `${fmtDay(r.from, { month: "short", day: "numeric" })} to ${fmtDay(r.to, { month: "short", day: "numeric", year: "numeric" })}`);

export function ProductsAnalysis({ db, money, range, today }) {
  const [more, setMore] = useState(false);
  const [by, setBy] = useState("profit");
  const [slowDays, setSlowDays] = useState(60);
  const stats = productStats(db, range);
  const n = more ? 10 : 5;
  const fast = fastMovers(stats).slice(0, n);
  const best = (by === "profit" ? topProfit(stats) : topMargin(stats)).slice(0, n);
  const slow = slowMovers(db, slowDays, today);
  const cats = categoryStats(stats);
  const tied = slow.reduce((a, x) => a + x.tied, 0);
  const maxFast = Math.max(0, ...fast.map((x) => x.pcs));
  const maxBest = Math.max(0, ...best.map((x) => (by === "profit" ? x.profit : x.margin)));
  const maxCat = Math.max(0, ...cats.map((x) => x.revenue));
  return (
    <>
      <p className="muted small">{rangeText(range)} · {stats.length} {stats.length === 1 ? "product" : "products"} sold</p>

      <h2>Fast movers</h2>
      {fast.length === 0 ? <Empty>No sales in this period yet.</Empty> : fast.map((x) => <BarRow key={x.pid} label={x.name} sub={`${x.count} ${x.count === 1 ? "sale" : "sales"} · ${money(x.revenue)}`} value={x.pcs} max={maxFast} right={`${trimNum(x.pcs)} ${x.base}`} />)}

      <h2>Most profitable</h2>
      <Chips><Chip on={by === "profit"} onClick={() => setBy("profit")}>By profit</Chip><Chip on={by === "margin"} onClick={() => setBy("margin")}>By margin %</Chip></Chips>
      {best.length === 0 ? <Empty>No sales in this period yet.</Empty> : best.map((x) => (
        <BarRow key={x.pid} label={x.name} sub={by === "profit" ? `Margin ${Math.round(x.margin * 100)}%` : `Profit ${money(x.profit)}`} value={by === "profit" ? x.profit : x.margin} max={maxBest} tone={x.profit < 0 ? "bad" : ""} right={by === "profit" ? money(x.profit) : `${Math.round(x.margin * 100)}%`} />
      ))}
      {stats.length > 5 && <button className="link" onClick={() => setMore(!more)}>{more ? "Show fewer" : "Show top 10"}</button>}
      <p className="muted small">Profit is sales minus what the stock cost you, with discounts shared out and returns removed. It's before expenses and tax.</p>

      <h2>Slow movers</h2>
      <Chips>{[30, 60, 90].map((d) => <Chip key={d} on={slowDays === d} onClick={() => setSlowDays(d)}>{d}+ days</Chip>)}</Chips>
      {slow.length === 0 ? <Empty>Nothing in stock has been sitting for {slowDays}+ days.</Empty> : (
        <>
          <p className="small">{money(tied)} of stock cost is tied up in these {slow.length} {slow.length === 1 ? "product" : "products"}.</p>
          {slow.map((x) => <BarRow key={x.pid} label={x.name} sub={x.since === null ? `No sales recorded · ${trimNum(x.qty)} ${x.base} in stock` : `Last sold ${x.since} days ago · ${trimNum(x.qty)} ${x.base} in stock`} value={x.tied} max={slow[0].tied} tone="bad" right={money(x.tied)} />)}
        </>
      )}

      <h2>By category</h2>
      {cats.length === 0 ? <Empty>No sales in this period yet.</Empty> : cats.map((x) => <BarRow key={x.name} label={x.name} sub={`Profit ${money(x.profit)}`} value={x.revenue} max={maxCat} right={money(x.revenue)} />)}
    </>
  );
}

export function TrendsAnalysis({ db, money, range }) {
  const tr = trendFor(db, range);
  const days = weekdayStats(db, range);
  const hours = hourStats(db, range).filter((h) => h.count > 0);
  const custs = customerStats(db, range).slice(0, 5);
  const debtors = topDebtors(db).slice(0, 5);
  const total = tr.data.reduce((a, b) => a + b.sales, 0);
  const profit = tr.data.reduce((a, b) => a + b.profit, 0);
  const maxDay = Math.max(0, ...days.map((d) => d.sales));
  const maxHour = Math.max(0, ...hours.map((h) => h.sales));
  const bestDay = days.reduce((a, d) => (d.sales > a.sales ? d : a), days[0]);
  return (
    <>
      <p className="muted small">{rangeText(range)} · {tr.count} {tr.count === 1 ? "sale" : "sales"}</p>
      <div className="grid2">
        <div className="card"><p className="muted small">Sales</p><p className="amt">{money(total)}</p></div>
        <div className="card"><p className="muted small">Profit before expenses</p><p className={"amt " + (profit < 0 ? "neg" : "pos")}>{money(profit)}</p></div>
      </div>
      {tr.count === 0 ? <Empty>No sales in this period yet.</Empty> : (
        <div className="card chart">
          <p className="muted small">{tr.mode === "hour" ? "By hour of the day" : tr.mode === "day" ? "By day" : "By month"}</p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={tr.data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide />
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="sales" name="Sales" fill="var(--pri)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name="Profit" radius={[3, 3, 0, 0]}>{tr.data.map((d, i) => <Cell key={i} fill={d.profit < 0 ? "var(--out)" : "var(--in)"} fillOpacity={0.55} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          {tr.mode === "hour" && tr.untimed > 0 && <p className="muted small">{tr.untimed} older {tr.untimed === 1 ? "sale has" : "sales have"} no time recorded and isn't shown here.</p>}
        </div>
      )}

      {range.from !== range.to && (
        <>
          <h2>Best days of the week</h2>
          {maxDay === 0 ? <Empty>No sales in this period yet.</Empty> : (
            <>
              <p className="small">Your strongest day is <b>{bestDay.name}</b>.</p>
              {days.map((d) => <BarRow key={d.name} label={d.name} sub={`${d.count} ${d.count === 1 ? "sale" : "sales"}`} value={d.sales} max={maxDay} right={money(d.sales)} />)}
            </>
          )}
        </>
      )}

      <h2>Busiest hours</h2>
      {hours.length === 0 ? <Empty>No timed sales in this period. Sales recorded in the newer version store the time.</Empty> : hours.map((h) => <BarRow key={h.name} label={`${h.name.padStart(2, "0")}:00`} sub={`${h.count} ${h.count === 1 ? "sale" : "sales"}`} value={h.sales} max={maxHour} right={money(h.sales)} />)}

      <h2>Top customers</h2>
      {custs.length === 0 ? <Empty>No sales to named customers in this period.</Empty> : custs.map((c) => <BarRow key={c.cid} label={c.name} sub={`${c.count} ${c.count === 1 ? "sale" : "sales"}`} value={c.revenue} max={custs[0].revenue} right={money(c.revenue)} />)}

      <h2>Who owes you most</h2>
      {debtors.length === 0 ? <Empty>Nobody owes you anything right now.</Empty> : debtors.map((c) => <BarRow key={c.cid} label={c.name} value={c.owed} max={debtors[0].owed} tone="bad" right={money(c.owed)} />)}
    </>
  );
}
