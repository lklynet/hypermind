// Lazy-loaded
let iploc = null;

class LocationManager {
	constructor() {
		this.location = null;
		this.initialized = false;
	}

	async init() {
		if (this.initialized) return;

		try {
			// Lazy load ip-location-api only when needed
			if (!iploc) {
				iploc = require("ip-location-api");
			}
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
			this.initialized = true;
		} catch (e) {
			console.log("[Geo] Location lookup failed:", e.message);
			this.location = null;
		}
	}

	getLocation() {
		return this.location;
	}

	// Generate GeoJSON FeatureCollection of peer locations, aggregated by city
	getPeerLocations(seenPeers, selfId) {
		const cityGroups = new Map();

		for (const [id, data] of seenPeers.entries()) {
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
