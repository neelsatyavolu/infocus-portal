// Runs patch-package (postinstall). If a patch no longer applies because the installed copy
// was already patched by an older version of that patch (Vercel restores node_modules from
// its build cache), overwrite each patched package with its pristine npm tarball and retry.
// This replaces `rm -rf node_modules/<pkg> && npm install`, which forced a ~3 minute
// reconcile on every deploy.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function patchPackage() {
  return spawnSync("npx", ["patch-package", "--error-on-fail"], { cwd: root, stdio: "inherit" }).status === 0;
}

// patches/<name>+<version>.patch, scoped as @scope+name+<version>.patch
function patchedPackages() {
  return readdirSync(join(root, "patches"))
    .filter((file) => file.endsWith(".patch"))
    .map((file) => {
      const parts = file.slice(0, -".patch".length).split("+");
      return { name: parts.slice(0, -1).join("/"), version: parts.at(-1) };
    });
}

function restorePristine({ name, version }) {
  const tmp = mkdtempSync(join(tmpdir(), "pristine-"));
  try {
    const tarball = execFileSync("npm", ["pack", `${name}@${version}`, "--silent", "--pack-destination", tmp], {
      cwd: root,
      encoding: "utf8"
    })
      .trim()
      .split("\n")
      .at(-1);
    // Extract over the installed copy so nested node_modules stay in place.
    execFileSync("tar", ["-xzf", join(tmp, tarball), "-C", join(root, "node_modules", name), "--strip-components=1"]);
    process.stdout.write(`Restored pristine ${name}@${version}\n`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (!patchPackage()) {
  process.stdout.write("patch-package failed; restoring pristine copies and retrying\n");
  patchedPackages().forEach(restorePristine);
  if (!patchPackage()) process.exit(1);
}
