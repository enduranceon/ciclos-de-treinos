// Gera um token aleatório seguro pra convites. Usa crypto API do browser.
export function generateInviteToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}
