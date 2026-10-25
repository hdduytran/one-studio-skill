// Minimal OpenAI-compatible speech-to-text server for tests: POST /v1/audio/transcriptions (multipart) returns
// { text } from transcribe({ bytes, model, language }), which the test supplies (default: empty transcript).
import { createServer } from "node:http";

// Parts of a multipart/form-data body: [{ name, filename, data: Buffer }].
export function parseMultipart(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? "");
  if (!boundary) return [];
  const sep = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const parts = [];
  let at = body.indexOf(sep);
  while (at >= 0) {
    const next = body.indexOf(sep, at + sep.length);
    if (next < 0) break;
    const part = body.subarray(at + sep.length + 2, next - 2); // skip CRLF after the boundary and before the next
    const split = part.indexOf("\r\n\r\n");
    if (split >= 0) {
      const head = part.subarray(0, split).toString("utf8");
      parts.push({ name: /name="([^"]*)"/.exec(head)?.[1], filename: /filename="([^"]*)"/.exec(head)?.[1] ?? null, data: part.subarray(split + 4) });
    }
    at = next;
  }
  return parts;
}

export function startMockStt({ key, transcribe = () => "", port = 0 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/audio/transcriptions") {
      if (key && req.headers.authorization !== `Bearer ${key}`) {
        res.writeHead(401);
        return res.end("bad key");
      }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const parts = parseMultipart(Buffer.concat(chunks), req.headers["content-type"]);
        const field = (n) => parts.find((p) => p.name === n);
        const call = { model: field("model")?.data.toString(), language: field("language")?.data.toString() ?? null, bytes: field("file")?.data ?? Buffer.alloc(0) };
        calls.push(call);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ text: transcribe(call) }));
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
