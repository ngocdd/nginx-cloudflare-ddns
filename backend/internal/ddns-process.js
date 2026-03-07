import { spawn } from "node:child_process";
import { global as logger } from "../logger.js";

/**
 * Manages running cloudflare-ddns processes.
 * Each DDNS config entry can have its own running process.
 */
const runningProcesses = new Map();

// Persists lastRun data across process restarts (keyed by config id)
const lastRunData = new Map();

const internalDdnsProcess = {
	/**
	 * Build a PROXIED expression for domain-dependent proxy settings
	 * Uses cloudflare-ddns template syntax: is(domain1) || is(domain2)
	 *
	 * @param {string} proxiedDomains - comma-separated proxied domains
	 * @returns {string} PROXIED expression or "false" if no proxied domains
	 */
	buildProxiedExpression: (proxiedDomains) => {
		if (!proxiedDomains || proxiedDomains.trim() === "") {
			return "false";
		}

		const domains = proxiedDomains.split(",").map((d) => d.trim()).filter(Boolean);
		if (domains.length === 0) {
			return "false";
		}

		// Build expression like: is(domain1) || is(domain2) || is(domain3)
		return domains.map((d) => `is(${d})`).join(" || ");
	},

	/**
	 * Build environment variables from a DDNS config row
	 *
	 * @param {Object} row - cloudflare_ddns database row
	 * @returns {Object} environment variables for the ddns process
	 */
	buildEnv: (row) => {
		// Combine proxied and unproxied domains into a single DOMAINS list
		const allDomains = [row.domains, row.unproxied_domains]
			.filter(Boolean)
			.map((d) => d.trim())
			.filter(Boolean)
			.join(",");

		// Build PROXIED expression based on which domains should be proxied
		const proxiedExpression = internalDdnsProcess.buildProxiedExpression(row.domains);

		// Skip IPv6 if ip6_domains is empty - use 'none' provider to disable
		const ip6Provider = row.ip6_domains && row.ip6_domains.trim() !== "" 
			? (row.ip6_provider || "cloudflare.trace") 
			: "none";

		const env = {
			CLOUDFLARE_API_TOKEN: row.cloudflare_api_token,
			IP4_PROVIDER: row.ip4_provider || "cloudflare.trace",
			IP6_PROVIDER: ip6Provider,
			UPDATE_CRON: row.update_cron || "@every 5m",
			UPDATE_ON_START: row.update_on_start ? "true" : "false",
			DELETE_ON_STOP: row.delete_on_stop ? "true" : "false",
			PROXIED: proxiedExpression,
			TTL: String(row.ttl || 1),
			RECORD_COMMENT: row.record_comment || "",
			DETECTION_TIMEOUT: row.detection_timeout || "5s",
			UPDATE_TIMEOUT: row.update_timeout || "30s",
			CACHE_EXPIRATION: row.cache_expiration || "6h0m0s",
			EMOJI: "false",
			QUIET: "false",
		};

		if (allDomains) {
			env.DOMAINS = allDomains;
		}
		if (row.ip4_domains) {
			env.IP4_DOMAINS = row.ip4_domains;
		}
		if (row.ip6_domains) {
			env.IP6_DOMAINS = row.ip6_domains;
		}

		return env;
	},

	/**
	 * Start a DDNS process for a given config
	 *
	 * @param {Object} row - cloudflare_ddns database row
	 * @returns {boolean}
	 */
	start: (row) => {
		if (runningProcesses.has(row.id)) {
			logger.info(`DDNS process for config #${row.id} is already running, restarting...`);
			internalDdnsProcess.stop(row.id);
		}

		const env = internalDdnsProcess.buildEnv(row);

		logger.info(`Starting Cloudflare DDNS process for config #${row.id} (${row.name || "unnamed"})`);
		logger.info(`  Domains (proxied): ${row.domains || "none"}`);
		logger.info(`  Domains (unproxied): ${row.unproxied_domains || "none"}`);
		logger.info(`  IPv4 Domains: ${row.ip4_domains || "none"}`);
		logger.info(`  IPv6 Domains: ${row.ip6_domains || "none"}`);
		logger.info(`  Cron: ${row.update_cron}`);

		try {
			// Try to run the cloudflare-ddns binary
			const proc = spawn("cloudflare-ddns", [], {
				env: { ...process.env, ...env },
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			});

			let lastOutput = "";
			let lastError = "";
			let lastRunAt = null;
			let lastRunSuccess = null;

			proc.stdout.on("data", (data) => {
				const output = data.toString().trim();
				if (output) {
					lastOutput = output;
					logger.info(`[DDNS #${row.id}] ${output}`);
					// Detect successful update from output
					if (output.includes("Updated") || output.includes("No change") || output.includes("unchanged") || output.includes("already up to date")) {
						lastRunAt = new Date().toISOString();
						lastRunSuccess = true;
						lastRunData.set(row.id, { lastRunAt, lastRunSuccess });
					}
				}
			});

			proc.stderr.on("data", (data) => {
				const output = data.toString().trim();
				if (output) {
					lastError = output;
					logger.warn(`[DDNS #${row.id}] ${output}`);
					// Detect error from stderr
					if (output.includes("error") || output.includes("failed") || output.includes("Error") || output.includes("Failed")) {
						lastRunAt = new Date().toISOString();
						lastRunSuccess = false;
						lastRunData.set(row.id, { lastRunAt, lastRunSuccess });
					}
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
				getLastRunAt: () => lastRunAt,
				getLastRunSuccess: () => lastRunSuccess,
			});

			return true;
		} catch (err) {
			logger.error(`Failed to start DDNS process for config #${row.id}: ${err.message}`);
			return false;
		}
	},

	/**
	 * Stop a running DDNS process
	 *
	 * @param {Number} id - cloudflare_ddns config id
	 * @returns {boolean}
	 */
	stop: (id) => {
		const entry = runningProcesses.get(id);
		if (entry) {
			logger.info(`Stopping Cloudflare DDNS process for config #${id}`);
			try {
				entry.process.kill("SIGTERM");
			} catch (err) {
				logger.warn(`Error stopping DDNS process #${id}: ${err.message}`);
				try {
					entry.process.kill("SIGKILL");
				} catch (_) {
					// ignore
				}
			}
			runningProcesses.delete(id);
			return true;
		}
		return false;
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
		if (entry) {
			const entryLastRunAt = entry.getLastRunAt();
			return {
				running: !entry.process.killed,
				pid: entry.process.pid,
				startedAt: entry.startedAt,
				lastOutput: entry.getLastOutput(),
				lastError: entry.getLastError(),
				lastRunAt: entryLastRunAt || (persisted && persisted.lastRunAt) || null,
				lastRunSuccess: entryLastRunAt ? entry.getLastRunSuccess() : (persisted ? persisted.lastRunSuccess : null),
			};
		}
		if (persisted) {
			return {
				running: false,
				lastRunAt: persisted.lastRunAt,
				lastRunSuccess: persisted.lastRunSuccess,
			};
		}
		return null;
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
	 * Used when a manual trigger completes successfully
	 *
	 * @param {Number} id - config id
	 * @param {boolean} success - whether the run was successful
	 */
	updateLastRun: (id, success) => {
		const lastRunAt = new Date().toISOString();
		const lastRunSuccess = success;
		// Always persist
		lastRunData.set(id, { lastRunAt, lastRunSuccess });
		// Also update the running process entry if it exists
		const entry = runningProcesses.get(id);
		if (entry) {
			entry.getLastRunAt = () => lastRunAt;
			entry.getLastRunSuccess = () => lastRunSuccess;
		}
	},

	/**
	 * Stop all running processes
	 */
	stopAll: () => {
		for (const [id] of runningProcesses) {
			internalDdnsProcess.stop(id);
		}
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
			const env = internalDdnsProcess.buildEnv(row);

			// Override settings for one-time update
			env.UPDATE_CRON = "@once";
			env.UPDATE_ON_START = "true";

			logger.info(`Triggering one-time DDNS update for config #${row.id} (${row.name || "unnamed"})`);

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
					resolve({
						success: false,
						error: err.message,
						output: output.trim(),
					});
				});

				proc.on("exit", (code) => {
					const success = code === 0;
					logger.info(`[DDNS Trigger #${row.id}] One-time update completed with code ${code}`);
					resolve({
						success,
						exitCode: code,
						output: output.trim(),
						error: errorOutput.trim() || null,
					});
				});

				// Timeout after 60 seconds
				setTimeout(() => {
					if (!proc.killed) {
						proc.kill("SIGTERM");
						resolve({
							success: false,
							error: "Trigger timed out after 60 seconds",
							output: output.trim(),
						});
					}
				}, 60000);
			} catch (err) {
				logger.error(`Failed to trigger DDNS update for config #${row.id}: ${err.message}`);
				resolve({
					success: false,
					error: err.message,
				});
			}
		});
	},
};

export default internalDdnsProcess;
