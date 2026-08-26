# ParakhMitra — The Codebook

*A phase-by-phase technical textbook for this exact project.*

## How to read this document

This is written for a teammate who can read a little code but has never been taught what an **API**, a **database**, **authentication**, or **deployment** actually *are*. We build every idea from the ground up with a real-world analogy, and then we show you the **real code from this repository** that implements it — with the real file path printed above every snippet.

Two promises:

1. We never show you code without first explaining the idea behind it in plain English.
2. We never explain an idea without then showing you the real code that makes it happen.

If you read this front to back, you will understand both *how software like this works in general* and *how our ParakhMitra is actually built*, line by line.

**What ParakhMitra does, in one breath:** an inspection officer photographs the front and back of a packaged product; the app reads the mandatory legal declarations off the label using AI, checks them against India's Legal Metrology packaging rules, and produces a permanent, tamper-proof inspection record plus a printable government-style notice.

The phases follow the real path of the system:

1. The two-program architecture (frontend vs backend) and how they talk
2. The frontend — screens, routing, and the scan flow
3. The backend API — endpoints and how a request flows
4. AI extraction with Gemini (and what JSON is)
5. The deterministic rule engine (the 8 real rules)
6. Data, authentication & security
7. The PDF Improvement Notice
8. Deployment — putting it on the internet

---

# Phase 1 — Two programs that talk over the internet

## 1. The concept

Imagine a restaurant. There is a **dining room** where guests sit, read the menu, and place orders. There is a **kitchen** where the actual cooking happens, where the expensive knives and the secret recipes live. Guests never walk into the kitchen. Instead, a **waiter** carries a written order from the dining room to the kitchen, and carries a finished plate back.

Our project is built exactly like this, as **two separate programs**:

- The **frontend** (the dining room) is what runs on the officer's phone — the buttons, the camera screen, the results page. It is friendly and pretty, but it holds no secrets.
- The **backend** (the kitchen) runs on a server far away. It holds the secret keys (the AI key, the master database key), talks to the AI, and enforces the rules. Nobody's phone can see inside it.

The "waiter" between them is something called an **API request** over the **internet**. "API" simply means *Application Programming Interface* — a fixed, agreed-upon menu of things one program is allowed to ask another program to do. Just as a waiter only accepts orders that are on the menu, the backend only answers requests that match its published list. When the frontend wants a package scanned, it doesn't do the scanning itself — it sends an order ("here are two photo filenames, please scan them") to the backend and waits for the plate to come back.

In our repository these two programs live in two folders you can literally see: `frontend/` and `backend/`.

## 2. What we actually built

The frontend needs to know the kitchen's address — where to send its orders. That address lives in one constant.

**`frontend/src/lib/api.ts`**
```ts
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'
```

In plain English: "The backend's address is whatever `VITE_API_BASE_URL` is set to; if nobody set it, assume the backend is running on this same computer at port 8000." That fallback (`127.0.0.1:8000`, which means "this machine") is what we use while developing on a laptop. In production it is set to the real internet address of our kitchen.

On the kitchen side, the backend has to *agree* to take orders from that particular dining room. Browsers enforce a safety rule (called CORS — we'll meet it properly in Phase 8) that a website may only call a backend that has explicitly allow-listed it. Here is where the backend opens that door:

**`backend/app/main.py`**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(scans_router)
```

Line by line: `add_middleware(CORSMiddleware, …)` tells the kitchen "these specific dining rooms (`settings.CORS_ORIGINS`) are allowed to send me orders." `include_router(scans_router)` plugs in the actual menu of scan-related orders (which we'll read in Phase 3).

## 3. Why we did it this way

Why split into two programs at all, instead of one? **Secrets and trust.** The backend holds keys that can read and write *everyone's* data and spend money on the AI. If those keys lived on the phone, anyone could pull them out of the app and abuse them. By keeping the powerful keys in the kitchen and giving the phone only a limited, public "menu," a stolen phone (or a hostile user) can't do damage. It also lets the two halves be built, updated, and hosted independently — we deploy the dining room to one service (Vercel) and the kitchen to another (Render), which is exactly Phase 8.

## 4. For your teammates

> ParakhMitra is two programs: a **frontend** (the app on the phone — pretty, holds no secrets) and a **backend** (a server that holds the keys and does the real work). They talk over the internet by sending "requests," like a waiter carrying orders between a dining room and a kitchen.

---

# Phase 2 — The frontend: screens, routing, and the scan flow

## 1. The concept

The frontend is the part you can see and touch. Think of it as a **building with many rooms**. Each room (the login room, the dashboard room, the new-scan room) is a **screen**. Something has to decide which room you're standing in based on the sign on the door — that job is called **routing** (the door signs are the web address: `/scan`, `/history`, `/profile`).

The rooms themselves are built out of reusable pieces called **components** — a component is just a labeled Lego brick of interface (a button, a photo tile, a whole screen) that can be snapped together and reused. Our components are written in **React** (a popular toolkit for building these bricks) using **TypeScript** (ordinary JavaScript with *labels on the data*, so the computer catches mistakes like "you promised a number but gave text"). The whole thing is bundled and served to the browser by a tool called **Vite**.

One more idea: **state**. State is the app's short-term memory of "what's happening right now" — which photo you just took, whether we're mid-upload, whether an error popped up. When state changes, the screen redraws itself to match.

## 2. What we actually built

Everything starts at one file that "mounts" the app into the web page and wraps it in two helpers:

**`frontend/src/main.tsx`**
```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

Read the wrapping from the outside in: `BrowserRouter` is the thing that reads the door sign (the URL) and knows which room to show. `AuthProvider` is a memory of *who is logged in* that every room can consult (built in Phase 6). `<App />` is the building itself.

`App` is the receptionist who decides what you're allowed to see:

**`frontend/src/App.tsx`**
```tsx
export default function App() {
  const { session, loading, accessDenied, isAdmin } = useAuth()

  if (loading) {
    return <FullScreenLoader label="Loading ParakhMitra…" />
  }
  if (!session) {
    return <Login />
  }
  if (accessDenied) {
    return <AccessDenied />
  }

  return (
    <Routes>
      <Route path="/scan/:id" element={<ScanDetail />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scan" element={isAdmin ? <Navigate to="/" replace /> : <NewScan />} />
        <Route path="/results" element={isAdmin ? <Navigate to="/" replace /> : <Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

In plain English, top to bottom: *if we're still checking who you are, show a spinner; if you're not signed in, show the Login screen; if you're signed in but not allowed, show "access denied"; otherwise show the real rooms.* The `<Route>` lines are the door signs: the address `/history` shows the `History` room, `/profile` shows `Profile`, and so on. Notice the clever line for `/scan` — `isAdmin ? <Navigate to="/" replace /> : <NewScan />` means "if an admin tries to open the scan room, send them home instead," because in our design admins supervise and do not scan.

Now the heart of the app: the **scan flow**. This is the New Scan screen. The important function is `handleScan`:

**`frontend/src/screens/NewScan.tsx`**
```tsx
async function handleScan() {
  if (!front || !back || !user) return
  setSubmitting(true)
  setError(null)
  try {
    setStage('Uploading package photos…')
    const [frontPath, backPath] = await Promise.all([
      uploadEvidencePhoto(front),
      uploadEvidencePhoto(back),
    ])

    setStage('Extracting declarations & checking rules…')
    const result = await createScan({ frontPath, backPath, userId: user.id, category })

    navigate('/results', { state: { result } })
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Scan failed. Please try again.')
    setSubmitting(false)
    setStage('')
  }
}
```

Line by line: it refuses to run unless both photos and a logged-in user exist. `setSubmitting(true)` flips a piece of state so the screen shows a "working…" spinner. It then **uploads both photos** (`uploadEvidencePhoto` twice, run together with `Promise.all` so they upload in parallel), getting back two short filenames. Then it calls `createScan(...)` — that's the order to the kitchen. When the plate comes back (`result`), it navigates to the Results room, handing the result along. If anything throws, the `catch` shows a friendly error instead of crashing.

Where do those two helper functions actually send data? Back in `api.ts`. Uploading a photo:

**`frontend/src/lib/api.ts`**
```ts
export async function uploadEvidencePhoto(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    })
  if (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
  return path
}
```

This gives the photo a random unique name (`crypto.randomUUID()` produces something like `330389d7-8a0d-….jpg`), uploads it straight to online file storage (Supabase Storage, Phase 6), and returns that filename. The photo bytes go straight from the phone to storage — they do **not** pass through our backend.

And placing the actual scan order:

**`frontend/src/lib/api.ts`**
```ts
const res = await fetch(`${API_BASE_URL}/api/scans`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  body: JSON.stringify({
    front_path: params.frontPath,
    back_path: params.backPath,
    user_id: params.userId,
    category: params.category,
  }),
})
```

`fetch(...)` is the browser's built-in "send a request over the internet" function. We `POST` (a POST means "here is some data, please act on it") to `.../api/scans`, attach our identity in the headers (`authHeaders()`, Phase 6), and put the two filenames + category into the `body` as **JSON** text (Phase 4 explains JSON).

## 3. Why we did it this way

**Why upload photos directly to storage instead of through our backend?** Photos are large. Routing megabytes of image through our small kitchen would make it slow and expensive. Letting the phone hand the photo straight to the storage service, and passing our backend only the tiny *filename*, keeps the backend fast and cheap. **Why block admins from the scan screen in the router itself**, not just hide the button? Because a determined user could type the address by hand — real access control has to live in the code, not in a hidden button. **Why React + TypeScript + Vite?** They're the mainstream, well-documented choice, and TypeScript's "labels on data" catch a whole class of bugs before the app ever runs.

## 4. For your teammates

> The frontend is a set of **screens** connected by **routing** (the web address decides which screen shows). The scan screen uploads the two photos straight to online storage, then sends just their filenames to the backend and waits for the compliance result to come back.

---

# Phase 3 — The backend API: endpoints and how a request flows

## 1. The concept

Back to the kitchen. A kitchen doesn't cook "anything" — it has a **menu of dishes it knows how to make**. In software, each item on that menu is called an **endpoint**: a specific web address plus a specific action the backend will perform when that address is called. Our menu has two dishes: "scan a package" and "make a PDF notice for a scan."

Each order has a **method** — the verb. The two you'll see are **POST** ("here's data, do something and create a result") and **GET** ("just give me something, don't change anything"). Scanning is a POST (it creates a new record); downloading a notice is a GET (it only reads).

When an order arrives, it flows through the kitchen in **steps**, in order, and if any step fails the kitchen sends back a numbered complaint slip called a **status code** (200 = "here's your dish, all good"; 404 = "couldn't find that"; 401 = "who are you?"; 500 = "we broke"). Our whole backend is built with **FastAPI**, a Python toolkit whose entire job is to make these menus and manage this flow.

## 2. What we actually built

The menu is declared with small labels above each function. Here is the "scan a package" dish:

**`backend/app/api/scans.py`**
```python
@router.post("", response_model=ScanResponse, status_code=status.HTTP_200_OK, ...)
def create_scan(
    payload: ScanRequest,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> ScanResponse:
```

`@router.post("")` is the label that says "this function answers a POST to `/api/scans`." The function's arguments are its ingredients, and FastAPI fills them in automatically: `payload` is the incoming JSON (validated against the `ScanRequest` shape from Phase 4), and the three `Depends(...)` lines pull in helpers — the logged-in user, a connection to the database, and a connection to the AI. `Depends` means "before you run me, go build these for me." (`get_current_user` is the security guard; we meet it in Phase 6.)

Inside, the request flows through numbered steps — you can read the story straight down the function:

**`backend/app/api/scans.py`**
```python
    user_id = current_user["id"]
    _enforce_scan_rate_limit(user_id)

    front_path = payload.front_path.strip()
    back_path = payload.back_path.strip()
    category = payload.category.strip() if payload.category else None
    ...
    # 1. Fetch BOTH images from Supabase Storage
    front_bytes = supabase_service.fetch_image(front_path)
    ...
    # 2. Detect mime types and extract declarations via Gemini API ... in a SINGLE call
    extracted = gemini_service.extract_label_data(...)
    ...
    # 3. Run the deterministic Legal Metrology Rule 6 checks.
    violations, compliance_status = check_compliance_rules(extracted, category=category)
    ...
    # 4. Save record to Supabase 'scans' table
    supabase_service.save_scan_record(..., user_id=user_id, category=category)
    ...
    # 5. Return extracted data and violations
    return ScanResponse(
        extracted=extracted,
        violations=violations,
        status=compliance_status,
    )
```

This is the entire life of a scan, in five plain steps: **(1)** download the two photos from storage using their filenames; **(2)** hand both photos to the AI and get back the label's declarations (Phase 4); **(3)** run those declarations through our rulebook and get a verdict (Phase 5); **(4)** save a permanent record to the database (Phase 6); **(5)** return the result to the phone. When any step fails, the code raises an `HTTPException` with a status code and a short message — for example, if a photo is missing it returns `404` "Front image not found in storage." The phone reads that and shows an error instead of a result.

Notice line 1 already does two security things before any work happens: it takes the owner id **from the verified user**, not from the request body, and it calls `_enforce_scan_rate_limit` (Phase 6). Everything is guarded before a single expensive operation runs.

## 3. Why we did it this way

**Why numbered steps in one readable function** instead of clever indirection? Because this is a *pipeline* — fetch, extract, judge, save, return — and code that reads top-to-bottom like a recipe is code a new teammate (or the legal team) can follow. **Why separate `services` (`supabase_service`, `gemini_service`) instead of doing it all inline?** Each service is a self-contained specialist — one knows how to talk to storage/database, one knows how to talk to the AI. The endpoint stays a short story; the messy details are tucked into the specialists. That separation is why we could swap the AI model, or harden the database calls, without rewriting the endpoint.

## 4. For your teammates

> The backend offers a small **menu of endpoints**. "Scan" is one POST endpoint whose job reads like a five-step recipe: get the photos → ask the AI to read the label → run our rulebook → save a permanent record → send the result back. Each step can fail politely with a numbered error.

---

# Phase 4 — AI extraction with Gemini (and what JSON is)

## 1. The concept

Step 2 of the recipe is the only place we use artificial intelligence, and it does exactly **one narrow job**: *read the text off a photo of a label.* It is a very good pair of eyes — nothing more. It does not decide whether the product is legal (that's Phase 5's job, on purpose).

The AI we use is Google's **Gemini**, a "vision" model — you give it images and instructions, it gives back text. But free-form text is a nightmare to work with. If we asked "what's on this label?" it might reply in a friendly paragraph, and paragraphs are impossible for a program to reliably pull facts out of.

So we force it to answer in **JSON**. JSON (JavaScript Object Notation) is simply a strict, universal way of writing down labeled data that every program understands. Think of it as a **fill-in-the-blank form** instead of an essay. Instead of "The MRP looks like about 5 rupees, tax included," JSON says exactly:

```json
{ "mrp": { "value": "Rs 5.00", "inclusive_of_taxes_stated": true } }
```

Same facts, but now every blank has a fixed name and a fixed place. We hand Gemini the *shape of the form* in advance and require it to fill in that form and nothing else. This is called **structured output**.

## 2. What we actually built

First, we define the exact form — the blanks we expect. This is a **schema** (a fancy word for "the agreed shape of some data"):

**`backend/app/schemas/scan.py`**
```python
class ExtractedData(BaseModel):
    product_name: Optional[str] = Field(default=None, ...)
    manufacturer_packer_importer: Optional[str] = Field(default=None, ...)
    net_quantity: Optional[NetQuantity] = Field(default=None, ...)
    mrp: Optional[MRP] = Field(default=None, ...)
    mfg_or_pack_date: Optional[str] = Field(default=None, ...)
    consumer_care: Optional[str] = Field(default=None, ...)
    declarations_present: List[str] = Field(default_factory=list, ...)
```

Each line is a blank on the form. `Optional[str]` with `default=None` means "this can be text, or empty if it's not on the label." `net_quantity` and `mrp` are their own little sub-forms (e.g. `NetQuantity` has a `value` and a `unit`). This class, built with a tool called **Pydantic**, does double duty: it's both the instruction to the AI *and* the automatic gate that rejects any reply that doesn't fit.

Now the actual call to Gemini. Two things matter: we send **both photos in a single request**, and we switch on JSON mode:

**`backend/app/services/gemini_service.py`**
```python
front_part = types.Part.from_bytes(data=front_image_bytes, mime_type=front_mime_type)
back_part = types.Part.from_bytes(data=back_image_bytes, mime_type=back_mime_type)

config = types.GenerateContentConfig(
    response_mime_type="application/json",
    response_schema=ExtractedData,
    system_instruction=SYSTEM_PROMPT,
)

contents = [
    "Image 1 (Front of product package):",
    front_part,
    "Image 2 (Back of product package):",
    back_part,
    "Extract all Legal Metrology declarations across both images of this product according to the schema.",
]
```

The two key settings: `response_mime_type="application/json"` says "answer only in JSON, no chit-chat," and `response_schema=ExtractedData` hands over our exact form so the AI knows every blank to fill. The `contents` list literally interleaves labels and image bytes — "here's the front, here's the back" — so a single call sees both sides at once. `system_instruction=SYSTEM_PROMPT` is the standing brief; that prompt (also in this file) tells the model things like *`product_name` is the generic name like 'Potato Chips', not the brand*, and *only mark taxes-inclusive if those exact words appear.*

Finally we take the AI's JSON text and pour it back into our form, which validates it:

**`backend/app/services/gemini_service.py`**
```python
raw_text = response.text
if not raw_text:
    logger.warning("Gemini returned empty response text")
    return ExtractedData()

extracted = ExtractedData.model_validate_json(raw_text)
return extracted
```

`model_validate_json(raw_text)` is the crucial line: it parses the AI's reply and checks it against our schema. If Gemini ever returned something malformed, this would catch it rather than letting bad data flow downstream. If the reply is empty, we return a blank form — which, as you'll see in Phase 5, correctly gets flagged as non-compliant.

## 3. Why we did it this way

**Why force JSON / structured output** instead of parsing free text? Reliability. A rulebook can only run on clean, predictable data; a form guarantees that, an essay doesn't. **Why one call with both images** instead of two calls? Because declarations are spread across front and back (MRP on the front, manufacturer on the back), and a single call lets the model combine them — plus it's one AI charge instead of two. **Why does the AI only *read* and never *judge*?** Because AI can be subtly wrong or inconsistent, and a legal compliance verdict must be exact, explainable, and identical every time — that is a job for deterministic code, which is Phase 5. Keeping the AI on "eyes only" duty is the single most important design decision in the whole project.

## 4. For your teammates

> The AI (Gemini) has exactly one job: **read the words off the label photos**. We force it to answer as a strict fill-in-the-blank **form (JSON)**, not a paragraph, and we send both photos in one shot. It never decides whether the product is legal — it only reports what the label says.

---

# Phase 5 — The deterministic rule engine (the 8 real rules)

## 1. The concept

Now we *judge*. The word **deterministic** just means "same input, same output, every single time, with no guessing." That is the opposite of an AI, and it is exactly what the law demands: if two officers scan the same label, they must get the identical verdict, and we must be able to point at *which rule* was broken.

Think of it as a **checklist a human inspector would run down**: "Is the maker's name on it? ✔. Is the net weight in proper units like grams, not 'a dozen'? ✔. Is the price marked as including tax? ✘ — write that one up." Our rule engine is that checklist, turned into plain, boring, predictable code. It reads the form the AI filled in (Phase 4) and, for each rule, asks a simple yes/no question. Every "no" becomes a **violation** with the exact legal reference attached.

The rules come from India's **Legal Metrology (Packaged Commodities) Rules, 2011** — the law about what must be printed on any packaged good for sale.

## 2. What we actually built

The rules are stored as a plain **list** — deliberately, so a non-programmer can read and tweak them. Each entry is one checklist item:

**`backend/app/rules/engine.py`**
```python
RULES: List[dict] = [
    {
        "field": "manufacturer_packer_importer",
        "rule_ref": "Rule 6(1)(a)",
        "issue": "Name and address of manufacturer/packer/importer missing",
        "check": _has_manufacturer,
    },
    {
        "field": "product_name",
        "rule_ref": "Rule 6(1)(b)",
        "issue": "Common or generic name of the commodity not declared",
        "check": _has_product_name,
    },
    ...
    {
        "field": "net_quantity",
        "rule_ref": "Rule 13(4)",
        "issue": "Net quantity uses a non-standard unit (e.g. dozen/score/gross)",
        "check": _net_quantity_not_prohibited_unit,
    },
]
```

Each rule has a human sentence (`issue`), the exact law it comes from (`rule_ref`, e.g. `Rule 6(1)(a)`), and a small `check` function that returns `True` if the label passes. The eight rules cover: (a) maker's name & address, (b) the product's generic name, (c) net quantity in proper units, (d) manufacture/pack date, (e) the MRP, (2m) that the MRP says "inclusive of all taxes," (6(2)) consumer-care contact details, and (13(4)) that the quantity unit isn't a forbidden one like "dozen."

The `check` functions are tiny and readable. Here is the one for net quantity units:

**`backend/app/rules/engine.py`**
```python
def _net_quantity_standard(e: ExtractedData) -> bool:
    # Rule 6(1)(c) — present, has a value, and unit is a standard metric unit.
    nq = e.net_quantity
    if nq is None or not _text(nq.value):
        return False
    return _canonical_unit(nq.unit) in STANDARD_UNITS
```

In English: "If there's no quantity, or no number, fail. Otherwise, is the unit a real metric unit?" Real labels write units messily — `g`, `GM`, `gms`, `grams` — so before checking, `_canonical_unit` tidies the spelling using a small dictionary:

**`backend/app/rules/engine.py`**
```python
STANDARD_UNITS = {"g", "kg", "mg", "ml", "l", "cm", "m", "n", "u"}

UNIT_ALIASES = {
    "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    ...
}

NON_STANDARD_UNITS = {
    "dozen", "dozens", "doz",
    "score", "scores",
    "gross", "grosses",
    "piece", "pieces", "pcs", "pc",
}
```

`STANDARD_UNITS` is the allow-list of legal units; `UNIT_ALIASES` maps common misspellings onto them (so `GM` counts as `g`); `NON_STANDARD_UNITS` is the *forbidden* list that Rule 13(4) rejects. A non-programmer can add a spelling here without touching any logic.

Now a subtle but important touch: **not double-firing**. If a label has *no* MRP at all, only *one* violation should be raised ("MRP not declared"), not also a second one ("MRP not marked tax-inclusive") — that would be nonsense. So the tax rule *skips itself* when there's no MRP:

**`backend/app/rules/engine.py`**
```python
def _mrp_tax_inclusive(e: ExtractedData) -> bool:
    # Rule 2(m) — MRP must be declared inclusive of all taxes.
    # Only meaningful when an MRP exists; if MRP is missing, Rule 6(1)(e) already
    # covers it, so skip (pass) here to avoid double-firing.
    if not _has_mrp(e):
        return True
    return bool(e.mrp.inclusive_of_taxes_stated)
```

The `if not _has_mrp(e): return True` line means "no MRP? then this rule isn't my department — pass." The same guard exists on the forbidden-unit rule (it passes when there's no quantity, because the missing-quantity rule already covers that case).

Finally, the loop that runs the whole checklist and produces the verdict:

**`backend/app/rules/engine.py`**
```python
def check_compliance_rules(extracted, category=None):
    violations: List[Violation] = []
    applicable_rules = RULES + CATEGORY_RULES.get(category or "", [])

    for rule in applicable_rules:
        passed = rule["check"](extracted)
        if not passed:
            violations.append(
                Violation(field=rule["field"], issue=rule["issue"], rule_ref=rule["rule_ref"])
            )

    status = "flagged" if violations else "compliant"
    return violations, status
```

It walks every rule, and each time a `check` returns `False` it records a `Violation` (the field, the sentence, the law). At the end the verdict is dead simple: **any violations → `flagged`; none → `compliant`.** The `CATEGORY_RULES.get(...)` piece is a deliberately-empty hook — a place to add category-specific rules later — but today it's empty, so *every* product category runs the *same* eight checks.

## 3. Why we did it this way

**Why does the AI extract but this Python engine judge?** Because a legal verdict must be deterministic, explainable, and auditable. If a manufacturer disputes a violation, we can point at `Rule 6(1)(c)` and the exact code that raised it — you cannot do that with an AI's opinion. **Why a plain list of rules with English sentences?** So the legal team can read, correct, and extend the rulebook without being programmers. **Why the double-fire guards?** Because a fair notice should list each real problem once, not pile on redundant complaints. **Why did we deliberately exclude FSSAI rules?** FSSAI is India's *food safety* regulator — a completely different body from Legal Metrology (which governs *packaging declarations*). Mixing them would produce legally wrong notices, so the engine's comment explicitly forbids adding FSSAI or other non-Legal-Metrology rules.

## 4. For your teammates

> After the AI reads the label, a **plain, predictable checklist** (not AI) judges it against the 8 real 2011 packaging rules. Every failure is recorded with its exact legal reference. No violations = "compliant," any violation = "flagged" — and it gives the identical answer every single time.

---

# Phase 6 — Data, authentication & security

## 1. The concept

Three ideas live here.

**A database** is an organized, permanent filing cabinet. Instead of paper, it holds **tables** (like spreadsheets); each **row** is one record, each **column** a field. We use **Supabase**, which gives us a database, file storage, and a login system in one. We keep two tables: `scans` (one row per inspection) and `profiles` (one row per person, holding their role).

**Authentication** ("auth") is *proving who you are*, like showing ID at a door. **Authorization** is the next question: *given who you are, what are you allowed to do?* When you log in with Google, Supabase hands your browser a **token** — specifically a **JWT** (JSON Web Token), which is a tamper-proof digital wristband. It's signed like a hologram on a passport: anyone can read it, nobody can forge it. Your browser shows this wristband on every request, and the backend checks it's genuine.

**Row Level Security (RLS)** is a rule the database *itself* enforces about which rows each person may see or change — like a filing cabinet where the lock inspects your ID before letting you open a specific drawer. This is what makes our inspection records **immutable** (unchangeable): the database is configured to let *nobody* edit or delete a scan, not even an admin.

## 2. What we actually built

**The tables and their security rules** are defined in one SQL file. Here's the `profiles` table and the rule that makes scans immutable:

**`supabase/schema.sql`**
```sql
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'none'   check (role   in ('admin', 'officer', 'none')),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
```

Each person gets a row with a `role` that can only ever be `admin`, `officer`, or `none`, and a `status` of `active` or `inactive`. Now the immutability rule for scans:

**`supabase/schema.sql`**
```sql
-- scans: officers read only their own; admins read all.
-- Deliberately NO insert/update/delete policies for clients: inspection
-- records can only be written by the backend (service-role key bypasses RLS)
-- and can never be altered or removed by any user.
alter table public.scans enable row level security;

create policy scans_select_own_or_admin on public.scans
  for select using (auth.uid() = user_id or public.is_admin());
```

Read the comment — it's the whole security posture. RLS is turned **on**, and we only ever grant permission to **read** (`for select`), and even then only your *own* scans (`auth.uid() = user_id`) unless you're an admin. There is deliberately **no** rule allowing edit or delete from any app. The only writer is our backend, which uses a master key that bypasses RLS. That is what "immutable inspection record" means in practice.

**Roles are assigned automatically on first sign-in** by a database trigger (a small routine the database runs by itself when a new user appears):

**`supabase/schema.sql`**
```sql
  if user_email = any (admin_emails) then
    derived_role := 'admin';
  elsif user_email like '%@ves.ac.in' then
    derived_role := 'officer';
  else
    derived_role := 'none';       -- signed in, but no access until an admin grants a role
  end if;
```

Plain English: if your email is on the admin list, you're an admin; if it ends in `@ves.ac.in`, you're an officer; otherwise you're signed in but have no access until an admin grants you a role.

**On the frontend side**, the app remembers who you are and what your role is. This is the `AuthProvider` from Phase 2, watching Supabase's login state:

**`frontend/src/auth/AuthContext.tsx`**
```tsx
const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
  setSession(newSession)
  setLoadingSession(false)
  if (newSession?.user) {
    void loadProfile(newSession.user.id)
  } else {
    setProfile(null)
  }
})
```

Whenever you log in or out, this fires: it stores your `session` (which contains the JWT wristband) and loads your `profile` (which contains your role). The whole app then asks this provider "am I allowed here?" — that's the `useAuth()` you saw guarding routes in Phase 2.

**The backend's security guard.** This is the fix that makes the kitchen safe on the open internet. Every protected endpoint depends on `get_current_user`, which checks the wristband:

**`backend/app/api/scans.py`**
```python
def get_current_user(
    authorization: Optional[str] = Header(default=None),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> Dict[str, Optional[str]]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    token = authorization[7:].strip()
    user = supabase_service.get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session. Please sign in again.")

    profile = supabase_service.fetch_profile(user["id"])
    if (not profile or profile.get("status") != "active"
            or profile.get("role") not in ("officer", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is not authorised.")
    return {"id": user["id"], "email": user.get("email"), "role": profile.get("role")}
```

Step by step: no wristband → **401** ("who are you?"). A wristband that Supabase says is fake or expired → **401**. A real user whose profile isn't an active officer/admin → **403** ("I know who you are, but you're not allowed"). Only a genuine, authorized user gets past. `get_user_from_token` (in `supabase_service.py`) is what actually asks Supabase "is this wristband real?"

Two more hardening touches. **Anti-spoofing** — the scan's owner is taken from the *verified wristband*, never from what the phone claims:

**`backend/app/api/scans.py`**
```python
    # Owner is derived from the authenticated token, NOT the request body — a
    # client cannot attribute a scan to another user.
    user_id = current_user["id"]
```

And a **rate limit**, so no single user can hammer the (money-costing) AI endpoint:

**`backend/app/api/scans.py`**
```python
def _enforce_scan_rate_limit(user_id: str) -> None:
    now = time.time()
    cutoff = now - _RATE_LIMIT_WINDOW
    calls = _SCAN_CALLS[user_id]
    calls[:] = [t for t in calls if t > cutoff]
    if len(calls) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many scans in a short time. Please wait a moment and try again.",
        )
    calls.append(now)
```

It keeps a short list of each user's recent scan times, throws away ones older than the window, and if there are already too many (`_RATE_LIMIT_MAX`, 20 per minute) it returns **429** "too many, slow down."

## 3. Why we did it this way

**Why make records immutable via the database, not just by hiding buttons?** Because inspection evidence must be trustworthy — if anyone could quietly edit a past verdict, the whole system is worthless in a dispute. Enforcing "read-only for everyone" at the database lock means even a bug in our own code can't tamper with a record. **Why check the JWT on the backend when the database already has RLS?** Because our backend uses a *master key* that bypasses RLS — so the backend must re-check permissions itself, or it would be a wide-open door. That's the anti-spoofing and owner-or-admin checks. **Why derive roles from email automatically?** So officers from `@ves.ac.in` get access on first login with zero manual setup, while everyone else is safely locked out until promoted.

## 4. For your teammates

> Your Google login gives your phone a tamper-proof **wristband (JWT)**. The backend checks that wristband on every request and only lets in active officers/admins. Inspection records are **read-only for everyone** — the database itself forbids editing or deleting them — so a saved verdict can never be altered.

---

# Phase 7 — The PDF Improvement Notice

## 1. The concept

An inspection isn't much use if the officer can't hand someone an official piece of paper. So the app can turn any saved scan into a formal, printable **PDF** — a "Legal Metrology Improvement Notice."

The trick for making a nice-looking document is a **template**. A template is a pre-designed page with blanks — like an official letterhead where the body, the date, and the recipient are left empty to be filled per-case. We design the notice once as a web page (HTML) full of blanks, then for each scan we fill the blanks with that scan's real data and convert the finished page into a PDF. The filling-in is done by a tool called **Jinja2**; the HTML-to-PDF conversion by a tool called **xhtml2pdf**.

## 2. What we actually built

The whole notice lives in one service. Its main function gathers the scan's real data into a bundle of blanks to fill:

**`backend/app/services/report_service.py`**
```python
    now = datetime.now(timezone.utc)
    context = {
        "notice_ref": str(scan.get("id", "-")),
        "notice_date": now.strftime("%d %b %Y"),
        "inspection_date": _fmt_dt(scan.get("created_at"), with_time=True),
        "officer_name": officer_name or "Unknown officer",
        "officer_email": officer_email or "",
        "category": scan.get("category") or "General",
        "packer": extracted.get("manufacturer_packer_importer") or "Not declared on package",
        "product_name": extracted.get("product_name"),
        "net_quantity": net_quantity_text,
        ...
    }
```

This `context` is the list of blanks and their real values — the scan's id becomes the notice reference number, the manufacturer becomes who the notice is addressed to, and so on. Every value comes straight from the immutable scan record; nothing is invented.

The evidence photos need special care, because a tall phone photo would otherwise overflow the page. So before embedding, each image is shrunk and fitted into a fixed box:

**`backend/app/services/report_service.py`**
```python
def _prepare_evidence_image(raw, max_w_cm=7.4, max_h_cm=6.5, max_px=900):
    ...
    im = Image.open(io.BytesIO(raw))
    im = im.convert("RGB")
    im.thumbnail((max_px, max_px))  # in-place, keeps aspect ratio
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=82)
    uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    ...
```

Using the **Pillow** image library, it opens the photo, shrinks it (`thumbnail`) while keeping its proportions, re-saves it smaller, and turns it into a text form the HTML can embed directly (a `data:` URI — the image encoded as letters). The function also returns a width and height in centimetres so the template can pin the photo to an exact size and it can never spill over.

Finally, the fill-and-convert step:

**`backend/app/services/report_service.py`**
```python
    html = _template.render(**context)

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, encoding="utf-8")
    if result.err:
        logger.error("xhtml2pdf reported %s error(s) generating the notice", result.err)
        raise RuntimeError("Failed to generate the improvement notice PDF.")
    return buffer.getvalue()
```

`_template.render(**context)` is Jinja2 pouring our real values into the blanks, producing a finished HTML page. `pisa.CreatePDF(...)` is xhtml2pdf turning that page into actual PDF bytes, which the endpoint (Phase 3) then sends to the phone as a download. The template itself (a big HTML string higher up in the same file) contains the navy header, the verdict banner that turns green for "compliant" or red for "flagged," a table of the violations with their `rule_ref`s, and the two evidence photos labelled front and back.

## 3. Why we did it this way

**Why a template instead of drawing the PDF by hand?** Because designing a page in HTML/CSS is far easier and more maintainable than positioning every line of a PDF manually — change the template, and every future notice updates. **Why xhtml2pdf and not the more famous WeasyPrint?** WeasyPrint needs heavy system libraries that are painful to install (especially on Windows, where the team develops); xhtml2pdf is pure Python and "just works" everywhere, including on our free hosting. **Why shrink the photos with Pillow first?** Real evidence photos are tall and multi-megabyte; without fitting them into a fixed box they overflowed the page and made a mess — pre-sizing them keeps the layout clean and the file small. **Why build it from the immutable record?** So the notice is a faithful printout of what was actually inspected, never an editable re-interpretation.

## 4. For your teammates

> Any saved scan can be turned into an official **PDF notice**. We designed the page once as a fill-in-the-blanks web template, drop each scan's real data (and its two photos) into it, and convert it to a PDF. It's generated fresh from the read-only record, so it always matches the real inspection.

---

# Phase 8 — Deployment: putting it on the internet

## 1. The concept

**Deployment** means taking the code off your laptop and running it on always-on computers on the internet, so anyone with the link can use it. Our two programs go to two specialist hosts: the frontend to **Vercel** (great at serving websites) and the backend to **Render** (good at running Python servers). The database/storage/login already live on Supabase.

Two supporting ideas. **Environment variables** are settings you feed a program from the outside instead of hard-coding them — especially secrets (keys) and addresses that differ between "my laptop" and "the real internet." And **CORS** (Cross-Origin Resource Sharing) is the browser safety rule from Phase 1: a website may only call a backend that has explicitly named it as allowed. Getting these two right is 90% of what "wiring up a deployment" means.

## 2. What we actually built

The backend's recipe for Render is written down so it's reproducible:

**`render.yaml`**
```yaml
services:
  - type: web
    name: parakhmitra-backend
    runtime: python
    rootDir: backend
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
```

This tells Render: it's a Python web service, its code is in the `backend` folder, install its dependencies with `pip install -r requirements.txt`, and start it with `uvicorn …` (uvicorn is the little engine that runs FastAPI). `$PORT` is an environment variable Render fills in. `healthCheckPath: /health` is the address Render pings to confirm the kitchen is alive.

The secrets (the Supabase master key, the Gemini key, and the allowed frontend address) are **not** in the code — they're set as environment variables in the Render dashboard. The backend reads them here:

**`backend/app/config.py`**
```python
def _parse_cors_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]
```

This reads the `CORS_ORIGINS` setting from the environment. In production we set it to our real frontend address (the Vercel URL); on a laptop, where it's unset, it falls back to the local development addresses. Whatever this returns is exactly the allow-list handed to the CORS middleware you saw in Phase 1 — so this one setting is what lets the live website talk to the live backend.

The frontend needs one small rule so that refreshing a deep link (like `/history`) doesn't 404:

**`frontend/vercel.json`**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This says "for any address, serve the app's main page and let the frontend's router (Phase 2) sort out which screen to show." Without it, reloading on `/history` would ask the server for a `/history` file that doesn't exist.

**How the two live URLs wire together** (from `DEPLOY.md`): deploy the backend first to get its URL (e.g. `https://sih-d9a.onrender.com`); give that URL to the frontend as the `VITE_API_BASE_URL` environment variable (the address constant from Phase 2); deploy the frontend to get *its* URL; then set the backend's `CORS_ORIGINS` to that frontend URL, and add the same URL to Supabase's allowed login redirect list. Now the dining room and the kitchen know each other's addresses and permit each other.

## 3. Why we did it this way

**Why two different hosts?** Each is best-in-class and free for its job — Vercel for static sites, Render for Python servers. **Why environment variables for keys and URLs?** So the exact same code runs on a laptop and in production with zero edits, and so secrets never end up committed in the code where they could leak. **One quirk to know — the free-tier "cold start":** Render's free backend goes to sleep after about 15 minutes of no traffic; the very first request after that has to wake it (~50 seconds) and can appear to "fail to fetch" on a phone. Hitting `/health` first, or a small uptime pinger, keeps it awake for demos. This is a cost trade-off, not a bug.

## 4. For your teammates

> Deploying means running the two programs on always-on internet computers: frontend on **Vercel**, backend on **Render**, data on **Supabase**. The magic wiring is (1) telling the frontend the backend's URL and (2) telling the backend to allow the frontend's URL (**CORS**). On the free plan the backend naps when idle, so the first request after a while is slow.

---

# The whole story, in one paragraph

An officer opens the **frontend** (Phase 2) and photographs a package. The two photos go straight to online **storage**; their filenames are POSTed to the **backend API** (Phase 3). The backend checks the officer's **login wristband** (Phase 6), downloads the photos, and asks **Gemini** to read the label into a strict **JSON form** (Phase 4). A deterministic **rule engine** judges that form against the 8 real Legal Metrology rules and returns a verdict (Phase 5). The result is saved as an **immutable record** the database itself won't let anyone edit (Phase 6), and shown back on the phone. Any record can be turned into an official **PDF notice** (Phase 7). All of it runs live on the internet across **Vercel + Render + Supabase**, wired together by URLs and CORS (Phase 8) — two programs, talking like a dining room and a kitchen (Phase 1).
