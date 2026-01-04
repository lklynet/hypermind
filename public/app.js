const countEl = document.getElementById("count");
const directEl = document.getElementById("direct");
const canvas = document.getElementById("network");
const ctx = canvas.getContext("2d");
let particles = [];

function resize() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);
resize();

class Particle {
	constructor() {
		this.x = Math.random() * canvas.width;
		this.y = Math.random() * canvas.height;
		this.vx = (Math.random() - 0.5) * 1;
		this.vy = (Math.random() - 0.5) * 1;
		this.size = 3;
	}

	update() {
		this.x += this.vx;
		this.y += this.vy;

		if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
		if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
	}

	draw() {
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
		ctx.fillStyle = "#4ade80";
		ctx.fill();
	}
}

const updateParticles = (count) => {
	const VISUAL_LIMIT = 500;
	const visualCount = Math.min(count, VISUAL_LIMIT);

	const currentCount = particles.length;
	if (visualCount > currentCount) {
		for (let i = 0; i < visualCount - currentCount; i++) {
			particles.push(new Particle());
		}
	} else if (visualCount < currentCount) {
		particles.splice(visualCount, currentCount - visualCount);
	}
};

const animate = () => {
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.strokeStyle = "rgba(74, 222, 128, 0.15)";
	ctx.lineWidth = 1;
	for (let i = 0; i < particles.length; i++) {
		for (let j = i + 1; j < particles.length; j++) {
			const dx = particles[i].x - particles[j].x;
			const dy = particles[i].y - particles[j].y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance < 150) {
				ctx.beginPath();
				ctx.moveTo(particles[i].x, particles[i].y);
				ctx.lineTo(particles[j].x, particles[j].y);
				ctx.stroke();
			}
		}
	}

	particles.forEach((p) => {
		p.update();
		p.draw();
	});

	requestAnimationFrame(animate);
};

const openDiagnostics = () => {
	document.getElementById("diagnosticsModal").classList.add("active");
};

const closeDiagnostics = () => {
	document.getElementById("diagnosticsModal").classList.remove("active");
};

document.getElementById("diagnosticsModal").addEventListener("click", (e) => {
	if (e.target.id === "diagnosticsModal") {
		closeDiagnostics();
	}
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		closeDiagnostics();
	}
});

// MapLibre Map
const mapStyles = {
	light: "https://tiles.openfreemap.org/styles/liberty",
	dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
let currentMapTheme = localStorage.getItem("mapTheme") || "light";

const map = new maplibregl.Map({
	container: "map",
	style: mapStyles[currentMapTheme],
	center: [0, 20],
	zoom: 0.8,
	interactive: true,
});

// Update theme button text on load
if (currentMapTheme === "dark") {
	document.getElementById("themeBtn").textContent = "Light";
}

let lastPeerData = { type: "FeatureCollection", features: [] };
const countMarkers = {};

function setupMapLayers() {
	// Remove existing layers/source if present (for theme switching)
	["city-points", "city-glow", "cluster-points", "cluster-glow"].forEach((id) => {
		if (map.getLayer(id)) map.removeLayer(id);
	});
	if (map.getSource("peers")) map.removeSource("peers");

	map.addSource("peers", {
		type: "geojson",
		data: lastPeerData,
		cluster: true,
		clusterMaxZoom: 14,
		clusterRadius: 50,
		clusterProperties: {
			totalCount: ["+", ["get", "count"]],
			hasSelf: ["any", ["get", "hasSelf"]],
		},
	});

	map.addLayer({
		id: "cluster-glow",
		type: "circle",
		source: "peers",
		filter: ["has", "point_count"],
		paint: {
			"circle-color": ["case", ["get", "hasSelf"], "#4ade80", "#22d3ee"],
			"circle-radius": ["interpolate", ["linear"], ["get", "totalCount"], 1, 25, 50, 45, 200, 60],
			"circle-opacity": 0.2,
			"circle-blur": 1,
		},
	});

	map.addLayer({
		id: "cluster-points",
		type: "circle",
		source: "peers",
		filter: ["has", "point_count"],
		paint: {
			"circle-color": ["case", ["get", "hasSelf"], "#4ade80", "#22d3ee"],
			"circle-radius": ["interpolate", ["linear"], ["get", "totalCount"], 1, 10, 50, 20, 200, 30],
			"circle-opacity": 0.9,
		},
	});

	map.addLayer({
		id: "city-glow",
		type: "circle",
		source: "peers",
		filter: ["!", ["has", "point_count"]],
		paint: {
			"circle-color": ["case", ["get", "hasSelf"], "#4ade80", "#22d3ee"],
			"circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 20, 10, 35, 50, 50],
			"circle-opacity": 0.2,
			"circle-blur": 1,
		},
	});

	map.addLayer({
		id: "city-points",
		type: "circle",
		source: "peers",
		filter: ["!", ["has", "point_count"]],
		paint: {
			"circle-color": ["case", ["get", "hasSelf"], "#4ade80", "#22d3ee"],
			"circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 6, 10, 12, 50, 18],
			"circle-opacity": 0.9,
		},
	});

	// Force data refresh after layer setup
	map.once("idle", () => {
		if (map.getSource("peers") && lastPeerData.features.length > 0) {
			map.getSource("peers").setData(lastPeerData);
			updateCountMarkers();
		}
	});
}

// Pulse animation
let pulsePhase = 0;
setInterval(() => {
	pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);
	const scale = 1 + Math.sin(pulsePhase) * 0.3;
	const opacity = 0.25 - Math.sin(pulsePhase) * 0.15;
	if (map.getLayer("city-glow")) {
		map.setPaintProperty("city-glow", "circle-opacity", Math.max(0.05, opacity));
		map.setPaintProperty("city-glow", "circle-radius", [
			"interpolate", ["linear"], ["get", "count"], 1, 20 * scale, 10, 35 * scale, 50, 50 * scale,
		]);
	}
	if (map.getLayer("cluster-glow")) {
		map.setPaintProperty("cluster-glow", "circle-opacity", Math.max(0.05, opacity));
		map.setPaintProperty("cluster-glow", "circle-radius", [
			"interpolate", ["linear"], ["get", "totalCount"], 1, 25 * scale, 50, 45 * scale, 200, 60 * scale,
		]);
	}
}, 50);

function updateCountMarkers() {
	const source = map.getSource("peers");
	if (!source) return;

	const features = map.querySourceFeatures("peers");
	const seenIds = new Set();

	features.forEach((f) => {
		const coords = f.geometry.coordinates;
		const isCluster = f.properties.cluster;
		const count = isCluster ? f.properties.totalCount : f.properties.count;
		const markerId = isCluster ? "cluster-" + f.properties.cluster_id : "city-" + f.properties.city;

		if (!count) return;
		seenIds.add(markerId);

		if (!countMarkers[markerId]) {
			const el = document.createElement("div");
			el.className = "cluster-label";
			el.innerText = count;
			countMarkers[markerId] = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map);
		} else {
			countMarkers[markerId].setLngLat(coords);
			countMarkers[markerId].getElement().innerText = count;
		}
	});

	Object.keys(countMarkers).forEach((id) => {
		if (!seenIds.has(id)) {
			countMarkers[id].remove();
			delete countMarkers[id];
		}
	});
}

// Popup for city details
const popup = new maplibregl.Popup({
	closeButton: true,
	closeOnClick: true,
	className: "peer-popup",
});

// Global event handlers (survive style changes)
map.on("moveend", updateCountMarkers);
map.on("sourcedata", (e) => {
	if (e.sourceId === "peers" && e.isSourceLoaded) {
		updateCountMarkers();
	}
});

// Initial layer setup
map.once("style.load", () => {
	setupMapLayers();

	// Layer click handlers
	map.on("click", "city-points", (e) => {
		const feature = e.features[0];
		const props = feature.properties;
		const coords = feature.geometry.coordinates.slice();

		const city = props.city || "Unknown";
		const region = props.region || "";
		const location = region ? `${city}, ${region}` : city;

		let peerIds = [];
		try {
			peerIds = typeof props.peerIds === "string" ? JSON.parse(props.peerIds) : props.peerIds || [];
		} catch (err) {
			peerIds = [];
		}

		const peerList = peerIds.map((id) => `<div class="peer-id">${id}</div>`).join("");

		popup
			.setLngLat(coords)
			.setHTML(`<div class="popup-title">${location}</div><div class="popup-peers">${peerList}</div>`)
			.addTo(map);
	});

	map.on("click", "cluster-points", (e) => {
		const feature = e.features[0];
		const clusterId = feature.properties.cluster_id;
		const source = map.getSource("peers");

		source.getClusterExpansionZoom(clusterId, (err, zoom) => {
			if (err) return;
			map.easeTo({ center: feature.geometry.coordinates, zoom: zoom });
		});
	});

	map.on("mouseenter", "city-points", () => { map.getCanvas().style.cursor = "pointer"; });
	map.on("mouseleave", "city-points", () => { map.getCanvas().style.cursor = ""; });
	map.on("mouseenter", "cluster-points", () => { map.getCanvas().style.cursor = "pointer"; });
	map.on("mouseleave", "cluster-points", () => { map.getCanvas().style.cursor = ""; });
});

function toggleFullscreen() {
	const container = document.getElementById("mapContainer");
	const btn = document.getElementById("fullscreenBtn");
	container.classList.toggle("fullscreen");
	btn.textContent = container.classList.contains("fullscreen") ? "Exit" : "Fullscreen";
	setTimeout(() => map.resize(), 160);
}

function toggleMapTheme() {
	currentMapTheme = currentMapTheme === "light" ? "dark" : "light";
	localStorage.setItem("mapTheme", currentMapTheme);
	document.getElementById("themeBtn").textContent = currentMapTheme === "light" ? "Dark" : "Light";

	// Store current data before style change
	const dataToRestore = JSON.parse(JSON.stringify(lastPeerData));

	map.setStyle(mapStyles[currentMapTheme]);

	// Poll until style is loaded, then restore layers
	const checkStyleLoaded = setInterval(() => {
		if (map.isStyleLoaded()) {
			clearInterval(checkStyleLoaded);
			setupMapLayers();
			setTimeout(() => {
				if (map.getSource("peers")) {
					map.getSource("peers").setData(dataToRestore);
				}
			}, 50);
		}
	}, 50);
}

function toggleMapPanel() {
	const container = document.getElementById("mapContainer");
	const globeIcon = document.getElementById("toggleIconGlobe");
	const closeIcon = document.getElementById("toggleIconClose");
	const isCollapsed = container.classList.toggle("collapsed");

	globeIcon.style.display = isCollapsed ? "block" : "none";
	closeIcon.style.display = isCollapsed ? "none" : "block";

	localStorage.setItem("mapCollapsed", isCollapsed ? "true" : "false");

	if (!isCollapsed) {
		setTimeout(() => map.resize(), 160);
	}
}

// Restore map panel state from localStorage
(function initMapPanelState() {
	const saved = localStorage.getItem("mapCollapsed");
	// Default to collapsed if no preference saved
	if (saved === "false") {
		const container = document.getElementById("mapContainer");
		const globeIcon = document.getElementById("toggleIconGlobe");
		const closeIcon = document.getElementById("toggleIconClose");
		container.classList.remove("collapsed");
		globeIcon.style.display = "none";
		closeIcon.style.display = "block";
	}
})();

const evtSource = new EventSource("/events");

evtSource.onmessage = (event) => {
	const data = JSON.parse(event.data);

	updateParticles(data.count);

	if (countEl.innerText != data.count) {
		countEl.innerText = data.count;
		countEl.classList.remove("pulse");
		void countEl.offsetWidth;
		countEl.classList.add("pulse");
	}

	directEl.innerText = data.direct;

	if (data.diagnostics) {
		const d = data.diagnostics;

		const formatBandwidth = (bytes) => {
			const kb = bytes / 1024;
			const mb = kb / 1024;
			const gb = mb / 1024;

			if (gb >= 1) {
				return gb.toFixed(2) + " GB";
			} else if (mb >= 1) {
				return mb.toFixed(2) + " MB";
			} else {
				return kb.toFixed(1) + " KB";
			}
		};

		document.getElementById("diag-heartbeats-rx").innerText =
			d.heartbeatsReceived.toLocaleString();
		document.getElementById("diag-heartbeats-tx").innerText =
			d.heartbeatsRelayed.toLocaleString();
		document.getElementById("diag-new-peers").innerText =
			d.newPeersAdded.toLocaleString();
		document.getElementById("diag-dup-seq").innerText =
			d.duplicateSeq.toLocaleString();
		document.getElementById("diag-invalid-pow").innerText =
			d.invalidPoW.toLocaleString();
		document.getElementById("diag-invalid-sig").innerText =
			d.invalidSig.toLocaleString();
		document.getElementById("diag-bandwidth-in").innerText = formatBandwidth(
			d.bytesReceived
		);
		document.getElementById("diag-bandwidth-out").innerText = formatBandwidth(
			d.bytesRelayed
		);
		document.getElementById("diag-leave").innerText =
			d.leaveMessages.toLocaleString();
	}

	// Update map locations
	if (data.locations) {
		lastPeerData = data.locations;
		if (map.isStyleLoaded() && map.getSource("peers")) {
			map.getSource("peers").setData(data.locations);
		}
	}
};

evtSource.onerror = (err) => {
	// Automatic reconnection
};

const initialCount = parseInt(countEl.dataset.initialCount) || 0;
countEl.innerText = initialCount;
countEl.classList.add("loaded");
updateParticles(initialCount);
animate();
