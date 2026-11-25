import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atendimento · Despachante",
  description: "Atendimento de WhatsApp com IA e CRM para despachantes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster position="top-right" closeButton toastOptions={{ style: { borderRadius: 8, fontSize: 13 } }} />
      </body>
    </html>
  );
}
