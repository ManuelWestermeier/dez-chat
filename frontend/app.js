import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { generateKeyPair, exportKey, signChallenge } from './crypto';

const socket = new WebSocket('ws://localhost:8080');

const App = () => {
  const [keys, setKeys] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [messages, setMessages] = useState([]);

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

  return (
    <div>
      <h1>Mesh Chat</h1>
      {!keys && <button onClick={createIdentity}>Create Identity</button>}
      {registered && <p>✅ Registered</p>}
      <div>
        <h3>Messages:</h3>
        <ul>{messages.map((m, i) => <li key={i}>{JSON.stringify(m)}</li>)}</ul>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
