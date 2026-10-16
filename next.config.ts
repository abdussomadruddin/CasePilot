import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: { "/api/honda-vso": ["./assets/honda-vso-*.pdf"], "/api/invoice": ["./assets/invoice-template.pdf"], "/api/receipt": ["./assets/receipt-template.pdf"] },
};

export default nextConfig;
