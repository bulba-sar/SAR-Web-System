import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import bcrypt as _bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import models
from database import get_db

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is not set. Copy backend/.env.example to backend/.env and fill in your values.")

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7
RESET_TOKEN_EXPIRE_MINUTES = 15

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _truncate(password: str) -> bytes:
    """bcrypt only processes the first 72 bytes — truncate at byte boundary safely."""
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    hashed = _bcrypt.hashpw(_truncate(password), _bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(_truncate(plain), hashed.encode("utf-8"))


def create_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def create_reset_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "purpose": "password_reset"},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def verify_reset_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid reset link")
        return int(payload["sub"])
    except JWTError:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")


def send_reset_email(to_email: str, reset_url: str) -> None:
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        raise RuntimeError("SMTP credentials (SMTP_USER / SMTP_PASS) are not configured in backend/.env")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your Sakahang Lupa password"
    msg["From"] = f"Sakahang Lupa <{smtp_user}>"
    msg["To"] = to_email

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px;">
      <h2 style="color:#23432f;margin-bottom:8px;">Reset your password</h2>
      <p style="color:#52525b;font-size:14px;line-height:1.6;">
        We received a request to reset the password for your Sakahang Lupa account.
        Click the button below to choose a new password. This link expires in
        <strong>{RESET_TOKEN_EXPIRE_MINUTES} minutes</strong>.
      </p>
      <a href="{reset_url}"
         style="display:inline-block;margin:24px 0;padding:12px 28px;background:#3f7b56;color:#fff;
                border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
        Reset Password
      </a>
      <p style="color:#a1a1aa;font-size:12px;">
        If you did not request this, you can safely ignore this email.<br>
        The link above will only work once and expires in {RESET_TOKEN_EXPIRE_MINUTES} minutes.
      </p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, to_email, msg.as_string())


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
