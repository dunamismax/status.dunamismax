.PHONY: serve check collect database test-db

serve:
	php -S 127.0.0.1:8096 -t public dev/router.php

check:
	php bin/check.php
	php tests/run.php

collect:
	php bin/collect.php

database:
	php bin/database.php

test-db:
	php tests/database.php
