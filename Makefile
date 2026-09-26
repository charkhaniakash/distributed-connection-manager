.PHONY: help build up down logs test clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker compose build

up: ## Start all services
	docker compose up -d

down: ## Stop all services
	docker compose down

logs: ## View logs from all services
	docker compose logs -f

logs-node-1: ## View logs from node-1
	docker compose logs -f node-1

logs-node-2: ## View logs from node-2
	docker compose logs -f node-2

logs-node-3: ## View logs from node-3
	docker compose logs -f node-3

restart: ## Restart all services
	docker compose restart

restart-node-1: ## Restart node-1
	docker compose restart node-1

restart-node-2: ## Restart node-2
	docker compose restart node-2

restart-node-3: ## Restart node-3
	docker compose restart node-3

stop-node-2: ## Stop node-2 (for crash demo)
	docker compose stop node-2

health: ## Check health of all nodes
	@curl -s http://localhost:8080/health | jq .
	@curl -s http://localhost:3001/health | jq .
	@curl -s http://localhost:3002/health | jq .
	@curl -s http://localhost:3003/health | jq .

nodes: ## Get information about all nodes
	@curl -s http://localhost:8080/nodes | jq .

stats: ## Get global statistics
	@curl -s http://localhost:8080/stats | jq .

test: ## Run tests
	npm test

clean: ## Clean up everything
	docker compose down -v
	rm -rf node_modules dist

install: ## Install dependencies
	npm install

dev: ## Run in development mode
	npm run dev
