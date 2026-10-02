/** Image integrity: an image is only shown if its bytes match the recorded fingerprint. */

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyMedia(bytes: ArrayBuffer | Uint8Array, expectedSha256: string): Promise<boolean> {
  return (await sha256Hex(bytes)) === expectedSha256.toLowerCase();
}
