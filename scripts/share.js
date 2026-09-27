'use strict';
/* One-command public URL for the locally running PayClone app.
 *
 * - Starts the server if it isn't already running
 * - Opens a free SSH tunnel via localhost.run (no account, no install —
 *   uses the SSH client built into Windows/macOS/Linux)
 * - Prints the shareable HTTPS URL; Ctrl+C cleans everything up
 *
 * The subdomain is random per run (that's the free tier's only limitation);
 * all data still lives in your local SQLite database at data/payclone.db.
 */
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3000;

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 1500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  let server = null;
  if (!(await serverUp())) {
    console.log('Starting PayClone server on port ' + PORT + ' ...');
    server = spawn(process.execPath, ['server.js'], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !(await serverUp()); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!(await serverUp())) {
    console.error('Server failed to start — check server.log or port availability.');
    process.exit(1);
  }
  console.log('Server is up. Opening public tunnel ...');

  const tunnel = spawn(
    'ssh',
    [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ExitOnForwardFailure=yes',
      '-R', '80:localhost:' + PORT,
      'nokey@localhost.run'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let printed = false;
  const grab = (buf) => {
    const m = String(buf).match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
    if (m && !printed) {
      printed = true;
      console.log('');
      console.log('==========================================================');
      console.log('  PayClone is now PUBLIC at:');
      console.log('');
      console.log('    ' + m[0]);
      console.log('');
      console.log('  Data persists in your local SQLite database.');
      console.log('  Keep this window open while sharing.');
      console.log('==========================================================');
      console.log('');
    }
  };
  tunnel.stdout.on('data', grab);
  tunnel.stderr.on('data', grab);
  tunnel.on('exit', (code) => {
    if (!printed) console.error('Tunnel exited (' + code + ') — network may be blocking ssh. Try again.');
    process.exit(code || 0);
  });

  const cleanup = () => {
    try { tunnel.kill(); } catch (e) { /* ignore */ }
    if (server) {
      try { server.kill(); } catch (e) { /* ignore */ }
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log('Press Ctrl+C to stop sharing.');
}

main();
