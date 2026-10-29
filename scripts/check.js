import ejs from "ejs";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const directory of ["src", "scripts", "tests"]) {
  for (const file of await readdir(directory, { recursive: true })) {
    if (file.endsWith(".js")) {
      const result = spawnSync(
        process.execPath,
        ["--check", `${directory}/${file}`],
        { stdio: "inherit" },
      );
      if (result.status) process.exit(result.status);
    }
  }
}
console.log("JavaScript syntax checks passed.");

for (const file of await readdir("views", { recursive: true })) {
  if (file.endsWith(".ejs"))
    ejs.compile(await readFile(`views/${file}`, "utf8"), {
      filename: `views/${file}`,
    });
}
console.log("EJS template compilation passed.");
