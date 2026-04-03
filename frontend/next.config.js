/** @type {import('next').NextConfig} */
const { version } = require('./package.json');
const pwaDisabled =
  process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "true";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: pwaDisabled,
  register: !pwaDisabled,
  reloadOnOnline: false,
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkOnly',
    },
  ],
  reloadOnOnline: false,
});

module.exports = withPWA({
  output: "standalone", env: {
    VERSION: version,
  },
});
