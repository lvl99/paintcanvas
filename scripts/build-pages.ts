// Builds the GitHub Pages site in `.pages/`: the docs at the root, the demo pages in `app/` and the JSON schemas in
// `schemas/`. Run with: pnpm pages:build
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run } from "./run.ts";

const pagesPath = fileURLToPath(new URL("../.pages", import.meta.url));
const docsBuildPath = fileURLToPath(new URL("../docs/build", import.meta.url));
const schemasPath = fileURLToPath(new URL("../schemas", import.meta.url));

rmSync(pagesPath, { recursive: true, force: true });
run("pnpm", ["docs:build"]);
cpSync(docsBuildPath, pagesPath, { recursive: true });
// Builds into `.pages/app/` (see vite.demo.config.ts)
run("pnpm", ["demo:build"]);
cpSync(schemasPath, `${pagesPath}/schemas`, { recursive: true });
// Stops GitHub Pages running the site through Jekyll, which skips files starting with "_"
writeFileSync(`${pagesPath}/.nojekyll`, "");
console.log(`Built the GitHub Pages site in ${pagesPath}`);
