import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });

const ctx = await esbuild.context({
  entryPoints: { content: "src/content.ts", main: "src/main.ts" },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  sourcemap: false,
  minify: !watch,
  logLevel: "info",
});

if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
