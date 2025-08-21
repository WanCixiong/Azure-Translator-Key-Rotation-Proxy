FROM node:18-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY src ./src
COPY README.md ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
