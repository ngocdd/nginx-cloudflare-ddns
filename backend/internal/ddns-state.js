/**
 * Runtime state for DDNS processes: in-memory cache + DB persistence helpers.
 *
 * The cache is the fast read path used by `getStatus()`. Writes go to both
 * the cache and the DB row (fire-and-forget) so the UI has correct values
 * immediately after a restart.
 *
 * NOTE: This module deliberately does NOT import the model or DB at top
 * level — pulling in `cloudflare_ddns.js` transitively loads the JWT key
 * generator, which fails in test environments without `/data`. The DB
 * patcher is injected lazily by the caller (see `internal/ddns-process.js`).
 */

import { global as logger } from "../logger.js";

const lastRunData = new Map();

let dbPatcher = null;

/**
 * Inject the DB-patching function. Called once at module init by
 * `ddns-process.js`. The injected function takes (id, patch) and returns a
 * Promise that resolves on success or rejects on failure.
 *
 * @param {(id: Number, patch: Object) => Promise<any>} fn
 */
const setDbPatcher = (fn) => {
	dbPatcher = fn;
};

/**
 * Persist a partial update to the cloudflare_ddns row. Fire-and-forget;
 * the in-memory cache is the source of truth for the current request and
 * the DB row is best-effort durability.
 *
 * @param {Number} id
 * @param {Object} patch
 */
const persistRow = (id, patch) => {
	if (!dbPatcher) {
		// No DB layer injected (e.g. in tests) — silent no-op so callers
		// don't have to special-case it.
		return;
	}
	dbPatcher(id, patch).catch((err) => {
		logger.warn(`[DDNS #${id}] Failed to persist runtime state: ${err.message}`);
	});
};

/**
 * Seed the in-memory cache from a freshly-loaded DB row.
 * Called by start() and startAllEnabled() so the UI has correct
 * timestamps immediately after a server restart.
 *
 * @param {Object} row
 */
const seedCacheFromRow = (row) => {
	if (!row || !row.id) return;
	const prev = lastRunData.get(row.id) || {};
	lastRunData.set(row.id, {
		...prev,
		lastRunAt: row.last_run_at || prev.lastRunAt || null,
		lastRunSuccess:
			row.last_run_at != null ? !!row.last_run_success : prev.lastRunSuccess,
		lastTriggerAt: row.last_trigger_at || prev.lastTriggerAt || null,
		lastTriggerSuccess:
			row.last_trigger_at != null
				? !!row.last_trigger_success
				: prev.lastTriggerSuccess,
		lastError: row.last_error || prev.lastError || null,
	});
};

/**
 * Derive a coarse state for the UI. The UI maps these to icons/tooltips.
 *
 * Possible values:
 *   - missing-binary  the cloudflare-ddns binary is not on PATH
 *   - broken          last_error is set (start failed for another reason)
 *   - starting        process spawned but hasn't logged anything yet
 *   - running-pending running, no completed run yet
 *   - running-ok      running, last run succeeded
 *   - running-failed  running, last run failed
 *   - stopped         not currently running, with prior history
 *   - never-started   no runtime state at all
 *
 * @param {Number} id
 * @param {boolean} binaryAvailable
 * @param {Map<Number, {process: object}>} runningProcesses
 * @returns {string}
 */
const deriveState = (id, binaryAvailable, runningProcesses) => {
	const entry = runningProcesses.get(id);
	const persisted = lastRunData.get(id);

	if (!binaryAvailable) return "missing-binary";
	if (persisted?.lastError && !entry) return "broken";
	if (entry) {
		if (!persisted?.lastRunAt) return "running-pending";
		return persisted.lastRunSuccess ? "running-ok" : "running-failed";
	}
	if (persisted?.lastRunAt) return "stopped";
	return "never-started";
};

export default {
	get lastRunData() {
		return lastRunData;
	},
	setDbPatcher,
	persistRow,
	seedCacheFromRow,
	deriveState,
};