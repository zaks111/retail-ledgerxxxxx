import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const MAIN = "ledger.json";            // working copy, private to the app
const BACKUP_DIR = "RetailLedger";     // visible folder in Documents
const LATEST = `${BACKUP_DIR}/latest.json`;
const KEEP_DATED = 30;
const native = Capacitor.isNativePlatform();

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function read(path, directory) {
  const r = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
  return typeof r.data === "string" ? r.data : await r.data.text();
}
const write = (path, data, directory) =>
  Filesystem.writeFile({ path, data, directory, encoding: Encoding.UTF8, recursive: true });

async function ensurePermission() {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    const p = await Filesystem.checkPermissions();
    if (p.publicStorage !== "granted") await Filesystem.requestPermissions();
  } catch (e) { /* newer Android versions don't need it */ }
}

/* Load: working copy first, then the newest backup (covers a reinstall). */
export async function loadDb() {
  if (!native) {
    try { const v = localStorage.getItem("retail-ledger-db"); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  try { return JSON.parse(await read(MAIN, Directory.Data)); } catch (e) { /* fall through */ }
  try { await ensurePermission(); return JSON.parse(await read(LATEST, Directory.Documents)); } catch (e) { return null; }
}

let timer = null;
export function saveDb(db) {
  const text = JSON.stringify(db);
  if (!native) { try { localStorage.setItem("retail-ledger-db", text); } catch (e) { /* ignore */ } return; }
  write(MAIN, text, Directory.Data).catch((e) => console.error("save failed", e));
  clearTimeout(timer);
  timer = setTimeout(() => { writeBackups(text).catch(() => {}); }, 3000);
}

async function writeBackups(text) {
  await ensurePermission();
  await write(LATEST, text, Directory.Documents);
  await write(`${BACKUP_DIR}/backup-${today()}.json`, text, Directory.Documents);
  try {
    const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    const dated = files.map((f) => f.name).filter((n) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const n of dated.slice(0, Math.max(0, dated.length - KEEP_DATED))) {
      await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${n}`, directory: Directory.Documents });
    }
  } catch (e) { /* pruning is best effort */ }
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function backupNow(db) {
  const text = JSON.stringify(db);
  if (!native) { download(`retail-ledger-backup-${today()}.json`, text); return "Backup downloaded."; }
  await writeBackups(text);
  return "Backup saved to Documents/RetailLedger on your phone.";
}

export async function shareBackup(db) {
  const text = JSON.stringify(db);
  const name = `retail-ledger-backup-${today()}.json`;
  if (!native) { download(name, text); return "Backup downloaded."; }
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: "Retail ledger backup", files: [uri] });
  return "Choose where to save the copy, such as Drive, iCloud, or email.";
}

export function parseBackup(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.products) || !Array.isArray(d.sales) || !Array.isArray(d.expenses)) {
    throw new Error("This file isn't a Retail Ledger backup.");
  }
  return d;
}

/* A dated copy of everything, written to the phone before an import or restore changes anything. */
export async function safetyCopy(db) {
  if (!native) return "";
  try {
    await ensurePermission();
    const t = new Date(), p = (n) => String(n).padStart(2, "0");
    const name = `before-import-${today()}-${p(t.getHours())}${p(t.getMinutes())}.json`;
    await write(`${BACKUP_DIR}/${name}`, JSON.stringify(db), Directory.Documents);
    return name;
  } catch (e) { return ""; }
}
