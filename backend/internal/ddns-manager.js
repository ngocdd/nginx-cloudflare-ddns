/**
 * DDNS process manager.
 *
 * Owns the single long-running `ddns-updater` child process and the
 * `/data/ddns/config.json` file the binary consumes. The previous
 * implementation spawned one child process per `cloudflare_ddns` row; the
 * new qdm12 binary reads a single config file with all entries, so we run
 * exactly one process and reload it when any row changes.
 *
 * Lifecycle:
 *   - startAllEnabled()     called once on backend boot
 *   - start()               spawn the binary with the latest config
 *   - stop()                SIGTERM, escalate to SIGKILL after 5s
 *   - reload()              debounced stop+start, fires after a row mutation
 *   - trigger(id)           one-shot run for a single row, awaited
 *   - getStatus(id)         runtime state for the UI
 *
 * The in-memory `lastRunData` map is the fast read path for status; it is
 * seeded from each DB row at boot (`preloadFromDatabase`) and persisted
 * fire-and-forget via the injected dbPatcher so a restart does not blank
 * the UI.
 *
 * NOTE: This module deliberately does NOT import the model at top level —
 * doing so transitively loads the JWT key generator, which fails in unit
 * tests without `/data`. The DB patcher is injected by the caller.
 */

import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { global as logger } from "../logger.js";
import internalDdnsBuilder from "./ddns-config-builder.js";

const execFileAsync = promisify(execFile);

// ---- Persistent state --------------------------------------------------------

const lastRunData = new Map();
let dbPatcher = null;

// ---- Child process bookkeeping ----------------------------------------------

/**
 * @typedef {Object} ProcessEntry
 * @property {import('node:child_process').ChildProcess} process
 * @property {Object} config
 * @property {string} startedAt
 * @property {string} lastOutput
 * @property {string} lastError
 */

/** @type {ProcessEntry | null} */
let currentProcess = null;

let reloadTimer = null;
const RELOAD_DEBOUNCE_MS = 1000;

// ---- Binary availability ----------------------------------------------------

// Cached for the lifetime of the process. We do not throw on import if the
// binary is missing — operators may upgrade the binary in a separate
// release — but `getBinaryStatus()` exposes the result so the UI can render
// a "broken" badge.
let binaryAvailable = false;
let binaryCheckError = null;
const checkBinary = async () => {
	try {
		await execFileAsync("which", ["ddns-updater"], { timeout: 5000 });
		binaryAvailable = true;
		binaryCheckError = null;
	} catch (err) {
		binaryAvailable = false;
		binaryCheckError = err.message || "which ddns-updater failed";
		logger.warn(
			`ddns-updater binary not found on PATH: ${binaryCheckError}. DDNS will fail to start until this is fixed.`,
		);
	}
};
// Kick off the check immediately.
checkBinary();

// ---- Filesystem paths -------------------------------------------------------

const CONFIG_DIR = process.env.DDNS_CONFIG_DIR || "/data/ddns";
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;
const UPDATES_FILE = `${CONFIG_DIR}/updates.json`;

// ---- DB patcher injection --------------------------------------------------

/**
 * Inject the DB-patching function. Called once at module init by
 * `ddns-config.js` (or whoever wires the manager up). Takes (id, patch) and
 * returns a Promise.
 *
 * @param {(id: Number, patch: Object) => Promise<any>} fn
 */
const setDbPatcher = (fn) => {
	dbPatcher = fn;
};

const persistRow = (id, patch) => {
	if (!dbPatcher) return;
	dbPatcher(id, patch).catch((err) => {
		logger.warn(`[DDNS #${id}] Failed to persist runtime state: ${err.message}`);
	});
};

// ---- Cache helpers ----------------------------------------------------------

const seedCacheFromRow = (row) => {
	if (!row || !row.id) return;
	const prev = lastRunData.get(row.id) || {};
	lastRunData.set(row.id, {
		...prev,
		lastRunAt: row.last_run_at || prev.lastRunAt || null,
		lastRunSuccess: row.last_run_at != null ? !!row.last_run_success : prev.lastRunSuccess,
		lastTriggerAt: row.last_trigger_at || prev.lastTriggerAt || null,
		lastTriggerSuccess: row.last_trigger_at != null ? !!row.last_trigger_success : prev.lastTriggerSuccess,
		lastError: row.last_error || prev.lastError || null,
	});
};

const deriveState = (id) => {
	const _entry = currentProcess?.config ? lastRunData.get(id) : null;
	const persisted = lastRunData.get(id);

	if (!binaryAvailable) return "missing-binary";
	if (currentProcess) {
		// process is up; report per-id
		if (!persisted?.lastRunAt) return "running-pending";
		return persisted.lastRunSuccess ? "running-ok" : "running-failed";
	}
	if (persisted?.lastError && persisted.lastError !== null) return "broken";
	if (persisted?.lastRunAt) return "stopped";
	return "never-started";
};

// ---- Public API -------------------------------------------------------------

const internalDdnsManager = {
	binaryAvailable: () => binaryAvailable,
	getBinaryStatus: () => ({
		available: binaryAvailable,
		error: binaryCheckError,
	}),

	configPath: () => CONFIG_FILE,
	configDir: () => CONFIG_DIR,

	setDbPatcher,

	/**
	 * Build the config.json from `rows`, write it to disk, then spawn the
	 * ddns-updater child process. Returns true on success.
	 *
	 * @param {Array<Object>} rows - enabled, non-deleted rows.
	 * @returns {Promise<boolean>}
	 */
	start: async (rows) => {
		// Always seed the cache so the UI shows correct timestamps immediately.
		for (const row of rows || []) {
			seedCacheFromRow(row);
		}

		if (!binaryAvailable) {
			const lastError = `ddns-updater binary not found${binaryCheckError ? `: ${binaryCheckError}` : ""}`;
			logger.error(`Cannot start DDNS: ${lastError}`);
			for (const row of rows || []) {
				lastRunData.set(row.id, {
					...lastRunData.get(row.id),
					lastError,
					lastRunSuccess: false,
				});
				persistRow(row.id, { last_error: lastError, last_run_success: 0 });
			}
			return false;
		}

		try {
			await mkdir(CONFIG_DIR, { recursive: true });
		} catch (err) {
			logger.warn(`Failed to create ${CONFIG_DIR}: ${err.message}`);
		}

		const configFile = internalDdnsBuilder.buildConfigFile(rows || []);
		const configJson = JSON.stringify(configFile, null, 2);

		try {
			await writeFile(CONFIG_FILE, configJson, { mode: 0o600 });
		} catch (err) {
			logger.error(`Failed to write ${CONFIG_FILE}: ${err.message}`);
			return false;
		}

		logger.info(`Starting ddns-updater with ${configFile.settings.length} setting(s), cron=${configFile.__cron}`);

		try {
			const proc = spawn("ddns-updater", ["--config", CONFIG_FILE, "--listen-address", ":8000"], {
				env: {
					...process.env,
					UPDATE_CRON: configFile.__cron,
					LOG_LEVEL: process.env.DDNS_LOG_LEVEL || "info",
				},
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			});

			let lastOutput = "";
			let lastError = "";

			proc.stdout.on("data", (data) => {
				const text = data.toString().trim();
				if (text) {
					lastOutput = text;
					logger.info(`[ddns-updater] ${text}`);
				}
			});

			proc.stderr.on("data", (data) => {
				const text = data.toString().trim();
				if (text) {
					lastError = text;
					logger.warn(`[ddns-updater] ${text}`);
				}
			});

			proc.on("error", (err) => {
				logger.error(`ddns-updater process error: ${err.message}`);
				if (currentProcess && currentProcess.process === proc) {
					currentProcess = null;
				}
			});

			proc.on("exit", (code, signal) => {
				const reason = code !== null ? `code ${code}` : `signal ${signal}`;
				logger.info(`ddns-updater exited (${reason})`);
				if (currentProcess && currentProcess.process === proc) {
					currentProcess = null;
				}
				// Mark running rows as stopped
				for (const row of rows || []) {
					lastRunData.set(row.id, {
						...lastRunData.get(row.id),
						lastError: code !== 0 && lastError ? lastError : lastRunData.get(row.id)?.lastError || null,
						lastRunSuccess: false,
					});
				}
			});

			currentProcess = {
				process: proc,
				config: { rows: rows || [], writtenAt: new Date().toISOString() },
				startedAt: new Date().toISOString(),
				lastOutput,
				lastError,
			};
			return true;
		} catch (err) {
			logger.error(`Failed to spawn ddns-updater: ${err.message}`);
			return false;
		}
	},

	/**
	 * Stop the currently running ddns-updater. Waits for exit (with SIGKILL
	 * escalation after 5s).
	 *
	 * @returns {Promise<boolean>} true if a process was stopped.
	 */
	stop: () =>
		new Promise((resolve) => {
			if (!currentProcess) {
				resolve(false);
				return;
			}
			const entry = currentProcess;
			currentProcess = null;
			logger.info("Stopping ddns-updater process");
			let settled = false;
			const finish = (killed) => {
				if (settled) return;
				settled = true;
				clearTimeout(killTimer);
				resolve(killed);
			};
			entry.process.once("exit", () => finish(true));
			try {
				entry.process.kill("SIGTERM");
			} catch (err) {
				logger.warn(`Error stopping ddns-updater: ${err.message}`);
			}
			const killTimer = setTimeout(() => {
				if (entry.process.exitCode === null && !entry.process.killed) {
					logger.warn("ddns-updater did not exit after SIGTERM, sending SIGKILL");
					try {
						entry.process.kill("SIGKILL");
					} catch (_) {
						/* ignore */
					}
				}
			}, 5000);
		}),

	/**
	 * Debounced reload — coalesces bursts of row updates into one restart.
	 *
	 * @param {() => Promise<Array<Object>>} loadRows - fetches the latest enabled rows.
	 */
	reload: (loadRows) => {
		if (reloadTimer) clearTimeout(reloadTimer);
		reloadTimer = setTimeout(async () => {
			reloadTimer = null;
			try {
				const rows = await loadRows();
				await internalDdnsManager.stop();
				await internalDdnsManager.start(rows);
			} catch (err) {
				logger.error(`ddns-updater reload failed: ${err.message}`);
			}
		}, RELOAD_DEBOUNCE_MS);
	},

	/**
	 * One-shot DDNS update for a single row. Spawns a fresh process that
	 * reads a temporary config.json with only that row's settings, waits
	 * for it to exit, and returns the result.
	 *
	 * @param {Object} row
	 * @returns {Promise<{success: boolean, exitCode?: number, output?: string, error?: string}>}
	 */
	trigger: async (row) => {
		if (!binaryAvailable) {
			return {
				success: false,
				error: `ddns-updater binary not found${binaryCheckError ? `: ${binaryCheckError}` : ""}`,
			};
		}
		const tmpConfig = `${CONFIG_DIR}/trigger-${row.id}-${Date.now()}.json`;
		try {
			await mkdir(CONFIG_DIR, { recursive: true });
			const configJson = JSON.stringify(
				internalDdnsBuilder.buildConfigFile([row], { globalCron: "@once" }),
				null,
				2,
			);
			await writeFile(tmpConfig, configJson, { mode: 0o600 });
		} catch (err) {
			return { success: false, error: `Failed to write trigger config: ${err.message}` };
		}

		const result = await new Promise((resolve) => {
			let settled = false;
			let output = "";
			let errorOutput = "";
			let timeoutHandle = null;
			let killTimer = null;

			const finish = (r) => {
				if (settled) return;
				settled = true;
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (killTimer) clearTimeout(killTimer);
				resolve(r);
			};

			try {
				const proc = spawn("ddns-updater", ["--config", tmpConfig, "--no-listener", "--once"], {
					env: {
						...process.env,
						UPDATE_CRON: "@once",
						LOG_LEVEL: process.env.DDNS_LOG_LEVEL || "info",
					},
					stdio: ["ignore", "pipe", "pipe"],
					detached: false,
				});
				proc.stdout.on("data", (d) => {
					const t = d.toString().trim();
					if (t) {
						output += `${t}\n`;
						logger.info(`[DDNS Trigger #${row.id}] ${t}`);
					}
				});
				proc.stderr.on("data", (d) => {
					const t = d.toString().trim();
					if (t) {
						errorOutput += `${t}\n`;
						logger.warn(`[DDNS Trigger #${row.id}] ${t}`);
					}
				});
				proc.on("error", (err) => {
					finish({ success: false, error: err.message, output: output.trim() });
				});
				proc.on("exit", (code) => {
					const success = code === 0;
					finish({
						success,
						exitCode: code,
						output: output.trim(),
						error: errorOutput.trim() || null,
					});
				});
				timeoutHandle = setTimeout(() => {
					if (settled) return;
					try {
						proc.kill("SIGTERM");
					} catch (_) {
						/* ignore */
					}
					killTimer = setTimeout(() => {
						if (settled) return;
						try {
							proc.kill("SIGKILL");
						} catch (_) {
							/* ignore */
						}
						finish({
							success: false,
							error: "Trigger timed out after 60 seconds",
							output: output.trim(),
						});
					}, 5000);
				}, 60000);
			} catch (err) {
				finish({ success: false, error: err.message });
			}
		});

		// Cleanup the temp config
		try {
			const { unlink } = await import("node:fs/promises");
			await unlink(tmpConfig);
		} catch (_) {
			/* ignore */
		}
		return result;
	},

	/**
	 * Status for one row, suitable for the UI table.
	 * @param {number} id
	 */
	getStatus: (id) => {
		const persisted = lastRunData.get(id);
		const state = deriveState(id);
		const running = !!currentProcess;
		if (persisted) {
			return {
				state,
				running,
				lastRunAt: persisted.lastRunAt,
				lastRunSuccess: persisted.lastRunSuccess,
				lastTriggerAt: persisted.lastTriggerAt,
				lastTriggerSuccess: persisted.lastTriggerSuccess,
				lastError: persisted.lastError,
			};
		}
		return { state, running };
	},

	getAllStatuses: () => {
		const out = {};
		for (const [id] of lastRunData) {
			out[id] = internalDdnsManager.getStatus(id);
		}
		return out;
	},

	updateLastRun: (id, success) => {
		const lastRunAt = new Date().toISOString();
		const prev = lastRunData.get(id) || {};
		lastRunData.set(id, { ...prev, lastRunAt, lastRunSuccess: success });
		persistRow(id, {
			last_run_at: lastRunAt,
			last_run_success: success ? 1 : 0,
			last_error: success ? null : prev.lastError || null,
		});
	},

	updateLastTrigger: (id, success) => {
		const lastTriggerAt = new Date().toISOString();
		const prev = lastRunData.get(id) || {};
		lastRunData.set(id, { ...prev, lastTriggerAt, lastTriggerSuccess: success });
		persistRow(id, {
			last_trigger_at: lastTriggerAt,
			last_trigger_success: success ? 1 : 0,
		});
	},

	stopAll: async () => {
		if (!currentProcess) return 0;
		await internalDdnsManager.stop();
		return 1;
	},

	preloadFromDatabase: async (rows) => {
		try {
			for (const row of rows || []) seedCacheFromRow(row);
			return rows.length;
		} catch (err) {
			logger.warn(`Failed to preload DDNS runtime state: ${err.message}`);
			return 0;
		}
	},

	/**
	 * Read the updates.json file from the binary (best-effort). This file is
	 * written by ddns-updater whenever it successfully resolves and updates
	 * a record. Used by the frontend to show "last updated IP" if available.
	 */
	readUpdatesFile: async () => {
		try {
			const text = await readFile(UPDATES_FILE, "utf8");
			return JSON.parse(text);
		} catch (_) {
			return null;
		}
	},
};

export default internalDdnsManager;
