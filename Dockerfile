FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
# Operator-only one-off commands for Turso migrations and Telegram webhook setup.
# The image never runs these automatically at startup.
COPY scripts ./scripts
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
