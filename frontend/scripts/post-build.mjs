// Post-build hardening for the static dApp (GitHub Pages cannot set response headers):
//  1. Subresource Integrity (sha384) on every same-origin <script>/<link> in index.html.
//  2. dist/SHA256SUMS so a release can be checked against what was built from the tagged commit.
//  3. Fails the build if source maps, secrets or private-key-shaped strings ended up in dist/.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const walk = (d) =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(dist);

// ---- 3. guards
const problems = [];
for (const f of files) {
  const rel = relative(dist, f);
  if (rel.endsWith(".map")) problems.push(`source map shipped: ${rel}`);
  if (/\.(js|css|html|json|webmanifest)$/.test(rel)) {
    const t = readFileSync(f, "utf8");
    if (/MNEMONIC|PRIVATE_KEY|SECRET_KEY|INFURA_API_KEY|ETHERSCAN_API_KEY|seed phrase/i.test(t))
      problems.push(`secret-looking name in ${rel}`);
    if (/(?<![0-9a-fA-F])0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(t)) problems.push(`64-hex string in ${rel}`);
    if (/sourceMappingURL=/.test(t)) problems.push(`sourceMappingURL in ${rel}`);
  }
}
if (problems.length) {
  console.error("post-build check failed:\n - " + problems.join("\n - "));
  process.exit(1);
}

// ---- 1. SRI
const indexPath = join(dist, "index.html");
let html = readFileSync(indexPath, "utf8");
const sri = (p) =>
  "sha384-" +
  createHash("sha384")
    .update(readFileSync(join(dist, p)))
    .digest("base64");
html = html.replace(
  /<(script|link)\b([^>]*?)(src|href)="(\.\/assets\/[^"]+)"([^>]*)>/g,
  (m, tag, pre, attr, url, post) => {
    if (/integrity=/.test(m)) return m;
    if (tag === "link" && !/rel="(stylesheet|modulepreload)"/.test(m)) return m;
    const rel = url.replace(/^\.\//, "");
    return `<${tag}${pre}${attr}="${url}"${post} integrity="${sri(rel)}">`;
  },
);
writeFileSync(indexPath, html);

// ---- 2. checksums (after SRI rewrite so index.html matches)
const sums = walk(dist)
  .filter((f) => !f.endsWith("SHA256SUMS"))
  .sort()
  .map((f) => `${createHash("sha256").update(readFileSync(f)).digest("hex")}  ${relative(dist, f)}`);
writeFileSync(join(dist, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(`post-build: SRI on index.html, ${sums.length} files checksummed, no maps/secrets.`);
