import type { Metadata } from "next";
import TeleprompterClient from "./teleprompter-client";

export const metadata: Metadata = { title: "Teleprompter" };

export default function TeleprompterPage() {
  return <TeleprompterClient />;
}
