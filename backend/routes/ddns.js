import express from "express";
import internalDdnsConfig from "../internal/ddns-config.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/ddns
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/ddns
	 * List all DDNS configurations.
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: {
							$ref: "common#/properties/expand",
						},
						query: {
							$ref: "common#/properties/query",
						},
					},
				},
				{
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
					query: typeof req.query.query === "string" ? req.query.query : null,
				},
			);
			const rows = await internalDdnsConfig.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/ddns
	 * Create a new DDNS configuration.
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/ddns", "post"), req.body);
			const result = await internalDdnsConfig.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/ddns/:ddnsID
 */
router
	.route("/:ddnsID")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/ddns/:ddnsID
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["ddnsID"],
					additionalProperties: false,
					properties: {
						ddnsID: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					ddnsID: req.params.ddnsID,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await internalDdnsConfig.get(res.locals.access, {
				id: Number.parseInt(data.ddnsID, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/ddns/:ddnsID
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/ddns/{ddnsID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.ddnsID, 10);
			const result = await internalDdnsConfig.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/ddns/:ddnsID
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalDdnsConfig.delete(res.locals.access, {
				id: Number.parseInt(req.params.ddnsID, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/ddns/:ddnsID/enable
 */
router
	.route("/:ddnsID/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	.post(async (req, res, next) => {
		try {
			const result = await internalDdnsConfig.enable(res.locals.access, {
				id: Number.parseInt(req.params.ddnsID, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/ddns/:ddnsID/disable
 */
router
	.route("/:ddnsID/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	.post(async (req, res, next) => {
		try {
			const result = await internalDdnsConfig.disable(res.locals.access, {
				id: Number.parseInt(req.params.ddnsID, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/ddns/:ddnsID/trigger
 */
router
	.route("/:ddnsID/trigger")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	.post(async (req, res, next) => {
		try {
			const result = await internalDdnsConfig.trigger(res.locals.access, {
				id: Number.parseInt(req.params.ddnsID, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Runtime status of all DDNS configs + binary availability.
 *
 * GET /api/ddns/status
 */
router
	.route("/status")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const internalDdnsManager = (await import("../internal/ddns-manager.js")).default;
			const statuses = internalDdnsManager.getAllStatuses();
			const binary = internalDdnsManager.getBinaryStatus();
			const configs = await internalDdnsConfig.getAll(res.locals.access);
			const failed = configs
				.filter((row) => {
					const s = row.process_status || {};
					if (!row.enabled) return false;
					return s.state && s.state !== "running-ok" && s.state !== "running-pending";
				})
				.map((row) => ({
					id: row.id,
					name: row.name,
					provider: row.provider,
					domain: row.domain,
					state: row.process_status?.state,
					reason: row.process_status?.lastError || "not running",
				}));
			res.status(200).send({
				binary,
				total: configs.length,
				enabled: configs.filter((r) => r.enabled).length,
				running: Object.values(statuses).filter((s) => s?.running).length,
				failed,
				statuses,
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
