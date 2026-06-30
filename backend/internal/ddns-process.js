import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import cloudflareDdnsModel from "../models/cloudflare_ddns.js";
import { global as logger } from "../logger.js";
import internalDdnsEnv from "./ddns-env.js";
import internalDdnsState from "./ddns-state.js";

const execFileAsync = promisify(execFile);

// Re-export for tests / callers.
const { lastRunData, persistRow, seedCacheFromRow } = internalDdnsState;

// Inject the DB patcher so ddns-state doesn't have to import the model
// at top level (which would transitively load the JWT key generator and
// crash in unit-test environments without /data).
internalDdnsState.setDbPatcher((id, patch) =>
	cloudflareDdnsModel
		.query()
		.where("id", id)
		.patch(patch),
);

/**
 * Manages running cloudflare-ddns processes.
 * Each DDNS config entry can have its own running process.
 */
const runningProcesses = new Map();

// Check the binary up front (cached for the lifetime of the process).
// We do not fail the import if the binary is missing — operators may
// upgrade the binary later — but the result is exposed via getStatus()
// so the UI can surface a "broken" badge.
let binaryAvailable = false;
let binaryCheckError = null;
const checkBinary = async () => {
	try {
		// `which cloudflare-ddns` is the standard way to find an executable on PATH.
		// We redirect stdout to /dev/null and check the exit code via rejection.
		await execFileAsync("which", ["cloudflare-ddns"], { timeout: 5000 });
		binaryAvailable = true;
		binaryCheckError = null;
	} catch (err) {
		binaryAvailable = false;
		binaryCheckError = err.message || "which cloudflare-ddns failed";
		logger.warn(
			`cloudflare-ddns binary not found on PATH: ${binaryCheckError}. DDNS processes will fail to start until this is fixed.`,
		);
	}
};
// Kick off the check immediately; the result is read by start() / getStatus()
checkBinary();

/**
 * Derive a coarse state for the UI. The UI maps these to icons/tooltips.
 * Wraps internalDdnsState.deriveState with our local runningProcesses map.
 *
 * @param {Number} id
 * @returns {string}
 */
const deriveState = (id) =>
	internalDdnsState.deriveState(id, binaryAvailable, runningProcesses);

const internalDdnsProcess = {
	/**
	 * Build a PROXIED expression for domain-dependent proxy settings
	 * Uses cloudflare-ddns template syntax: is(domain1) || is(domain2)
	 *
	 * @param {string} proxiedDomains - comma-separated proxied domains
	 * @returns {string} PROXIED expression or "false" if no proxied domains
	 */
	buildProxiedExpression: internalDdnsEnv.buildProxiedExpression,

	/**
	 * Build environment variables from a DDNS config row
	 *
	 * @param {Object} row - cloudflare_ddns database row
	 * @returns {Object} environment variables for the ddns process
	 */
	buildEnv: internalDdnsEnv.buildEnv,

	/**
	 * Start a DDNS process for a given config
	 *
	 * @param {Object} row - cloudflare_ddns database row
	 * @returns {boolean}
	 */
	start: (row) => {
		// Seed in-memory cache from the row so a restart doesn't blank out
		// last_run_at / last_trigger_at / last_error in the UI.
		seedCacheFromRow(row);

		if (runningProcesses.has(row.id)) {
			logger.info(`DDNS process for config #${row.id} is already running, restarting...`);
			// Note: stop() is now async; we kick it off and don't await. start() is
			// intentionally fire-and-forget to match the prior synchronous signature.
			internalDdnsProcess.stop(row.id);
		}

		if (!binaryAvailable) {
			const lastError = `cloudflare-ddns binary not found${binaryCheckError ? `: ${binaryCheckError}` : ""}`;
			logger.error(`[DDNS #${row.id}] Cannot start: ${lastError}`);
			const prev = lastRunData.get(row.id) || {};
			lastRunData.set(row.id, { ...prev, lastError, lastRunSuccess: false });
			persistRow(row.id, {
				last_error: lastError,
				last_run_success: 0,
			});
			return false;
		}

		const env = internalDdnsProcess.buildEnv(row);

		logger.info(`Starting Cloudflare DDNS process for config #${row.id} (${row.name || "unnamed"})`);
		logger.info(`  Domains (proxied): ${row.domains || "none"}`);
		logger.info(`  Domains (unproxied): ${row.unproxied_domains || "none"}`);
		logger.info(`  IPv4 Domains: ${row.ip4_domains || "none"}`);
		logger.info(`  IPv6 Domains: ${row.ip6_domains || "none"}`);
		logger.info(`  Cron: ${row.update_cron}`);
		logger.info("  API token: [redacted]");

		try {
			// Try to run the cloudflare-ddns binary
			const proc = spawn("cloudflare-ddns", [], {
				env: { ...process.env, ...env },
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			});

			let lastOutput = "";
			let lastError = "";

			proc.stdout.on("data", (data) => {
				const output = data.toString().trim();
				if (output) {
					lastOutput = output;
					logger.info(`[DDNS #${row.id}] ${output}`);
				}
			});

			proc.stderr.on("data", (data) => {
				const output = data.toString().trim();
				if (output) {
					lastError = output;
					logger.warn(`[DDNS #${row.id}] ${output}`);
				}
			});

			proc.on("error", (err) => {
				logger.error(`[DDNS #${row.id}] Process error: ${err.message}`);
				runningProcesses.delete(row.id);
			});

			proc.on("exit", (code, signal) => {
				if (code !== null) {
					logger.info(`[DDNS #${row.id}] Process exited with code ${code}`);
				} else {
					logger.info(`[DDNS #${row.id}] Process killed with signal ${signal}`);
				}
				runningProcesses.delete(row.id);
			});

			runningProcesses.set(row.id, {
				process: proc,
				config: row,
				startedAt: new Date().toISOString(),
				getLastOutput: () => lastOutput,
				getLastError: () => lastError,
			});

			return true;
		} catch (err) {
			logger.error(`Failed to start DDNS process for config #${row.id}: ${err.message}`);
			return false;
		}
	},

	/**
	 * Stop a running DDNS process. Waits for the process to exit.
	 * After 5s with no exit, escalates to SIGKILL.
	 *
	 * @param {Number} id - cloudflare_ddns config id
	 * @returns {Promise<boolean>} true if a process was stopped
	 */
	stop: (id) => {
		return new Promise((resolve) => {
			const entry = runningProcesses.get(id);
			if (!entry) {
				resolve(false);
				return;
			}

			logger.info(`Stopping Cloudflare DDNS process for config #${id}`);
			runningProcesses.delete(id);

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
				logger.warn(`Error stopping DDNS process #${id}: ${err.message}`);
			}

			// Escalate to SIGKILL after 5s if the process hasn't exited
			const killTimer = setTimeout(() => {
				if (entry.process.exitCode === null && !entry.process.killed) {
					logger.warn(`DDNS process #${id} did not exit after SIGTERM, sending SIGKILL`);
					try {
						entry.process.kill("SIGKILL");
					} catch (_) {
						// ignore
					}
				}
			}, 5000);
		});
	},

	/**
	 * Get the status of a DDNS process
	 *
	 * @param {Number} id
	 * @returns {Object|null}
	 */
	getStatus: (id) => {
		const entry = runningProcesses.get(id);
		const persisted = lastRunData.get(id);
		const state = deriveState(id);
		if (entry) {
			return {
				state,
				running: !entry.process.killed,
				pid: entry.process.pid,
				startedAt: entry.startedAt,
				lastOutput: entry.getLastOutput(),
				lastError: entry.getLastError(),
				lastRunAt: persisted?.lastRunAt ?? null,
				lastRunSuccess: persisted?.lastRunSuccess ?? null,
				lastTriggerAt: persisted?.lastTriggerAt ?? null,
				lastTriggerSuccess: persisted?.lastTriggerSuccess ?? null,
			};
		}
		if (persisted) {
			return {
				state,
				running: false,
				lastRunAt: persisted.lastRunAt,
				lastRunSuccess: persisted.lastRunSuccess,
				lastTriggerAt: persisted.lastTriggerAt,
				lastTriggerSuccess: persisted.lastTriggerSuccess,
			};
		}
		return { state, running: false };
	},

	/**
	 * Get statuses for all running processes
	 *
	 * @returns {Object}
	 */
	getAllStatuses: () => {
		const statuses = {};
		for (const [id] of runningProcesses) {
			statuses[id] = internalDdnsProcess.getStatus(id);
		}
		return statuses;
	},

	/**
	 * Update the lastRun status for a running process
	 * Used when the scheduled cron run completes (detected via stdout/stderr)
	 *
	 * @param {Number} id - config id
	 * @param {boolean} success - whether the run was successful
	 */
	updateLastRun: (id, success) => {
		const lastRunAt = new Date().toISOString();
		const lastRunSuccess = success;
		const prev = lastRunData.get(id) || {};
		lastRunData.set(id, {
			...prev,
			lastRunAt,
			lastRunSuccess,
		});
		// Persist to DB so the timestamp survives restarts. Fire-and-forget.
		persistRow(id, {
			last_run_at: lastRunAt,
			last_run_success: success ? 1 : 0,
			last_error: success ? null : prev.lastError || null,
		});
	},

	/**
	 * Update the lastTrigger status (manual one-shot trigger).
	 * Kept separate from lastRun so the UI can show "last scheduled run"
	 * and "last manual trigger" independently.
	 *
	 * @param {Number} id - config id
	 * @param {boolean} success - whether the trigger succeeded
	 */
	updateLastTrigger: (id, success) => {
		const lastTriggerAt = new Date().toISOString();
		const lastTriggerSuccess = success;
		const prev = lastRunData.get(id) || {};
		lastRunData.set(id, {
			...prev,
			lastTriggerAt,
			lastTriggerSuccess,
		});
		persistRow(id, {
			last_trigger_at: lastTriggerAt,
			last_trigger_success: success ? 1 : 0,
		});
	},

	/**
	 * Stop all running processes. Waits for every stop() to complete.
	 *
	 * @returns {Promise<number>} count of processes stopped
	 */
	stopAll: async () => {
		const ids = Array.from(runningProcesses.keys());
		await Promise.all(ids.map((id) => internalDdnsProcess.stop(id)));
		return ids.length;
	},

	/**
	 * Trigger a one-time DDNS update for a given config
	 * This spawns a separate process that runs once and exits
	 *
	 * @param {Object} row - cloudflare_ddns database row
	 * @returns {Promise<Object>} result with success status and output
	 */
	trigger: (row) => {
		return new Promise((resolve) => {
			if (!binaryAvailable) {
				resolve({
					success: false,
					error: `cloudflare-ddns binary not found${binaryCheckError ? `: ${binaryCheckError}` : ""}`,
				});
				return;
			}

			const env = internalDdnsProcess.buildEnv(row);

			// Override settings for one-time update
			env.UPDATE_CRON = "@once";
			env.UPDATE_ON_START = "true";

			logger.info(`Triggering one-time DDNS update for config #${row.id} (${row.name || "unnamed"})`);

			let timeoutHandle = null;
			let killTimer = null;
			let settled = false;

			const finish = (result) => {
				if (settled) return;
				settled = true;
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (killTimer) clearTimeout(killTimer);
				resolve(result);
			};

			try {
				const proc = spawn("cloudflare-ddns", [], {
					env: { ...process.env, ...env },
					stdio: ["ignore", "pipe", "pipe"],
					detached: false,
				});

				let output = "";
				let errorOutput = "";

				proc.stdout.on("data", (data) => {
					const text = data.toString().trim();
					if (text) {
						output += `${text}\n`;
						logger.info(`[DDNS Trigger #${row.id}] ${text}`);
					}
				});

				proc.stderr.on("data", (data) => {
					const text = data.toString().trim();
					if (text) {
						errorOutput += `${text}\n`;
						logger.warn(`[DDNS Trigger #${row.id}] ${text}`);
					}
				});

				proc.on("error", (err) => {
					logger.error(`[DDNS Trigger #${row.id}] Process error: ${err.message}`);
					finish({
						success: false,
						error: err.message,
						output: output.trim(),
					});
				});

				proc.on("exit", (code) => {
					const success = code === 0;
					logger.info(`[DDNS Trigger #${row.id}] One-time update completed with code ${code}`);
					finish({
						success,
						exitCode: code,
						output: output.trim(),
						error: errorOutput.trim() || null,
					});
				});

				// 60s hard timeout: SIGTERM first, then SIGKILL after 5s.
				timeoutHandle = setTimeout(() => {
					if (settled) return;
					if (proc.exitCode !== null || proc.killed) {
						// already exiting on its own
						return;
					}
					logger.warn(`[DDNS Trigger #${row.id}] Timed out after 60s, sending SIGTERM`);
					try {
						proc.kill("SIGTERM");
					} catch (_) {
						// ignore
					}
					killTimer = setTimeout(() => {
						if (settled) return;
						if (proc.exitCode === null && !proc.killed) {
							logger.warn(`[DDNS Trigger #${row.id}] Still alive, sending SIGKILL`);
							try {
								proc.kill("SIGKILL");
							} catch (_) {
								// ignore
							}
						}
						// Always resolve with a timeout error so the caller doesn't hang.
						finish({
							success: false,
							error: "Trigger timed out after 60 seconds",
							output: output.trim(),
						});
					}, 5000);
				}, 60000);
			} catch (err) {
				logger.error(`Failed to trigger DDNS update for config #${row.id}: ${err.message}`);
				finish({
					success: false,
					error: err.message,
				});
			}
		});
	},

	/**
	 * Whether the cloudflare-ddns binary is on PATH.
	 * Used by /api/cloudflare-ddns/status.
	 *
	 * @returns {{available: boolean, error: string|null}}
	 */
	getBinaryStatus: () => ({
		available: binaryAvailable,
		error: binaryCheckError,
	}),

	/**
	 * Preload runtime state for every DDNS row in the DB into the
	 * in-memory cache. Called once at startup so getStatus() can answer
	 * the "last run at" question without a DB hit per request.
	 *
	 * @returns {Promise<number>} count of rows loaded
	 */
	preloadFromDatabase: async () => {
		try {
			const rows = await cloudflareDdnsModel.query().where("is_deleted", 0);
			for (const row of rows) seedCacheFromRow(row);
			return rows.length;
		} catch (err) {
			logger.warn(`Failed to preload DDNS runtime state from DB: ${err.message}`);
			return 0;
		}
	},
};

export default internalDdnsProcess;
