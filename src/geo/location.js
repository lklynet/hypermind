class LocationManager {
	constructor() {
		this.location = null;
		this.initialized = false;
	}

	async init() {
		if (this.initialized) return;

		try {
			const response = await fetch("https://ipwho.is/");
			const data = await response.json();

			if (data.success && data.latitude && data.longitude) {
				this.location = {
					lat: data.latitude,
					lon: data.longitude,
					city: data.city || "Unknown",
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
