import unittest

from tui.ui.widgets.resize_handle import clamp_height


class TestClampHeight(unittest.TestCase):
    def test_within_bounds(self):
        self.assertEqual(clamp_height(10, 3, 40), 10)

    def test_below_min(self):
        self.assertEqual(clamp_height(1, 3, 40), 3)

    def test_above_max(self):
        self.assertEqual(clamp_height(99, 3, 40), 40)


if __name__ == "__main__":
    unittest.main()
