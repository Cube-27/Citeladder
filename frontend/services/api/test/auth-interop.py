"""Live crypto interoperability probe; no generated or golden fixtures."""

import json
import os
import sys

os.environ["CITELADDER_DISABLE_DOTENV"] = "1"
os.environ["APP_ENV"] = "test"
os.environ["JWT_SECRET_KEY"] = "api-service-test-session-key-0123456789abcdef"

from app.core.security import (  # noqa: E402 -- deterministic environment before settings
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

request = json.load(sys.stdin)
if request["operation"] == "issue":
    print(json.dumps({"token": create_access_token(request["user_id"], token_version=2),
                      "hash": hash_password(request["password"])}))
else:
    print(json.dumps({"claims": decode_access_token(request["token"]),
                      "verified": verify_password(request["password"], request["hash"])}))
