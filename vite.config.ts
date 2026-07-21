import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

  const supabaseProxyPaths = ["/auth/v1", "/rest/v1", "/functions/v1", "/storage/v1"];
  const proxyEntries = Object.fromEntries(
    supabaseProxyPaths.map((p) => [p, { target: supabaseUrl, changeOrigin: true, secure: false }])
  );

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      ...proxyEntries,
      "/realtime/v1": { target: supabaseUrl, changeOrigin: true, secure: false, ws: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    ...(mode === "production" && {
      minify: "esbuild",
    }),
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  };
});
