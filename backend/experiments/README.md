# Experiments

Evaluation spikes kept for the record. **Nothing here is imported by the application** — these
files exist so the reasoning behind a decision can be re-run rather than just asserted.

## `paddleocr_baseline.py`

The classical-OCR alternative to the vision model, built and benchmarked before the current
pipeline was chosen: PaddleOCR with contrast enhancement and confidence filtering, a regular
expression field parser mapping recognised lines onto the same `ExtractedData` shape, and a small
local web tester for trying real photographs.

It works, and that is the point — it also shows the ceiling. OCR returns a bag of text lines; you
are then left writing expressions to guess which line is a packer's address and which number is a
price, across curved, glossy, multi-font and multilingual packaging. A vision-language model does
recognition *and* field assignment in one step, which is why the shipped pipeline uses one.

Run the benchmark on your own images:

```bash
python experiments/paddleocr_baseline.py path/to/front.jpg path/to/back.jpg
```

Or start its local tester UI:

```bash
python experiments/paddleocr_baseline.py --serve
```

PaddleOCR is not in `requirements.txt` — it is a heavy dependency the application does not need.
Install it separately (`pip install paddleocr paddlepaddle`) if you want to run this.
