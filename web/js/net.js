// Conexión WebSocket con reconexión automática y medida de latencia.
// La usan la tele y el móvil.
export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.hello = null;      // mensaje a reenviar al (re)conectar
    this.rtts = [];
    this.halfLatency = 40;  // ms, estimación inicial
    this.retry = 0;
    this.queue = [];        // mensajes importantes enviados sin conexión: salen al reconectar
    setInterval(() => this.send({ type: 'ping', t: performance.now() }), 2000);
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  connect(hello) {
    if (hello) this.hello = hello;
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;
    this.onStatus('connecting');
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('open');
      const h = typeof this.hello === 'function' ? this.hello() : this.hello;
      if (h) this.send(h);
      const q = this.queue.splice(0);
      q.forEach(m => this.send(m));
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        const rtt = performance.now() - m.t;
        this.rtts.push(rtt);
        if (this.rtts.length > 9) this.rtts.shift();
        const sorted = [...this.rtts].sort((a, b) => a - b);
        this.halfLatency = sorted[sorted.length >> 1] / 2;
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.onStatus('closed');
      const wait = Math.min(5000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => ws.close();
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) return this.ws.send(JSON.stringify(m));
    // Lo que caduca enseguida (ping, voz, estado) no se guarda
    if (!['ping', 'pitch', 'state'].includes(m.type) && this.queue.length < 20) this.queue.push(m);
  }
}
