import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      strategies: "generateSW",
      // Use the hand-authored public/manifest.json (file_handlers etc.)
      manifest: false,
      devOptions: { enabled: false },
      includeAssets: ["app-icon.png", "icons/*.png", "manifest.json"],
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,woff,woff2,ttf}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // HTML navigations — always try the network first.
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              networkTimeoutSeconds: 4,
            },
          },
          {
            // Hashed same-origin built assets.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|woff2?|ttf)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Images, including app icons.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:png|jpg|jpeg|svg|webp|gif)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // One-time local download URLs created from in-memory public scans.
            // Android WebViews do not save blob: URLs, but they do handle normal
            // same-origin file URLs with a real extension and download headers.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/local-downloads/"),
            handler: "CacheFirst",
            options: {
              cacheName: "local-downloads",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
