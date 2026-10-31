/* Spreadsheet files: reading and writing CSV and Excel (.xlsx), and the tables the app exports. */
import JSZip from "jszip/dist/jszip.min.js";
import { calcSale, groupItems, partsText, owedBy, supplierBalance, LEDGER_TYPES, uid, r2, num, todayISO, trimNum } from "./logic";

/* ---------- CSV ---------- */
export function parseCSV(input) {
  let text = String(input).replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => first.split(ch).length - 1;
  const delim = [",", ";", "\t"].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\r\n;]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCSV = (rows) => "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------- XLSX writer ---------- */
const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const safeSheetName = (n, used) => { let s = String(n).replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet"; let k = 2; const base = s; while (used.has(s.toLowerCase())) s = base.slice(0, 28) + " " + k++; used.add(s.toLowerCase()); return s; };

function sheetXml(rows, textCols = []) {
  const widths = [];
  rows.forEach((r) => r.forEach((v, i) => { const len = v == null ? 0 : String(v).length; widths[i] = Math.min(48, Math.max(widths[i] || 8, len + 2)); }));
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${textCols.includes(i) ? ' style="2"' : ""}/>`).join("")}</cols>` : "";
  const data = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      if (v == null || v === "") return "";
      const ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : "";
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${data}</sheetData></worksheet>`;
}

/* sheets: [{ name, rows: [headerRow, ...dataRows], textCols?: [column numbers kept as text, e.g. phone numbers] }]  ->  base64 text of the .xlsx file */
export async function writeXLSX(sheets) {
  const zip = new JSZip(), used = new Set();
  const named = sheets.map((s) => ({ ...s, name: safeSheetName(s.name, used) }));
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  named.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows, s.textCols)));
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

/* ---------- XLSX reader ---------- */
const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");
const colIndex = (ref) => { const m = /^([A-Z]+)/i.exec(ref || ""); let n = 0; if (m) for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const textOf = (el) => { let out = ""; el.querySelectorAll("t").forEach((t) => { if (!t.closest("rPh")) out += t.textContent; }); return out; };

/* data: ArrayBuffer  ->  [{ name, rows: string[][] }] */
export async function readXLSX(data) {
  const zip = await JSZip.loadAsync(data);
  const read = async (path) => { const f = zip.file(path); return f ? f.async("string") : null; };
  const wbText = await read("xl/workbook.xml");
  if (!wbText) throw new Error("This doesn't look like an Excel (.xlsx) file.");
  const wb = parseXml(wbText), rels = parseXml((await read("xl/_rels/workbook.xml.rels")) || "<r/>");
  const target = {};
  rels.querySelectorAll("Relationship").forEach((r) => { let t = r.getAttribute("Target") || ""; t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); target[r.getAttribute("Id")] = t; });
  const shared = [];
  const ssText = await read("xl/sharedStrings.xml");
  if (ssText) parseXml(ssText).querySelectorAll("si").forEach((si) => shared.push(textOf(si)));
  const out = [];
  for (const sh of Array.from(wb.querySelectorAll("sheet"))) {
    const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const xml = await read(target[rid]);
    if (!xml) continue;
    const rows = [];
    parseXml(xml).querySelectorAll("sheetData > row").forEach((rowEl) => {
      const ri = Number(rowEl.getAttribute("r")) - 1;
      const cells = [];
      rowEl.querySelectorAll("c").forEach((c, k) => {
        const idx = c.getAttribute("r") ? colIndex(c.getAttribute("r")) : k;
        const t = c.getAttribute("t"), v = c.querySelector("v");
        let val = "";
        if (t === "s") val = shared[Number(v && v.textContent)] || "";
        else if (t === "inlineStr") val = textOf(c);
        else if (t === "b") val = v && v.textContent === "1" ? "TRUE" : "FALSE";
        else if (v) val = v.textContent;
        cells[idx] = val;
      });
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      rows[Number.isFinite(ri) && ri >= 0 ? ri : rows.length] = cells;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out.push({ name: sh.getAttribute("name"), rows });
  }
  return out;
}

/* ---------- turning table rows into app records ---------- */
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SYN = {
  products: {
    name: ["name", "product", "product name", "item", "item name", "description"],
    cat: ["category", "group", "type"],
    cost: ["cost", "cost price", "buying price", "purchase price", "cost per unit", "unit cost", "cost per pcs"],
    price: ["price", "selling price", "sell price", "sale price", "retail price", "unit price"],
    qty: ["stock", "quantity", "qty", "opening stock", "in stock", "on hand", "stock qty"],
    unit: ["unit", "unit name", "uom", "base unit", "smallest unit"],
    reorder: ["reorder", "reorder level", "reorder at", "min stock", "minimum", "low stock level"],
  },
  customers: {
    name: ["name", "customer", "customer name"],
    phone: ["phone", "mobile", "tel", "telephone", "phone number", "contact"],
    note: ["note", "notes", "address", "remarks"],
  },
  expenses: {
    date: ["date"],
    cat: ["category", "type", "expense"],
    amount: ["amount", "cost", "value", "total"],
    note: ["note", "notes", "description", "details", "remarks"],
  },
};
export const KIND_LABEL = { products: "Products", customers: "Customers", expenses: "Expenses" };
export const TEXT_COLS = { products: [], customers: [1], expenses: [] };
export const TEMPLATES = {
  products: [["Name", "Category", "Unit", "Cost per unit", "Selling price", "Stock", "Reorder level"], ["Example: Sugar 1kg", "Groceries", "pcs", 900, 1200, 40, 10]],
  customers: [["Name", "Phone", "Note"], ["Example: Amina Bello", "08012345678", "Regular customer"]],
  expenses: [["Date", "Category", "Amount", "Note"], [todayISO(), "Transport", 2500, "Example: delivery"]],
};

export const parseAmount = (v) => { const s = String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""); const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
export function parseDate(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10); }
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(s);
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

/* rows (header first) -> { records, columns } or { error } */
export function mapRows(rows, kind) {
  const syn = SYN[kind], need = kind === "expenses" ? "amount" : "name";
  if (!rows.length || !rows.some((r) => r.some((c) => String(c || "").trim()))) return { error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) if ((rows[i] || []).some((c) => syn[need].includes(norm(c)))) { h = i; break; }
  if (h < 0) return { error: `Couldn't find a "${need === "name" ? "Name" : "Amount"}" column. The first row has: ${(rows[0] || []).filter(Boolean).slice(0, 8).join(", ") || "nothing"}. Use the template to see the expected columns.` };
  const head = rows[h].map(norm), col = {};
  for (const [field, names] of Object.entries(syn)) { const i = head.findIndex((c) => names.includes(c)); if (i >= 0) col[field] = i; }
  if (kind === "expenses" && col.cat === col.amount) delete col.cat;
  const records = rows.slice(h + 1).filter((r) => (r || []).some((c) => String(c || "").trim())).map((r, k) => {
    const o = { _row: h + 2 + k };
    for (const f of Object.keys(col)) o[f] = r[col[f]] == null ? "" : String(r[col[f]]).trim();
    return o;
  });
  return { records, columns: Object.keys(col) };
}

/* records -> a partial database that can be merged into the real one */
export function recordsToDb(kind, records) {
  const skipped = [], today = todayISO();
  const db = { products: [], customers: [], expenses: [] };
  records.forEach((r) => {
    if (kind === "products") {
      if (!r.name) return skipped.push(`Row ${r._row}: no name`);
      const price = parseAmount(r.price);
      db.products.push({ id: uid(), name: r.name, cat: r.cat || "", photo: "", added: today, cost: parseAmount(r.cost), qty: parseAmount(r.qty), reorder: r.reorder === undefined || r.reorder === "" ? 5 : parseAmount(r.reorder), units: [{ id: uid(), name: r.unit || "pcs", pcs: 1, show: price, price }] });
    } else if (kind === "customers") {
      if (!r.name) return skipped.push(`Row ${r._row}: no name`);
      db.customers.push({ id: uid(), name: r.name, phone: r.phone || "", note: r.note || "", deposit: 0 });
    } else {
      const amount = parseAmount(r.amount);
      if (!(amount > 0)) return skipped.push(`Row ${r._row}: no amount`);
      db.expenses.push({ id: uid(), date: parseDate(r.date) || today, category: r.cat || "Other", amount, note: r.note || "" });
    }
  });
  return { db, skipped };
}

/* ---------- what the app exports ---------- */
export const EXPORTS = [["sales", "Sales"], ["items", "Sale items"], ["products", "Products"], ["customers", "Customers"], ["expenses", "Expenses"], ["suppliers", "Suppliers"]];

export function exportSheets(db, { from = "", to = "" } = {}) {
  const inDates = (d) => (!from || d >= from) && (!to || d <= to);
  const sales = db.sales.filter((s) => inDates(s.date)).slice().reverse();
  const out = {};
  out.sales = [["Receipt", "Date", "Time", "Customer", "Items", "Items total", "Discount", "Tax", "Other charges", "Total", "Paid", "Balance due", "Refunded", "Payment method"]].concat(sales.map((s) => {
    const c = calcSale(s);
    const items = groupItems(s).map((g) => `${g.name}: ${partsText(g.parts, g.base)}`).join("; ");
    return [s.no, s.date, s.time || "", s.customerName || "", items, c.sub, c.disc, c.tax, c.other, c.total, c.paid + c.refunded, c.due, c.refunded, s.method || ""];
  }));
  out.items = [["Receipt", "Date", "Customer", "Product", "Unit", "Quantity", "Pieces", "Unit price", "Showing price", "Quantity returned", "Line total", "Line cost", "Line profit (before sale discount)"]];
  sales.forEach((s) => groupItems(s).forEach((g) => g.parts.forEach((p) => {
    const item = s.items[p.idx];
    const live = p.qty;
    out.items.push([s.no, s.date, s.customerName || "", g.name, p.unit, p.orig, p.orig * p.pcsPer, p.price, p.show == null ? p.price : p.show, p.returned, r2(live * p.price), r2(live * p.pcsPer * (item.cost || 0)), r2(live * p.price - live * p.pcsPer * (item.cost || 0))]);
  })));
  out.products = [["Name", "Category", "Unit", "In stock", "Cost per unit", "Selling price", "Other units and prices", "Stock value at cost", "Reorder level"]].concat(db.products.map((p) => [p.name, p.cat || "", p.units[0].name, p.qty, p.cost, p.units[0].price, p.units.slice(1).map((u) => `${u.name} (${trimNum(u.pcs)}): ${u.price}`).join("; "), r2(Math.max(0, p.qty) * p.cost), p.reorder]));
  out.customers = [["Name", "Phone", "Owes you", "Deposit held", "Note"]].concat(db.customers.map((c) => [c.name, c.phone || "", owedBy(db.sales, c.id), c.deposit || 0, c.note || ""]));
  out.expenses = [["Date", "Category", "Amount", "Note"]].concat(db.expenses.filter((e) => inDates(e.date)).slice().reverse().map((e) => [e.date, e.category, e.amount, e.note || ""]));
  out.suppliers = [["Name", "Phone", "Balance", "Meaning"]].concat(db.suppliers.map((s) => { const b = supplierBalance(db.ledger, s.id, LEDGER_TYPES); return [s.name, s.phone || "", r2(Math.abs(b)), b > 0.004 ? "You owe them" : b < -0.004 ? "They owe you" : "Settled"]; }));
  return out;
}
