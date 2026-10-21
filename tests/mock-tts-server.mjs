// Minimal OpenAI-compatible TTS server for tests: POST /v1/audio/speech returns a WAV whose length
// depends on the text (0.06 s per character) with 0.2 s of silence at both ends (to exercise trimming).
import { createServer } from "node:http";

export function wav(seconds, { rate = 24000, lead = 0.2, tail = 0.2, freq = 220 } = {}) {
  const n = Math.round((lead + seconds + tail) * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const on = t >= lead && t < lead + seconds;
    buf.writeInt16LE(on ? Math.round(Math.sin(2 * Math.PI * freq * t) * 12000) : 0, 44 + i * 2);
  }
  return buf;
}

export const speechSeconds = (text) => Math.max(0.3, text.length * 0.06);

// voices: when given, GET /v1/audio/voices lists them and unknown voices are rejected (like ZeroTTS).
export function startMockTts({ key, voices = null, port = 0 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/audio/voices" && voices) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ voices: voices.map((id) => ({ id, name: id })) }));
    }
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "zerotts" }, { id: "omnivoice" }] }));
    }
    if (req.method === "POST" && req.url === "/v1/audio/speech") {
      if (key && req.headers.authorization !== `Bearer ${key}`) {
        res.writeHead(401);
        return res.end("bad key");
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const j = JSON.parse(body);
        if (voices && !voices.includes(j.voice)) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ detail: `Unknown voice: ${j.voice}` }));
        }
        calls.push(j);
        res.writeHead(200, { "content-type": "audio/wav" });
        res.end(wav(speechSeconds(j.input)));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() }));
  });
}

// Run standalone: node tests/mock-tts-server.mjs [port]   (ZeroTTS-like voices)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { url } = await startMockTts({ port: Number(process.argv[2] ?? 0), voices: ["quangminh", "tiendat", "baotrang"] });
  console.log(`mock TTS on ${url}`);
}
