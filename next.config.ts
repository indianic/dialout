import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres', 'nodemailer'],
  transpilePackages: ['@dialout/shared'],
};

export default nextConfig;
