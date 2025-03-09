FROM nginx:alpine

# Copy nginx configuration
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY public /usr/share/nginx/html

EXPOSE 3000 