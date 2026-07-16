"""
Email service using Resend API.
If RESEND_API_KEY is unset, delivery is disabled without logging recipients or links.
"""

import resend
from config import Settings
from utils.logger import setup_logger
from utils.observability import record_email

logger = setup_logger(__name__)
_settings = Settings()

if _settings.RESEND_API_KEY:
    resend.api_key = _settings.RESEND_API_KEY


def _send(operation: str, to: str, subject: str, html: str) -> bool:
    if not _settings.RESEND_API_KEY:
        record_email(operation, "disabled")
        logger.warning(
            "Email delivery is disabled",
            extra={
                "event_name": "email.delivery.disabled",
                "email_operation": operation,
                "outcome": "disabled",
            },
        )
        return False
    try:
        resend.Emails.send({"from": _settings.EMAIL_FROM, "to": to, "subject": subject, "html": html})
        record_email(operation, "success")
        logger.info(
            "Email delivered",
            extra={
                "event_name": "email.delivery.completed",
                "email_operation": operation,
                "outcome": "success",
            },
        )
        return True
    except Exception:
        record_email(operation, "error")
        logger.exception(
            "Email delivery failed",
            extra={
                "event_name": "email.delivery.failed",
                "email_operation": operation,
                "outcome": "error",
            },
        )
        return False


def send_password_reset(to: str, reset_url: str) -> None:
    _send(
        operation="password_reset",
        to=to,
        subject="Reset your password — TTRPG System",
        html=(
            "<p>You requested a password reset.</p>"
            f'<p><a href="{reset_url}">Reset your password</a> — expires in 15 minutes.</p>'
            "<p>If you didn't request this, ignore this email.</p>"
        ),
    )


def send_password_changed(to: str) -> None:
    _send(
        operation="password_changed",
        to=to,
        subject="Your password was changed — TTRPG System",
        html=(
            "<p>Your account password was just changed.</p>"
            "<p>If this wasn't you, contact support immediately.</p>"
        ),
    )


def send_email_change_verify(to_new: str, verify_url: str) -> None:
    _send(
        operation="email_change_verify",
        to=to_new,
        subject="Verify your new email — TTRPG System",
        html=(
            "<p>Click the link below to confirm your new email address.</p>"
            f'<p><a href="{verify_url}">Verify email</a> — expires in 24 hours.</p>'
        ),
    )


def send_email_change_notify(to_old: str) -> None:
    _send(
        operation="email_change_notify",
        to=to_old,
        subject="Email change requested — TTRPG System",
        html=(
            "<p>A request was made to change the email on your account.</p>"
            "<p>If this wasn't you, change your password now.</p>"
        ),
    )
