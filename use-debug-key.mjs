// Copies the saved debug signing key to where Android's build tools look for it,
// so every build is signed the same way and new versions install over old ones.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const src = path.resolve("debug.keystore");
if (fs.existsSync(src)) {
  const dir = path.join(os.homedir(), ".android");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, "debug.keystore"));
  console.log("Using the saved debug key.");
} else {
  console.log("No debug.keystore found; using a fresh key.");
}
