import unittest

from tui.services.agent_service import (
    parse_download_args,
    build_agent_inputs,
    parse_progress_line,
)


class TestParseDownloadArgs(unittest.TestCase):
    URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"

    def test_plain_url_is_video(self):
        self.assertEqual(parse_download_args([self.URL]), (self.URL, False))

    def test_audio_flag_after_url(self):
        self.assertEqual(parse_download_args([self.URL, "--audio"]), (self.URL, True))

    def test_audio_flag_before_url(self):
        self.assertEqual(parse_download_args(["--audio", self.URL]), (self.URL, True))

    def test_mp3_and_short_aliases(self):
        self.assertEqual(parse_download_args([self.URL, "--mp3"]), (self.URL, True))
        self.assertEqual(parse_download_args([self.URL, "-a"]), (self.URL, True))

    def test_empty_args(self):
        self.assertEqual(parse_download_args([]), ("", False))


class TestBuildAgentInputs(unittest.TestCase):
    def test_video_download_includes_rights_confirmation(self):
        # option 2 (video) must answer the y/n rights prompt
        self.assertEqual(build_agent_inputs("2", "URL"), "2\nURL\ny\n3\n")

    def test_audio_download_includes_rights_confirmation(self):
        # option 6 (audio) follows the same prompt sequence as video
        self.assertEqual(build_agent_inputs("6", "URL"), "6\nURL\ny\n3\n")

    def test_non_download_has_no_rights_prompt(self):
        self.assertEqual(build_agent_inputs("1", "URL"), "1\nURL\n3\n")


class TestParseProgressLine(unittest.TestCase):
    def test_parses_percent_speed_eta(self):
        self.assertEqual(
            parse_progress_line("Progress: 6.1% | 14.45MiB/s | 00:00"),
            (6.1, "14.45MiB/s", "00:00"),
        )

    def test_parses_unknown_speed(self):
        self.assertEqual(
            parse_progress_line("Progress: 0.4% | Unknown B/s | Unknown"),
            (0.4, "Unknown B/s", "Unknown"),
        )

    def test_parses_with_log_prefix(self):
        # The line reaches us with a "> " markup prefix stripped upstream, but
        # search() must still find it even if surrounded by other text.
        self.assertEqual(
            parse_progress_line("> Progress: 100.0% | 4.41MiB/s | 00:00"),
            (100.0, "4.41MiB/s", "00:00"),
        )

    def test_non_progress_line_returns_none(self):
        self.assertIsNone(parse_progress_line("=== DivTube Menu ==="))
        self.assertIsNone(parse_progress_line(""))


if __name__ == "__main__":
    unittest.main()
