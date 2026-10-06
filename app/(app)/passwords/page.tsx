import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVaultActor } from "@/src/server/password-vault";
import PasswordsClient from "./passwords-client";

export const metadata: Metadata = { title: "Passwords" };

export default async function PasswordsPage() {
  if (!(await getVaultActor())) {
    redirect("/access-denied");
  }

  return <PasswordsClient />;
}
