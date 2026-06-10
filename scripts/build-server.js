'use strict';
// Bundles server/index.js + all its deps into a single file (server-dist/index.js).
// This eliminates node_modules resolution issues when Electron forks the backend
// from outside the asar archive.

const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, '..', 'server', 'index.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(__dirname, '..', 'server-dist', 'index.js'),
  format: 'cjs',
  // Keep dynamic requires that can't be statically analysed (e.g. child_process)
  packages: 'bundle',
  // systeminformation uses dynamic requires for platform detection — keep those working
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
}).catch(() => process.exit(1));
