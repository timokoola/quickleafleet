FROM node:20-alpine

WORKDIR /app

# Install PostgreSQL client
RUN apk add --no-cache postgresql-client

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with clean slate
RUN rm -rf node_modules && npm install

# Copy application files
COPY server.js ./
COPY db ./db

EXPOSE 3001

# Use nodemon for live reload
RUN npm install -g nodemon
CMD ["nodemon", "--watch", "server.js", "server.js"] 