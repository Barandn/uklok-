import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

// Only define full config with credentials if DATABASE_URL is available
// This allows schema-only operations (like generate) to work without a DB
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  ...(connectionString ? { dbCredentials: { url: connectionString } } : {}),
});
