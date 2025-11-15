import { OrderExecutionServer } from './server.js';
const server = new OrderExecutionServer();
server.start().catch((error) => {
  console.log(error);
  process.exit(1);
});