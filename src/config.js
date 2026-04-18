'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'nexus-config.json');

let _config = null;

function loadConfig() {
  if (_config) return _config;

  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read nexus-config.json: ${e.message}`);
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse nexus-config.json: ${e.message}`);
  }

  // Validate required fields
  if (!cfg.auth?.token) throw new Error('Config missing auth.token');
  if (!cfg.port) throw new Error('Config missing port');
  if (!cfg.budgets?.dailyUsd) throw new Error('Config missing budgets.dailyUsd');
  if (!cfg.modelPrices) throw new Error('Config missing modelPrices');

  // Allow env overrides
  if (process.env.NEXUS_TOKEN) cfg.auth.token = process.env.NEXUS_TOKEN;
  if (process.env.NEXUS_PORT) cfg.port = parseInt(process.env.NEXUS_PORT, 10);

  _config = cfg;
  return cfg;
}

function getConfig() {
  return _config || loadConfig();
}

module.exports = { loadConfig, getConfig };
