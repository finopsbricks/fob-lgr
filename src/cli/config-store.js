/**
 * CLI credential store — reads/writes ~/.fob/fob-lgr/config.yml (mode 0600) and
 * resolves which credentials the current command uses.
 *
 * Config lives under the shared family root ~/.fob/ so every fob-<tool> keeps
 * its config in one place. Home-dir based for multi-OS support, not XDG.
 * Override the whole directory with FOB_LGR_CONFIG_DIR.
 *
 * CLI-only: the importable client (src/index.js) never imports this. Handlers
 * call resolveCredentials() and pass the result to the client factory.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

const CONFIG_DIR = process.env.FOB_LGR_CONFIG_DIR || join(homedir(), '.fob', 'fob-lgr');
const CONFIG_PATH = join(CONFIG_DIR, 'config.yml');

let orgOverride = null;

/** Set by the `--profile` global flag. Beats the stored current_org. */
export function setOrgOverride(name) {
  orgOverride = name;
}

export function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    const cfg = yaml.load(readFileSync(CONFIG_PATH, 'utf8')) || {};
    return {
      current_org: cfg.current_org ?? null,
      orgs: cfg.orgs ?? {},
      settings: cfg.settings ?? {},
    };
  }
  return { current_org: null, orgs: {}, settings: {} };
}

export function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, yaml.dump(cfg), { mode: 0o600 });
}

export function addOrg(name, { api_url, api_key, api_secret }) {
  const cfg = loadConfig();
  cfg.orgs[name] = { api_url, api_key, api_secret };
  if (!cfg.current_org) cfg.current_org = name;
  saveConfig(cfg);
  return cfg;
}

export function removeOrg(name) {
  const cfg = loadConfig();
  if (!cfg.orgs[name]) throw new Error(`No profile named '${name}'.`);
  delete cfg.orgs[name];
  if (cfg.current_org === name) cfg.current_org = Object.keys(cfg.orgs)[0] ?? null;
  saveConfig(cfg);
  return cfg;
}

export function useOrg(name) {
  const cfg = loadConfig();
  if (!cfg.orgs[name]) {
    throw new Error(`No profile named '${name}'. Run \`fob-lgr config add ${name}\`.`);
  }
  cfg.current_org = name;
  saveConfig(cfg);
  return cfg;
}

/** Absolute path to the config file, shown in `config list`. */
export function configPath() {
  return CONFIG_PATH;
}

/** Profiles for display — non-secret metadata only. Secrets are never included. */
export function listProfiles() {
  const cfg = loadConfig();
  const profiles = Object.entries(cfg.orgs).map(([name, o]) => ({
    name,
    current: name === cfg.current_org,
    api_url: o.api_url,
  }));
  return { current: cfg.current_org, path: CONFIG_PATH, profiles };
}

/**
 * Resolve credentials for the current command.
 *
 * Precedence: `--profile` override, then the stored `current_org`. The CLI does
 * not read FOB_LGR_API_* env vars — an env var that silently overrode the
 * active profile is a footgun, and in a tool that writes to a ledger it is one
 * that posts to the wrong organization's books.
 */
export function resolveCredentials() {
  const cfg = loadConfig();

  if (orgOverride) {
    const org = cfg.orgs[orgOverride];
    if (!org) {
      throw new Error(`Profile '${orgOverride}' is not configured. Run \`fob-lgr config add ${orgOverride}\`.`);
    }
    return { ...org, name: orgOverride, source: `profile '${orgOverride}'` };
  }

  if (cfg.current_org && cfg.orgs[cfg.current_org]) {
    return {
      ...cfg.orgs[cfg.current_org],
      name: cfg.current_org,
      source: `profile '${cfg.current_org}'`,
    };
  }

  throw new Error(
    'No ledger profile selected. Run `fob-lgr config add <name>`, then `fob-lgr config use <name>` (or pass --profile <name>).',
  );
}

/** Non-secret description of the identity in force, or null. Powers `config current`. */
export function describeCurrent() {
  let creds;
  try {
    creds = resolveCredentials();
  } catch {
    return null;
  }
  const { api_key, api_secret, ...rest } = creds;
  return rest;
}
