import { readFile } from "node:fs/promises";

const lockfile = JSON.parse(await readFile("package-lock.json", "utf8"));
const forbiddenLicense =
  /(?:^|[^L])GPL|AGPL|SSPL|NON[- ]?COMMERCIAL|UNLICENSED/i;
const missing = [];
const forbidden = [];
let checked = 0;

for (const [packagePath, metadata] of Object.entries(lockfile.packages)) {
  if (!packagePath.includes("node_modules/") || metadata.link) {
    continue;
  }

  checked += 1;
  const license = metadata.license;
  if (typeof license !== "string" || license.trim() === "") {
    missing.push(packagePath);
  } else if (forbiddenLicense.test(license)) {
    forbidden.push(`${packagePath} (${license})`);
  }
}

if (missing.length > 0 || forbidden.length > 0) {
  throw new Error(
    [
      missing.length > 0
        ? `Packages without declared licenses:\n${missing.join("\n")}`
        : "",
      forbidden.length > 0
        ? `Packages requiring explicit approval:\n${forbidden.join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

console.log(`Node license policy passed for ${checked} locked packages.`);
