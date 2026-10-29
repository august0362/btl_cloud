/* global process */
import { createServer } from 'node:http';
const server = createServer((_req, res) => res.end('ok'));
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('message', (message) => {
  if (message === 'local:shutdown') server.close(() => process.exit(process.env.BTL_TEST_STOP_ERROR === '1' ? 2 : 0));
});
