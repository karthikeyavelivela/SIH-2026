"""Calendar features for demand forecasting: holidays and crop seasons.

Both tables are checked in and their sources are stated. Neither is
complete, and the gaps are named here rather than filled with guesses.
"""
from datetime import date

# FIXED-DATE public holidays, the same every year.
# Source: Government of India gazetted national holidays (Republic Day,
# Independence Day, Gandhi Jayanti) and widely observed fixed-date days
# (Ambedkar Jayanti, Christmas, AP Formation Day is NOT included because the
# state observance date is set by notification each year).
FIXED_HOLIDAYS = {
    (1, 26): "Republic Day",
    (4, 14): "Dr. B. R. Ambedkar Jayanti",
    (8, 15): "Independence Day",
    (10, 2): "Gandhi Jayanti",
    (12, 25): "Christmas",
}

# LUNAR and movable festivals (Ugadi, Sankranti observances, Diwali, Eid,
# Dasara and others) change date every year. They must come from the Andhra
# Pradesh government's published holiday list for each year and are NOT
# guessed here. Add them as ISO dates; see HUMAN INPUT NEEDED in
# BUILD_PROGRESS.md. Until filled, only FIXED_HOLIDAYS affect the flag.
MOVABLE_HOLIDAYS: set[str] = set()

HOLIDAY_SOURCE = (
    "Fixed-date national holidays checked in (see FIXED_HOLIDAYS). Movable "
    "festivals are not included until the AP government holiday list is added."
)

# Crop seasons. General Indian agricultural season definitions:
# Kharif: sown with the monsoon, harvested roughly Oct-Nov (here Jun-Oct);
# Rabi: sown Oct-Nov, harvested Feb-Apr (here Nov-Mar).
# Source: Indian Council of Agricultural Research / Department of
# Agriculture season definitions. Exact Andhra Pradesh sowing and harvest
# windows differ by district and crop and should be confirmed with the AP
# Department of Agriculture; these month ranges are the coarse national
# definition, not AP-specific data.
KHARIF_MONTHS = {6, 7, 8, 9, 10}
RABI_MONTHS = {11, 12, 1, 2, 3}

CROP_SEASON_SOURCE = (
    "Coarse national Kharif (Jun-Oct) / Rabi (Nov-Mar) definitions; "
    "AP-specific windows to be confirmed with the AP Department of Agriculture."
)


def is_holiday(d: date) -> int:
    return int((d.month, d.day) in FIXED_HOLIDAYS or d.isoformat() in MOVABLE_HOLIDAYS)


def is_kharif(d: date) -> int:
    return int(d.month in KHARIF_MONTHS)


def is_rabi(d: date) -> int:
    return int(d.month in RABI_MONTHS)
