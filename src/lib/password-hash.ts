import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const HASH_PATTERN = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/;

function derive(password: string, salt: Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** `scrypt:<salt hex>:<key hex>`. The password can't be read back from it, so it may live in env. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${(await derive(password, salt, 64)).toString("hex")}`;
}

export function isPasswordHash(value: string) {
  return HASH_PATTERN.test(value);
}

export async function verifyPassword(password: string, passwordHash: string) {
  const match = HASH_PATTERN.exec(passwordHash);
  if (!match) return false;
  const expected = Buffer.from(match[2], "hex");
  return timingSafeEqual(expected, await derive(password, Buffer.from(match[1], "hex"), expected.length));
}
