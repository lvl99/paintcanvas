import { spawnSync } from "node:child_process";

/**
 * Run a command, showing its output, and return what it printed. Exits the script if the command fails.
 *
 * @example
 * run("git", ["status"]);
 * const branch = run("git", ["branch", "--show-current"], { quiet: true }).trim();
 */
export const run = (
  command: string,
  args: string[],
  { cwd, quiet = false }: { cwd?: string; quiet?: boolean } = {},
): string => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (quiet) process.stderr.write(result.stderr ?? "");
    console.error(`Failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
};

/**
 * Run a command quietly and return whether it succeeded, without exiting the script.
 *
 * @example
 * succeeds("git", ["rev-parse", "--verify", "gh-pages"]); // true if the branch exists
 */
export const succeeds = (command: string, args: string[]): boolean =>
  spawnSync(command, args, { stdio: "ignore" }).status === 0;
