import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import legacy from "@vitejs/plugin-legacy";
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
    legacy({
      targets: ["Chrome >= 49", "Android >= 6", "Safari >= 11"],
      // modernPolyfills=false: modern phones don't need the 127KB extra bundle.
      // Our hand-written polyfills.ts fills the few real gaps.
      modernPolyfills: false,
      renderLegacyChunks: true,
    }),
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
        // Only precache the app shell (HTML + CSS + icon). Everything else is
        // fetched on demand and served via runtime caching. Precaching the
        // whole 11 MB build was OOM-killing low-RAM Android WebViews on
        // service-worker install, which surfaced as "Scan&Store keeps stopping"
        // right after launch.
        globPatterns: ["index.html", "assets/*.css", "app-icon.png", "manifest.json"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              networkTimeoutSeconds: 4,
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|woff2?|ttf)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:png|jpg|jpeg|svg|webp|gif)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
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
  build: {
    target: "es2017",
    cssTarget: "chrome61",
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Only split heavy, self-contained libraries. Splitting React (or the
        // many small libs that depend on it) across chunks broke module init
        // order in the legacy build and produced a blank/black screen
        // ("Cannot read properties of undefined (reading 'createContext')").
        // React and its ecosystem now stay together in the main entry.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("pdfjs-dist") || id.includes("pdf-lib") || id.includes("jspdf")) return "vendor-pdf";
          if (id.includes("xlsx") || id.includes("mammoth") || id.includes("docx")) return "vendor-office";
          if (id.includes("html2canvas")) return "vendor-html2canvas";
        },
      },

    },
  },
}));
