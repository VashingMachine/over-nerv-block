import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const credentialPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["GitHub token", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{30,}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  [
    "assigned credential",
    /\b(?:api[_-]?key|client[_-]?secret|password|private[_-]?key|token)\s*[:=]\s*["'][^"'\s]{16,}["']/i,
  ],
];

const findings = [];

for (const filePath of trackedFiles) {
  const contents = await readFile(filePath);
  if (contents.includes(0) || contents.byteLength > 2_000_000) {
    continue;
  }

  const text = contents.toString("utf8");
  for (const [label, pattern] of credentialPatterns) {
    if (pattern.test(text)) {
      findings.push(`${filePath}: possible ${label}`);
    }
  }
}

if (findings.length > 0) {
  throw new Error(
    `Secret scan failed without printing credential values:\n${findings.join("\n")}`,
  );
}

console.log(`Secret scan passed for ${trackedFiles.length} repository files.`);
