import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Emergent managed email proxy. CONSTANT — never read from env so it survives deploy.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "NIVI FINSERV CRM")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
EMAIL_ENABLED = bool(EMAIL_KEY)
if not EMAIL_ENABLED:
    logger.warning("EMERGENT_EMAIL_KEY not set — email notifications are disabled, app will run normally without them.")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
      if not EMAIL_ENABLED:
        logger.info(f"Email disabled — skipping send to {to!r} (subject: {subject!r})")
        return None 
  _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()
    return resp.json().get("id")


def _app_link() -> str:
    url = os.environ.get("FRONTEND_URL", "").strip()
    if url.startswith("https://"):
        return f'<p style="margin:16px 0"><a href="{escape(url)}" style="color:#059669;font-weight:600">Open the CRM</a></p>'
    return ""


def _shell(title: str, inner: str) -> str:
    return (
        '<table role="presentation" width="100%" style="background:#f6f8f7;padding:24px 0">'
        '<tr><td align="center">'
        '<table role="presentation" width="560" style="background:#ffffff;border:1px solid #e5e7eb;'
        'border-radius:12px;font-family:Arial,Helvetica,sans-serif">'
        '<tr><td style="padding:20px 28px;border-bottom:1px solid #eef2f1">'
        f'<span style="font-size:16px;font-weight:800;color:#0F2C4D">NIVI</span>'
        f'<span style="font-size:16px;font-weight:800;color:#059669"> FINSERV</span>'
        '</td></tr>'
        f'<tr><td style="padding:24px 28px">'
        f'<h2 style="margin:0 0 12px;color:#111827;font-size:18px">{escape(title)}</h2>'
        f'{inner}'
        f'{_app_link()}'
        '<p style="font-size:12px;color:#9ca3af;margin-top:24px">'
        'Sent by NIVI FINSERV CRM. We never ask for your password or card details by email.'
        '</p></td></tr></table></td></tr></table>'
    )


def _fmt_usd(v) -> str:
    try:
        return "${:,.0f}".format(float(v or 0))
    except Exception:
        return "$0"


async def notify_deal_closed(to: str, client: dict) -> None:
    stage = client.get("stage", "")
    won = stage == "Closed Won"
    emoji_word = "won" if won else "lost"
    color = "#059669" if won else "#ef4444"
    inner = (
        f'<p style="color:#374151;font-size:14px">A deal has been marked '
        f'<strong style="color:{color}">{escape(stage)}</strong>.</p>'
        '<table role="presentation" width="100%" style="font-size:14px;color:#374151;margin-top:8px">'
        f'<tr><td style="padding:4px 0;color:#6b7280;width:120px">Client</td><td><strong>{escape(str(client.get("name","")))}</strong></td></tr>'
        f'<tr><td style="padding:4px 0;color:#6b7280">Country</td><td>{escape(str(client.get("country") or client.get("company") or "-"))}</td></tr>'
        f'<tr><td style="padding:4px 0;color:#6b7280">Services</td><td>{escape(str(client.get("services") or "-"))}</td></tr>'
        f'<tr><td style="padding:4px 0;color:#6b7280">Deal value</td><td><strong>{_fmt_usd(client.get("deal_value"))}</strong></td></tr>'
        '</table>'
    )
    subject = f"Deal {emoji_word}: {client.get('name','')} — {_fmt_usd(client.get('deal_value'))}"
    await send_email(to=to, subject=subject, html=_shell(f"Deal {emoji_word}", inner))


async def notify_task_due(to: str, task: dict, kind: str) -> None:
    when = "is due tomorrow" if kind == "due_tomorrow" else "is due today"
    inner = (
        f'<p style="color:#374151;font-size:14px">A task <strong>{when}</strong>.</p>'
        '<table role="presentation" width="100%" style="font-size:14px;color:#374151;margin-top:8px">'
        f'<tr><td style="padding:4px 0;color:#6b7280;width:120px">Task</td><td><strong>{escape(str(task.get("title","")))}</strong></td></tr>'
        f'<tr><td style="padding:4px 0;color:#6b7280">Priority</td><td>{escape(str(task.get("priority","")))}</td></tr>'
        f'<tr><td style="padding:4px 0;color:#6b7280">Due date</td><td>{escape(str(task.get("due_date") or "-"))}</td></tr>'
        f'<tr><td style="padding:4px 0;color:#6b7280">Client</td><td>{escape(str(task.get("client_name") or "-"))}</td></tr>'
        '</table>'
    )
    subject = f"Reminder: '{task.get('title','')}' {when}"
    await send_email(to=to, subject=subject, html=_shell("Task reminder", inner))
