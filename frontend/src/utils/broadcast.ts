type Message = { type: string; payload?: any };

const CHANNEL = "scarms_events";

export function broadcast(message: Message) {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(message);
    bc.close();
  } catch (e) {
    // fallback to localStorage event
    try {
      localStorage.setItem(CHANNEL, JSON.stringify({ ...message, _ts: Date.now() }));
    } catch (err) {
      // ignore
    }
  }
}

export function subscribe(cb: (msg: Message) => void) {
  let bc: BroadcastChannel | null = null;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== CHANNEL || !e.newValue) return;
    try {
      const data = JSON.parse(e.newValue);
      cb({ type: data.type, payload: data.payload });
    } catch (err) {
      // ignore
    }
  };
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev) => cb(ev.data as Message);
  } catch (e) {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    if (bc) {
      try { bc.close(); } catch (e) { /* ignore */ }
    } else {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export default { broadcast, subscribe };
