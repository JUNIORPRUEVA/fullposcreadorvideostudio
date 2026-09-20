import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FullPOS Video Studio",
  description: "Videos profesionales para publicidad, capacitación y contenido de marca."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
