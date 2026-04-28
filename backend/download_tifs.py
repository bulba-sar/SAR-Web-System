import os
import shutil
import gdown

_HERE = os.path.dirname(__file__)
TIF_DIR     = os.path.join(_HERE, "tif")
BASEMAP_DIR = os.path.join(_HERE, "basemap")
os.makedirs(TIF_DIR,     exist_ok=True)
os.makedirs(BASEMAP_DIR, exist_ok=True)

GDRIVE_FOLDER_ID = "1Az2HZscFSjYt1OsVjBuUrZwfMulY1oAZ"

SAR_FILES = [
    "2021-Jan-Jun.tif", "2021-Jul-Dec.tif",
    "2022-Jan-Jun.tif", "2022-Jul-Dec.tif",
    "2023-Jan-Jun.tif", "2023-Jul-Dec.tif",
    "2024-Jan-Jun.tif", "2024-Jul-Dec.tif",
    "2025-Jan-Jun.tif", "2025-Jul-Dec.tif",
]
BASEMAP_FILE = "basemap.tif"

def all_files_present():
    sar_ok     = all(os.path.exists(os.path.join(TIF_DIR, f)) for f in SAR_FILES)
    basemap_ok = os.path.exists(os.path.join(BASEMAP_DIR, BASEMAP_FILE))
    return sar_ok and basemap_ok

def download_all():
    if all_files_present():
        print("All .tif files already downloaded")
        return

    missing_sar = [f for f in SAR_FILES if not os.path.exists(os.path.join(TIF_DIR, f))]
    basemap_missing = not os.path.exists(os.path.join(BASEMAP_DIR, BASEMAP_FILE))
    total = len(missing_sar) + (1 if basemap_missing else 0)
    print(f"Downloading {total} missing .tif file(s) from Google Drive...")

    gdown.download_folder(
        id=GDRIVE_FOLDER_ID,
        output=TIF_DIR,
        quiet=False,
        remaining_ok=True,  # Comment out if tif files are not yet installed
    )

    # basemap.tif belongs in backend/basemap/, not backend/tif/
    basemap_in_tif = os.path.join(TIF_DIR, BASEMAP_FILE)
    basemap_dest   = os.path.join(BASEMAP_DIR, BASEMAP_FILE)
    if os.path.exists(basemap_in_tif):
        if not os.path.exists(basemap_dest):
            shutil.move(basemap_in_tif, basemap_dest)
            print("Moved basemap.tif to backend/basemap/")
        else:
            os.remove(basemap_in_tif)

    print("Download complete.")

if __name__ == "__main__":
    download_all()
