FROM nginx:1.25-alpine

# Config do Nginx (seleciona bundle por host)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Bundles: client e admin
COPY dist/sabr-client/ /usr/share/nginx/html/client
COPY dist/sabr-admin/ /usr/share/nginx/html/admin
