#!/bin/bash

# Digital Roots Backend - EC2 Automated Setup Script
# Run this on a fresh Ubuntu 22.04 EC2 instance to set up everything
# Usage: ./setup-ec2.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Digital Roots Backend - EC2 Setup${NC}"
echo "================================================"

# Step 1: Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# Step 2: Install Docker
echo -e "${YELLOW}🐳 Installing Docker...${NC}"
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
rm get-docker.sh

# Step 3: Install Docker Compose
echo -e "${YELLOW}📦 Installing Docker Compose...${NC}"
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Step 4: Install Node.js
echo -e "${YELLOW}📦 Installing Node.js 18...${NC}"
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git

# Step 5: Install Nginx
echo -e "${YELLOW}🌐 Installing Nginx...${NC}"
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Step 6: Install PM2
echo -e "${YELLOW}⚙️  Installing PM2...${NC}"
sudo npm install -g pm2
pm2 install pm2-logrotate

# Step 7: Install Certbot for SSL
echo -e "${YELLOW}🔒 Installing Certbot (Let's Encrypt)...${NC}"
sudo apt install -y certbot python3-certbot-nginx

# Step 8: Clone repository
echo -e "${YELLOW}📂 Cloning repository...${NC}"
cd /home/ubuntu
git clone https://github.com/your-org/digital-roots-xz.git || echo "Repo already cloned"
cd digital-roots-xz

# Step 9: Setup environment
echo -e "${YELLOW}⚙️  Creating .env file...${NC}"
cp backend/.env.production backend/.env
echo -e "${RED}⚠️  IMPORTANT: Edit backend/.env with your actual credentials!${NC}"
echo "   - DB_PASSWORD"
echo "   - Firebase credentials"
echo "   - API keys"
echo ""

# Step 10: Start Docker services
echo -e "${YELLOW}🐳 Starting Docker services...${NC}"
cd /home/ubuntu/digital-roots-xz/backend
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 15

# Step 11: Setup database
echo -e "${YELLOW}🗄️  Setting up database...${NC}"
npm install
npm run setup-db || echo "Database already set up"

# Step 12: Start application with PM2
echo -e "${YELLOW}▶️  Starting backend application...${NC}"
pm2 start "npm start" --name "xz-backend"
pm2 save
sudo pm2 startup

# Step 13: Verify services
echo -e "${YELLOW}✅ Verifying services...${NC}"
echo ""
echo "Docker containers:"
docker-compose -f docker-compose.prod.yml ps
echo ""

# Wait for app to start
sleep 5

if curl -s http://localhost:5000/api/health > /dev/null; then
  echo -e "${GREEN}✅ Backend is running!${NC}"
else
  echo -e "${RED}❌ Backend health check failed${NC}"
  echo "Check logs with: pm2 logs xz-backend"
fi

# Step 14: Display setup summary
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ EC2 Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Edit .env file with your credentials:"
echo "   sudo nano /home/ubuntu/digital-roots-xz/backend/.env"
echo ""
echo "2. Configure SSL (Let's Encrypt):"
echo "   sudo certbot certonly --standalone -d your-domain.com"
echo ""
echo "3. Setup Nginx reverse proxy:"
echo "   sudo cp /home/ubuntu/digital-roots-xz/backend/nginx.conf /etc/nginx/sites-available/default"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo ""
echo "4. View logs:"
echo "   pm2 logs xz-backend"
echo "   docker-compose logs -f postgres"
echo ""
echo "5. Verify health:"
echo "   curl http://localhost:5000/api/health"
echo ""
echo "🔑 Important Files:"
echo "   - .env: /home/ubuntu/digital-roots-xz/backend/.env"
echo "   - Nginx config: /etc/nginx/sites-available/default"
echo "   - PM2 config: ~/.pm2/ecosystem.config.js"
echo "   - Docker compose: /home/ubuntu/digital-roots-xz/backend/docker-compose.prod.yml"
echo ""
echo "💾 Database Access:"
echo "   - PostgreSQL: localhost:5432"
echo "   - MongoDB: localhost:27017"
echo "   - Redis: localhost:6379"
echo ""
echo -e "${YELLOW}⚠️  Don't forget to:${NC}"
echo "   1. Update .env with real credentials"
echo "   2. Setup SSL certificates"
echo "   3. Configure domain DNS"
echo "   4. Setup backups"
echo "   5. Configure security groups in AWS"
