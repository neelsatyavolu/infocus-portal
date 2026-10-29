import type { Metadata } from "next";
import { getRealSessionUser } from "@/src/lib/auth";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { isPlatformSuperAdmin } from "@/src/lib/platform-roles";
import { SeasonPreviewProvider } from "./season-preview";

export const metadata: Metadata = { title: "Settings" };

/** Super admins get the seasonal theme previews in Appearance (a look in their own browser only). */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getRealSessionUser().catch(() => null);
  const role = session?.email ? await getPlatformRoleForEmail(session.email).catch(() => null) : null;
  return <SeasonPreviewProvider canPreview={isPlatformSuperAdmin(role)}>{children}</SeasonPreviewProvider>;
}
