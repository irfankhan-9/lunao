import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const keyPath = path.join(os.homedir(), '.ssh', 'lunao-backend-key.pem');
const cmd = `ssh -i "${keyPath}" ec2-user@51.21.181.63 "grep -n 'fab-label-text' /var/www/lunao/public/templates-raw/hvac-template-02.html"`;
console.log(execSync(cmd, { encoding: 'utf8' }));

const cmd2 = `ssh -i "${keyPath}" ec2-user@51.21.181.63 "node -e \\"import('./server/lib/templates.js').then(async ({resolveTemplate, loadRawHtml}) => { const res = await resolveTemplate('hvac-bespoke'); console.log('Resolved:', res); const raw = await loadRawHtml(res); console.log('Raw contains fab-label-text:', raw.includes('fab-label-text')); process.exit(0); });\\""`;
console.log(execSync(cmd2, { encoding: 'utf8' }));
