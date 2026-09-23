import { fail } from "@/src/lib/http";
export async function GET() {
  return fail("Checkout now uses a separate one-hour Google sign-in. Passcodes are no longer used.", 410);
}
export const POST = GET;
