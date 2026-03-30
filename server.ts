import { resolve, extname } from 'path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
  '.png':  'image/png',
};

// Bundle main.js once at startup
console.log('Bundling...');
const build = await Bun.build({
  entrypoints: ['./main.js'],
  target: 'browser',
  minify: false,
});

if (!build.success) {
  console.error('Build failed:');
  build.logs.forEach(l => console.error(l));
  process.exit(1);
}

const bundleCode = await build.outputs[0].text();
console.log(`Bundle ready (${(bundleCode.length / 1024).toFixed(1)} KB)`);

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === '/') pathname = '/index.html';

    // Serve the pre-built JS bundle
    if (pathname === '/bundle.js') {
      return new Response(bundleCode, {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }

    // Serve static files from project root
    const filePath = resolve('.' + pathname);
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return new Response('Not found', { status: 404 });

    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    return new Response(file, {
      headers: {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      },
    });
  },
});

console.log(`\n  Running → http://localhost:${server.port}\n`);
