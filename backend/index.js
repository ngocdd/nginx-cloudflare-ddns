#!/usr/bin/env node

import app from "./app.js";
import internalCertificate from "./internal/certificate.js";
import internalCloudflareDdns from "./internal/cloudflare-ddns.js";
import internalDdnsProcess from "./internal/ddns-process.js";
import internalIpRanges from "./internal/ip_ranges.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

const IP_RANGES_FETCH_ENABLED = process.env.IP_RANGES_FETCH_ENABLED !== "false";

let httpServer = null;
let shuttingDown = false;

async function gracefulShutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info(`PID ${process.pid} received ${signal}, shutting down...`);

	// Stop all running DDNS child processes first so they don't get SIGKILLed
	// by the init system (s6-overlay) when the parent disappears.
	try {
		const stopped = await internalDdnsProcess.stopAll();
		if (stopped > 0) {
			logger.info(`Stopped ${stopped} DDNS process(es)`);
		}
	} catch (err) {
		logger.warn(`Error stopping DDNS processes during shutdown: ${err.message}`);
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

			// Preload last_run_at / last_trigger_at / last_error for every row
			// so the UI shows correct timestamps immediately on first request
			// after a restart (rather than waiting for the next cron tick).
			try {
				const loaded = await internalDdnsProcess.preloadFromDatabase();
				logger.info(`Loaded runtime state for ${loaded} DDNS config(s) from DB`);
			} catch (err) {
				logger.warn(`Failed to preload DDNS runtime state: ${err.message}`);
			}

			// Start all enabled Cloudflare DDNS processes
			try {
				const result = await internalCloudflareDdns.startAllEnabled();
				logger.info(
					`Cloudflare DDNS startup: ${result.started}/${result.total} started${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
				);
			} catch (err) {
				logger.error("Failed to start Cloudflare DDNS processes:", err.message);
			}

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
