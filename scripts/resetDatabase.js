import { runDockerCompose } from './dockerUtils.js';

console.log('🔄 Resetting PostgreSQL container and volume...');
runDockerCompose('down -v');
runDockerCompose('up -d');

import('./waitForPostgres.js');
