# Krono Distributed Systems Platform Docker Container
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

RUN npm install
RUN npm run build --workspace=apps/dashboard

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 8080 9000 3000
CMD ["npm", "start"]
