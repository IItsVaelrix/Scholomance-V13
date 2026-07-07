import sys
import os

from tui.services.tool_service import ToolService

ts = ToolService()
print("LIST DIR:", ts._list_directory({}, None))
print("ARCHIVE SEARCH:", ts._archive_search({"query": "opencode"}, None))
