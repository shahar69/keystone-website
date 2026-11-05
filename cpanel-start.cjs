'use strict';
// The cPanel source directory is mounted into its application container.
// Keep runtime data outside public and outside tracked release files.
const path = require('node:path');
process.env.DATA_DIR ||= path.join(process.cwd(), 'data');
process.env.HOST ||= '0.0.0.0';
const {createApplication} = require(path.join(process.cwd(), 'server.js'));
createApplication().then(app => {
  const port = Number(process.env.PORT || 3000);
  app.server.listen(port, process.env.HOST, () => console.log(JSON.stringify({
    event: 'keystone_ready', port, dataDir: process.env.DATA_DIR,
    release: '2026-11-05-company-draft'
  })));
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    setTimeout(() => process.exit(1), 20000).unref();
    app.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}).catch(error => {
  console.error('Startup failed:', error.message);
  process.exitCode = 1;
});
