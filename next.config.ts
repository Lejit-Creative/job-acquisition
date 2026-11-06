import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local SQLite is read on every request. Skip the static cache shell.
  serverExternalPackages: ["pdfkit"],
  // The browser checks open the app at 127.0.0.1. Dev assets must load from that host.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
