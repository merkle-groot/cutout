import { app } from "./app.js";
import { db } from "./providers/db.provider.js";
import { testnetAspService } from "./services/index.js";

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST ?? '0.0.0.0';

async function main() {
  await db.init();
  testnetAspService.start();
  // Start the server
  app.listen(port, host, () => {
    console.log(`Relay API listening at http://${host}:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
