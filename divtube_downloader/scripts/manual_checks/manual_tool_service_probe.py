"""Manual probe: exercise ToolService's filesystem tools against the real tree.

Not a pytest test -- it reads the live working copy and prints real paths. Run
from the module root:

    python -m scripts.manual_checks.manual_tool_service_probe

Was `test_tools.py` at the module root, where merely *collecting* it cost
4.7-6.2 seconds: `ToolService()` is constructed at import time, and the two
probe calls run at import time too, before a single test has been selected.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from tui.services.tool_service import ToolService

ts = ToolService()
print("LIST DIR:", ts._list_directory({}, None))
print("ARCHIVE SEARCH:", ts._archive_search({"query": "opencode"}, None))
