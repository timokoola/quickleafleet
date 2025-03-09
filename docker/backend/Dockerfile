FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY server.js ./

EXPOSE 3001

# Use nodemon for live reload
RUN npm install -g nodemon
CMD ["nodemon", "--watch", "server.js", "server.js"] 