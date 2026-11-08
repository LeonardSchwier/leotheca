"""Guards for snap/snapcraft.yaml, which no CI job builds.

Text checks only (no YAML dependency): the snap must not request the network
plug, and the Node.js toolchain must come from a hash-verified archive, never
from a piped installer script.
"""

import pathlib
import re
import unittest

SNAP = pathlib.Path(__file__).resolve().parent.parent / "snap" / "snapcraft.yaml"


class TestSnapcraft(unittest.TestCase):
    def setUp(self):
        self.text = SNAP.read_text(encoding="utf-8")

    def test_no_network_plug(self):
        self.assertIsNone(re.search(r"^\s*-\s*network\s*$", self.text, re.M))

    def test_no_piped_installer(self):
        self.assertIsNone(re.search(r"\|\s*(ba)?sh\b", self.text))

    def test_node_archive_is_hash_verified(self):
        self.assertIn("sha256sum -c", self.text)
        self.assertGreaterEqual(len(re.findall(r"\b[0-9a-f]{64}\b", self.text)), 2)

    def test_rust_comes_from_the_rustup_snap(self):
        # override-build calls `rustup`; without build-snaps the builder has none.
        self.assertRegex(self.text, r"build-snaps:\s*\[\s*rustup\s*\]")


if __name__ == "__main__":
    unittest.main()
