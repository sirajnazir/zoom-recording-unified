FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p logs output temp cache

# Expose port
EXPOSE 3000

# Start webhook server
CMD ["node", "webhook-server.js"]
