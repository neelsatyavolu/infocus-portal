import { fail } from "@/src/lib/http";
export async function POST() {
  return fail("Sign in with your manager Google account to unlock checkout.", 410);
}
