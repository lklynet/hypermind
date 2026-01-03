const express = require("express");
const fs = require("fs");
const path = require("path");

const HTML_TEMPLATE = fs.readFileSync(
	path.join(__dirname, "../../public/index.html"),
	"utf-8"
);

const setupRoutes = (
	app,
	identity,
	peerManager,
	swarm,
	sseManager,
	diagnostics,
	locationManager = null
) => {
	const optedIn = locationManager ? locationManager.isOptedIn() : false;

	app.get("/", (req, res) => {
		const count = peerManager.size;
		const directPeers = swarm.getSwarm().connections.size;
		const currentOptedIn = locationManager
			? locationManager.isOptedIn()
			: false;

		const html = HTML_TEMPLATE.replace(/\{\{COUNT\}\}/g, count)
			.replace(/\{\{ID\}\}/g, identity.id.slice(0, 8) + "...")
			.replace(/\{\{DIRECT\}\}/g, directPeers)
			.replace(/\{\{OPTED_IN\}\}/g, currentOptedIn ? "true" : "false")
			.replace(
				/\{\{OPTED_IN_CLASS\}\}/g,
				currentOptedIn ? "opted-in" : ""
			)
			.replace(/\{\{OVERLAY_HIDDEN\}\}/g, currentOptedIn ? " hidden" : "")
			.replace(/\{\{BTN_VISIBLE\}\}/g, currentOptedIn ? " visible" : "");

		res.send(html);
	});

	app.get("/events", (req, res) => {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.flushHeaders();

		sseManager.addClient(res);

		const locations = locationManager
			? locationManager.getPeerLocations(
					peerManager.getSeenPeers(),
					identity.id
			  )
			: null;

		const data = JSON.stringify({
			count: peerManager.size,
			direct: swarm.getSwarm().connections.size,
			id: identity.id,
			diagnostics: diagnostics.getStats(),
			locations,
			optedIn: locationManager ? locationManager.isOptedIn() : false,
		});
		res.write(`data: ${data}\n\n`);

		req.on("close", () => {
			sseManager.removeClient(res);
		});
	});

	app.get("/api/stats", (req, res) => {
		res.json({
			count: peerManager.size,
			direct: swarm.getSwarm().connections.size,
			id: identity.id,
			diagnostics: diagnostics.getStats(),
		});
	});

	app.post("/api/location-optin", async (req, res) => {
		if (!locationManager) {
			return res
				.status(400)
				.json({ success: false, error: "Location not available" });
		}

		const result = await locationManager.optIn();

		// Update self location in peerManager
		if (result.location) {
			const selfData = peerManager.getPeer(identity.id);
			if (selfData) {
				peerManager.addOrUpdatePeer(
					identity.id,
					selfData.seq,
					selfData.key,
					result.location
				);
			}
		}

		res.json(result);
	});

	app.use(express.static(path.join(__dirname, "../../public")));
};

module.exports = { setupRoutes };
