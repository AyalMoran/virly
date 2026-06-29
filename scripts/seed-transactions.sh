#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://api.virly.ayal.online}"
TRANSACTION_COUNT="${TRANSACTION_COUNT:-100}"
MIN_AMOUNT="${MIN_AMOUNT:-5}"
MAX_AMOUNT="${MAX_AMOUNT:-75}"

# Replace the placeholder passwords below.
# You can also override them with environment variables if preferred.
declare -A USER_PASSWORDS=(
  ["sga@thunder.com"]="${SGA_PASSWORD:-admin1234}"
  ["lebron@lakers.com"]="${LEBRON_PASSWORD:-admin1234}"
  ["admin@admin.com"]="${ADMIN_PASSWORD:-admin1234}"
  ["deni@trailblazers.com"]="${DENI_PASSWORD:-admin1234}"
  ["jokic@nuggets.com"]="${JOKIC_PASSWORD:-admin1234}"
  ["luka@lakers.com"]="${LUKA_PASSWORD:-admin1234}"
)

USERS=(
  "sga@thunder.com"
  "lebron@lakers.com"
  "admin@admin.com"
  "deni@trailblazers.com"
  "jokic@nuggets.com"
  "luka@lakers.com"
)

REASONS=(
  "החזר על קפה"
  "חלוקת חשבון צהריים"
  "סתם כי אוהב"
  "נסיעה במונית"
  "תוכניות לסוף השבוע"
  "תשלום חשבונות"
  "נשנושים למשרד"
  "יתרת ארוחת ערב"
  "כרטיסים לאירוע"
  "העברת דמו של Virly"
  "סביח זיסמן"
  "ערב בירה"
  "ארוחה אחרי המשחק"
  "השתתפות בנסיעה"
  "חלוקת מנוי"
  "מתנת יום הולדת"
  "תשלום חניה"
  "חלוקת מלון"
  "ארוחת צוות"
  "החזר"
)

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

json_get() {
  node -e '
    const key = process.argv[1];
    let data = "";

    process.stdin.setEncoding("utf8");

    process.stdin.on("data", chunk => data += chunk);

    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        const value = key.split(".").reduce((acc, part) => acc && acc[part], parsed);

        if (value === undefined || value === null) {
          process.exit(1);
        }

        process.stdout.write(String(value));
      } catch {
        process.exit(1);
      }
    });
  ' "$1"
}

json_escape() {
  node -e '
    const value = process.argv[1];
    process.stdout.write(JSON.stringify(value));
  ' "$1"
}

cookie_from_headers() {
  node -e '
    const fs = require("node:fs");
    const headerFile = process.argv[1];
    const cookieName = process.argv[2];
    const headers = fs.readFileSync(headerFile, "utf8").split(/\r?\n/);

    for (const header of headers) {
      const separatorIndex = header.indexOf(":");
      if (separatorIndex === -1) {
        continue;
      }

      const name = header.slice(0, separatorIndex).toLowerCase();
      if (name !== "set-cookie") {
        continue;
      }

      const cookie = header.slice(separatorIndex + 1).trim().split(";")[0];
      const cookieSeparatorIndex = cookie.indexOf("=");
      if (cookieSeparatorIndex === -1) {
        continue;
      }

      if (cookie.slice(0, cookieSeparatorIndex) === cookieName) {
        process.stdout.write(cookie.slice(cookieSeparatorIndex + 1));
        process.exit(0);
      }
    }

    process.exit(1);
  ' "$1" "$2"
}

login() {
  local email="$1"
  local password="$2"
  local email_json
  local password_json
  local header_file
  local body_file
  local auth_cookie
  local csrf_cookie

  email_json="$(json_escape "$email")"
  password_json="$(json_escape "$password")"
  header_file="$(mktemp "$TMP_DIR/login-headers.XXXXXX")"
  body_file="$(mktemp "$TMP_DIR/login-body.XXXXXX")"

  if ! curl -sS --fail-with-body \
    -D "$header_file" \
    -o "$body_file" \
    -H "Content-Type: application/json" \
    -d "{\"email\":$email_json,\"password\":$password_json}" \
    "${API_BASE_URL%/}/api/auth/login"; then
    echo "Login failed for $email:" >&2
    sed -n '1,120p' "$body_file" >&2
    return 1
  fi

  if ! auth_cookie="$(cookie_from_headers "$header_file" "virly_auth")"; then
    echo "Login for $email did not return the virly_auth cookie." >&2
    sed -n '1,120p' "$body_file" >&2
    return 1
  fi

  if ! csrf_cookie="$(cookie_from_headers "$header_file" "virly_csrf")"; then
    echo "Login for $email did not return the virly_csrf cookie." >&2
    sed -n '1,120p' "$body_file" >&2
    return 1
  fi

  USER_COOKIE_HEADERS["$email"]="virly_auth=$auth_cookie; virly_csrf=$csrf_cookie"
  USER_CSRF_TOKENS["$email"]="$csrf_cookie"
}

random_amount() {
  local range=$((MAX_AMOUNT - MIN_AMOUNT + 1))
  local whole=$((RANDOM % range + MIN_AMOUNT))
  local cents=$((RANDOM % 100))

  printf "%d.%02d" "$whole" "$cents"
}

random_user_index() {
  echo $((RANDOM % ${#USERS[@]}))
}

transfer() {
  local cookie_header="$1"
  local csrf_token="$2"
  local recipient="$3"
  local amount="$4"
  local reason="$5"
  local recipient_json
  local reason_json
  local body_file

  recipient_json="$(json_escape "$recipient")"
  reason_json="$(json_escape "$reason")"
  body_file="$(mktemp "$TMP_DIR/transfer-body.XXXXXX")"

  if ! curl -sS --fail-with-body \
    -o "$body_file" \
    -H "Content-Type: application/json" \
    -H "Cookie: $cookie_header" \
    -H "X-CSRF-Token: $csrf_token" \
    -d "{\"recipientEmail\":$recipient_json,\"amount\":$amount,\"reason\":$reason_json}" \
    "${API_BASE_URL%/}/api/transactions" \
    >/dev/null; then
    echo "Transfer failed:" >&2
    sed -n '1,120p' "$body_file" >&2
    return 1
  fi
}

require_command curl
require_command node

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if (( TRANSACTION_COUNT < 1 )); then
  echo "TRANSACTION_COUNT must be at least 1." >&2
  exit 1
fi

if (( MIN_AMOUNT < 1 || MAX_AMOUNT < MIN_AMOUNT )); then
  echo "Use positive amounts with MAX_AMOUNT >= MIN_AMOUNT." >&2
  exit 1
fi

if (( ${#USERS[@]} < 2 )); then
  echo "At least two users are required." >&2
  exit 1
fi

declare -A USER_COOKIE_HEADERS=()
declare -A USER_CSRF_TOKENS=()

echo "Logging in to $API_BASE_URL..."

for email in "${USERS[@]}"; do
  password="${USER_PASSWORDS[$email]}"

  if [[ "$password" == CHANGE_ME_* ]]; then
    echo "Warning: password for $email is still a placeholder." >&2
  fi

  echo "Logging in: $email"
  login "$email" "$password"
done

echo
echo "Creating $TRANSACTION_COUNT random transactions between ${#USERS[@]} users..."
echo

for ((i = 1; i <= TRANSACTION_COUNT; ++i)); do
  sender_index="$(random_user_index)"
  recipient_index="$(random_user_index)"

  while [[ "$recipient_index" == "$sender_index" ]]; do
    recipient_index="$(random_user_index)"
  done

  sender="${USERS[$sender_index]}"
  recipient="${USERS[$recipient_index]}"
  cookie_header="${USER_COOKIE_HEADERS[$sender]}"
  csrf_token="${USER_CSRF_TOKENS[$sender]}"

  amount="$(random_amount)"
  reason="${REASONS[RANDOM % ${#REASONS[@]}]}"

  printf "[%03d/%03d] %s -> %s: %s (%s)\n" \
    "$i" "$TRANSACTION_COUNT" "$sender" "$recipient" "$amount" "$reason"

  transfer "$cookie_header" "$csrf_token" "$recipient" "$amount" "$reason"
done

echo
echo "Done."
