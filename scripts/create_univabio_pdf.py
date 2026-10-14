"""Render the one-page UnivaBio description; status snapshot 13 October 2026."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/SkinSnap_UnivaBio_Project_Description.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
for name, file in [("Body", "calibri.ttf"), ("BodyBold", "calibrib.ttf"), ("Display", "georgia.ttf")]:
    pdfmetrics.registerFont(TTFont(name, str(Path("C:/Windows/Fonts") / file)))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="BodyBold")
TEAL, INK, MUTED = HexColor("#164C46"), HexColor("#233C39"), HexColor("#526662")
IVORY, PALE, LINE = HexColor("#FCFBF7"), HexColor("#EDF4F0"), HexColor("#D4E1DB")
WIDTH, HEIGHT, MARGIN = 612, 792, 40
c = canvas.Canvas(str(OUTPUT), pagesize=(WIDTH, HEIGHT), pageCompression=1)
c.setTitle("SkinSnap - UnivaBio One-Page Project Description")
c.setAuthor("SkinSnap project")
c.setSubject("AI for Human Health: purpose, features, methods and honest prototype status")
c.setFillColor(IVORY); c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)


def text(content, x, top, width, size=10.5, leading=14, color=INK, bold=False):
    style = ParagraphStyle("p", fontName="BodyBold" if bold else "Body", fontSize=size, leading=leading,
                           textColor=color, spaceBefore=0, spaceAfter=0, allowWidows=0, allowOrphans=0)
    p = Paragraph(content, style)
    _, h = p.wrap(width, HEIGHT)
    p.drawOn(c, x, top - h)
    return top - h


def label(content, x, y, size=8):
    c.setFont("BodyBold", size); c.setFillColor(TEAL); c.drawString(x, y, content)


def card(x, top, width, height, fill=PALE):
    c.setFillColor(fill); c.roundRect(x, top - height, width, height, 11, fill=1, stroke=0)


label("UNIVABIO  /  ARTIFICIAL INTELLIGENCE FOR HUMAN HEALTH", MARGIN, 751)
c.setFont("Display", 37); c.setFillColor(TEAL); c.drawString(MARGIN, 704, "SkinSnap")
text("Understand the evidence. Build a routine that fits you.", MARGIN, 690, 445, 12, 16, MUTED)
# Code-native brand mark, not a medical image or an explanation heatmap.
c.setStrokeColor(LINE); c.setLineWidth(1)
for r in [15, 24, 33]: c.circle(535, 706, r, fill=0, stroke=1)
c.setFillColor(TEAL); c.circle(535, 706, 6, fill=1, stroke=0)

label("PURPOSE", MARGIN, 647)
text("SkinSnap makes skin health information and everyday skincare choices easier to understand. "
     "It brings real research image analysis, a short preferences survey, and transparent product explanations into one accessible web application. "
     "It is a student research and education prototype, not a clinical diagnostic service.", MARGIN, 636, 532, 10.8, 14.5)

top, gap, tile_w = 566, 10, (532 - 20) / 3
steps = [
    ("01  CHOOSE & PERSONALIZE", "Upload a supported image and share texture, ingredient, purchasing and routine preferences."),
    ("02  ANALYZE WITH CONTEXT", "Run the trained research task, check image quality, and show uncertainty and model limitations."),
    ("03  UNDERSTAND & COMPARE", "Explore care guidance, product options, selection reasons, dated prices and retailer links."),
]
for i, (title, body) in enumerate(steps):
    x = MARGIN + i * (tile_w + gap)
    card(x, top, tile_w, 76)
    label(title, x + 11, top - 17, 7.6)
    text(body, x + 11, top - 27, tile_w - 22, 9.3, 12.2)

left_x, left_w, right_x, right_w = 40, 312, 368, 204
label("KEY FEATURES", left_x, 467)
y = 454
features = [
    ("Real image inference", "The working dermoscopic demo ranks seven lesion categories using trained model weights, with uncertainty handling and a genuine activation overlay."),
    ("Usable, private image workflow", "Drag-and-drop, file and camera input; preview, replace and delete controls; resolution, blur and exposure checks. Default inference keeps uploads on the device."),
    ("Personalized skincare education", "Survey-based catalog choices respect selected ingredient exclusions, texture preferences and owned basics. Each category has a top catalog match, alternatives, dated prices and shopping links."),
    ("Reasons and everyday habits", "Explain why each product fits the stated preferences, provide simple care habits, and prioritize professional evaluation for concerning changes."),
    ("Transparent research", "Condition education, model and dataset provenance, measured evaluation reports, failure states, and documented limitations. No fabricated predictions or medical probabilities."),
]
for title, body in features:
    y = text(title, left_x, y, left_w, 10.3, 13, TEAL, True)
    y = text(body, left_x, y - 2, left_w, 9.7, 12.5, INK) - 10

card(right_x, 477, right_w, 309)
label("TECHNICAL BUILD", right_x + 14, 457)
ry = text("<b>Web:</b> Next.js, React, TypeScript, Tailwind CSS, accessible UI components.<br/>"
          "<b>Models:</b> Python, PyTorch, ONNX, browser WebAssembly; optional FastAPI backend.<br/>"
          "<b>Quality:</b> Zod validation, automated unit and browser tests, GitHub Actions.", right_x + 14, 445, right_w - 28, 9.2, 11.5)
label("MEASURED DEMO", right_x + 14, ry - 20)
ry = text("The dermoscopic benchmark achieved <b>84.1% accuracy</b> and <b>0.634 macro-F1</b> on 1,218 held-out images. Melanoma recall was 55.7%; these results do not establish clinical safety.", right_x + 14, ry - 30, right_w - 28, 9.2, 11.5)
label("ONGOING RESEARCH", right_x + 14, ry - 20)
ry = text("Current development explores DINOv2 vision-transformer models for ordinary skin photographs and additional research categories, using SCIN and corrected Fitzpatrick17k-C. Independent evaluation and deployment checks guide which capabilities are introduced.", right_x + 14, ry - 30, right_w - 28, 9.2, 11.5)

if y < 141 or ry < 180:
    raise RuntimeError(f"Content overflow: left={y}, right={ry}")
c.setStrokeColor(LINE); c.line(40, 146, 572, 146)
text("<b>Intended impact:</b> Help people ask better questions about skin health and compare basic care options without treating an AI label as a diagnosis. Clinical review, external evaluation and commercial rights clearance remain future requirements.", 40, 135, 532, 9.5, 12.5)
text("<b>Disclosure:</b> Rebuild of the original SkinSnap prototype; prior work, third-party data/models and AI-assisted development are documented. Research data have specific licensing restrictions.", 40, 96, 532, 8.5, 11, MUTED)
text('<b>Source:</b> <link href="https://github.com/JaivardhanSamadhiya/SkinDetector" color="#164C46">github.com/JaivardhanSamadhiya/SkinDetector</link>', 40, 66, 532, 9, 12)
label("PROJECT DESCRIPTION  /  STATUS AS OF 13 OCTOBER 2026  /  EDUCATIONAL RESEARCH", 40, 29, 7.3)
c.showPage(); c.save()
print(OUTPUT)
