const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('dotenv');

const dbPath = path.join(__dirname, 'history.db');
const db = new Database(dbPath);

// Initialize the history table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS count_metrics (
        timestamp INTEGER PRIMARY KEY,
        value INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS direct_metrics (
        timestamp INTEGER PRIMARY KEY,
        value INTEGER
    );
`);

const log = (count, direct) => {
    try {
        const now = Date.now();
        db.prepare('INSERT INTO count_metrics (timestamp, value) VALUES (?, ?)').run(now, count);
        db.prepare('INSERT INTO direct_metrics (timestamp, value) VALUES (?, ?)').run(now, direct);
    } catch (error) {
        console.error('Error logging metrics:', error.message);
    }
};

  const setupRoutes = (app) => {
      app.get('/history', (req, res) => {
          const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf-8');
          res.send(html);
      });

    app.get('/history.js', (req, res) => {
      res.setHeader('Content-Type', 'application/javascript');
      const js = fs.readFileSync(path.join(__dirname, 'history.js'), 'utf-8');
      res.send(js);
    });

      app.get('/history/data', (req, res) => {
        const range = req.query.range || '5min';

        const ranges = {
            '5min': { duration: 5 * 60 * 1000, bucket: 10000 },      // 10s buckets
            '1h': { duration: 60 * 60 * 1000, bucket: 60000 },       // 1min buckets
            '24h': { duration: 24 * 60 * 60 * 1000, bucket: 300000 }, // 5min buckets
            '7d': { duration: 7 * 24 * 60 * 60 * 1000, bucket: 900000 } // 15hour buckets
        };

        const config = ranges[range] || ranges['5min'];
        const startTime = Date.now() - config.duration;
        
        try {
            const countData = db.prepare(`SELECT 
            CAST(timestamp / ? AS INTEGER) as bucket, MIN(timestamp) AS timestamp, AVG(value) as value
            FROM count_metrics 
            WHERE timestamp >= ?
            GROUP BY bucket
            ORDER BY bucket
            `).all(config.bucket, startTime);

            const directData = db.prepare(`SELECT 
            CAST(timestamp / ? AS INTEGER) as bucket, MIN(timestamp) as timestamp, AVG(value) as value
            FROM direct_metrics 
            WHERE timestamp >= ?
            GROUP BY bucket
            ORDER BY bucket
            `).all(config.bucket, startTime);

            res.json({
                count: countData,
                direct: directData,
                range
            });

          } catch (err) {
              res.status(500).json({ error: err.message });
          }
      });
  };

const init = (peerManager, swarmManager) => {
    console.log('History plugin initialized.');
    setInterval(() => {
        log(peerManager.totalUniquePeers, swarmManager.getSwarm().connections.size);
    }, 10000);

    return { log };
};


module.exports = {init, setupRoutes};