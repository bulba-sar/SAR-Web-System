"""
Download SAR .tif files from Google Drive to backend/tif/.
Run this once on each machine before starting the backend:

    python backend/download_tifs.py

Requires: pip install gdown
The Google Drive folder must be set to "Anyone with the link can view".
"""

import os
import gdown

TIF_DIR = os.path.join(os.path.dirname(__file__), "tif")
os.makedirs(TIF_DIR, exist_ok=True)

GDRIVE_FOLDER_ID = "1Az2HZscFSjYt1OsVjBuUrZwfMulY1oAZ"

EXPECTED_FILES = [
    "2021-Jan-Jun.tif", "2021-Jul-Dec.tif",
    "2022-Jan-Jun.tif", "2022-Jul-Dec.tif",
    "2023-Jan-Jun.tif", "2023-Jul-Dec.tif",
    "2024-Jan-Jun.tif", "2024-Jul-Dec.tif",
    "2025-Jan-Jun.tif", "2025-Jul-Dec.tif",
    "basemap.tif",
]

def all_files_present():
    return all(os.path.exists(os.path.join(TIF_DIR, f)) for f in EXPECTED_FILES)

def download_all():
    if all_files_present():
        print("All .tif files already present — skipping download.")
        return

    missing = [f for f in EXPECTED_FILES if not os.path.exists(os.path.join(TIF_DIR, f))]
    print(f"Downloading {len(missing)} missing .tif file(s) from Google Drive...")

    gdown.download_folder(
        id=GDRIVE_FOLDER_ID,
        output=TIF_DIR,
        quiet=False,
        remaining_ok=True,
    )
    print("Download complete.")

if __name__ == "__main__":
    download_all()
