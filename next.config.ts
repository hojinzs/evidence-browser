import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["shiki", "@aws-sdk/client-s3", "yauzl-promise", "@modelcontextprotocol/sdk", "better-sqlite3", "@node-rs/argon2"],
};

export default nextConfig;

