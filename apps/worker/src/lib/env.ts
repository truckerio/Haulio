import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
  path.resolve(process.cwd(), "..", ".env"),
];

const selected = candidates.find((candidate) => fs.existsSync(candidate));

if (selected) {
  dotenv.config({ path: selected });
} else {
  dotenv.config();
}
