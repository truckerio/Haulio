import path from "path";
import { fileURLToPath } from "url";

const currentFile = fileURLToPath(import.meta.url);
export const repoRoot = path.resolve(path.dirname(currentFile), "..", "..");
