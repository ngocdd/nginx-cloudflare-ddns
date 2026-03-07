import express from "express";
import internalCloudflareDdns from "../internal/cloudflare-ddns.js";
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
 * /api/cloudflare-ddns
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/cloudflare-ddns
	 *
	 * Retrieve all Cloudflare DDNS configurations
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
			const rows = await internalCloudflareDdns.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/cloudflare-ddns
	 *
	 * Create a new Cloudflare DDNS configuration
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/cloudflare-ddns", "post"), req.body);
			const result = await internalCloudflareDdns.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific Cloudflare DDNS config
 *
 * /api/cloudflare-ddns/123
 */
router
	.route("/:ddns_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/cloudflare-ddns/123
	 *
	 * Retrieve a specific Cloudflare DDNS configuration
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["ddns_id"],
					additionalProperties: false,
					properties: {
						ddns_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					ddns_id: req.params.ddns_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await internalCloudflareDdns.get(res.locals.access, {
				id: Number.parseInt(data.ddns_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/cloudflare-ddns/123
	 *
	 * Update an existing Cloudflare DDNS configuration
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/cloudflare-ddns/{ddnsID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.ddns_id, 10);
			const result = await internalCloudflareDdns.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/cloudflare-ddns/123
	 *
	 * Delete a Cloudflare DDNS configuration
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalCloudflareDdns.delete(res.locals.access, {
				id: Number.parseInt(req.params.ddns_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Enable Cloudflare DDNS config
 *
 * /api/cloudflare-ddns/123/enable
 */
router
	.route("/:ddns_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/cloudflare-ddns/123/enable
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalCloudflareDdns.enable(res.locals.access, {
				id: Number.parseInt(req.params.ddns_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Disable Cloudflare DDNS config
 *
 * /api/cloudflare-ddns/123/disable
 */
router
	.route("/:ddns_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/cloudflare-ddns/123/disable
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalCloudflareDdns.disable(res.locals.access, {
				id: Number.parseInt(req.params.ddns_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Trigger Cloudflare DDNS update
 *
 * /api/cloudflare-ddns/123/trigger
 */
router
	.route("/:ddns_id/trigger")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/cloudflare-ddns/123/trigger
	 *
	 * Manually trigger a one-time DDNS update
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalCloudflareDdns.trigger(res.locals.access, {
				id: Number.parseInt(req.params.ddns_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
