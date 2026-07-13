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
  // Redirect laalbutton.com root → /laalbutton landing page.
  // This works when laalbutton.com is added as a custom domain in Vercel
  // pointing to the same deployment as app.laalbutton.com.
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'host', value: 'laalbutton.com' }],
        destination: '/laalbutton',
        permanent: false,
      },
      {
        source: '/',
        has: [{ type: 'host', value: 'www.laalbutton.com' }],
        destination: '/laalbutton',
        permanent: false,
      },
      {
        source: '/about',
        has: [{ type: 'host', value: 'laalbutton.com' }],
        destination: '/laalbutton/about',
        permanent: false,
      },
      {
        source: '/about',
        has: [{ type: 'host', value: 'www.laalbutton.com' }],
        destination: '/laalbutton/about',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
