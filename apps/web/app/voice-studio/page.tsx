import type { Metadata } from "next";
import { VoiceStudioClient } from "./VoiceStudioClient";

export const metadata: Metadata = {
  title: "FullPOS Voice Studio",
  description: "Genera narraciones consistentes para tus videos con voces locales."
};

/**
 * Fase 1: generador local de narracion. No toca el editor de video; el audio se
 * descarga y se importa manualmente en CapCut.
 */
export default function VoiceStudioPage() {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return <VoiceStudioClient apiUrl={apiUrl} />;
}
