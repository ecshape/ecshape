"""Run: python test_instagram_webhook.py"""
import hashlib, hmac, json, os, sys, tempfile

os.environ.update(INSTAGRAM_VERIFY_TOKEN="vt", INSTAGRAM_APP_SECRET="sec",
                  INSTAGRAM_ACCESS_TOKEN="tok", INSTAGRAM_BUSINESS_ID="999")
rules = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
json.dump({"rules": [{"keywords": ["plan"], "public_reply": ["hi"], "dm_text": "link"}]}, rules)
rules.close()
os.environ["INSTAGRAM_RULES_PATH"] = rules.name
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
import importlib.util
# Load the router by file path: `app.routers/__init__` imports every router (and opens the DB).
_spec = importlib.util.spec_from_file_location(
    "instagram_webhook", os.path.join(os.path.dirname(os.path.abspath(__file__)), "app", "routers", "instagram_webhook.py"))
instagram_webhook = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(instagram_webhook)
from app.services import instagram_service as svc

fails = 0
def check(name, cond):
    global fails
    print(("PASS" if cond else "FAIL"), name)
    fails += 0 if cond else 1

app = FastAPI(); app.include_router(instagram_webhook.router, prefix="/api/instagram")
c = TestClient(app)
q = "/api/instagram/webhook"
r = c.get(q, params={"hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "123"})
check("verify ok", r.status_code == 200 and r.text == "123")
check("verify bad token", c.get(q, params={"hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1"}).status_code == 403)
body = json.dumps({"entry": [{"changes": [{"field": "comments", "value": {"id": "c0", "text": "plan", "from": {"id": "1"}}}]}]}).encode()
check("bad signature", c.post(q, content=body, headers={"x-hub-signature-256": "sha256=bad"}).status_code == 403)
sig = "sha256=" + hmac.new(b"sec", body, hashlib.sha256).hexdigest()
_real = svc.handle_comment
dispatched = []
svc.handle_comment = lambda *a, **k: dispatched.append(a)
check("good signature", c.post(q, content=body, headers={"x-hub-signature-256": sig}).status_code == 200)
check("comment dispatched", dispatched and dispatched[0][0] == "c0")
svc.handle_comment = _real

calls = []
def handler(req):
    calls.append(str(req.url)); return httpx.Response(200, json={})
mc = httpx.Client(transport=httpx.MockTransport(handler))
res = svc.handle_comment("c1", "Send me the PLAN please", "1", "m1", client=mc)
check("match -> reply+dm", res["reply"] and res["dm"] and len(calls) == 2)
check("dedupe", not svc.handle_comment("c1", "plan", "1", client=mc)["matched"])
check("no match", not svc.handle_comment("c2", "hello", "1", client=mc)["matched"])
check("own comment ignored", not svc.handle_comment("c3", "plan", "999", client=mc)["matched"])
sys.exit(1 if fails else 0)
