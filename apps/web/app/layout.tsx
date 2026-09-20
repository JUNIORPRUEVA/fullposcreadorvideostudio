import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FullPOS Ad Studio",
  description: "Generador profesional de anuncios de software."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
