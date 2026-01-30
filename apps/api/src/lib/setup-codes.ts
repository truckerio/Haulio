import crypto from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeSetupCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateSetupCode(length = 20) {
  const chars = CODE_ALPHABET;
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
