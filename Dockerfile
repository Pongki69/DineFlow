FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM php:8.3-apache-bookworm AS php-base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git unzip libpq-dev libonig-dev libzip-dev libicu-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install -j2 pdo_pgsql mbstring zip intl bcmath opcache pcntl gd \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
COPY deploy/php.ini /usr/local/etc/php/conf.d/dineflow.ini
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /var/www/html

FROM php-base AS backend
COPY backend/ ./
ENV COMPOSER_ALLOW_SUPERUSER=1
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

FROM php-base AS runtime
COPY --from=backend /var/www/html/ /var/www/html/
COPY --from=frontend /frontend/dist/ /var/www/html/public/
COPY deploy/apache.conf /etc/apache2/sites-available/000-default.conf
COPY deploy/start.sh /usr/local/bin/dineflow-start
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views \
    storage/app/public storage/app/private storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod +x /usr/local/bin/dineflow-start
ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr \
    SESSION_DRIVER=database SESSION_SECURE_COOKIE=true QUEUE_CONNECTION=sync \
    BROADCAST_CONNECTION=log MAIL_MAILER=log PORT=10000
EXPOSE 10000
CMD ["dineflow-start"]
