type CryptoLike = {
  randomUUID?: () => string;
};

export function createId() {
  const cryptoLike =
    typeof globalThis === "undefined"
      ? undefined
      : (globalThis as { crypto?: CryptoLike }).crypto;

  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
