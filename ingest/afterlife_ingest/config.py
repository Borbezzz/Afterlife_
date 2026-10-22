import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

DATA_DIR = REPO_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
PROJECTS_JSON = DATA_DIR / "projects.json"

# Keep Cognee's local graph/vector stores in the repo (gitignored), not inside .venv.
os.environ.setdefault("SYSTEM_ROOT_DIRECTORY", str(DATA_DIR / "cognee" / "system"))
os.environ.setdefault("DATA_ROOT_DIRECTORY", str(DATA_DIR / "cognee" / "data"))
RUNS_LOG = DATA_DIR / "agent_runs.jsonl"

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
COGNEE_DATASET = os.getenv("COGNEE_DATASET", "afterlife")

# A hackathon counts as London if its title or venue mentions one of these.
LONDON_MARKERS = [
    m.strip().lower()
    for m in os.getenv(
        "LONDON_MARKERS",
        "london,shoreditch,waterloo,qmul,ucl,imperial college,king's cross,kings cross,"
        "newspeak house,canary wharf,southwark,camden,hackney,islington,westminster",
    ).split(",")
    if m.strip()
]
