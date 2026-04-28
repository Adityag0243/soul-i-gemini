import jwt
import time

# Read your private key
with open("private.pem", "r") as f:
    private_key = f.read()

payload = {
    "sub": "1",                          # fake user_id = 1
    "iss": "api.dev.souli.com",                # must match JWT_ISSUER in .env
    "aud": "souli.com",                 # must match JWT_AUDIENCE in .env
    "prm": "test-key-123",              # fake keystore param
    "iat": int(time.time()),
    "exp": int(time.time()) + 86400,    # expires in 24 hours
}

token = jwt.encode(payload, private_key, algorithm="RS256")
print("\nYour test token (valid 24 hours):\n")
print(token)