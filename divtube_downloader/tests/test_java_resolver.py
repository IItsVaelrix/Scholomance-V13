import os
import unittest
import tempfile

from tui.services.agent_service import resolve_java_home


def _make_jdk(root, name):
    """Create a fake JDK layout root/<name>/bin/java and return the home dir."""
    home = os.path.join(root, name)
    bindir = os.path.join(home, "bin")
    os.makedirs(bindir, exist_ok=True)
    java = os.path.join(bindir, "java")
    with open(java, "w") as f:
        f.write("#!/bin/sh\n")
    os.chmod(java, 0o755)
    return home


class TestResolveJavaHome(unittest.TestCase):
    def test_honors_valid_java_home_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = _make_jdk(tmp, "jdk")
            self.assertEqual(resolve_java_home(env={"JAVA_HOME": home}), home)

    def test_ignores_nonexistent_java_home_env(self):
        bogus = "/no/such/redhat.java-1.54.0/jre/21.0.10-linux-x86_64"
        # With no fallbacks available, a dead JAVA_HOME must NOT be returned.
        result = resolve_java_home(env={"JAVA_HOME": bogus, "PATH": ""}, search_globs=[])
        self.assertNotEqual(result, bogus)

    def test_picks_newest_versioned_jdk_from_glob(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_jdk(tmp, "redhat.java-1.54.0/jre/21.0.10-linux-x86_64")
            newest = _make_jdk(tmp, "redhat.java-1.55.0/jre/21.0.11-linux-x86_64")
            globs = [os.path.join(tmp, "redhat.java-*/jre/*")]
            self.assertEqual(
                resolve_java_home(env={"PATH": ""}, search_globs=globs), newest
            )

    def test_falls_back_to_java_on_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = _make_jdk(tmp, "jdk")
            result = resolve_java_home(
                env={"PATH": os.path.join(home, "bin")}, search_globs=[]
            )
            self.assertEqual(result, home)

    def test_returns_none_when_nothing_found(self):
        self.assertIsNone(resolve_java_home(env={"PATH": ""}, search_globs=[]))


if __name__ == "__main__":
    unittest.main()
