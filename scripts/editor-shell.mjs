#!/usr/bin/env node
// Run a shell command on a dedicated editing Mac, as the super admin. Not part of the Portal: it writes a signed
// command straight to the database (the Mac gets it with its next heartbeat, within about a minute) and prints the
// output when the Mac acks it. Needs the database URL (.env DIRECT_URL) and the admin signing key whose public half
// ships with the editor (infocus-editor editor/admin_shell.pub); a personal computer refuses these commands.
//
//   node scripts/editor-shell.mjs [--machine "<name>"] [--timeout <seconds>] -- <command…>
//
// The key: $INFOCUS_EDITOR_ADMIN_KEY, else ~/.ssh/infocus-editor-admin.pem (Ed25519, PKCS#8 PEM).
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

const VALID_FOR_S = 600;
const POLL_MS = 2000;

function parseArgs(argv) {
  const split = argv.indexOf("--");
  const flags = split < 0 ? argv : argv.slice(0, split);
  const command = split < 0 ? "" : argv.slice(split + 1).join(" ");
  const value = (name) => { const i = flags.indexOf(name); return i >= 0 ? flags[i + 1] : undefined; };
  const timeout = Number(value("--timeout") ?? 120);
  if (!command.trim() || !Number.isFinite(timeout) || timeout <= 0) {
    console.error('usage: node scripts/editor-shell.mjs [--machine "<name>"] [--timeout <seconds>] -- <command…>');
    process.exit(2);
  }
  return { machine: value("--machine"), timeout: Math.min(Math.round(timeout), 1800), command };
}

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  config({ path: ".env", quiet: true });
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("No DIRECT_URL or DATABASE_URL in .env (run from the Portal repo).");
  const key = createPrivateKey(readFileSync(process.env.INFOCUS_EDITOR_ADMIN_KEY || join(homedir(), ".ssh", "infocus-editor-admin.pem")));

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    // Who asked, for the record (the signing key is what authorizes it): the super admin's account when this
    // machine knows it (PLATFORM_SUPER_ADMIN_EMAIL or a SUPER_ADMIN role row), else a fixed label.
    const admin = (await db.query(
      `SELECT u.id FROM "User" u WHERE lower(u.email) = lower($1)
       UNION ALL SELECT u.id FROM "User" u JOIN "PlatformRoleAssignment" r ON lower(r.email) = lower(u.email)
       WHERE r.role = 'SUPER_ADMIN' LIMIT 1`, [process.env.PLATFORM_SUPER_ADMIN_EMAIL ?? ""])).rows[0]
      ?? { id: "super-admin-shell" };
    const devices = (await db.query(
      `SELECT id, name, kind, "tokenHash", "lastSeenAt" FROM "ShowEditorDevice" WHERE "revokedAt" IS NULL AND kind = 'dedicated'
       AND ($1::text IS NULL OR name = $1) ORDER BY "lastSeenAt" DESC NULLS LAST`, [args.machine ?? null])).rows;
    if (devices.length !== 1) {
      throw new Error(devices.length === 0
        ? "No dedicated editing Mac with that name (personal computers never run remote commands)."
        : `Several dedicated Macs: pick one with --machine (${devices.map((d) => `"${d.name}"`).join(", ")}).`);
    }
    const device = devices[0];
    if (!device.tokenHash) throw new Error(`${device.name} has no device token yet.`);
    if (!device.lastSeenAt || Date.now() - new Date(device.lastSeenAt).getTime() > 3 * 60_000) {
      console.error(`warning: ${device.name} hasn't checked in for a while; the command expires in ${VALID_FOR_S / 60} minutes.`);
    }

    const id = `sh${randomBytes(12).toString("hex")}`;
    const body = b64url(JSON.stringify({
      v: 1, id, device: device.tokenHash, exp: Math.floor(Date.now() / 1000) + VALID_FOR_S, cmd: args.command, timeout: args.timeout
    }));
    const kind = `shell:${body}.${b64url(sign(null, Buffer.from(body), key))}`;
    await db.query(
      `INSERT INTO "ShowEditorCommand" (id, "deviceId", kind, status, "requestedById", "createdAt") VALUES ($1, $2, $3, 'PENDING', $4, now())`,
      [id, device.id, kind, admin.id]);
    console.error(`sent to ${device.name}; waiting for it…`);

    const deadline = Date.now() + (VALID_FOR_S + args.timeout + 60) * 1000;
    try {
      while (Date.now() < deadline) {
        const row = (await db.query(`SELECT status, ok, output FROM "ShowEditorCommand" WHERE id = $1`, [id])).rows[0];
        if (!row) throw new Error("The command disappeared before it finished.");
        if (row.status === "DONE" || row.status === "FAILED") {
          process.stdout.write(`${row.output ?? ""}\n`);
          process.exitCode = row.ok ? 0 : 1;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      throw new Error("No answer in time (is the Mac online and on editor v0.2.7 or later?).");
    } finally {
      await db.query(`DELETE FROM "ShowEditorCommand" WHERE id = $1`, [id]);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`editor-shell: ${error.message}`);
  process.exit(1);
});
