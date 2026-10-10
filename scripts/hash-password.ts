/**
 * Prints the value for SUPER_ADMIN_PASSWORD_HASH. The password comes from stdin, so it never
 * lands in shell history:  op read "op://<vault>/<item>/password" | npx tsx scripts/hash-password.ts
 */
import { text } from "node:stream/consumers";
import { hashPassword } from "@/src/lib/password-hash";

async function main() {
  const password = (await text(process.stdin)).replace(/\r?\n$/, "");
  if (!password) throw new Error("Pipe the password in on stdin.");
  process.stdout.write(`${await hashPassword(password)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
