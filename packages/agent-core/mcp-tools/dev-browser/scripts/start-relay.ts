import { serveRelay } from "@/relay.js";

const PORT = parseInt(process.env.PORT || "9224", 10);
const HOST = process.env.HOST || "127.0.0.1";

async function main() {
  const server = await serveRelay({
    port: PORT,
    host: HOST,
  });

  const shutdown = async () => {
    console.log("\nShutting down relay server...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start relay server:", err);
  process.exit(1);
});
