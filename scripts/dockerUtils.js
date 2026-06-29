import { execSync } from 'child_process';

export function requireDocker() {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 15000 });
  } catch {
    console.error('❌ Docker is not running.');
    console.error('   Start Docker Desktop, wait until it is ready, then rerun setup.');
    process.exit(1);
  }
}

export function runDockerCompose(args) {
  requireDocker();
  execSync(`docker compose ${args}`, { stdio: 'inherit', cwd: process.cwd(), timeout: 120000 });
}
