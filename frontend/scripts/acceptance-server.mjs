import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const backend = resolve(root, "backend");
const ini = resolve(backend, "php.ini");
const extensionDir = existsSync(ini)
  ? readFileSync(ini, "utf8").match(/extension_dir="([^"]+)"/)?.[1]
  : null;
const localPhp = extensionDir ? resolve(extensionDir, "../php.exe") : null;
const php =
  process.env.DINEFLOW_PHP ||
  (localPhp && existsSync(localPhp) ? localPhp : "php");
const database = resolve(root, ".local/acceptance.sqlite");
mkdirSync(dirname(database), { recursive: true });
writeFileSync(database, "");
const env = {
  ...process.env,
  APP_ENV: "testing",
  APP_DEBUG: "false",
  APP_KEY: "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  APP_URL: "http://127.0.0.1:8091",
  FRONTEND_URL: "http://127.0.0.1:5191",
  SANCTUM_STATEFUL_DOMAINS: "127.0.0.1:5191,127.0.0.1:8091",
  SESSION_DOMAIN: "",
  SESSION_DRIVER: "database",
  SESSION_SECURE_COOKIE: "false",
  DB_CONNECTION: "sqlite",
  DB_DATABASE: database,
  DB_URL: "",
  CACHE_STORE: "array",
  MAIL_MAILER: "array",
  QUEUE_CONNECTION: "sync",
  BROADCAST_CONNECTION: "log",
  ...(existsSync(ini) ? { PHPRC: ini } : {}),
};
for (const args of [
  ["migrate:fresh", "--force"],
  ["db:seed", "--class=Database\\Seeders\\AcceptanceSeeder", "--force"],
]) {
  const result = spawnSync(php, ["artisan", ...args], {
    cwd: backend,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const server = spawn(
  php,
  ["artisan", "serve", "--host=127.0.0.1", "--port=8091", "--no-reload"],
  { cwd: backend, env, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code || 0));
