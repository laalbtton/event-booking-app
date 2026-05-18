import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase storage — covers all project subdomain variants
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      // Platform's own domain (for default fallback images)
      { protocol: 'https', hostname: 'app.laalbutton.com' },
    ],
  },
  // Prevent Next.js from bundling firebase-admin into the client or edge
  // chunks — it is a Node.js-only package used only in API routes.
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
