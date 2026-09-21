import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "US Phone Number Validator",
  description:
    "Validate and classify US phone numbers: validity, duplicates, line type (cellular / landline / VoIP), and state — free, no paid API required.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
