const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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
        console.log(`Logged metrics - Count: ${count}, Direct: ${direct}`);
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
              '5min': 5 * 60 * 1000,
              '1h': 60 * 60 * 1000,
              '24h': 24 * 60 * 60 * 1000,
              '7d': 7 * 24 * 60 * 60 * 1000
          };

          const duration = ranges[range] || ranges['5min'];
          const startTime = Date.now() - duration;

          try {
              const countData = db.prepare('SELECT timestamp, value FROM count_metrics WHERE timestamp >= ? ORDER BY timestamp').all(startTime);
              const directData = db.prepare('SELECT timestamp, value FROM direct_metrics WHERE timestamp >= ? ORDER BY timestamp').all(startTime);

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
    console.log('Initial peerManager.size:', peerManager.size);
    setInterval(() => {
        log(peerManager.totalUniquePeers, swarmManager.getSwarm().connections.size);
    }, 10000);

    return { log };
};


module.exports = {init, setupRoutes};