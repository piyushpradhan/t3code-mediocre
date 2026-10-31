#!/usr/bin/env bash
# Fork-only: create the self-signed macOS code-signing certificate that release-fork.yml
# signs with, and store it as repo secrets. Rotating it breaks in-app updates once:
# every installed copy must be reinstalled by hand to pick up the new certificate.
set -euo pipefail

dir="${1:-$HOME/.config/t3code-fork-signing}"
openssl=/opt/homebrew/bin/openssl
mkdir -p "$dir" && chmod 700 "$dir" && cd "$dir"
[[ -e cert.p12 ]] && { echo "$dir/cert.p12 exists; delete it to rotate." >&2; exit 1; }

"$openssl" req -x509 -newkey rsa:2048 -nodes -days 7300 -keyout key.pem -out cert.pem \
  -subj "/CN=T3 Code Fork Self-Signed" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning"
"$openssl" rand -hex 24 | tr -d '\n' > password.txt
# -legacy: macOS `security import` cannot read OpenSSL 3's default PKCS#12 encryption.
"$openssl" pkcs12 -export -legacy -inkey key.pem -in cert.pem -name "T3 Code Fork Self-Signed" \
  -out cert.p12 -passout "file:password.txt"
rm key.pem && chmod 600 ./*

base64 -i cert.p12 | gh secret set FORK_MAC_SIGNING_P12_BASE64 -R piyushpradhan/t3code-mediocre
gh secret set FORK_MAC_SIGNING_P12_PASSWORD -R piyushpradhan/t3code-mediocre < password.txt
echo "Stored secrets. Keep $dir/cert.p12 and password.txt backed up."
