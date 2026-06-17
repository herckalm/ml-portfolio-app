#!/usr/bin/env bash
#
# smoke-test.sh — end-to-end check of the ML Portfolio multi-tenant backend.
#
# Usage:   ./smoke-test.sh [BASE_URL]
# Example: ./smoke-test.sh http://localhost:5013     (default)
#
# Requirements: the API must be running and the DB migrated.
# Safe to rerun: every run uses a unique timestamp suffix for emails/handles,
# so it never collides with previous runs (no DB reset needed).

set -u

BASE="${1:-http://localhost:5013}"
TS=$(date +%s)
PW="Secret123!"

PASS=0
FAIL=0
GREEN=$'\e[32m'; RED=$'\e[31m'; DIM=$'\e[2m'; NC=$'\e[0m'

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v jq   >/dev/null || { echo "jq is required (sudo apt install jq)"; exit 1; }

# api METHOD PATH [TOKEN] [JSON_BODY]  -> sets globals CODE and BODY
api() {
  local method=$1 path=$2 token=${3:-} body=${4:-}
  local args=(-s -w $'\n%{http_code}' -X "$method" "$BASE$path" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ]  && args+=(-d "$body")
  local resp; resp=$(curl "${args[@]}")
  CODE=$(printf '%s' "$resp" | tail -n1)
  BODY=$(printf '%s' "$resp" | sed '$d')
}

ok()   { printf '%sPASS%s %s %s(HTTP %s)%s\n' "$GREEN" "$NC" "$1" "$DIM" "$CODE" "$NC"; PASS=$((PASS+1)); }
bad()  { printf '%sFAIL%s %s — %s\n      %sbody: %s%s\n' "$RED" "$NC" "$1" "$2" "$DIM" "${BODY:0:300}" "$NC"; FAIL=$((FAIL+1)); }

# expect DESC WANTED_CODE
expect() { [ "$CODE" = "$2" ] && ok "$1" || bad "$1" "expected HTTP $2, got $CODE"; }

# expect_in DESC CODE1 CODE2 ...
expect_in() {
  local desc=$1; shift
  for c in "$@"; do [ "$CODE" = "$c" ] && { ok "$desc"; return; }; done
  bad "$desc" "expected one of [$*], got $CODE"
}

# expect_val DESC JQ_FILTER WANTED
expect_val() {
  local got; got=$(printf '%s' "$BODY" | jq -r "$2" 2>/dev/null)
  [ "$got" = "$3" ] && { printf '%sPASS%s %s %s(%s = %s)%s\n' "$GREEN" "$NC" "$1" "$DIM" "$2" "$got" "$NC"; PASS=$((PASS+1)); } \
                    || bad "$1" "expected $2 = '$3', got '$got'"
}

echo "== ML Portfolio backend smoke test =="
echo "Target: $BASE   run id: $TS"
echo

echo "-- Health --"
api GET /health
expect "GET /health" 200
api GET /health/db
expect "GET /health/db" 200
echo

echo "-- Registration: validation & uniqueness --"
A_EMAIL="alice+$TS@test.com"; A_HANDLE="alice-$TS"
api POST /api/auth/register "" "{\"email\":\"$A_EMAIL\",\"password\":\"$PW\",\"handle\":\"$A_HANDLE\",\"displayName\":\"Alice Test\"}"
expect_in "Register user A (explicit handle)" 200 201
A_TOKEN=$(printf '%s' "$BODY" | jq -r .token)
expect_val "A's handle echoed back" .handle "$A_HANDLE"

api POST /api/auth/register "" "{\"email\":\"$A_EMAIL\",\"password\":\"$PW\",\"handle\":\"alice2-$TS\"}"
expect "Duplicate email rejected" 409

api POST /api/auth/register "" "{\"email\":\"dupe+$TS@test.com\",\"password\":\"$PW\",\"handle\":\"$A_HANDLE\"}"
expect "Taken handle rejected" 409

api POST /api/auth/register "" "{\"email\":\"res+$TS@test.com\",\"password\":\"$PW\",\"handle\":\"admin\"}"
expect "Reserved handle 'admin' rejected" 409

api POST /api/auth/register "" "{\"email\":\"bad+$TS@test.com\",\"password\":\"$PW\",\"handle\":\"ab\"}"
expect "Too-short handle rejected (model validation)" 400

api POST /api/auth/register "" "{\"email\":\"bob+$TS@test.com\",\"password\":\"$PW\"}"
expect_in "Register user B (handle derived from email)" 200 201
B_TOKEN=$(printf '%s' "$BODY" | jq -r .token)
B_HANDLE=$(printf '%s' "$BODY" | jq -r .handle)
[ -n "$B_HANDLE" ] && [ "$B_HANDLE" != "null" ] \
  && { printf '%sPASS%s B got a derived handle %s(%s)%s\n' "$GREEN" "$NC" "$DIM" "$B_HANDLE" "$NC"; PASS=$((PASS+1)); } \
  || bad "B got a derived handle" "handle was empty/null"
echo

echo "-- Login --"
api POST /api/auth/login "" "{\"email\":\"$A_EMAIL\",\"password\":\"$PW\"}"
expect "Login user A" 200
api POST /api/auth/login "" "{\"email\":\"$A_EMAIL\",\"password\":\"wrongpass\"}"
expect "Login with bad password rejected" 401
echo

echo "-- Projects: create, ownership, drafts --"
api POST /api/projects "$A_TOKEN" "{\"title\":\"NLP Sentiment\",\"description\":\"BERT fine-tune\",\"domain\":\"NLP\",\"modelType\":\"BERT\"}"
expect "Create project P1 as A" 201
P1=$(printf '%s' "$BODY" | jq -r .id)
expect_val "P1 defaults to draft" .isPublished false

api POST /api/projects "$A_TOKEN" "{\"title\":\"Vision Demo\",\"description\":\"ResNet\",\"domain\":\"Vision\",\"modelType\":\"ResNet\"}"
expect "Create project P2 as A (stays draft)" 201
P2=$(printf '%s' "$BODY" | jq -r .id)

api GET /api/projects "$A_TOKEN"
expect "GET /api/projects (authed) = my projects" 200
expect_val "My projects total = 2 (incl. drafts)" .total 2

api GET /api/projects ""
expect "GET /api/projects without token = 401" 401
echo

echo "-- Publishing & public visibility --"
api GET "/api/users/$A_HANDLE/projects" ""
expect "Public list by handle reachable" 200
expect_val "Nothing published yet (total 0)" .total 0

api PATCH "/api/projects/$P1/publish" "$A_TOKEN" "{\"isPublished\":true}"
expect "Publish P1" 200
expect_val "P1 now published" .isPublished true

api GET "/api/users/$A_HANDLE/projects" ""
expect_val "Public list shows exactly 1 published" .total 1

api GET "/api/projects/$P1" ""
expect "Public detail of published P1 = 200" 200

api GET "/api/projects/$P2" ""
expect "Public detail of DRAFT P2 = 404 (no leak)" 404
echo

echo "-- Cross-tenant isolation (the 404-not-403 rule) --"
api PUT "/api/projects/$P1" "$B_TOKEN" "{\"title\":\"hijack\",\"description\":\"x\",\"domain\":\"NLP\",\"modelType\":\"X\"}"
expect "B updating A's project = 404 (not 403)" 404
api DELETE "/api/projects/$P1" "$B_TOKEN"
expect "B deleting A's project = 404 (not 403)" 404
api PUT "/api/projects/$P1" "$A_TOKEN" "{\"title\":\"NLP Sentiment v2\",\"description\":\"updated\",\"domain\":\"NLP\",\"modelType\":\"BERT\"}"
expect "A updating own project = 200" 200
echo

echo "-- Public profile & profile editing --"
api GET "/api/users/$A_HANDLE" ""
expect "Public profile of A = 200" 200
expect_val "displayName correct" .displayName "Alice Test"
expect_val "email NOT exposed" 'has("email")' false
expect_val "role NOT exposed" 'has("role")' false

api GET "/api/users/nope-$TS" ""
expect "Unknown handle profile = 404" 404

api PUT /api/users/me "$A_TOKEN" "{\"displayName\":\"Alice M. Test\",\"bio\":\"ML engineer and grad student.\"}"
expect "Update own profile = 200" 200
expect_val "bio updated in response" .bio "ML engineer and grad student."

api GET "/api/users/$A_HANDLE" ""
expect_val "bio persisted" .bio "ML engineer and grad student."
expect_val "displayName persisted" .displayName "Alice M. Test"

api PUT /api/users/me "" "{\"displayName\":\"x\"}"
expect "Profile edit without token = 401" 401
echo

echo "=========================================="
printf 'Total: %s%d passed%s, %s%d failed%s\n' "$GREEN" "$PASS" "$NC" "$RED" "$FAIL" "$NC"
echo "=========================================="
[ "$FAIL" -eq 0 ]
