// In-process MQTT broker (aedes) for e2e tests: no EMQX needed. Prints "PORT <n>" when ready.
import { createServer } from 'node:net';
import { Aedes } from 'aedes';

const broker = await Aedes.createBroker();
const server = createServer(broker.handle);
server.listen(0, '127.0.0.1', () => console.log(`PORT ${server.address().port}`));
process.on('SIGTERM', () => broker.close(() => server.close(() => process.exit(0))));
