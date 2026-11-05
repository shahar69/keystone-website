'use strict';
// The cPanel source directory is mounted into its application container.
// Keep runtime data outside public and outside tracked release files.
const path = require('node:path');
process.env.DATA_DIR ||= path.join(process.cwd(), 'data');
process.env.HOST ||= '0.0.0.0';
const {createApplication} = require(path.join(process.cwd(), 'server.js'));
createApplication().then(app => {
  if (process.env.DEPLOY_DIAGNOSTICS === '1') {
    let remaining = 10;
    app.server.prependListener('request', req => {
      if (remaining-- > 0) console.log(JSON.stringify({event:'proxy_diagnostic',peer:req.socket.remoteAddress,protocol:req.headers['x-forwarded-proto'] || '',errorDocument:/^\/(403|404)\.shtml(?:\?|$)/.test(req.url || '')}));
    });
    const fs = require('node:fs');
    console.log(JSON.stringify({event:'data_mount',mounts:fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').filter(line => / \/app(?:\/| )/.test(line))}));
  }
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
