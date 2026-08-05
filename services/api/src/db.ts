import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const databaseConfigFile=process.env.DATABASE_CONFIG_FILE??"/data/database-url";
const fileConnection=existsSync(databaseConfigFile)?readFileSync(databaseConfigFile,"utf8").trim():"";
export const databaseConnectionString=fileConnection||process.env.DATABASE_URL;
export const databaseConnectionSource=fileConnection?"managed-file":"environment";

export const pool = new Pool({
  connectionString: databaseConnectionString,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
});

export async function migrate(target:pg.Pool=pool): Promise<void> {
  await target.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const directory = resolve(process.env.MIGRATIONS_DIR ?? "migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const exists = await target.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (exists.rowCount) continue;
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(resolve(directory, file), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.info(`Applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function databaseDescription(){try{const value=new URL(databaseConnectionString??"");return {source:databaseConnectionSource,host:value.hostname,port:value.port||"5432",database:value.pathname.replace(/^\//,"")||"postgres",tls:value.searchParams.get("sslmode")||"unspecified"};}catch{return {source:databaseConnectionSource,host:"unknown",port:"",database:"",tls:"unspecified"};}}

export async function testAndPrepareDatabase(connectionString:string):Promise<void>{const target=new Pool({connectionString,max:2,connectionTimeoutMillis:10_000});try{await target.query("SELECT current_database(),version()");await migrate(target);}finally{await target.end();}}
export async function saveDatabaseConnection(connectionString:string):Promise<void>{await mkdir(resolve(databaseConfigFile,".."),{recursive:true});const temporary=`${databaseConfigFile}.tmp`;await writeFile(temporary,`${connectionString.trim()}\n`,{encoding:"utf8",mode:0o600});await chmod(temporary,0o600);await rename(temporary,databaseConfigFile);}
