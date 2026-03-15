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
};

export default nextConfig;
