"""
Improvement Notice PDF generation.

Self-contained: renders a formal "Legal Metrology Improvement Notice" from an
existing (immutable) scan record using a Jinja2 HTML template and converts it to
a printable A4 PDF with xhtml2pdf (pure-Python, no native system libraries — so
it works on Windows out of the box).

This module is READ-ONLY with respect to scan data. It never mutates a record.
"""

import base64
import io
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional, Tuple

import qrcode
from jinja2 import Environment, BaseLoader, select_autoescape
from PIL import Image
from xhtml2pdf import pisa

logger = logging.getLogger(__name__)

# Every date on this notice is Indian Standard Time. It is an Indian legal
# document, and the 30-day compliance period is counted from the date printed
# on it — so a UTC timestamp would show the wrong day for anything issued
# before 05:30 IST.
IST = ZoneInfo("Asia/Kolkata")


# ---------------------------------------------------------------------------
# HTML template (xhtml2pdf-compatible CSS: tables for layout, no flex/grid)
# ---------------------------------------------------------------------------
NOTICE_HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  /* A deliberately monochrome document. The single exception is the compliance
     verdict block, which stays green/red so the finding reads at a glance —
     everything else is black on white in the register of an official notice. */
  @page { size: a4 portrait; margin: 1.5cm 1.6cm; }
  body { font-family: "Times New Roman", Times, Georgia, serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.4; }
  table { border-collapse: collapse; width: 100%; }

  .doc-title { font-size: 15pt; font-weight: bold; text-align: center;
    letter-spacing: 0.5pt; margin: 0 0 4pt 0; }
  .doc-sub { text-align: center; font-size: 9pt; color: #555; margin-bottom: 2pt; }

  .refbar { margin-top: 14pt; border-top: 0.75pt solid #1a1a1a; border-bottom: 0.75pt solid #1a1a1a; }
  .refbar td { padding: 6pt 2pt; vertical-align: middle; }
  .refbar .lbl { font-size: 7.5pt; letter-spacing: 0.8pt; text-transform: uppercase; color: #555; }
  .refbar .val { font-size: 11pt; font-weight: bold; padding-top: 1pt; }

  .meta td { padding: 3pt 6pt; font-size: 9.5pt; vertical-align: top; }
  .meta .k { color: #555; width: 34%; }
  .meta .v { font-weight: bold; }
  .meta .sub { font-size: 8pt; color: #555; font-weight: normal; padding-top: 2pt; }

  .section-h { font-size: 9.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.8pt;
    border-bottom: 1pt solid #1a1a1a; padding-bottom: 3pt; margin: 16pt 0 8pt 0; }

  /* The one intentional splash of colour. */
  .verdict { padding: 10pt 12pt; color: #ffffff; }
  .verdict.compliant { background-color: #166534; }
  .verdict.flagged { background-color: #991b1b; }
  .verdict .lbl { font-size: 7.5pt; letter-spacing: 1.5pt; text-transform: uppercase; }
  .verdict .st { font-size: 15pt; font-weight: bold; }

  .vtable th { background-color: #ececec; color: #1a1a1a; text-align: left;
    padding: 5pt 7pt; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5pt;
    border: 0.75pt solid #999; }
  .vtable td { border: 0.75pt solid #bbb; padding: 5pt 7pt; font-size: 9pt; vertical-align: top; }
  .vtable .rule { font-weight: bold; white-space: nowrap; }

  .ok-box { border: 0.75pt solid #999; background-color: #f5f5f5;
    padding: 8pt 10pt; font-size: 9.5pt; }
  .cap { font-size: 8pt; color: #555; }
  .photos td { width: 50%; padding: 4pt; text-align: center; vertical-align: top; }
  .photos .cap { padding-top: 3pt; }
  .photo-frame { border: 0.75pt solid #999; padding: 3pt; }
  .no-photo { border: 0.75pt dashed #999; color: #777; padding: 24pt 4pt;
    font-size: 8.5pt; text-align: center; }
  .note { border: 0.75pt solid #999; background-color: #f7f7f7;
    padding: 10pt 12pt; font-size: 9.5pt; line-height: 1.55; }

  .sign td { padding-top: 30pt; font-size: 9pt; width: 50%; vertical-align: bottom; }
  .sign .line { border-top: 0.75pt solid #1a1a1a; padding-top: 3pt; color: #555; }
  .footer { color: #777; font-size: 7.5pt; text-align: center;
    border-top: 0.5pt solid #999; padding-top: 5pt; margin-top: 18pt; }
  .avoid-break { -pdf-keep-with-next: true; page-break-inside: avoid; }
</style>
</head>
<body>

  <div class="doc-title">LEGAL METROLOGY IMPROVEMENT NOTICE</div>
  <div class="doc-sub">Issued under the Legal Metrology (Packaged Commodities) Rules, 2011</div>

  <table class="refbar"><tr>
    <td style="width:50%;"><div class="lbl">Notice Reference</div><div class="val">{{ notice_ref }}</div></td>
    <td style="width:50%; text-align:right;"><div class="lbl">Date of Notice</div><div class="val">{{ notice_date }}</div></td>
  </tr></table>

  <table class="meta">
    <tr><td class="k">Inspection date</td><td class="v">{{ inspection_date }}</td></tr>
    {% if location %}<tr><td class="k">Inspection location</td><td class="v">{{ location.coords }}<div class="sub">{{ location.maps_url }}</div></td></tr>{% endif %}
    <tr><td class="k">Inspecting officer</td><td class="v">{{ officer_name }}{% if officer_email %} &lt;{{ officer_email }}&gt;{% endif %}</td></tr>
    <tr><td class="k">Product category</td><td class="v">{{ category }}</td></tr>
    <tr><td class="k">Addressed to (Mfr/Packer/Importer)</td><td class="v">{{ packer }}</td></tr>
    {% if product_name %}<tr><td class="k">Commodity</td><td class="v">{{ product_name }}</td></tr>{% endif %}
    {% if net_quantity %}<tr><td class="k">Declared net quantity</td><td class="v">{{ net_quantity }}</td></tr>{% endif %}
    {% if mrp %}<tr><td class="k">Declared MRP</td><td class="v">{{ mrp }}</td></tr>{% endif %}
    {% if use_by_date %}<tr><td class="k">Use by / best before</td><td class="v">{{ use_by_date }}</td></tr>{% endif %}
    {% if lot_batch_number %}<tr><td class="k">Lot / batch number</td><td class="v">{{ lot_batch_number }}</td></tr>{% endif %}
  </table>

  <div class="section-h">Compliance Verdict</div>
  <table><tr><td>
    <div class="verdict {{ 'compliant' if is_compliant else 'flagged' }}">
      <div class="lbl">Status</div>
      <div class="st">{{ status_label }}</div>
    </div>
  </td></tr></table>

  <div class="section-h">Declared Contraventions</div>
  {% if violations %}
  <table class="vtable">
    <tr><th style="width:24%">Declaration</th><th>Deficiency observed</th><th style="width:22%">Rule cited</th></tr>
    {% for v in violations %}
    <tr>
      <td>{{ v.field_label }}</td>
      <td>{{ v.issue }}</td>
      <td class="rule">{{ v.rule_ref }}</td>
    </tr>
    {% endfor %}
  </table>
  {% else %}
  <div class="ok-box">No contraventions of the checked Legal Metrology declarations were observed on this package.</div>
  {% endif %}

  {% if advisories %}
  <div class="section-h">Observations for Verification</div>
  <table class="vtable">
    <tr><th style="width:24%">Subject</th><th>Observation</th><th style="width:22%">Reference</th></tr>
    {% for a in advisories %}
    <tr>
      <td>{{ a.field_label }}</td>
      <td>{{ a.issue }}</td>
      <td class="rule">{{ a.rule_ref }}</td>
    </tr>
    {% endfor %}
  </table>
  <div class="cap" style="padding-top:4pt;">These observations are not findings of contravention. They
  record matters that could not be adjudicated from the photographs and require verification against
  the physical package.</div>
  {% endif %}

  <div class="avoid-break">
  <div class="section-h">Evidence on Record</div>
  {% if photo_rows %}
  {% for row in photo_rows %}
  <table class="photos"><tr>
    {% for photo in row %}
    <td>
      <img class="photo-frame" src="{{ photo.uri }}" style="width:{{ photo.w }}cm; height:{{ photo.h }}cm" />
      <div class="cap">{{ photo.caption }}</div>
    </td>
    {% endfor %}
    {% if row|length == 1 %}<td></td>{% endif %}
  </tr></table>
  {% endfor %}
  {% else %}
  <div class="no-photo">Evidence photographs unavailable</div>
  {% endif %}
  </div>

  <div class="section-h">Notice</div>
  <div class="note">
  {% if is_compliant %}
    On inspection, the package named above was found to <strong>comply</strong> with the checked
    mandatory declarations under the Legal Metrology (Packaged Commodities) Rules, 2011. No
    improvement action is required at this time. This notice is issued for record purposes.
  {% else %}
    The manufacturer/packer/importer named above is hereby required to <strong>rectify the
    contravention(s)</strong> listed above, in conformity with the Legal Metrology (Packaged
    Commodities) Rules, 2011, within <strong>{{ compliance_period }}</strong> of the date of this
    notice. This is an improvement notice issued prior to penalty; failure to comply within the
    stated period may attract action under the Legal Metrology Act, 2009.
  {% endif %}
  </div>

  {% if qr_uri %}
  <table style="margin-top:14pt;"><tr>
    <td style="width:2.6cm; vertical-align:top;"><img src="{{ qr_uri }}" style="width:2.3cm; height:2.3cm;" /></td>
    <td style="vertical-align:top; padding-left:8pt;">
      <div style="font-size:9pt; font-weight:bold;">VERIFY THIS NOTICE</div>
      <div style="font-size:8.5pt; color:#555; padding-top:3pt;">
        Scan the code, or visit the address below, to check this notice against the
        original inspection record. The record cannot be altered after it is created,
        so any discrepancy means this document has been modified.
      </div>
      <div style="font-size:8pt; color:#555; padding-top:4pt;">{{ verify_url }}</div>
    </td>
  </tr></table>
  {% endif %}

  <table class="sign"><tr>
    <td><div class="line">Signature of Inspecting Officer</div></td>
    <td><div class="line">Office Seal</div></td>
  </tr></table>

  <div class="footer">
    ParakhMitra | Legal Metrology Compliance - computer-generated improvement notice | Ref {{ notice_ref }} | record {{ record_id }} | generated {{ generated_at }}
  </div>

</body>
</html>
"""


_env = Environment(loader=BaseLoader(), autoescape=select_autoescape(["html", "xml"]))
_template = _env.from_string(NOTICE_HTML)


def _prepare_evidence_image(
    raw: Optional[bytes],
    max_w_cm: float = 7.4,
    max_h_cm: float = 6.5,
    max_px: int = 900,
) -> tuple[Optional[str], float, float]:
    """
    Normalise an evidence photo for the PDF: downscale (preserving aspect ratio)
    and re-encode to JPEG, then compute an explicit display size that fits inside
    a fixed box. Returns (data_uri, width_cm, height_cm). Setting BOTH dimensions
    on the <img> prevents tall/portrait photos from overflowing the layout.
    """
    if not raw:
        return None, 0.0, 0.0
    try:
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        im.thumbnail((max_px, max_px))  # in-place, keeps aspect ratio
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=82)
        uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

        w_px, h_px = im.size
        aspect = (w_px / h_px) if h_px else 1.0
        w_cm = max_w_cm
        h_cm = w_cm / aspect
        if h_cm > max_h_cm:
            h_cm = max_h_cm
            w_cm = h_cm * aspect
        return uri, round(w_cm, 2), round(h_cm, 2)
    except Exception as exc:
        logger.warning("Could not process evidence image: %s", exc)
        return None, 0.0, 0.0


def _field_label(key: str) -> str:
    label = key.replace("_", " ").strip().title()
    return label.replace("Mrp", "MRP")


def _fmt_dt(iso: Optional[str], with_time: bool = False) -> str:
    """Format a stored timestamp in IST.

    Timestamps arrive from Postgres in UTC. Converting — rather than merely
    formatting — is what stops the notice showing a time 5.5 hours behind the
    one the officer saw on screen.
    """
    if not iso:
        return "-"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(IST)
        return dt.strftime("%d %b %Y, %H:%M IST") if with_time else dt.strftime("%d %b %Y")
    except Exception:
        return iso


def _fmt_location(scan: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Format the capture coordinates for the notice, or None if not recorded.

    Latitude/longitude are stored as decimal degrees (WGS84). A missing pair
    means the device had no fix or location permission was denied — in which case
    the notice omits the location line rather than printing a placeholder.
    """
    lat, lng = scan.get("latitude"), scan.get("longitude")
    if lat is None or lng is None:
        return None
    try:
        lat_f, lng_f = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    coords = f"{lat_f:.6f}, {lng_f:.6f}"
    accuracy = scan.get("location_accuracy")
    if accuracy is not None:
        try:
            coords += f"  (±{round(float(accuracy))} m)"
        except (TypeError, ValueError):
            pass
    return {"coords": coords, "maps_url": f"https://www.google.com/maps?q={lat_f},{lng_f}"}


def _notice_ref(scan: Dict[str, Any]) -> str:
    """A quotable reference for the notice, derived from the record.

    A raw UUID is unique but unusable — nobody reads one aloud or files under
    it. This yields e.g. 'PM/2026/AF63AA2A3F1E': structured like a real notice
    reference, still unique in practice, and stable because it is derived from
    the immutable record rather than generated at render time.
    """
    created = scan.get("created_at")
    year = None
    if created:
        try:
            year = datetime.fromisoformat(str(created).replace("Z", "+00:00")).astimezone(IST).year
        except Exception:
            year = None
    year = year or datetime.now(IST).year
    token = str(scan.get("id", "")).replace("-", "").upper()[:12] or "UNKNOWN"
    return f"PM/{year}/{token}"


def notice_filename(scan: Dict[str, Any]) -> str:
    """Download filename matching the printed reference.

    The old form truncated the id to 8 hex characters, which collides often
    enough to silently overwrite one notice with another in a downloads folder.
    """
    return "improvement-notice-" + _notice_ref(scan).replace("/", "-") + ".pdf"


def _qr_data_uri(url: str) -> Optional[str]:
    """QR pointing at the public verification page, as an embedded PNG."""
    if not url:
        return None
    try:
        img = qrcode.make(url).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as exc:
        logger.warning("Could not render the verification QR (%s).", exc)
        return None


def generate_notice_pdf(
    *,
    scan: Dict[str, Any],
    officer_name: str,
    officer_email: Optional[str],
    evidence: Optional[List[Tuple[bytes, str]]] = None,
    verify_url: Optional[str] = None,
    compliance_period: str = "30 days",
) -> bytes:
    """Render the Improvement Notice HTML and convert it to PDF bytes."""
    extracted: Dict[str, Any] = scan.get("extracted") or {}
    raw_violations: List[Dict[str, Any]] = scan.get("violations") or []
    status = (scan.get("status") or "").lower()
    is_compliant = status == "compliant"

    net_qty = extracted.get("net_quantity") or {}
    net_quantity_text = None
    if net_qty.get("value"):
        net_quantity_text = f"{net_qty.get('value')} {net_qty.get('unit') or ''}".strip()

    mrp = extracted.get("mrp") or {}
    mrp_text = None
    if mrp.get("value"):
        tax = "inclusive of all taxes" if mrp.get("inclusive_of_taxes_stated") else "tax-inclusive not stated"
        mrp_text = f"{mrp.get('value')} ({tax})"

    violations = [
        {
            "field_label": _field_label(str(v.get("field", ""))),
            "issue": v.get("issue", ""),
            "rule_ref": v.get("rule_ref", ""),
        }
        for v in raw_violations
    ]

    advisories = [
        {
            "field_label": _field_label(str(a.get("field", ""))),
            "issue": a.get("issue", ""),
            "rule_ref": a.get("rule_ref", ""),
        }
        for a in (scan.get("advisories") or [])
    ]

    # Every available evidence photo, two per row.
    photos = []
    for index, (raw, _mime) in enumerate(evidence or [], start=1):
        uri, width, height = _prepare_evidence_image(raw)
        if uri:
            photos.append({"uri": uri, "w": width, "h": height, "caption": f"Photo {index}"})
    photo_rows = [photos[i:i + 2] for i in range(0, len(photos), 2)]

    now = datetime.now(IST)
    context = {
        "notice_ref": _notice_ref(scan),
        "record_id": str(scan.get("id", "-")),
        "verify_url": verify_url,
        "qr_uri": _qr_data_uri(verify_url) if verify_url else None,
        "notice_date": now.strftime("%d %b %Y"),
        "inspection_date": _fmt_dt(scan.get("created_at"), with_time=True),
        "location": _fmt_location(scan),
        "generated_at": now.strftime("%d %b %Y %H:%M IST"),
        "officer_name": officer_name or "Unknown officer",
        "officer_email": officer_email or "",
        "category": scan.get("category") or "General",
        "packer": extracted.get("manufacturer_packer_importer") or "Not declared on package",
        "product_name": extracted.get("product_name"),
        "net_quantity": net_quantity_text,
        "mrp": mrp_text,
        "use_by_date": extracted.get("use_by_date"),
        "lot_batch_number": extracted.get("lot_batch_number"),
        "is_compliant": is_compliant,
        "status_label": "Compliant" if is_compliant else "Flagged",
        "violations": violations,
        "advisories": advisories,
        "photo_rows": photo_rows,
        "compliance_period": compliance_period,
    }

    html = _template.render(**context)

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, encoding="utf-8")
    if result.err:
        logger.error("xhtml2pdf reported %s error(s) generating the notice", result.err)
        raise RuntimeError("Failed to generate the improvement notice PDF.")
    return buffer.getvalue()
