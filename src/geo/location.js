const fs = require("fs");
const path = require("path");
const iploc = require("ip-location-api");

const OPTIN_FILE = path.join(__dirname, "../../.location-optin");

class LocationManager {
	constructor() {
		// Environment variable takes precedence (useful for Docker/k8s deployments)
		const envOptIn = process.env.LOCATION_OPTIN === "true";
		this.optedIn = envOptIn || fs.existsSync(OPTIN_FILE);
		this.location = null;
		this.initialized = false;
	}

	async init() {
		if (this.initialized) return;
		this.initialized = true;

		try {
			await iploc.reload({ fields: ["latitude", "longitude", "city"] });
			const response = await fetch("https://api.ipify.org?format=json");
			const { ip } = await response.json();
			const loc = await iploc.lookup(ip);

			if (loc && loc.latitude && loc.longitude) {
				this.location = {
					lat: loc.latitude,
					lon: loc.longitude,
					city: loc.city || "Unknown",
				};
				console.log("[Geo] Location ready");
			} else {
				console.log("[Geo] Could not determine location from IP");
			}
		} catch (e) {
			console.log("[Geo] Location lookup failed:", e.message);
			this.location = null;
		}
	}

	async optIn() {
		this.optedIn = true;

		// Persist opt-in to file
		try {
			fs.writeFileSync(OPTIN_FILE, "");
		} catch (e) {
			// Ignore write errors
		}

		// If location not ready yet, try to fetch it now
		if (!this.location) {
			await this.init();
		}

		return {
			success: true,
			location: this.location,
			hasLocation: !!this.location,
		};
	}

	getLocation() {
		return this.optedIn ? this.location : null;
	}

	isOptedIn() {
		return this.optedIn;
	}

	// Generate GeoJSON FeatureCollection of peer locations, aggregated by city
	getPeerLocations(seenPeers, selfId) {
		const cityGroups = new Map();

		for (const [id, data] of seenPeers) {
			if (data.loc && data.loc.lat != null && data.loc.lon != null) {
				const cityKey = data.loc.city || "Unknown";
				if (!cityGroups.has(cityKey)) {
					cityGroups.set(cityKey, {
						lat: data.loc.lat,
						lon: data.loc.lon,
						count: 0,
						hasSelf: false,
					});
				}
				const group = cityGroups.get(cityKey);
				group.count++;
				if (id === selfId) group.hasSelf = true;
			}
		}

		const features = [];
		for (const [city, data] of cityGroups) {
			features.push({
				type: "Feature",
				properties: { city, count: data.count, hasSelf: data.hasSelf },
				geometry: { type: "Point", coordinates: [data.lon, data.lat] },
			});
		}
		return { type: "FeatureCollection", features };
	}
}

module.exports = { LocationManager };
