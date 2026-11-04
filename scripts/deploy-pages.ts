// Publishes the GitHub Pages site: builds it from `main` and pushes it to the `gh-pages` branch, which GitHub Pages
// serves at https://lvl99.github.io/paintcanvas/. Run with: pnpm pages:deploy
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };
import { run, succeeds } from "./run.ts";

const pagesBranch = "gh-pages";
const pagesPath = fileURLToPath(new URL("../.pages", import.meta.url));
const git = (args: string[], cwd?: string) =>
  run("git", args, { cwd, quiet: true }).trim();

// Only publish what is on `main` and on GitHub, so the site matches the code people can see
if (git(["branch", "--show-current"]) !== "main") {
  console.error("Switch to the main branch before publishing.");
  process.exit(1);
}
if (git(["status", "--porcelain"]) !== "") {
  console.error("Commit or stash your changes before publishing.");
  process.exit(1);
}
git(["fetch", "origin", "main"]);
if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/main"])) {
  console.error(
    "Make main match origin/main (pull or push) before publishing.",
  );
  process.exit(1);
}
const commit = git(["rev-parse", "--short", "HEAD"]);

run("node", ["scripts/build-pages.ts"]);

// Bring the local `gh-pages` branch up to date with GitHub's, if either exists
if (
  succeeds("git", [
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    pagesBranch,
  ])
) {
  git(["fetch", "origin", `${pagesBranch}:${pagesBranch}`]);
}

// Check `gh-pages` out in a temporary folder, so this checkout stays on `main`
const worktreePath = mkdtempSync(join(tmpdir(), "paintcanvas-pages-"));
const branchExists = succeeds("git", [
  "rev-parse",
  "--verify",
  "--quiet",
  pagesBranch,
]);
git(
  branchExists
    ? ["worktree", "add", worktreePath, pagesBranch]
    : ["worktree", "add", "--orphan", "-b", pagesBranch, worktreePath],
);

try {
  // Replace the published site with the new build
  for (const name of readdirSync(worktreePath)) {
    if (name !== ".git") rmSync(join(worktreePath, name), { recursive: true });
  }
  cpSync(pagesPath, worktreePath, { recursive: true });
  git(["add", "--all"], worktreePath);
  if (git(["status", "--porcelain"], worktreePath) === "") {
    console.log("The published site is already up to date.");
  } else {
    git(
      [
        "commit",
        "-m",
        `Published PaintCanvas ${packageJson.version} docs and demos from ${commit}.`,
      ],
      worktreePath,
    );
    run("git", ["push", "origin", pagesBranch], { cwd: worktreePath });
    console.log("Published to https://lvl99.github.io/paintcanvas/");
  }
} finally {
  git(["worktree", "remove", "--force", worktreePath]);
}
