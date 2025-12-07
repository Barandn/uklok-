import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import mysql from "mysql2/promise";
import { InsertPort, ports } from "../../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Please configure your database connection string.");
    process.exit(1);
  }

  const jsonPath = path.resolve(process.cwd(), "server/data/ports.json");
  const fileContents = await fs.readFile(jsonPath, "utf-8");
  const records = JSON.parse(fileContents) as InsertPort[];

  const connection = await mysql.createConnection(databaseUrl);
  const db = drizzle(connection);

  await db.insert(ports).values(records).onDuplicateKeyUpdate({
    set: {
      name: sql`VALUES(name)`,
      country: sql`VALUES(country)`,
      latitude: sql`VALUES(latitude)`,
      longitude: sql`VALUES(longitude)`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  });

  console.log(`Inserted/updated ${records.length} port records.`);
  await connection.end();
}

main().catch((error) => {
  console.error("Port seed failed", error);
  process.exit(1);
});
