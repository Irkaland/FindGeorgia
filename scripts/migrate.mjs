import { loadConfig } from "../server/config.js";
import { openConfiguredDatabase } from "../server/db.js";

const config = loadConfig();
const db = await openConfiguredDatabase(config);
await db.close();
console.log(JSON.stringify({ event: "database_migrations_completed", provider: config.databaseProvider }));
