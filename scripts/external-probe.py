#!/usr/bin/env python3
"""Public-only external probe. Bounded, redacted; exits nonzero on failure."""
import datetime as dt
import json
import time
import urllib.request

SITES = ("dunamismax.com", "graceandfootnotes.com", "demo.xrayservice.net", "status.dunamismax.com", "xrayservice.net")

def fresh(value, now=None):
    at = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    age = ((now or dt.datetime.now(dt.timezone.utc)) - at).total_seconds()
    return -60 <= age < 1200

def run():
    failed = []
    for host in SITES:
        ok = False
        for attempt in range(3):
            try:
                req = urllib.request.Request("https://" + host + "/", headers={"User-Agent": "dunamis-external-probe/1"})
                with urllib.request.urlopen(req, timeout=10) as response:
                    assert response.status == 200
                    assert "text/html" in response.headers.get("Content-Type", "")
                    assert len(response.read(262144)) > 100
                    if host == "demo.xrayservice.net":
                        assert "noindex" in response.headers.get("X-Robots-Tag", "")
                ok = True
                break
            except Exception:
                if attempt < 2:
                    time.sleep(3)
        print(host + (": OK" if ok else ": FAILED"))
        if not ok:
            failed.append(host)
    try:
        with urllib.request.urlopen("https://status.dunamismax.com/api/status.json", timeout=10) as response:
            data = json.loads(response.read(1048576))
        assert fresh(data["checked_at"])
        print("Collector freshness: OK")
    except Exception:
        print("Collector freshness: FAILED")
        failed.append("collector")
    return bool(failed)

if __name__ == "__main__":
    raise SystemExit(run())
