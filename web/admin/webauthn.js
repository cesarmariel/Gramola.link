// Touch ID / passkeys (WebAuthn): convierte las opciones JSON del servidor y las respuestas del navegador.
(function () {
  const b64u = {
    dec: s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; },
    enc: buf => { const u = new Uint8Array(buf); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  };
  const creds = l => (l || []).map(c => ({ ...c, id: b64u.dec(c.id) }));
  async function register(o) {
    const publicKey = { ...o, challenge: b64u.dec(o.challenge), user: { ...o.user, id: b64u.dec(o.user.id) }, excludeCredentials: creds(o.excludeCredentials) };
    const c = await navigator.credentials.create({ publicKey });
    const r = c.response;
    return {
      id: c.id, rawId: b64u.enc(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(),
      authenticatorAttachment: c.authenticatorAttachment || undefined,
      response: { clientDataJSON: b64u.enc(r.clientDataJSON), attestationObject: b64u.enc(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] },
    };
  }
  async function login(o) {
    const publicKey = { ...o, challenge: b64u.dec(o.challenge), allowCredentials: creds(o.allowCredentials) };
    const c = await navigator.credentials.get({ publicKey });
    const r = c.response;
    return {
      id: c.id, rawId: b64u.enc(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(),
      authenticatorAttachment: c.authenticatorAttachment || undefined,
      response: { clientDataJSON: b64u.enc(r.clientDataJSON), authenticatorData: b64u.enc(r.authenticatorData), signature: b64u.enc(r.signature), userHandle: r.userHandle ? b64u.enc(r.userHandle) : undefined },
    };
  }
  window.WebAuthn = { register, login };
})();
