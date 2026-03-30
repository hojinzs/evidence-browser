import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["shiki", "@aws-sdk/client-s3", "yauzl-promise"],
};

export default nextConfig;
