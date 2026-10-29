#!/bin/sh
# Entrypoint of the one-shot `migrate` service in docker-compose.demo.yml.
# 1. Apply SQL migrations as the admin role (never as the application role, ADR-001).
# 2. Seed the DEMO dataset; the seed exits 0 without changes when the demo tenants exist.
set -eu
cd /app/apps/api
echo "aurora: applying migrations"
node dist/platform/database/migrate.js
echo "aurora: seeding DEMO dataset"
node dist/seed/seed-demo.js
echo "aurora: database ready"
