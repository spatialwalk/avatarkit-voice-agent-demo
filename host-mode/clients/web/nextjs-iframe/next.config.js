/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/iframe/:path*',
        destination: 'http://localhost:5178/:path*',
      },
    ]
  },
}

module.exports = nextConfig
