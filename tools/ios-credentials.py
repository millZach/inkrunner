"""Prepare Apple signing files on Windows or macOS; send credentials to GitHub via stdin."""
import argparse
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / ".apple"
REPO = "millZach/inkrunner"
BUNDLE_ID = json.loads((ROOT / "capacitor.config.json").read_text())["appId"]
CI_VALUES = ("IOS_TEAM_ID", "IOS_CERTIFICATE_BASE64", "IOS_CERTIFICATE_PASSWORD",
             "IOS_PROFILE_BASE64", "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY")


def run(args, *, data=None):
    result = subprocess.run([str(arg) for arg in args], input=data, capture_output=True)
    if result.returncode:
        # OpenSSL and gh error messages do not contain the supplied stdin credentials.
        raise RuntimeError(f"{Path(str(args[0])).name} failed: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout


def openssl():
    path = os.environ.get("OPENSSL_PATH") or shutil.which("openssl")
    if not path and os.name == "nt":
        candidate = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/usr/bin/openssl.exe"
        if candidate.exists():
            path = str(candidate)
    if not path:
        raise RuntimeError("OpenSSL is required. Git for Windows includes it; alternatively set OPENSSL_PATH.")
    return path


def private_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content if isinstance(content, bytes) else content.encode())
    if os.name != "nt":
        path.chmod(0o600)


def validate_profile(profile, team_id, certificate=None):
    if profile.get("TeamIdentifier") != [team_id]:
        raise ValueError("Provisioning profile belongs to a different Apple team.")
    entitlements = profile.get("Entitlements", {})
    if not entitlements.get("application-identifier", "").endswith("." + BUNDLE_ID):
        raise ValueError(f"Provisioning profile must be for {BUNDLE_ID}.")
    if entitlements.get("get-task-allow") or "ProvisionedDevices" in profile or profile.get("ProvisionsAllDevices"):
        raise ValueError("Use an App Store Connect distribution profile, not a development, ad hoc, or enterprise profile.")
    expiry = profile.get("ExpirationDate")
    if not expiry or expiry.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise ValueError("Provisioning profile is expired.")
    if certificate is not None and certificate not in profile.get("DeveloperCertificates", []):
        raise ValueError("Provisioning profile does not include this distribution certificate.")
    if not re.fullmatch(r"[A-Fa-f0-9-]{36}", profile.get("UUID", "")):
        raise ValueError("Provisioning profile UUID is missing or invalid.")


def prepare():
    key = PRIVATE / "signing.key"
    password = PRIVATE / "key-password.txt"
    request = PRIVATE / "inkrunner.csr"
    if key.exists() != password.exists():
        raise RuntimeError("Incomplete existing signing key. Recover its password before continuing.")
    if not key.exists():
        private_write(password, secrets.token_urlsafe(32))
        run([openssl(), "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
             "-aes-256-cbc", "-pass", f"file:{password}", "-out", key])
        if os.name != "nt":
            key.chmod(0o600)
    if not request.exists():
        run([openssl(), "req", "-new", "-sha256", "-key", key, "-passin", f"file:{password}",
             "-subj", "/CN=INKRUNNER Distribution", "-out", request])
    run([openssl(), "req", "-in", request, "-verify", "-noout"])
    print(f"Certificate request: {request}\nBundle ID: {BUNDLE_ID}\nPrivate signing files stay in the Git-ignored .apple folder.")


def configure(args):
    if not re.fullmatch(r"[A-Z0-9]{10}", args.team_id):
        raise ValueError("Team ID must be 10 uppercase letters or digits.")
    if not re.fullmatch(r"[A-Z0-9]{10}", args.key_id):
        raise ValueError("API Key ID must be 10 uppercase letters or digits.")
    if not re.fullmatch(r"[A-Fa-f0-9-]{36}", args.issuer_id):
        raise ValueError("Use the Issuer ID from a team App Store Connect API key.")
    certificate = Path(args.certificate or PRIVATE / "signing.cer").resolve()
    profile = Path(args.profile or PRIVATE / "profile.mobileprovision").resolve()
    api_key = Path(args.api_key or PRIVATE / f"AuthKey_{args.key_id}.p8").resolve()
    certificate_der = certificate.read_bytes()
    profile_bytes = profile.read_bytes()
    key_bytes = api_key.read_bytes()
    profile_xml = run([openssl(), "cms", "-verify", "-inform", "DER", "-noverify", "-in", profile])
    validate_profile(plistlib.loads(profile_xml), args.team_id, certificate_der)
    pem = PRIVATE / "certificate.pem"
    private_write(pem, run([openssl(), "x509", "-inform", "DER", "-in", certificate, "-outform", "PEM"]))
    run([openssl(), "x509", "-in", pem, "-checkend", "0", "-noout"])
    run([openssl(), "pkey", "-in", api_key, "-check", "-noout"])
    key_public = run([openssl(), "pkey", "-in", PRIVATE / "signing.key", "-passin",
                      f"file:{PRIVATE / 'key-password.txt'}", "-pubout"])
    cert_public = run([openssl(), "x509", "-in", pem, "-pubkey", "-noout"])
    if key_public.strip() != cert_public.strip():
        raise ValueError("Certificate does not match this computer's signing request.")
    p12_password_path = PRIVATE / "p12-password.txt"
    if not p12_password_path.exists():
        private_write(p12_password_path, secrets.token_urlsafe(32))
    p12 = PRIVATE / "distribution.p12"
    run([openssl(), "pkcs12", "-export", "-inkey", PRIVATE / "signing.key", "-passin",
         f"file:{PRIVATE / 'key-password.txt'}", "-in", pem, "-out", p12,
         "-passout", f"file:{p12_password_path}"])
    values = {
        "IOS_CERTIFICATE_BASE64": base64.b64encode(p12.read_bytes()),
        "IOS_CERTIFICATE_PASSWORD": p12_password_path.read_bytes(),
        "IOS_PROFILE_BASE64": base64.b64encode(profile_bytes),
        "ASC_KEY_ID": args.key_id.encode(),
        "ASC_ISSUER_ID": args.issuer_id.encode(),
        "ASC_PRIVATE_KEY": key_bytes,
    }
    run(["gh", "auth", "status"])
    for name, value in values.items():
        run(["gh", "secret", "set", name, "--repo", REPO], data=value)
        print(f"Saved GitHub secret: {name}")
    run(["gh", "variable", "set", "IOS_TEAM_ID", "--repo", REPO, "--body", args.team_id])
    print(f"Configured signing for {BUNDLE_ID}. No private key contents were printed or committed.")


def check_ci():
    missing = [name for name in CI_VALUES if not os.environ.get(name)]
    if missing:
        raise RuntimeError("Missing GitHub signing configuration: " + ", ".join(missing))
    if not re.fullmatch(r"[A-Z0-9]{10}", os.environ["IOS_TEAM_ID"]):
        raise ValueError("Invalid IOS_TEAM_ID.")
    print("All required signing values are present.")


def install_ci():
    check_ci()
    folder = Path(os.environ["RUNNER_TEMP"]) / "inkrunner-signing"
    folder.mkdir(parents=True, exist_ok=True)
    private_write(folder / "distribution.p12", base64.b64decode(os.environ["IOS_CERTIFICATE_BASE64"], validate=True))
    private_write(folder / "profile.mobileprovision", base64.b64decode(os.environ["IOS_PROFILE_BASE64"], validate=True))
    private_write(folder / f"AuthKey_{os.environ['ASC_KEY_ID']}.p8", os.environ["ASC_PRIVATE_KEY"])
    profile_xml = run(["security", "cms", "-D", "-i", folder / "profile.mobileprovision"])
    profile = plistlib.loads(profile_xml)
    validate_profile(profile, os.environ["IOS_TEAM_ID"])
    uuid = profile["UUID"]
    destination = Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles" / f"{uuid}.mobileprovision"
    destination.parent.mkdir(parents=True, exist_ok=True)
    private_write(destination, (folder / "profile.mobileprovision").read_bytes())
    private_write(folder / "installed-profile", str(destination))
    # Configure the App target only; Swift package frameworks do not use app provisioning profiles.
    project = ROOT / "ios/App/App.xcodeproj/project.pbxproj"
    source = project.read_text()
    pattern = r'(504EC3181FED79650016851F /\* Release \*/ = \{.*?buildSettings = \{)(.*?)(\n\s*\};)'
    match = re.search(pattern, source, re.S)
    if not match:
        raise RuntimeError("App Release configuration was not found.")
    settings = re.sub(r'CODE_SIGN_STYLE = Automatic;', 'CODE_SIGN_STYLE = Manual;', match[2])
    settings = re.sub(r'\n\s*(DEVELOPMENT_TEAM|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER) = [^;]*;', '', settings)
    settings += (f'\n\t\t\t\tDEVELOPMENT_TEAM = {os.environ["IOS_TEAM_ID"]};'
                 f'\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";'
                 f'\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{uuid}";')
    project.write_text(source[:match.start()] + match[1] + settings + match[3] + source[match.end():])
    export = {"method": "app-store-connect", "destination": "upload", "signingStyle": "manual",
              "teamID": os.environ["IOS_TEAM_ID"], "signingCertificate": "Apple Distribution",
              "provisioningProfiles": {BUNDLE_ID: uuid}, "manageAppVersionAndBuildNumber": False,
              "uploadSymbols": True}
    private_write(folder / "ExportOptions.plist", plistlib.dumps(export))
    print("Provisioning profile validated and installed; App Release signing configured.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare")
    setup = commands.add_parser("configure")
    setup.add_argument("--team-id", required=True)
    setup.add_argument("--key-id", required=True)
    setup.add_argument("--issuer-id", required=True)
    for name in ("certificate", "profile", "api-key"):
        setup.add_argument("--" + name)
    commands.add_parser("check-ci")
    commands.add_parser("install-ci")
    args = parser.parse_args()
    {"prepare": prepare, "configure": lambda: configure(args),
     "check-ci": check_ci, "install-ci": install_ci}[args.command]()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        sys.exit(str(error))
