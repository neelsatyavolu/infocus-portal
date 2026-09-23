import { EquipmentShell } from "@/components/equipment-shell";
import { mainAppOrigin } from "@/src/lib/hosts";

export default function EquipmentLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const dashboardUrl = `${mainAppOrigin().replace(/\/$/, "")}/dashboard`;
  return <EquipmentShell dashboardUrl={dashboardUrl}>{children}</EquipmentShell>;
}
