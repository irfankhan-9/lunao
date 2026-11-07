import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const keyPath = path.join(os.homedir(), '.ssh', 'lunao-backend-key.pem');
execSync(`scp -i "${keyPath}" scripts/patch-supabase-sites.mjs ec2-user@51.21.181.63:/var/www/lunao/patch-supabase.mjs`, { stdio: 'inherit' });
const res = execSync(`ssh -i "${keyPath}" ec2-user@51.21.181.63 "cd /var/www/lunao; node patch-supabase.mjs"`, { encoding: 'utf8' });
console.log(res);

