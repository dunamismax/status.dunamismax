.PHONY: check build test database-test serve collect
check:
	npm run check
	npm test
	for file in deploy/*.sh tests/postgres.sh; do bash -n "$$file" || exit; done
	python3 -m py_compile deploy/history-transfer.py
build:
	npm run build
test:
	npm test
database-test:
	bash tests/postgres.sh
serve:
	npm exec astro dev -- --host 127.0.0.1 --port 8096
collect:
	npm run collect -- --dry-run
