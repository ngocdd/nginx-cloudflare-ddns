#!/usr/bin/env node
// Generates the JWT key pair used by the backend to sign/verify tokens.
// Idempotent: refuses to overwrite an existing keys file.
//
// Usage:
//   node scripts/generate-keys.js [output-path]
//
// Defaults to ../data/keys.json (relative to this script), matching the
// path the backend reads from when DB_SQLITE_FILE lives under ./data.

import fs from "node:fs";
import path from "node:path";
import NodeRSA from "node-rsa";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputPath =
	process.argv[2] || path.resolve(__dirname, "..", "..", "data", "keys.json");

if (fs.existsSync(outputPath)) {
	console.log(`Keys already exist at ${outputPath} — leaving them alone.`);
	process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const key = new NodeRSA({ b: 2048 });
key.generateKeyPair();

const keys = {
	key: key.exportKey("private").toString(),
	pub: key.exportKey("public").toString(),
};

fs.writeFileSync(outputPath, JSON.stringify(keys, null, 2));
console.log(`Wrote JWT key pair to ${outputPath}`);