import path from "node:path";

export const PROJECT_ROOT = process.cwd();

export const CONFIG_PATH = path.join(PROJECT_ROOT, "codoc.yaml");

export const STATE_FILE = path.join(PROJECT_ROOT, "codoc.lock");

export const ENV_FILE = path.join(PROJECT_ROOT, ".env");

export const CODOC_ENV_FILE = path.join(PROJECT_ROOT, ".env-codoc");
