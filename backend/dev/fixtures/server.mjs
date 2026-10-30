/* global process */
import { createServer } from 'node:http';
const server = createServer((req, res) => res.end(req.url === '/environment'
  ? JSON.stringify({ nodeEnv: process.env.NODE_ENV, serveFrontend: process.env.SERVE_FRONTEND, host: process.env.HOST })
  : 'ok'));
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('message', (message) => {
  if (message === 'local:shutdown') server.close(() => process.exit(process.env.BTL_TEST_STOP_ERROR === '1' ? 2 : 0));
});
