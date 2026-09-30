"""Runtime settings, read from the environment once."""
import os
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("ML_MODELS_DIR", ML_ROOT / "models"))

# Below this many bookings of history for a category, a forecast is marked
# cold_start and comes from a plain seasonal baseline, not a trained model.
MIN_SOCIETY_BOOKINGS = int(os.environ.get("MIN_SOCIETY_BOOKINGS", "50"))

# Fewest distinct days of data a category needs before train.py will fit it.
MIN_TRAIN_DAYS = int(os.environ.get("MIN_TRAIN_DAYS", "60"))

# Shared secret with the Node API. Unset means every non-health route is
# refused, so a misconfigured deploy is closed rather than open.
def service_token() -> str:
    return os.environ.get("ML_SERVICE_TOKEN", "")
