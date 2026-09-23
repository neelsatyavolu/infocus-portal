import { getSessionUser } from "@/src/lib/auth";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";

export async function getCurrentAppUser() {
  const session = await getSessionUser();

  if (!session?.userId) {
    throw new Error("UNAUTHORIZED");
  }

  const platformRole = await getPlatformRoleForEmail(session.email);

  return {
    userId: session.userId,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      imageUrl: session.imageUrl
    },
    platformRole
  };
}
