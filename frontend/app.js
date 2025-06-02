import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { generateKeyPair, exportKey, signChallenge, signPocket } from './crypto';
import { v4 as uuidv4 } from 'uuid';

const socket = new WebSocket('ws://localhost:8080');

const App = () => {
  const [keys, setKeys] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [messages, setMessages] = useState([]);
  const [toPK, setToPK] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'challenge') {
        const signature = await signChallenge(keys.privateKey, msg.challenge);
        const exportedPK = await exportKey(keys.publicKey);
        socket.send(JSON.stringify({ type: 'registerResponse', publicKey: exportedPK, signature }));
      } else if (msg.type === 'registered') {
        setRegistered(true);
      } else if (msg.type === 'pocket') {
        setMessages((prev) => [...prev, msg.pocket]);
      }
    };
  }, [keys]);

  const createIdentity = async () => {
    const keyPair = await generateKeyPair();
    setKeys(keyPair);
    socket.send(JSON.stringify({ type: 'registerRequest' }));
  };

  const sendMessage = async () => {
    if (!keys || !toPK || !text) return;

    const senderPK = await exportKey(keys.publicKey);
    const timestamp = Date.now();
    const chatId = 'default';
    const msgType = 'text';

    const payload = {
      chatId,
      msgType,
      content: text,
    };

    const pocketData = JSON.stringify(payload);
    const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(pocketData + senderPK + toPK + timestamp));
    const signature = await signPocket(keys.privateKey, await hash);

    const pocket = {
      id: uuidv4(),
      senderPK,
      receiverPKs: [toPK],
      data: payload,
      timestamp,
      signature,
    };

    socket.send(JSON.stringify({ type: 'pocket', pocket }));
    setText('');
  };

  return (
    <div>
      <h1>Mesh Chat</h1>
      {!keys && <button onClick={createIdentity}>Create Identity</button>}
      {registered && <p>✅ Registered</p>}
      {registered && (
        <div>
          <input
            type="text"
            placeholder="Receiver PK"
            value={toPK}
            onChange={(e) => setToPK(e.target.value)}
            style={{ width: '100%' }}
          />
          <textarea
            placeholder="Your message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ width: '100%', height: 60 }}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      )}
      <div>
        <h3>Messages:</h3>
        <ul>{messages.map((m, i) => <li key={i}>{JSON.stringify(m)}</li>)}</ul>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
