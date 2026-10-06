import type { Metadata } from "next";
import EquipmentRequestClient from "../request-client";

export const metadata: Metadata = { title: "Request equipment" };

export default function EquipmentRequestPage() {
  return <EquipmentRequestClient />;
}
