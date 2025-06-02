const WebSocket = require('ws');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const PEERS = (process.env.PEERS || '').split(',').filter(Boolean);

const clients = new Map();        // publicKey -> ws
const challenges = new Map();     // ws -> challenge
const peers = new Set();          // connected peer sockets
const seenPockets = new Set();    // pocket.id -> seen

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});

wss.on('connection', (ws) => {
  let registeredPK = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === 'registerRequest') {
      const challenge = crypto.randomBytes(32).toString('hex');
      challenges.set(ws, challenge);
      return ws.send(JSON.stringify({ type: 'challenge', challenge }));
    }

    if (msg.type === 'registerResponse') {
      const { publicKey, signature } = msg;
      const challenge = challenges.get(ws);
      if (!challenge) return;

      try {
        const pubKeyBuffer = Buffer.from(publicKey, 'base64');
        const sigBuffer = Buffer.from(signature, 'hex');
        const verify = crypto.createVerify('SHA256');
        verify.update(challenge);
        verify.end();

        const isValid = verify.verify(
          { key: pubKeyBuffer, format: 'der', type: 'spki' },
          sigBuffer
        );

        if (isValid) {
          registeredPK = publicKey;
          clients.set(publicKey, ws);
          ws.send(JSON.stringify({ type: 'registered', publicKey }));
          console.log(`✅ Registered: ${publicKey.slice(0, 20)}...`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' }));
          ws.close();
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Malformed public key' }));
        ws.close();
      }
    }

    if (msg.type === 'pocket') {
      const { pocket } = msg;
      if (!pocket || !pocket.id || seenPockets.has(pocket.id)) return;

      seenPockets.add(pocket.id);
      setTimeout(() => seenPockets.delete(pocket.id), 5 * 60 * 1000);

      for (const receiverPK of pocket.receiverPKs || []) {
        const client = clients.get(receiverPK);
        if (client?.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'pocket', pocket }));
        }
      }

      for (const peer of peers) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: 'pocket', pocket }));
        }
      }
    }
  });

  ws.on('close', () => {
    if (registeredPK) clients.delete(registeredPK);
    challenges.delete(ws);
    peers.delete(ws);
  });
});

function connectToPeer(url) {
  const ws = new WebSocket(url);

  ws.on('open', () => {
    peers.add(ws);
    console.log(`🤝 Connected to peer ${url}`);
  });

  ws.on('message', (msg) => {
    try {
      const { type, pocket } = JSON.parse(msg);
      if (type === 'pocket' && pocket?.id && !seenPockets.has(pocket.id)) {
        seenPockets.add(pocket.id);

        for (const pk of pocket.receiverPKs || []) {
          const client = clients.get(pk);
          if (client?.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'pocket', pocket }));
          }
        }

        for (const peer of peers) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'pocket', pocket }));
          }
        }

        setTimeout(() => seenPockets.delete(pocket.id), 5 * 60 * 1000);
      }
    } catch {}
  });

  ws.on('close', () => {
    peers.delete(ws);
    console.log(`🔌 Lost connection to peer ${url}. Reconnecting...`);
    setTimeout(() => connectToPeer(url), 3000);
  });

  ws.on('error', () => ws.close());
}

PEERS.forEach(connectToPeer);
