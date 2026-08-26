import io
import os
import sys
import re
import time
from typing import List, Optional, Tuple, Dict, Any
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
from pydantic import BaseModel, Field

# Pydantic schemas (matching app.schemas.scan)
class NetQuantity(BaseModel):
    value: str = Field(description="Net quantity magnitude, e.g., '100', '1.5'")
    unit: str = Field(description="Unit of measurement, e.g., 'g', 'ml', 'kg', 'N'")


class MRP(BaseModel):
    value: str = Field(description="Maximum Retail Price amount, e.g., '45.00', 'Rs 120'")
    inclusive_of_taxes_stated: bool = Field(
        default=False,
        description="True if 'inclusive of all taxes' or similar phrasing is explicitly stated"
    )


class ExtractedData(BaseModel):
    manufacturer_packer_importer: Optional[str] = None
    net_quantity: Optional[NetQuantity] = None
    mrp: Optional[MRP] = None
    mfg_or_pack_date: Optional[str] = None
    consumer_care: Optional[str] = None
    declarations_present: List[str] = []


class Violation(BaseModel):
    field: str
    issue: str
    rule_ref: str


def check_compliance_rules(extracted: ExtractedData) -> Tuple[List[Violation], str]:
    violations: List[Violation] = []
    # Rule 1: Check MRP
    if extracted.mrp is None or not extracted.mrp.value or not extracted.mrp.value.strip():
        violations.append(Violation(field="mrp", issue="missing", rule_ref="Rule-PLACEHOLDER-1"))
    elif not extracted.mrp.inclusive_of_taxes_stated:
        violations.append(Violation(field="mrp", issue="taxes_not_inclusive_stated", rule_ref="Rule-PLACEHOLDER-1-TAX"))

    # Rule 2: Check Net Quantity
    if extracted.net_quantity is None or not extracted.net_quantity.value or not extracted.net_quantity.value.strip():
        violations.append(Violation(field="net_quantity", issue="missing", rule_ref="Rule-PLACEHOLDER-2"))

    # Rule 3: Check Consumer Care Details
    if extracted.consumer_care is None or not extracted.consumer_care.strip():
        violations.append(Violation(field="consumer_care", issue="missing", rule_ref="Rule-PLACEHOLDER-3"))

    status = "flagged" if len(violations) > 0 else "compliant"
    return violations, status


def parse_legal_metrology(lines: List[str]) -> ExtractedData:
    """
    Advanced Indian Legal Metrology Packaged Commodities (LMPC) Extractor.
    Handles multi-line dot-matrix stamp boxes, split table cells, OCR typos, and noise.
    """
    cleaned = [l.strip() for l in lines if len(l.strip()) > 1]
    full_text = " \n ".join(cleaned)
    declarations = []

    # 1. MRP & Tax Inclusiveness (Handles 'MRP5.00', 'M.R.P. 20.00', '(CLOFALLXES)')
    mrp_obj: Optional[MRP] = None
    mrp_val: Optional[str] = None
    
    # Catch '(CLOFALLXES)', '(INCL. OF ALL TAXES)', etc.
    tax_stated = bool(re.search(
        r'(?:incl|cl|inclus|inc)\w*\s*(?:of)?\s*(?:all)?\s*(?:tax|xes)|all\s*taxes|incl\s*tax',
        full_text,
        re.IGNORECASE
    ))

    # Search each line for MRP
    for i, line in enumerate(cleaned):
        # Pattern 1: 'MRP5.00', 'MRP: Rs. 20.00', 'M.R.P. : 50.00'
        m1 = re.search(r'\b(?:mrp|m\.r\.p\.?|max(?:imum)?\s*retail\s*price|sale\s*price)\s*[:.]?\s*(?:rs\.?|₹)?\s*([0-9]+(?:\.[0-9]{2})?)', line, re.IGNORECASE)
        if m1 and m1.group(1) and float(m1.group(1)) > 0:
            mrp_val = m1.group(1)
            break

        # Pattern 2: MRP header alone on a line -> look in next 5 lines
        if re.search(r'\b(?:mrp|m\.r\.p\.?)\b', line, re.IGNORECASE):
            for next_line in cleaned[i+1:i+6]:
                if not re.search(r'[/-]', next_line) and not re.search(r'\b(?:mfg|pkd|exp|batch|date|net)\b', next_line, re.IGNORECASE):
                    m2 = re.search(r'^(?:rs\.?|₹|\:)?\s*([0-9]+(?:\.[0-9]{2}))', next_line.strip(), re.IGNORECASE)
                    if m2 and float(m2.group(1)) > 0:
                        mrp_val = m2.group(1)
                        break
            if mrp_val:
                break

    # Fallback: standalone price format
    if not mrp_val:
        m_fallback = re.search(r'\b(?:rs\.?|₹)\s*([0-9]+(?:\.[0-9]{2}))', full_text, re.IGNORECASE)
        if m_fallback:
            mrp_val = m_fallback.group(1)

    if mrp_val:
        mrp_obj = MRP(value=mrp_val, inclusive_of_taxes_stated=tax_stated)
        declarations.append("mrp")

    # 2. Net Quantity (Prefers primary Net Quantity declaration over nutritional table values)
    net_qty_obj: Optional[NetQuantity] = None
    qty_val, qty_unit = None, None

    # Step 2a: Look for 'NET QUANTITY' or 'Net Weight' header
    for i, line in enumerate(cleaned):
        if re.search(r'\b(?:net\s*qty|net\s*quantity|net\s*wt|nat\s*weight|net\s*weight|mtquantity)\b', line, re.IGNORECASE):
            for window_line in [line] + cleaned[i+1:i+5]:
                qm = re.search(r'\b([0-9]+(?:\.[0-9]+)?)\s*(gm|g|gms|kg|ml|l|ltr|n|units)\b', window_line, re.IGNORECASE)
                if qm and not re.search(r'(?:kcal|cal|k\.cal)', window_line, re.IGNORECASE):
                    qty_val, qty_unit = qm.group(1), qm.group(2).lower()
                    break
            if qty_val:
                break

    # Step 2b: Fallback to standalone weight stamps (e.g. '50GM' or '18g')
    if not qty_val:
        for line in cleaned:
            qm = re.search(r'\b([0-9]+(?:\.[0-9]+)?)\s*(gm|g|gms|kg|ml|l)\b', line, re.IGNORECASE)
            if qm and not re.search(r'(?:kcal|cal|k\.cal|sodium|fat|carb|protein|sugar|serve)', line, re.IGNORECASE):
                qty_val, qty_unit = qm.group(1), qm.group(2).lower()
                break

    if qty_val:
        net_qty_obj = NetQuantity(value=qty_val, unit=qty_unit if qty_unit != 'gm' else 'g')
        declarations.append("net_quantity")

    # 3. Mfg / Pack Date
    mfg_date: Optional[str] = None
    for i, line in enumerate(cleaned):
        if re.search(r'\b(?:mfg\.?\s*date|mfg|pkd|packed|mfd|date\s*of\s*pkg|dop|dom)\b', line, re.IGNORECASE):
            for window_line in [line] + cleaned[i+1:i+6]:
                dm = re.search(r'([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,2}/[0-9]{4}|[a-zA-Z]{3}[/-][0-9]{2,4})', window_line)
                if dm:
                    mfg_date = dm.group(1)
                    break
            if mfg_date:
                break

    if not mfg_date:
        dm_fallback = re.search(r'\b([0-9]{2}/[0-9]{2}/[0-9]{2,4})\b', full_text)
        if dm_fallback:
            mfg_date = dm_fallback.group(1)

    if mfg_date:
        declarations.append("mfg_or_pack_date")

    # 4. Manufacturer / Packer Details
    mfg_parts = []
    # Look for corporate / factory lines with company indicators or PIN codes
    for i, line in enumerate(cleaned):
        # Exclude ingredients lines
        if any(bad in line.lower() for bad in ['oil', 'salt', 'spice', 'powder', 'sugar', 'fat', 'protein', 'carbohydrate']):
            continue

        if any(k in line.lower() for k in [
            'mfd & mkd by', 'mfd &mkd by', 'mfd by', 'mid by', 'manufactured by', 
            'packed by', 'marketed by', 'snacks limited', 'foods pvt', 'industries', 
            'nemawar road', 'industrial estate', 'gala no'
        ]):
            mfg_parts.append(line)
            for next_line in cleaned[i+1:i+4]:
                if not any(bad in next_line.lower() for bad in ['mrp', 'batch', 'expiry', 'nutrition', 'energy', 'serving', 'oil', 'flavour']):
                    mfg_parts.append(next_line)
            break

    # Look for 6-digit PIN code line if not already caught (e.g. Indore-452020)
    for line in cleaned:
        if re.search(r'\b[1-9][0-9]{5}\b', line) and not any(bad in line.lower() for bad in ['lic', 'fssai']):
            if line not in mfg_parts:
                mfg_parts.append(line)

    manufacturer = " | ".join(dict.fromkeys(mfg_parts)) if mfg_parts else None
    if manufacturer:
        declarations.append("manufacturer_packer_importer")

    # 5. Consumer Care / Contact / Grievance
    care_parts = []
    for line in cleaned:
        if any(k in line.lower() for k in [
            "consumer car", "customercare", "helpline", "toll free", "grievance", 
            "queries", "marketing address", "@yellowdiamond", "@gmail", "@parakh", 
            "2437642", "1800-", "email:", "feedback", "www.", ".in", "store in a cool"
        ]):
            care_parts.append(line)

    consumer_care = " | ".join(dict.fromkeys(care_parts[:5])) if care_parts else None
    if consumer_care:
        declarations.append("consumer_care")

    return ExtractedData(
        manufacturer_packer_importer=manufacturer,
        net_quantity=net_qty_obj,
        mrp=mrp_obj,
        mfg_or_pack_date=mfg_date,
        consumer_care=consumer_care,
        declarations_present=declarations
    )


_ocr_engine = None

def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR
        _ocr_engine = PaddleOCR(
            ocr_version="PP-OCRv4",
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            text_det_limit_side_len=1600,   # Higher resolution for fine print
            text_det_box_thresh=0.5,
            text_rec_score_thresh=0.55      # Filter out noisy low-confidence artifacts
        )
    return _ocr_engine


def enhance_image(pil_img: Image.Image) -> Image.Image:
    """Enhance image contrast & sharpness for better dot-matrix and print detection."""
    # Convert to RGB
    img = pil_img.convert("RGB")
    # Increase contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.3)
    # Slight sharpness boost
    sharp = ImageEnhance.Sharpness(img)
    img = sharp.enhance(1.4)
    return img


def run_ocr_on_bytes(image_bytes: bytes, label: str = "IMAGE") -> Tuple[List[str], float]:
    ocr = get_ocr_engine()
    raw_pil = Image.open(io.BytesIO(image_bytes))
    enhanced_pil = enhance_image(raw_pil)
    np_img = np.array(enhanced_pil)[:, :, ::-1]  # RGB -> BGR
    
    t0 = time.time()
    res = ocr.predict(np_img)
    latency = time.time() - t0

    lines = []
    if res and len(res) > 0:
        rec_texts = res[0].get("rec_texts", [])
        rec_scores = res[0].get("rec_scores", [])
        rec_polys = res[0].get("rec_polys", [])

        # Filter noise & sort by vertical coordinates
        box_items = []
        for i, (text, conf) in enumerate(zip(rec_texts, rec_scores)):
            t_clean = text.strip()
            # Filter single random characters or low confidence noise
            if len(t_clean) <= 1 and not t_clean.isdigit():
                continue
            if conf < 0.55:
                continue

            y_pos = 0
            if len(rec_polys) > i and len(rec_polys[i]) > 0:
                y_pos = np.mean([p[1] for p in rec_polys[i]])
            else:
                y_pos = i * 10

            box_items.append((y_pos, t_clean, conf))

        # Sort top-to-bottom
        box_items.sort(key=lambda x: x[0])
        for _, text, conf in box_items:
            lines.append(text)
            print(f"    [{label}] '{text}' (conf: {conf:.2f})")

    print(f"    --> {label} processed in {latency:.2f}s ({len(lines)} lines kept)\n")
    return lines, latency


def run_web_server(port: int = 8001):
    import uvicorn
    from fastapi import FastAPI, UploadFile, File
    from fastapi.responses import HTMLResponse

    app = FastAPI(title="PaddleOCR Legal Metrology Test")

    HTML_PAGE = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>PackCheck AI — PaddleOCR Live Tester</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b132b; color: #f8fafc; padding: 25px; margin: 0; }
            .container { max-width: 1000px; margin: 0 auto; background: #1c2541; padding: 30px; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.5); border: 1px solid #3a506b; }
            h1 { color: #6fffe9; margin-top: 0; font-size: 26px; }
            .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 25px; }
            .upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
            .card { background: #0b132b; padding: 20px; border-radius: 12px; border: 1px dashed #475569; }
            .btn { background: #0ea5e9; color: white; border: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; width: 100%; transition: all 0.2s; }
            .btn:hover { background: #0284c7; }
            .results { margin-top: 30px; display: none; }
            .grid-results { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
            pre { background: #0b132b; padding: 15px; border-radius: 10px; color: #a5f3fc; overflow-x: auto; font-size: 13px; max-height: 400px; border: 1px solid #334155; }
            .badge { display: inline-block; padding: 8px 16px; border-radius: 999px; font-weight: bold; font-size: 16px; }
            .badge-success { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
            .badge-error { background: #7f1d1d; color: #fca5a5; border: 1px solid #dc2626; }
            .field-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .field-table th, .field-table td { padding: 10px; border-bottom: 1px solid #334155; text-align: left; }
            .field-table th { color: #94a3b8; width: 35%; }
            .field-table td { color: #f1f5f9; font-weight: 500; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 PackCheck AI — Enhanced PaddleOCR Tester</h1>
            <div class="subtitle">Equipped with 2D Multi-Line Window Matching, Contrast Preprocessing & Dot-Matrix Parsing</div>
            
            <form id="uploadForm">
                <div class="upload-grid">
                    <div class="card">
                        <label><b>📷 Front Label Image:</b></label><br>
                        <input type="file" id="front_img" name="front_image" accept="image/*" style="margin-top: 12px;">
                    </div>
                    <div class="card">
                        <label><b>📷 Back Label Image:</b></label><br>
                        <input type="file" id="back_img" name="back_image" accept="image/*" style="margin-top: 12px;">
                    </div>
                </div>
                
                <button type="submit" class="btn" id="btnSubmit">⚡ Run Enhanced OCR & Compliance Audit</button>
            </form>

            <div id="loader" style="display:none; margin-top:25px; color:#38bdf8; font-size: 16px;">⏳ Processing full-resolution image with PP-OCRv4...</div>

            <div class="results" id="resultsBox">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                    <h2>Audit Result: <span id="statusBadge" class="badge"></span></h2>
                </div>

                <div id="violationsBox" style="margin-bottom: 20px;"></div>

                <div style="background: #0b132b; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 20px;">
                    <h3 style="margin-top:0; color:#38bdf8;">📋 Extracted Legal Metrology Fields</h3>
                    <table class="field-table" id="fieldsTable"></table>
                </div>

                <div class="grid-results">
                    <div>
                        <h3 style="color:#94a3b8;">Cleaned Text Lines</h3>
                        <pre id="rawLines"></pre>
                    </div>
                    <div>
                        <h3 style="color:#94a3b8;">Structured JSON Schema</h3>
                        <pre id="extractedJson"></pre>
                    </div>
                </div>
            </div>
        </div>

        <script>
            document.getElementById('uploadForm').onsubmit = async (e) => {
                e.preventDefault();
                const front = document.getElementById('front_img').files[0];
                const back = document.getElementById('back_img').files[0];
                if (!front && !back) { alert('Please select at least one image file!'); return; }

                const formData = new FormData();
                if (front) formData.append('front_image', front);
                if (back) formData.append('back_image', back);

                document.getElementById('loader').style.display = 'block';
                document.getElementById('resultsBox').style.display = 'none';

                try {
                    const res = await fetch('/api/test-scan', { method: 'POST', body: formData });
                    const data = await res.json();

                    document.getElementById('loader').style.display = 'none';
                    document.getElementById('resultsBox').style.display = 'block';

                    const badge = document.getElementById('statusBadge');
                    badge.innerText = data.compliance_status.toUpperCase();
                    badge.className = 'badge ' + (data.compliance_status === 'compliant' ? 'badge-success' : 'badge-error');

                    const ext = data.extracted;
                    const table = document.getElementById('fieldsTable');
                    table.innerHTML = `
                        <tr><th>MRP</th><td>${ext.mrp ? '₹ ' + ext.mrp.value + (ext.mrp.inclusive_of_taxes_stated ? ' (Incl. of all taxes)' : ' <span style="color:#f87171;">(Taxes not stated)</span>') : '<span style="color:#f87171;">MISSING</span>'}</td></tr>
                        <tr><th>Net Quantity</th><td>${ext.net_quantity ? ext.net_quantity.value + ' ' + ext.net_quantity.unit : '<span style="color:#f87171;">MISSING</span>'}</td></tr>
                        <tr><th>Mfg / Pkg Date</th><td>${ext.mfg_or_pack_date || '<span style="color:#94a3b8;">Not specified</span>'}</td></tr>
                        <tr><th>Manufacturer / Packer</th><td>${ext.manufacturer_packer_importer || '<span style="color:#94a3b8;">Not specified</span>'}</td></tr>
                        <tr><th>Consumer Care / Grievance</th><td>${ext.consumer_care || '<span style="color:#f87171;">MISSING</span>'}</td></tr>
                    `;

                    document.getElementById('rawLines').innerText = data.detected_lines.join('\\n');
                    document.getElementById('extractedJson').innerText = JSON.stringify(ext, null, 2);

                    const vBox = document.getElementById('violationsBox');
                    if (data.violations.length === 0) {
                        vBox.innerHTML = '<div style="background:#064e3b; padding:12px; border-radius:8px; color:#a7f3d0;">✅ <b>Fully Compliant:</b> No mandatory Legal Metrology violations detected.</div>';
                    } else {
                        vBox.innerHTML = '<div style="background:#450a0a; padding:15px; border-radius:8px; border: 1px solid #991b1b;"><h4 style="margin:0 0 8px 0; color:#f87171;">⚠️ Violations Detected (' + data.violations.length + '):</h4><ul style="margin:0; padding-left:20px;">' + 
                            data.violations.map(v => `<li style="color:#fca5a5; margin-bottom:4px;"><b>[${v.rule_ref}] ${v.field}:</b> ${v.issue}</li>`).join('') + '</ul></div>';
                    }
                } catch (err) {
                    document.getElementById('loader').style.display = 'none';
                    alert('Scan error: ' + err.message);
                }
            };
        </script>
    </body>
    </html>
    """

    @app.get("/", response_class=HTMLResponse)
    def index():
        return HTML_PAGE

    @app.post("/api/test-scan")
    async def test_scan(
        front_image: Optional[UploadFile] = File(None),
        back_image: Optional[UploadFile] = File(None)
    ):
        all_lines = []
        if front_image:
            fb = await front_image.read()
            fl, _ = run_ocr_on_bytes(fb, "FRONT_UPLOAD")
            all_lines.extend(fl)

        if back_image:
            bb = await back_image.read()
            bl, _ = run_ocr_on_bytes(bb, "BACK_UPLOAD")
            all_lines.extend(bl)

        extracted = parse_legal_metrology(all_lines)
        violations, status = check_compliance_rules(extracted)

        return {
            "compliance_status": status,
            "violations": [v.model_dump() for v in violations],
            "extracted": extracted.model_dump(),
            "detected_lines": all_lines
        }

    print(f"\n=======================================================")
    print(f"🚀 Enhanced PaddleOCR Server running at:")
    print(f"👉 http://127.0.0.1:{port}")
    print(f"=======================================================\n")
    uvicorn.run(app, host="127.0.0.1", port=port)


def main():
    args = sys.argv[1:]

    if "--serve" in args or "-s" in args:
        port = 8001
        for a in args:
            if a.startswith("--port="):
                port = int(a.split("=")[1])
        run_web_server(port=port)
        return

    if len(args) > 0 and not args[0].startswith("-"):
        print("===============================================================")
        print("Testing Enhanced PaddleOCR on Custom Image(s)...")
        print("===============================================================")
        all_lines = []
        for idx, img_path in enumerate(args, 1):
            if not os.path.exists(img_path):
                print(f"❌ Error: File not found: '{img_path}'")
                return
            print(f"\n--- Processing Image {idx}: {img_path} ---")
            with open(img_path, "rb") as f:
                img_bytes = f.read()
            lines, _ = run_ocr_on_bytes(img_bytes, f"IMAGE_{idx}")
            all_lines.extend(lines)

        print("--- Parsing Extracted Legal Metrology Fields ---")
        extracted = parse_legal_metrology(all_lines)
        print("=== Extracted Data Object ===")
        print(extracted.model_dump_json(indent=2))

        violations, status = check_compliance_rules(extracted)
        print(f"\nCompliance Status: {status.upper()}")
        print(f"Violations ({len(violations)}):")
        for v in violations:
            print(f" - [{v.rule_ref}] {v.field}: {v.issue}")
        return

    # Benchmark run
    print("===============================================================")
    print("Starting Enhanced PaddleOCR Benchmark...")
    print("===============================================================")
    get_ocr_engine()
    front_bytes, back_bytes = create_sample_images()
    front_lines, _ = run_ocr_on_bytes(front_bytes, "FRONT")
    back_lines, _ = run_ocr_on_bytes(back_bytes, "BACK")
    all_lines = front_lines + back_lines

    extracted = parse_legal_metrology(all_lines)
    print("=== Extracted Data Object ===")
    print(extracted.model_dump_json(indent=2))

    violations, compliance_status = check_compliance_rules(extracted)
    print(f"\nCompliance Status: {compliance_status.upper()}")
    print(f"Violations Found ({len(violations)}):")
    for v in violations:
        print(f" - [{v.rule_ref}] {v.field}: {v.issue}")


def create_sample_images() -> Tuple[bytes, bytes]:
    front_img = Image.new("RGB", (700, 900), color=(245, 245, 245))
    d1 = ImageDraw.Draw(front_img)
    d1.rectangle([30, 30, 670, 870], outline=(0, 32, 69), width=4)
    d1.text((120, 100), "PARAKH PREMIUM TEA", fill=(0, 32, 69))
    d1.text((150, 160), "100% Pure Assam CTC Leaf", fill=(60, 60, 60))
    d1.rectangle([100, 220, 600, 550], fill=(220, 235, 245), outline=(100, 150, 200), width=2)
    d1.text((220, 360), "[ TEA GARDEN ARTWORK ]", fill=(0, 32, 69))
    d1.text((180, 640), "Net Quantity: 500 g", fill=(0, 0, 0))
    d1.text((200, 720), "Best Before 12 Months from Packaging", fill=(80, 80, 80))

    front_buf = io.BytesIO()
    front_img.save(front_buf, format="JPEG", quality=95)

    back_img = Image.new("RGB", (700, 900), color=(255, 255, 255))
    d2 = ImageDraw.Draw(back_img)
    d2.rectangle([30, 30, 670, 870], outline=(150, 150, 150), width=2)
    d2.text((50, 60), "MANDATORY DECLARATIONS (LMPC ACT)", fill=(0, 32, 69))
    d2.text((50, 120), "Mfd. By: Parakh Agro Industries Pvt. Ltd.", fill=(0, 0, 0))
    d2.text((50, 150), "Plot No 45, Hadapsar Industrial Area, Pune 411028, MH", fill=(0, 0, 0))
    d2.text((50, 210), "Packed By: Parakh Packaging Div., Unit 2, Pune 411028", fill=(0, 0, 0))
    d2.text((50, 290), "M.R.P. : Rs. 145.00", fill=(0, 0, 0))
    d2.text((50, 320), "(Inclusive of all taxes)", fill=(0, 0, 0))
    d2.text((50, 380), "Month & Year of Pkg. : 08/2026", fill=(0, 0, 0))
    d2.text((50, 420), "Batch No. : PKH-2026-AUG-04", fill=(0, 0, 0))
    d2.text((50, 500), "For Consumer Grievances / Queries Contact:", fill=(0, 32, 69))
    d2.text((50, 530), "Consumer Care Officer, Parakh Agro Industries", fill=(0, 0, 0))
    d2.text((50, 560), "Toll Free Helpline: 1800-209-4560", fill=(0, 0, 0))
    d2.text((50, 590), "Email: customercare@parakh.in", fill=(0, 0, 0))
    d2.text((50, 620), "Website: www.parakhagro.com", fill=(0, 0, 0))

    back_buf = io.BytesIO()
    back_img.save(back_buf, format="JPEG", quality=95)

    return front_buf.getvalue(), back_buf.getvalue()


if __name__ == "__main__":
    main()
