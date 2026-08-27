"""Local self-signed TLS identity used only by the companion gateway."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import ipaddress
import os
from pathlib import Path
import socket
import ssl

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from tui.remote.net import lan_ipv4


@dataclass(frozen=True)
class TLSIdentity:
    context: ssl.SSLContext
    fingerprint: str
    certificate_path: Path
    key_path: Path


def ensure_local_certificate(state_dir: str | Path, bind_host: str = "127.0.0.1") -> TLSIdentity:
    directory = Path(state_dir)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    certificate_path = directory / "companion.crt"
    key_path = directory / "companion.key"
    try:
        certificate = x509.load_pem_x509_certificate(certificate_path.read_bytes())
        key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
        if certificate.public_key().public_numbers() != key.public_key().public_numbers():
            raise ValueError("certificate/key mismatch")
    except (OSError, ValueError, TypeError):
        certificate, key = _create_identity(bind_host)
        certificate_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        key_path.write_bytes(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
    os.chmod(certificate_path, 0o600)
    os.chmod(key_path, 0o600)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certificate_path, key_path)
    digest = hashlib.sha256(certificate.public_bytes(serialization.Encoding.DER)).hexdigest().upper()
    return TLSIdentity(context, ":".join(digest[index:index + 2] for index in range(0, len(digest), 2)), certificate_path, key_path)


def _create_identity(bind_host: str):
    key = ec.generate_private_key(ec.SECP256R1())
    hostname = socket.gethostname() or "divtube-cockpit"
    names: list[x509.GeneralName] = [x509.DNSName(hostname), x509.DNSName("localhost")]
    try:
        if bind_host in {"0.0.0.0", "::"}:
            # Binding a wildcard means the gateway is reachable on this
            # machine's LAN address, and that is the address the pairing URI
            # hands the phone. The certificate has to actually cover it:
            # clients verify the hostname/IP they dialled against the SAN
            # (the Android companion pins the fingerprint AND leaves normal
            # hostname verification in force), so a certificate listing only
            # 127.0.0.1 is rejected the moment the connection is made over
            # the LAN — pairing fails at TLS even though the address, port,
            # and fingerprint are all correct.
            lan_address = lan_ipv4()
            if lan_address:
                names.append(x509.IPAddress(ipaddress.ip_address(lan_address)))
            names.append(x509.IPAddress(ipaddress.ip_address("127.0.0.1")))
        else:
            names.append(x509.IPAddress(ipaddress.ip_address(bind_host)))
    except ValueError:
        names.append(x509.DNSName(bind_host))
    now = datetime.now(timezone.utc)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "DivTube Cockpit")])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(names), critical=False)
        .sign(key, hashes.SHA256())
    )
    return certificate, key
