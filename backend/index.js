#!/usr/bin/env node

import app from "./app.js";
import internalCertificate from "./internal/certificate.js";
// ===== FORK START: ddns integration =====
import internalDdnsConfig from "./internal/ddns-config.js";
import internalDdnsManager from "./internal/ddns-manager.js";
// ===== FORK END =====
import internalIpRanges from "./internal/ip_ranges.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

const IP_RANGES_FETCH_ENABLED = process.env.IP_RANGES_FETCH_ENABLED !== "false";

// ===== FORK START: graceful shutdown + DDNS child-process management =====
let httpServer = null;
let shuttingDown = false;

async function gracefulShutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info(`PID ${process.pid} received ${signal}, shutting down...`);

	// Stop the ddns-updater child process first so it doesn't get SIGKILLed
	// by the init system (s6-overlay) when the parent disappears.
	try {
		await internalDdnsManager.stopAll();
		logger.info("DDNS manager stopped");
	} catch (err) {
		logger.warn(`Error stopping DDNS manager during shutdown: ${err.message}`);
	}

	if (httpServer) {
		httpServer.close(() => {
			logger.info("HTTP server closed. Exiting.");
			process.exit(0);
		});
		// Force exit after 10s if server.close hangs on keep-alive connections
		setTimeout(() => {
			logger.warn("Forced exit after 10s shutdown grace period");
			process.exit(1);
		}, 10000).unref();
	} else {
		process.exit(0);
	}
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
// ===== FORK END =====

async function appStart() {
	return migrateUp()
		.then(setup)
		.then(getCompiledSchema)
		.then(() => {
			if (!IP_RANGES_FETCH_ENABLED) {
				logger.info("IP Ranges fetch is disabled by environment variable");
				return;
			}
			logger.info("IP Ranges fetch is enabled");
			return internalIpRanges.fetch().catch((err) => {
				logger.error("IP Ranges fetch failed, continuing anyway:", err.message);
			});
		})
		.then(async () => {
			internalCertificate.initTimer();
			internalIpRanges.initTimer();

			// ===== FORK START: preload DDNS runtime state + start enabled configs =====
			// Preload last_run_at / last_trigger_at / last_error for every row
			// so the UI shows correct timestamps immediately on first request
			// after a restart (rather than waiting for the next cron tick).
			try {
				const rows = await import("./models/ddns_config.js").then((m) =>
					m.default.query().where("is_deleted", 0),
				);
				await internalDdnsConfig.preloadFromDatabase(rows);
				logger.info(`Loaded runtime state for ${rows.length} DDNS config(s) from DB`);
			} catch (err) {
				logger.warn(`Failed to preload DDNS runtime state: ${err.message}`);
			}

			// Start the single ddns-updater process with all enabled rows.
			try {
				const result = await internalDdnsConfig.startAllEnabled();
				logger.info(
					`DDNS startup: ${result.started}/${result.total} processes started${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
				);
			} catch (err) {
				logger.error("Failed to start DDNS processes:", err.message);
			}
			// ===== FORK END =====

			httpServer = app.listen(3000, () => {
				logger.info(`Backend PID ${process.pid} listening on port 3000 ...`);
			});
		})
		.catch((err) => {
			logger.error(`Startup Error: ${err.message}`, err);
			setTimeout(appStart, 1000);
		});
}

try {
	appStart();
} catch (err) {
	logger.fatal(err);
	process.exit(1);
}