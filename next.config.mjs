/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Scanned delivery receipts (green cards) upload via a Server Action — allow a few MB.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};

export default nextConfig;
