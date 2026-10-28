import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { jsPDF } from "jspdf";
import { calcSale, fmtDay, trimNum, isLatin } from "./logic";

const native = Capacitor.isNativePlatform();
const clean = (s) => String(s == null ? "" : s).replace(/[\u202F\u00A0]/g, " ");
const pdfSafe = (s) => clean(s).replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
const hexRGB = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); const n = m ? parseInt(m[1], 16) : 0x0f766e; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/* The symbol for PDF receipts: PDFs only carry basic Latin characters, so fall back to the currency code. */
export const pdfSymbol = (settings) => (isLatin(settings.cur) ? settings.cur : settings.curCode ? settings.curCode + " " : "");

/* One description of a receipt, drawn as text, image or PDF. */
export function receiptModel(sale, settings, money) {
  const c = calcSale(sale);
  const items = sale.items.map((i) => ({
    name: i.name + (i.unit && i.unit !== "pcs" ? ` (${i.unit})` : ""),
    detail: `${trimNum(i.qty)} x ${money(i.price)}`,
    amount: money(i.qty * i.price),
  }));
  const totals = [["Subtotal", money(c.sub)]];
  if (c.disc > 0) totals.push(["Discount", "-" + money(c.disc)]);
  if (c.tax > 0) totals.push([`Tax (${sale.taxRate}%)`, money(c.tax)]);
  if (c.other > 0) totals.push(["Other charges", money(c.other)]);
  totals.push(["Total", money(c.total), true]);
  totals.push(["Paid", money(c.paid)]);
  if (c.due > 0.004) totals.push(["Balance due", money(c.due), true]);
  return {
    shop: settings.shop || "My shop",
    address: settings.address || "",
    phone: settings.phone || "",
    no: sale.no,
    date: fmtDay(sale.date, { year: "numeric", month: "short", day: "numeric" }) + (sale.time ? " " + sale.time : ""),
    customer: sale.customerName || "",
    method: sale.method || "",
    items, totals,
    saved: c.concession > 0.004 ? "You saved " + money(c.concession) : "",
    footer: settings.footer || "",
    color: settings.receiptColor || "#0F766E",
  };
}

export function receiptText(m) {
  const lines = [m.shop];
  if (m.address) lines.push(m.address);
  if (m.phone) lines.push("Tel: " + m.phone);
  lines.push("", `Receipt ${m.no}`, m.date);
  if (m.customer) lines.push("Customer: " + m.customer);
  if (m.method) lines.push("Payment: " + m.method);
  lines.push("");
  m.items.forEach((i) => lines.push(`${i.name}`, `   ${i.detail} = ${i.amount}`));
  lines.push("");
  m.totals.forEach((t) => lines.push(`${t[0]}: ${t[1]}`));
  if (m.saved) lines.push("", m.saved);
  if (m.footer) lines.push("", m.footer);
  return lines.join("\n");
}

/* ---------- image (PNG) ---------- */
const wrap = (ctx, text, maxW) => {
  const words = String(text).split(/\s+/); const out = []; let cur = "";
  words.forEach((w) => { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; });
  if (cur) out.push(cur);
  return out;
};
const fit = (ctx, text, maxW) => {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
};
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function receiptPNG(m) {
  const W = 640, P = 40;
  const paint = (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, 6000);
    ctx.fillStyle = m.color; ctx.fillRect(0, 0, W, m.address || m.phone ? 132 : 100);
    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; ctx.font = `700 34px ${FONT}`;
    ctx.fillText(fit(ctx, m.shop, W - 2 * P), W / 2, 62);
    let y = 100;
    const sub = [m.address, m.phone && "Tel: " + m.phone].filter(Boolean).join("  ·  ");
    if (sub) { ctx.font = `400 20px ${FONT}`; ctx.fillText(fit(ctx, sub, W - 2 * P), W / 2, 98); y = 132; }
    y += 44;
    ctx.textAlign = "left"; ctx.fillStyle = "#6b7b7d"; ctx.font = `700 20px ${FONT}`; ctx.fillText("RECEIPT", P, y);
    ctx.textAlign = "right"; ctx.fillStyle = "#142022"; ctx.fillText(m.no || "", W - P, y);
    ctx.font = `400 22px ${FONT}`; ctx.fillStyle = "#425052";
    [m.date, m.customer && "Customer: " + m.customer, m.method && "Payment: " + m.method].filter(Boolean).forEach((t) => { y += 32; ctx.textAlign = "left"; ctx.fillText(fit(ctx, t, W - 2 * P), P, y); });
    y += 24; ctx.fillStyle = "#d8dfdc"; ctx.fillRect(P, y, W - 2 * P, 2); y += 20;
    m.items.forEach((i) => {
      y += 30; ctx.textAlign = "right"; ctx.font = `600 24px ${FONT}`; ctx.fillStyle = "#142022"; ctx.fillText(i.amount, W - P, y);
      const aw = ctx.measureText(i.amount).width;
      ctx.textAlign = "left"; ctx.fillText(fit(ctx, i.name, W - 2 * P - aw - 16), P, y);
      y += 28; ctx.font = `400 20px ${FONT}`; ctx.fillStyle = "#6b7b7d"; ctx.fillText(i.detail, P, y); y += 10;
    });
    y += 10; ctx.fillStyle = "#d8dfdc"; ctx.fillRect(P, y, W - 2 * P, 2); y += 14;
    m.totals.forEach((t) => {
      y += t[2] ? 40 : 32;
      ctx.font = `${t[2] ? 700 : 400} ${t[2] ? 28 : 22}px ${FONT}`; ctx.fillStyle = "#142022";
      ctx.textAlign = "left"; ctx.fillText(t[0], P, y); ctx.textAlign = "right"; ctx.fillText(t[1], W - P, y);
    });
    if (m.saved) { y += 44; ctx.textAlign = "center"; ctx.fillStyle = m.color; ctx.font = `600 22px ${FONT}`; ctx.fillText(m.saved, W / 2, y); }
    if (m.footer) {
      ctx.textAlign = "center"; ctx.fillStyle = "#6b7b7d"; ctx.font = `400 20px ${FONT}`; y += 16;
      wrap(ctx, m.footer, W - 2 * P).forEach((l) => { y += 30; ctx.fillText(l, W / 2, y); });
    }
    return y + P;
  };
  const probe = document.createElement("canvas"); probe.width = W; probe.height = 10;
  const h = paint(probe.getContext("2d"));
  const c = document.createElement("canvas"); c.width = W; c.height = h;
  paint(c.getContext("2d"));
  return c.toDataURL("image/png").split(",")[1];
}

export function thankYouPNG(settings) {
  const W = 720, H = 420, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = settings.receiptColor || "#0F766E"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(W - 60, 40, 170, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = "center"; ctx.fillStyle = "#fff";
  ctx.font = `700 64px ${FONT}`; ctx.fillText("Thank you!", W / 2, 160);
  ctx.font = `400 28px ${FONT}`; ctx.fillText("for shopping with us", W / 2, 215);
  ctx.font = `700 38px ${FONT}`; ctx.fillText(fit(ctx, settings.shop || "", W - 80), W / 2, 290);
  ctx.font = `400 22px ${FONT}`;
  const sub = [settings.address, settings.phone && "Tel: " + settings.phone].filter(Boolean).join("  ·  ");
  if (sub) ctx.fillText(fit(ctx, sub, W - 80), W / 2, 335);
  return c.toDataURL("image/png").split(",")[1];
}

/* ---------- PDF ---------- */
export function receiptPDF(m, size) {
  const small = size === "small";
  const w = small ? 80 : 210, M = small ? 5 : 18, fs = small ? 8.5 : 11, lh = small ? 4.4 : 6;
  const [r, g, b] = hexRGB(m.color);
  const draw = (doc, a4) => {
    const R = w - M;
    let y = M;
    const need = () => { if (a4 && y > 275) { doc.addPage(); y = M; } };
    const row = (l, rt, bold) => { need(); doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? fs + 1.5 : fs); doc.setTextColor(20, 32, 34); doc.text(pdfSafe(l), M, y); doc.text(pdfSafe(rt), R, y, { align: "right" }); y += bold ? lh + 1 : lh; };
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs + 6); doc.setTextColor(r, g, b);
    doc.splitTextToSize(pdfSafe(m.shop) || "Shop", w - 2 * M).forEach((t) => { doc.text(t, w / 2, y + 4, { align: "center" }); y += lh + 2; });
    doc.setFont("helvetica", "normal"); doc.setFontSize(fs - 0.5); doc.setTextColor(95, 112, 115);
    [m.address, m.phone && "Tel: " + m.phone].filter(Boolean).forEach((t) => { doc.splitTextToSize(pdfSafe(t), w - 2 * M).forEach((l) => { doc.text(l, w / 2, y + 2, { align: "center" }); y += lh - 0.5; }); });
    y += 4; doc.setDrawColor(r, g, b); doc.setLineWidth(0.4); doc.line(M, y, R, y); y += lh;
    row("RECEIPT", m.no || "", true);
    [m.date, m.customer && "Customer: " + m.customer, m.method && "Payment: " + m.method].filter(Boolean).forEach((t) => { doc.setFont("helvetica", "normal"); doc.setFontSize(fs); doc.setTextColor(66, 80, 82); doc.text(pdfSafe(t), M, y); y += lh; });
    y += 1; doc.setDrawColor(200, 208, 205); doc.line(M, y, R, y); y += lh;
    m.items.forEach((i) => {
      need(); doc.setFont("helvetica", "bold"); doc.setFontSize(fs); doc.setTextColor(20, 32, 34);
      doc.text(pdfSafe(i.amount), R, y, { align: "right" });
      const aw = doc.getTextWidth(pdfSafe(i.amount));
      const nm = doc.splitTextToSize(pdfSafe(i.name) || "Item", w - 2 * M - aw - 3);
      doc.text(nm[0], M, y); y += lh - 0.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(fs - 1); doc.setTextColor(95, 112, 115); doc.text(pdfSafe(i.detail), M, y); y += lh;
    });
    doc.setDrawColor(200, 208, 205); doc.line(M, y, R, y); y += lh;
    m.totals.forEach((t) => row(t[0], t[1], t[2]));
    if (m.saved) { y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(fs); doc.setTextColor(r, g, b); doc.text(pdfSafe(m.saved), w / 2, y, { align: "center" }); y += lh; }
    if (m.footer) { y += 3; doc.setFont("helvetica", "normal"); doc.setFontSize(fs - 1); doc.setTextColor(95, 112, 115); doc.splitTextToSize(pdfSafe(m.footer), w - 2 * M).forEach((l) => { doc.text(l, w / 2, y, { align: "center" }); y += lh - 0.5; }); }
    return y + M;
  };
  const probe = new jsPDF({ unit: "mm", format: [w, 2000] });
  const h = draw(probe, false);
  const doc = small ? new jsPDF({ unit: "mm", format: [w, Math.max(h, 60)] }) : new jsPDF({ unit: "mm", format: "a4" });
  draw(doc, !small);
  return doc.output("datauristring").split("base64,")[1];
}

/* ---------- sharing ---------- */
const downloadBase64 = (name, b64, mime) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([arr], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export async function shareFile(name, b64, mime, title) {
  if (!native) { downloadBase64(name, b64, mime); return "Saved to your downloads."; }
  const { uri } = await Filesystem.writeFile({ path: name, data: b64, directory: Directory.Cache });
  await Share.share({ title, files: [uri] });
  return "Choose where to send it.";
}

export async function shareText(text, title) {
  if (native) { await Share.share({ title, text }); return "Choose where to send it."; }
  try { await navigator.clipboard.writeText(text); return "Copied to the clipboard."; } catch (e) { return "Copying isn't available here."; }
}
