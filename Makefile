.PHONY: check build test database-test serve collect
check:
	pnpm run check
	pnpm run db:check
	pnpm test
	for file in deploy/*.sh tests/postgres.sh; do bash -n "$$file" || exit; done
	python3 -m py_compile scripts/external-probe.py scripts/http3-probe.py
build:
	pnpm run build
test:
	pnpm test
database-test:
	bash tests/postgres.sh
serve:
	pnpm run dev
collect:
	pnpm run collect --dry-run
