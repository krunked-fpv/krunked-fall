import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Dev-only read-only middleware serving gitignored `.krunkedfall-assets/`
 * when the operator has locally extracted their owned retail pack.
 * NEVER bundled or copied into `dist/`.
 */
function krunkedLocalPackPlugin(): Plugin {
  return {
    name: 'krunkedfall-local-pack-middleware',
    configureServer(server) {
      const assetsRoot = path.resolve(process.cwd(), '.krunkedfall-assets');
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? '';
        const cleanUrl = rawUrl.split('?')[0];
        if (!cleanUrl.startsWith('/.krunkedfall-assets/')) {
          next();
          return;
        }
        const relPath = decodeURIComponent(cleanUrl.slice('/.krunkedfall-assets/'.length));
        const resolved = path.resolve(assetsRoot, relPath);
        if (!resolved.startsWith(assetsRoot + path.sep) && resolved !== assetsRoot) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(resolved).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [krunkedLocalPackPlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
});
