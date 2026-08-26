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
