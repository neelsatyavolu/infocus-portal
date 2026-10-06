import type { Metadata } from "next";
import EquipmentCheckoutClient from "./checkout-client";

export const metadata: Metadata = { title: "Equipment" };

export default function EquipmentPage() {
  return <EquipmentCheckoutClient />;
}
