# History Plugin

A simple plugin to track the cunt and number of connections in a local sqlite database every 10s. The data can then be shown under `/history`. It is built using a plugin approach with minimal changes in the existing codebase. A small initiatlization is added into `server.js` to load the history plugin if configured.

## Philosophy


## Installation instructions
- Add environment variable `ENABLE_HISTORY_PLUGIN = true`
- Ensure `better-sqlite3` is installed (it is listed as an optional dependency )

## Potential future improvements
- Make storage and retention intervals configurable
- Extend storage to other events for more data
- Support extensive analytics for more smart
- Migrate to over-engineered InfluxDB/Grafana back-end