import stat

from tui.remote.tls import ensure_local_certificate


def test_local_certificate_is_stable_owner_only_and_tls_enabled(tmp_path):
    first = ensure_local_certificate(tmp_path, "127.0.0.1")
    second = ensure_local_certificate(tmp_path, "127.0.0.1")

    assert first.fingerprint == second.fingerprint
    assert len(first.fingerprint.split(":")) == 32
    assert stat.S_IMODE(first.key_path.stat().st_mode) == 0o600
    assert stat.S_IMODE(first.certificate_path.stat().st_mode) == 0o600
    assert first.context is not None


def test_mismatched_key_and_certificate_are_regenerated(tmp_path):
    first = ensure_local_certificate(tmp_path, "127.0.0.1")
    first.key_path.write_text("not a key", encoding="utf-8")

    second = ensure_local_certificate(tmp_path, "127.0.0.1")

    assert second.key_path.read_text(encoding="utf-8").startswith("-----BEGIN PRIVATE KEY-----")
    assert second.fingerprint != first.fingerprint


def test_wildcard_bind_certificate_covers_the_lan_address_it_advertises(tmp_path):
    """Regression: the gateway binds 0.0.0.0 and the pairing URI hands the
    phone this machine's LAN IP — but the certificate used to be issued for
    loopback only, so a client dialling the LAN address rejected it during
    hostname verification (the Android companion pins the fingerprint AND
    leaves normal hostname verification in force). The SAN must cover the
    same address the pairing URI advertises, or pairing fails at TLS with
    the address, port, and fingerprint all correct."""
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization

    from tui.remote.net import lan_ipv4

    identity = ensure_local_certificate(tmp_path, "0.0.0.0")
    certificate = x509.load_pem_x509_certificate(identity.certificate_path.read_bytes())
    san = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    addresses = {str(ip) for ip in san.get_values_for_type(x509.IPAddress)}

    assert "127.0.0.1" in addresses
    advertised = lan_ipv4()
    if advertised:
        assert advertised in addresses, (
            f"certificate covers {addresses} but the pairing URI advertises {advertised}"
        )
