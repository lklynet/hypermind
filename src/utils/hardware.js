const os = require("os");

/**
 * Cached hardware statistics (computed once at module load)
 * RAM and CPU cores don't change at runtime, so no need to recompute
 * @type {{ ram: number, cores: number }}
 */
const cachedStats = Object.freeze({
    ram: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    cores: os.cpus().length
});

/**
 * Get local hardware statistics
 * @returns {{ ram: number, cores: number }} RAM in GB (1 decimal), logical CPU core count
 */
const getHardwareStats = () => cachedStats;

module.exports = { getHardwareStats };
