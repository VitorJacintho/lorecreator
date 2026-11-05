/**
 * Desenvolvimento do app desktop: sobe o Vite (com recarga automática) e abre
 * o Electron apontando para ele.   npm run app:dev
 */
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('O Vite não informou a URL local.');
console.log(`Vite em ${url} — abrindo o Electron…`);

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
