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
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from jinja2 import Environment, BaseLoader, select_autoescape
from PIL import Image
from xhtml2pdf import pisa

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTML template (xhtml2pdf-compatible CSS: tables for layout, no flex/grid)
# ---------------------------------------------------------------------------
NOTICE_HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: a4 portrait; margin: 1.4cm 1.5cm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1c1e; font-size: 10pt; }
  .bar { background-color: #002045; color: #ffffff; padding: 12pt 14pt; }
  .bar .title { font-size: 16pt; font-weight: bold; }
  .bar .sub { font-size: 8.5pt; color: #b9c7dd; }
  .doc-title { font-size: 13pt; font-weight: bold; color: #002045;
    text-align: center; margin: 14pt 0 2pt 0; letter-spacing: 0.5pt; }
  .doc-sub { text-align: center; font-size: 8.5pt; color: #43474e; margin-bottom: 12pt; }
  table { border-collapse: collapse; width: 100%; }
  .meta td { padding: 3pt 6pt; font-size: 9.5pt; vertical-align: top; }
  .meta .k { color: #43474e; width: 33%; }
  .meta .v { font-weight: bold; }
  .section-h { font-size: 10pt; font-weight: bold; color: #002045;
    border-bottom: 1.5pt solid #002045; padding-bottom: 3pt; margin: 16pt 0 8pt 0; }
  .verdict { padding: 10pt 12pt; color: #ffffff; }
  .verdict.compliant { background-color: #166534; }
  .verdict.flagged { background-color: #991b1b; }
  .verdict .lbl { font-size: 8pt; letter-spacing: 1pt; }
  .verdict .st { font-size: 15pt; font-weight: bold; }
  .vtable th { background-color: #002045; color: #ffffff; text-align: left;
    padding: 5pt 7pt; font-size: 8.5pt; }
  .vtable td { border: 0.75pt solid #c4c6cf; padding: 5pt 7pt; font-size: 9pt; vertical-align: top; }
  .vtable .rule { font-weight: bold; color: #002045; white-space: nowrap; }
  .ok-box { border: 0.75pt solid #bbf7d0; background-color: #f0fdf4;
    padding: 8pt 10pt; font-size: 9.5pt; color: #166534; }
  .photos td { width: 50%; padding: 4pt; text-align: center; vertical-align: top; }
  .photos .cap { font-size: 8pt; color: #43474e; padding-top: 3pt; }
  .photo-frame { border: 0.75pt solid #c4c6cf; padding: 3pt; }
  .no-photo { border: 0.75pt dashed #c4c6cf; color: #74777f; padding: 24pt 4pt;
    font-size: 8.5pt; text-align: center; }
  .note { border: 0.75pt solid #c4c6cf; background-color: #f7f9fb;
    padding: 10pt 12pt; font-size: 9.5pt; line-height: 1.5; }
  .note strong { color: #002045; }
  .sign td { padding-top: 26pt; font-size: 9pt; width: 50%; vertical-align: bottom; }
  .sign .line { border-top: 0.75pt solid #43474e; padding-top: 3pt; color: #43474e; }
  .footer { color: #74777f; font-size: 7.5pt; text-align: center;
    border-top: 0.5pt solid #c4c6cf; padding-top: 5pt; margin-top: 18pt; }
  .avoid-break { -pdf-keep-with-next: true; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="bar"><tr>
    {% if logo_uri %}<td style="width:1.5cm; vertical-align:middle;"><img src="{{ logo_uri }}" style="width:1.25cm; height:1.25cm;" /></td>{% endif %}
    <td style="vertical-align:middle;"><div class="title">ParakhMitra</div><div class="sub">Legal Metrology Compliance</div></td>
    <td style="text-align:right; vertical-align:top;">
      <div style="font-size:8pt; color:#b9c7dd;">NOTICE REF.</div>
      <div style="font-size:9.5pt; font-weight:bold;">{{ notice_ref }}</div>
    </td>
  </tr></table>

  <div class="doc-title">LEGAL METROLOGY IMPROVEMENT NOTICE</div>
  <div class="doc-sub">Issued under the Legal Metrology (Packaged Commodities) Rules, 2011</div>

  <table class="meta">
    <tr><td class="k">Date of notice</td><td class="v">{{ notice_date }}</td></tr>
    <tr><td class="k">Inspection date</td><td class="v">{{ inspection_date }}</td></tr>
    <tr><td class="k">Inspecting officer</td><td class="v">{{ officer_name }}{% if officer_email %} &lt;{{ officer_email }}&gt;{% endif %}</td></tr>
    <tr><td class="k">Product category</td><td class="v">{{ category }}</td></tr>
    <tr><td class="k">Addressed to (Mfr/Packer/Importer)</td><td class="v">{{ packer }}</td></tr>
    {% if product_name %}<tr><td class="k">Commodity</td><td class="v">{{ product_name }}</td></tr>{% endif %}
    {% if net_quantity %}<tr><td class="k">Declared net quantity</td><td class="v">{{ net_quantity }}</td></tr>{% endif %}
    {% if mrp %}<tr><td class="k">Declared MRP</td><td class="v">{{ mrp }}</td></tr>{% endif %}
    {% if use_by_date %}<tr><td class="k">Use by / best before</td><td class="v">{{ use_by_date }}</td></tr>{% endif %}
    {% if lot_batch_number %}<tr><td class="k">Lot / batch number</td><td class="v">{{ lot_batch_number }}</td></tr>{% endif %}
  </table>

  <div class="section-h">COMPLIANCE VERDICT</div>
  <table><tr><td>
    <div class="verdict {{ 'compliant' if is_compliant else 'flagged' }}">
      <div class="lbl">STATUS</div>
      <div class="st">{{ status_label }}</div>
    </div>
  </td></tr></table>

  <div class="section-h">DECLARED CONTRAVENTIONS</div>
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
  <div class="section-h">OBSERVATIONS FOR VERIFICATION</div>
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
  <div class="section-h">EVIDENCE ON RECORD</div>
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

  <div class="section-h">NOTICE</div>
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

  <table class="sign"><tr>
    <td><div class="line">Signature of Inspecting Officer</div></td>
    <td><div class="line">Office Seal</div></td>
  </tr></table>

  <div class="footer">
    ParakhMitra | Legal Metrology Compliance - computer-generated improvement notice | Ref {{ notice_ref }} | generated {{ generated_at }}
  </div>

</body>
</html>
"""

# The masthead logo, embedded as a data URI so the notice stays a single
# self-contained file with no external requests. Flattened onto the header navy
# rather than kept transparent: xhtml2pdf's PNG alpha handling is unreliable.
def _load_logo_uri() -> Optional[str]:
    path = Path(__file__).resolve().parent.parent / "assets" / "logo-notice.png"
    try:
        return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    except Exception as exc:
        logger.warning("Notice logo unavailable (%s); falling back to the wordmark.", exc)
        return None


LOGO_URI = _load_logo_uri()


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
    if not iso:
        return "-"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y, %H:%M") if with_time else dt.strftime("%d %b %Y")
    except Exception:
        return iso


def generate_notice_pdf(
    *,
    scan: Dict[str, Any],
    officer_name: str,
    officer_email: Optional[str],
    evidence: Optional[List[Tuple[bytes, str]]] = None,
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

    now = datetime.now(timezone.utc)
    context = {
        "logo_uri": LOGO_URI,
        "notice_ref": str(scan.get("id", "-")),
        "notice_date": now.strftime("%d %b %Y"),
        "inspection_date": _fmt_dt(scan.get("created_at"), with_time=True),
        "generated_at": now.strftime("%d %b %Y %H:%M UTC"),
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
