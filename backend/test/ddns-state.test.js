import { afterEach, beforeEach, describe, expect, it } from "vitest";
import internalDdnsState from "../internal/ddns-state.js";

const { lastRunData, deriveState, seedCacheFromRow } = internalDdnsState;

/** Construct a minimal fake entry for runningProcesses. */
const fakeProcessEntry = () => ({
	process: { killed: false },
	startedAt: new Date().toISOString(),
	getLastOutput: () => "",
	getLastError: () => "",
});

describe("ddns-state.deriveState", () => {
	const runningProcesses = new Map();

	beforeEach(() => {
		lastRunData.clear();
		runningProcesses.clear();
	});

	it("returns 'missing-binary' when the binary is missing", () => {
		lastRunData.set(1, { lastRunAt: "2026-01-01T00:00:00Z", lastRunSuccess: true });
		expect(deriveState(1, false, runningProcesses)).toBe("missing-binary");
	});

	it("returns 'running-ok' when running and last run succeeded", () => {
		lastRunData.set(1, { lastRunAt: "x", lastRunSuccess: true });
		runningProcesses.set(1, fakeProcessEntry());
		expect(deriveState(1, true, runningProcesses)).toBe("running-ok");
	});

	it("returns 'running-failed' when running and last run failed", () => {
		lastRunData.set(1, { lastRunAt: "x", lastRunSuccess: false });
		runningProcesses.set(1, fakeProcessEntry());
		expect(deriveState(1, true, runningProcesses)).toBe("running-failed");
	});

	it("returns 'running-pending' when running but no completed run yet", () => {
		runningProcesses.set(1, fakeProcessEntry());
		expect(deriveState(1, true, runningProcesses)).toBe("running-pending");
	});

	it("returns 'broken' when lastError is set and not running", () => {
		lastRunData.set(1, { lastError: "oops" });
		expect(deriveState(1, true, runningProcesses)).toBe("broken");
	});

	it("returns 'stopped' when there's prior history but not running", () => {
		lastRunData.set(1, { lastRunAt: "x", lastRunSuccess: true });
		expect(deriveState(1, true, runningProcesses)).toBe("stopped");
	});

	it("returns 'never-started' for a fresh id with no state", () => {
		expect(deriveState(999, true, runningProcesses)).toBe("never-started");
	});
});

describe("ddns-state.seedCacheFromRow", () => {
	beforeEach(() => lastRunData.clear());
	afterEach(() => lastRunData.clear());

	it("hydrates cache from a DB row", () => {
		seedCacheFromRow({
			id: 1,
			last_run_at: "2026-01-01T00:00:00Z",
			last_run_success: 1,
			last_trigger_at: "2026-01-02T00:00:00Z",
			last_trigger_success: 0,
			last_error: "boom",
		});
		const entry = lastRunData.get(1);
		expect(entry).toBeDefined();
		expect(entry.lastRunAt).toBe("2026-01-01T00:00:00Z");
		expect(entry.lastRunSuccess).toBe(true);
		expect(entry.lastTriggerAt).toBe("2026-01-02T00:00:00Z");
		expect(entry.lastTriggerSuccess).toBe(false);
		expect(entry.lastError).toBe("boom");
	});

	it("does nothing for a missing/invalid row", () => {
		seedCacheFromRow(null);
		seedCacheFromRow({});
		expect(lastRunData.size).toBe(0);
	});

	it("preserves existing cache fields not present in the row", () => {
		lastRunData.set(1, { foo: "bar" });
		seedCacheFromRow({
			id: 1,
			last_run_at: "2026-06-30T00:00:00Z",
			last_run_success: 1,
		});
		expect(lastRunData.get(1).foo).toBe("bar");
		expect(lastRunData.get(1).lastRunAt).toBe("2026-06-30T00:00:00Z");
	});
});
