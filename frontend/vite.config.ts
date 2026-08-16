import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        // 依赖分组打包:长期稳定的三方库独立成 chunk,业务迭代不再让浏览器整包重下
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@xterm")) return "xterm";
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
          if (id.includes("react-markdown") || id.includes("remark") || id.includes("micromark") || id.includes("unified") || id.includes("mdast") || id.includes("hast") || id.includes("unist")) return "markdown";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        }
      }
    }
  }
});
