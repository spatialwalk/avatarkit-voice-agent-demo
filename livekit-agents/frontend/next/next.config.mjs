import { withAvatarkit } from "@spatialwalk/avatarkit/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/token",
        destination: "http://localhost:8080/token",
      },
    ];
  },
};

export default withAvatarkit(nextConfig);
