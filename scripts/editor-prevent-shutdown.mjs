#!/usr/bin/env node
// Remove the studio Mac's weekday 6:00 PM shutdown and test that it stays on.
// Run this from the portal repo when you are at PH-LAB-INFOCUS-M04 and can
// type an admin password:
//
//   node scripts/editor-prevent-shutdown.mjs
//
// Within about a minute that Mac shows a macOS admin dialog. Any admin account
// on it works. The password is typed there and does not come back here.
// Cancel the dialog and nothing changes. After you approve, the test takes a
// few minutes: it removes the 6:00 PM shutdown, keeps the 7:00 AM power-on,
// sets a shutdown a few minutes out, removes that too, and checks the Mac
// stayed up.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const portal = join(dirname(fileURLToPath(import.meta.url)), "..");
const installDir = join(portal, "..", "infocus-editor", "install");
const remoteDir = "/tmp/infocus-prevent-shutdown";
const machine = "PH-LAB-INFOCUS-M04";

const files = {
  "prevent-shutdown.sh": readFileSync(join(installDir, "prevent-shutdown.sh")),
  "com.infocus.editor.prevent-shutdown.plist": readFileSync(join(installDir, "com.infocus.editor.prevent-shutdown.plist")),
  "install.sh": readFileSync(join(installDir, "prevent-shutdown-trial.sh")),
};

const lines = [
  "import base64, pathlib",
  `root = pathlib.Path(${JSON.stringify(remoteDir)})`,
  "root.mkdir(parents=True, exist_ok=True)",
];
for (const [name, data] of Object.entries(files)) {
  const mode = name.endsWith(".sh") ? "0o755" : "0o644";
  lines.push(`p = root / ${JSON.stringify(name)}`);
  lines.push(`p.write_bytes(base64.b64decode(${JSON.stringify(data.toString("base64"))}))`);
  lines.push(`p.chmod(${mode})`);
}
lines.push('print("files-ready")');
const py = lines.join("; ");
const applescript = [
  `do shell script "/bin/bash ${remoteDir}/install.sh"`,
  'with prompt "InFocus editor: enter an admin password to remove the 6 PM shutdown and test it"',
  "with administrator privileges",
].join(" ");
if (py.includes("'") || applescript.includes("'")) {
  console.error("The remote command would break on a single quote. Nothing was sent.");
  process.exit(2);
}

console.error(
  `Go to ${machine}. Within about a minute it asks for an admin password.\n` +
  "Any admin account on that Mac works. The password stays on that screen.\n" +
  "Cancel the dialog and nothing changes. After you approve, the test takes a few minutes.",
);
const result = spawnSync("node", [
  "scripts/editor-shell.mjs", "--machine", machine, "--timeout", "900", "--",
  `python3 -c '${py}' && osascript -e '${applescript}'`,
], { cwd: portal, stdio: "inherit" });
process.exit(result.status ?? 1);
