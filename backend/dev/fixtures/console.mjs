/* global process, console, setInterval */
process.on('SIGINT', () => { console.log('graceful'); process.exit(0); });
process.on('SIGBREAK', () => { console.log('graceful'); process.exit(0); });
setInterval(() => {}, 1000);
console.log('ready');
