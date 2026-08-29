# Krono Distributed Systems Platform Makefile

.PHONY: install build test test-chaos run-server run-cluster run-dashboard clean

install:
	npm install

build:
	npm run build --workspace=apps/dashboard

test:
	npm test

test-chaos:
	node --test tests/chaos/split_brain.test.js

run-server:
	node apps/server/src/index.js

run-cluster:
	node scripts/cluster.js

run-dashboard:
	npm run dev:dashboard

bench:
	node benchmarks/throughput.js

clean:
	rm -rf node_modules dist data
