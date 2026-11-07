import { execSync } from 'child_process';
import path from 'path';

const KEY = 'C:/Users/IMRAN MENGAL/.ssh/lunao-backend-key.pem';
const HOST = 'ec2-user@51.21.181.63';
const REMOTE_DIR = '/var/www/lunao';

console.log('Syncing templates and sw.js to EC2...');

const scpCommands = [
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/templates-raw/barber-template-03.html ${HOST}:${REMOTE_DIR}/public/templates-raw/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/templates-raw/salon-template-02.html ${HOST}:${REMOTE_DIR}/public/templates-raw/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/templates-raw/gym-template-02.html ${HOST}:${REMOTE_DIR}/public/templates-raw/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/templates-raw/hvac-template-02.html ${HOST}:${REMOTE_DIR}/public/templates-raw/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/barber-template-03.html ${HOST}:${REMOTE_DIR}/public/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/salon-template-02.html ${HOST}:${REMOTE_DIR}/public/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/gym-template-02.html ${HOST}:${REMOTE_DIR}/public/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/hvac-template-02.html ${HOST}:${REMOTE_DIR}/public/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no public/sw.js ${HOST}:${REMOTE_DIR}/public/`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no sw.js ${HOST}:${REMOTE_DIR}/sw.js`,
  `scp -i "${KEY}" -o StrictHostKeyChecking=no sites/summit-befrnfarber-hub-austin/index.html ${HOST}:${REMOTE_DIR}/sites/summit-befrnfarber-hub-austin/`
];

for (const cmd of scpCommands) {
  try {
    console.log('Running:', cmd);
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    console.error('Error running cmd:', e.message);
  }
}

console.log('Restarting PM2 backend...');
try {
  execSync(`ssh -i "${KEY}" -o StrictHostKeyChecking=no ${HOST} "pm2 restart lunao-backend"`, { stdio: 'inherit' });
  console.log('PM2 restarted successfully');
} catch (e) {
  console.error('PM2 restart notice:', e.message);
}
