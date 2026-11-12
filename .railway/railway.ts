import { defineRailway, project, service } from 'railway/iac';

// Connect your GitHub repository in the Railway dashboard before applying IaC.
// No source is hardcoded so forks can use this file unchanged.
// Railway's older railway.json/railway.toml config-as-code is deprecated.
export default defineRailway(() => project('telegram-sales-bot', {
  resources: [
    service('telegram-sales-bot', {
      start: 'node src/server.js',
      healthcheck: '/healthz',
      healthcheckTimeout: 60
    })
  ]
}));
