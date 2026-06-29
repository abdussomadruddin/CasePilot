import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Honda Case Operation System",
  description: "Role-based Honda car buying case operation dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
