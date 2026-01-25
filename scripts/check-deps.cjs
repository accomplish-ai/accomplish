const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const lockfilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');
const hashPath = path.join(__dirname, '..', 'node_modules', '.lockfile-hash');

// Compute current lockfile hash
const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
const currentHash = crypto.createHash('sha256').update(lockfileContent).digest('hex').slice(0, 16);

// Check if hash file exists
if (!fs.existsSync(hashPath)) {
  console.error('\n❌ Dependencies not installed. Run: pnpm install\n');
  process.exit(1);
}

// Compare hashes
const storedHash = fs.readFileSync(hashPath, 'utf8').trim();
if (storedHash !== currentHash) {
  console.error('\n❌ Dependencies out of sync. Run: pnpm install\n');
  process.exit(1);
}

console.log('✓ Dependencies in sync');
