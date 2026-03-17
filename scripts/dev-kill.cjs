const { clearPort } = require('./dev-runtime.cjs');

const killedCount = clearPort(5173);
if (killedCount > 0) {
  console.log(`[dev:kill] Cleared ${killedCount} process(es) from port 5173`);
} else {
  console.log('[dev:kill] Port 5173 is already clear');
}
