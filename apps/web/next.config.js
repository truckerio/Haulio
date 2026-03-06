/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Temporary unblock for legacy client-routed pages that use useSearchParams
    // without an explicit Suspense boundary.
    missingSuspenseWithCSRBailout: false,
  },
  images: {
    domains: [],
  },
  async rewrites() {
    const defaultApiBase = process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000" : "http://api:4000";
    const apiBase =
      process.env.API_BASE_INTERNAL ||
      (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.startsWith("http")
        ? process.env.NEXT_PUBLIC_API_BASE
        : defaultApiBase);
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
