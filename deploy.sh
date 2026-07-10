#!/bin/bash

# Digital Roots Backend Deployment Script
# Run this on EC2 to deploy the latest code

set -e

echo "🚀 Starting deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
REPO_DIR="/home/ubuntu/digital-roots-xz"
BRANCH="${1:-main}"
APP_NAME="xz-backend"

# Change to repo directory
cd "$REPO_DIR"

echo -e "${YELLOW}📦 Pulling latest code from $BRANCH...${NC}"
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

echo -e "${YELLOW}📚 Installing dependencies...${NC}"
cd backend
npm install --production

echo -e "${YELLOW}🐳 Updating Docker containers...${NC}"
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
npm run setup-db || echo -e "${YELLOW}Migrations already run${NC}"

echo -e "${YELLOW}🔄 Restarting Node app...${NC}"
pm2 restart $APP_NAME || pm2 start "npm start" --name "$APP_NAME"
pm2 save

echo -e "${YELLOW}✅ Verifying health endpoint...${NC}"
sleep 3
if curl -s http://localhost:5000/api/health > /dev/null; then
  echo -e "${GREEN}✅ Backend is healthy!${NC}"
else
  echo -e "${RED}❌ Health check failed!${NC}"
  echo -e "${RED}Logs:${NC}"
  pm2 logs $APP_NAME --lines 50
  exit 1
fi

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Deployment Summary:"
echo "  - Repo: $REPO_DIR"
echo "  - Branch: $BRANCH"
echo "  - Backend URL: http://localhost:5000"
echo "  - Health: http://localhost:5000/api/health"
echo ""
echo "View logs: pm2 logs $APP_NAME"
echo "View containers: docker-compose -f docker-compose.prod.yml ps"
