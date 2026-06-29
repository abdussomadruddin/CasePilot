import type { Metadata, Viewport } from "next";
import { ViewportLock } from "@/components/viewport-lock";
import "./globals.css";

export const metadata: Metadata = {
  title: "Honda Case Operation System",
  description: "Role-based Honda car buying case operation dashboard.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ViewportLock />
        {children}
      </body>
    </html>
  );
}
