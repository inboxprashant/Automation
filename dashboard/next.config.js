/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow the dashboard to read project data files from the parent directory
  serverExternalPackages: [],
  env: {
    PROJECT_ROOT: process.env.PROJECT_ROOT || require('path').resolve(__dirname, '..'),
  },
};

module.exports = nextConfig;
