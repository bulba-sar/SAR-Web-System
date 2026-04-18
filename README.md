# SAR-Web-System

## Thesis Structure
```
Workflow-Checker/
├── backend/
│   ├── tif/                        #
│   ├── main.py                     # 
│   ├── admin.py                    # 
│   ├── auth.py                     # 
│   ├── build_overviews.py          #
│   ├── database.py                 #
│   ├── fix_tif_nodata.py           #
│   ├── models.py                   #
│   ├── credentials.json            #
│   ├── model_metrics.json          #
│   └── requirements.txt            # Python dependencies
├── frontend/                       
│   ├── src/
│       ├── components/
│       │   ├── admin.jsx           #
│       │   ├── analysis.jsx        #
│       │   ├── filter-panel.jsx    #
│       │   ├── map.jsx             #
│       │   ├── profile.jsx         #
│       │   └── sidebar.jsx         #
│       ├── App.css                 #
│       └── App.js                  #
├── compute_model_metrics.py        #
└── README.md                       # Project Documentation
```

## How to Push and Pull in Github

```bash
#----------------- PUSH ------------------
#Create repo on Github
#Then run:
cd SAR-Web-System
git remote add origin https://github.com/bulba-sar/SAR-Web-System.git #Only if you are not sure what repo you are pushing at
git add .
git commit -m "Comment"
git push
```
```bash
#----------------- PULL ------------------
#if you have changes in your local code but wants to pull the new updated code from github
git stash 
git pull
git stash pop
```

## How to Run Locally

```bash
# You will need 2 terminals for the backend and frontend

#----------------- TERMINAL 1  ------------------
# BACKEND
cd SAR-Web-System/backend
py -m venv .venv # skip is venv is already installed
.\.venv\Scripts\actvate
pip install -r requirements.txt # skip is python llibraries are already installed
uvicorn main:app --reload

#----------------- TERMINAL 2  ------------------
# FRONTEND
cd SAR-Web-System/frontend
py -m venv .venv # skip is venv is already installed / skip if venv is not used
.\.venv\Scripts\actvate # skip if venv is not used
npm start 
```

## Installing Git LFS (Large File Storage)
This is for the basedmap since the file is 400mb
**Download here:**  `git-lfs.com`

```bash
git lfs install
git lfs track "backend/tif/*.tif"
```

### ENV Configurations
| Secret Name | Description |
```
| `DATABASE_URL` | SUPABASE Url |
| `JWT_SECRET_KEY` | IDK This |
```
