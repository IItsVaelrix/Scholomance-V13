import sqlite3
import json
import os

class NicheService:
    def __init__(self, db_path="niche_database.sqlite"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS niches (
                    name TEXT PRIMARY KEY,
                    config TEXT
                )
            ''')
            # Seed default data if empty
            cursor = conn.execute("SELECT COUNT(*) FROM niches")
            if cursor.fetchone()[0] == 0:
                defaults = {
                    "gaming": {
                        "optimal_length_min": 40,
                        "optimal_length_max": 65,
                        "power_words": ["playthrough", "speedrun", "mod", "survived", "100 days", "vs"],
                        "target_uppercase_ratio": 0.30,
                        "baseline_search_terms": ["gameplay", "walkthrough", "funny moments"]
                    },
                    "music": {
                        "optimal_length_min": 20,
                        "optimal_length_max": 50,
                        "power_words": ["official video", "lyric video", "cover", "live", "remix", "ft."],
                        "target_uppercase_ratio": 0.15,
                        "baseline_search_terms": ["official music video", "live performance", "cover song"]
                    },
                    "commentary": {
                        "optimal_length_min": 35,
                        "optimal_length_max": 60,
                        "power_words": ["drama", "response", "apology", "exposed", "truth", "why", "ruined"],
                        "target_uppercase_ratio": 0.25,
                        "baseline_search_terms": ["video essay", "commentary", "drama"]
                    }
                }
                for name, config in defaults.items():
                    conn.execute("INSERT INTO niches (name, config) VALUES (?, ?)", (name, json.dumps(config)))
                
    def list_niches(self):
        """Return the names of every stored niche (alphabetical)."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT name FROM niches ORDER BY name")
            return [row[0] for row in cursor]

    def get_niche(self, name):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT config FROM niches WHERE name = ? COLLATE NOCASE", (name,))
            row = cursor.fetchone()
            if row:
                return row[0]
            return "{}"

    def export_pack(self, filename):
        if not filename.endswith(".nichepack"):
            filename += ".nichepack"
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT name, config FROM niches")
            data = {row[0]: json.loads(row[1]) for row in cursor}
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        return len(data)

    def import_pack(self, filename):
        if not filename.endswith(".nichepack"):
            filename += ".nichepack"
        if not os.path.exists(filename):
            raise FileNotFoundError(f"{filename} not found.")
        with open(filename, 'r') as f:
            data = json.load(f)
        
        with sqlite3.connect(self.db_path) as conn:
            for name, config in data.items():
                conn.execute("INSERT OR REPLACE INTO niches (name, config) VALUES (?, ?)", (name, json.dumps(config)))
        return len(data)
