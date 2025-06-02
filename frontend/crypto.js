export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
}

export async function exportKey(publicKey) {
  const exported = await window.crypto.subtle.exportKey('spki', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function signChallenge(privateKey, challenge) {
  const encoder = new TextEncoder();
  const data = encoder.encode(challenge);
  const signature = await window.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}
