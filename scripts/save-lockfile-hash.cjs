const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const lockfilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');
const hashPath = path.join(__dirname, '..', 'node_modules', '.lockfile-hash');

const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
const hash = crypto.createHash('sha256').update(lockfileContent).digest('hex').slice(0, 16);

fs.writeFileSync(hashPath, hash);
console.log('Lockfile hash saved:', hash);
