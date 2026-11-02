"""Generate the Keystone website pages (Hebrew and English) into ../public.

Run:  python tools/build.py
All copy lives here so both languages stay in step. No dependencies.
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
UPDATED = {"he": "2 בנובמבר 2026", "en": "2 November 2026"}
SITE = "https://keystone.org.il"

ARCH = [
    ("M5 91 L95 91 L95 95 L5 95Z", "s d1"),
    ("M9 75.6 L23 75.6 L23 89.4 L9 89.4Z", "s d2"), ("M77 75.6 L91 75.6 L91 89.4 L77 89.4Z", "s d2"),
    ("M9 56.9 L23 56.9 L23 74 L9 74Z", "s d3"), ("M77 56.9 L91 56.9 L91 74 L77 74Z", "s d3"),
    ("M91 56A41 41 0 0 0 88.859 42.923L75.59 47.388A27 27 0 0 1 77 56Z", "s d4"),
    ("M11.141 42.923A41 41 0 0 0 9 56L23 56A27 27 0 0 1 24.41 47.388Z", "s d4"),
    ("M88.173 41.04A41 41 0 0 0 82.042 30.421L71.101 39.155A27 27 0 0 1 75.139 46.148Z", "s d5"),
    ("M17.958 30.421A41 41 0 0 0 11.827 41.04L24.861 46.148A27 27 0 0 1 28.899 39.155Z", "s d5"),
    ("M80.755 28.886A41 41 0 0 0 71.361 21.004L64.067 32.954A27 27 0 0 1 70.253 38.145Z", "s d6"),
    ("M28.639 21.004A41 41 0 0 0 19.245 28.886L29.747 38.145A27 27 0 0 1 35.933 32.954Z", "s d6"),
    ("M69.626 20.003A41 41 0 0 0 58.804 15.956L55.798 29.63A27 27 0 0 1 62.925 32.294Z", "s d7"),
    ("M41.196 15.956A41 41 0 0 0 30.374 20.003L37.075 32.294A27 27 0 0 1 44.202 29.63Z", "s d7"),
]
KEY = ("M44.19 9.408 L46.527 11.308 L53.473 11.308 L55.81 9.408Z"
       "M56.756 10.572 L54.419 12.472 L51.052 28.593 L52.596 30.493Z"
       "M51.432 31.439 L49.888 29.539 L50.112 29.539 L48.568 31.439Z"
       "M47.404 30.493 L48.948 28.593 L45.581 12.472 L43.244 10.572Z"
       "M47.184 12.808 L50.365 28.039 L49.635 28.039 L52.816 12.808Z")
ALL_ARCH = "".join(d for d, _ in ARCH) + KEY
GRAD = ('<defs><linearGradient id="{id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">'
        '<stop offset="0" stop-color="#7d5f25"/><stop offset=".42" stop-color="#f6e2a4"/>'
        '<stop offset=".68" stop-color="#7d5f25"/><stop offset="1" stop-color="#f6e2a4"/></linearGradient></defs>')


def mark(size_class="", gid="g-mark"):
    return (f'<svg class="{size_class}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
            f'{GRAD.format(id=gid)}<path fill="url(#{gid})" d="{ALL_ARCH}"/></svg>')


def hero_arch(label):
    stones = "".join(f'<path class="{c}" d="{d}"/>' for d, c in ARCH)
    return (f'<svg class="arch" viewBox="0 0 100 100" role="img" aria-label="{label}">'
            f'{GRAD.format(id="mirror")}{stones}<path class="k" d="{KEY}"/></svg>')


T = {
    "he": {
        "dir": "rtl", "other": "en", "other_label": "English", "other_href": "/en/",
        "home": "/", "skip": "דילוג לתוכן הראשי", "menu": "תפריט",
        "brand_word": "KEYSTONE", "site_name": "קיסטון",
        "nav": [("#services", "שירותים"), ("#process", "תהליך העבודה"), ("#calculator", "מחשבון"), ("#about", "מי אנחנו"), ("#contact", "צרו קשר")],
        "title": "קיסטון | ייעול עסקים, אוטומציה, מערכות ואתרים",
        "desc": "קיסטון לומדת איך העסק שלכם עובד ומחליפה עבודה ידנית חוזרת באוטומציה, במערכות ובאתרים שחוסכים זמן וכסף.",
        "hero_label": "לוגו קיסטון: קשת אבנים שאבן הראשה נועלת אותה",
        "h1": "העסק שלכם יכול לעבוד הרבה יותר חכם.",
        "lede": "אנחנו לומדים איך העסק שלכם עובד ביום-יום, ומחליפים עבודה ידנית חוזרת באוטומציות, במערכות ובאתרים שחוסכים זמן וכסף.",
        "cta": "קבעו שיחת היכרות", "cta2": "איך אנחנו עובדים",
        "story_quote": "בקשת אבנים, אבן הראשה היא האחרונה שמניחים. היא זו שמחזיקה את כל השאר במקום.",
        "story": ["זה התפקיד שאנחנו לוקחים בעסק שלכם. לא עוד תוכנה שמישהו צריך לתחזק, אלא החיבור בין האנשים, הכלים והתהליכים שכבר יש לכם, כך שהכול יחזיק יחד ויעבוד בלי מאמץ מיותר.",
                  "אנחנו מתחילים מהעבודה עצמה: איפה הולך הזמן, מה מוקלד פעמיים, מה נשען על זיכרון של עובד אחד. משם בונים בדיוק את מה שצריך."],
        "services_h": "מה אנחנו עושים",
        "services_p": "שלושה תחומים, ובכולם אותה שאלה: מה יחסוך לכם הכי הרבה זמן וטעויות.",
        "services": [
            ("ייעול ואוטומציה של תהליכים",
             "יושבים איתכם, ממפים איך העבודה זורמת היום, ומזהים איפה היא נתקעת: הקלדה כפולה, העתקה בין מערכות, מעקב בגיליונות, תזכורות ידניות. את מה שאפשר, הופכים לאוטומטי.",
             ["הפקת מסמכים, הצעות מחיר וחשבוניות", "סנכרון נתונים בין מערכות", "תזכורות ומעקב אחר לקוחות", "דוחות שמתעדכנים לבד"]),
            ("מערכות לעסק",
             "מערכת לניהול לקוחות, כלי פנימי לצוות, חיבור בין התוכנות שכבר יש לכם, או עוזר מבוסס בינה מלאכותית שעונה על שאלות חוזרות. בונים את מה שהעסק צריך, ולא את מה שנוח למכור.",
             ["ניהול לקוחות ופניות", "כלים פנימיים לצוות", "חיבורים בין תוכנות קיימות", "עוזרים מבוססי בינה מלאכותית"]),
            ("אתרים",
             "אתרים מהירים, מאובטחים ונגישים, שנבנים סביב מה שהלקוחות שלכם צריכים למצוא ולעשות. כל אתר עומד בתקן הנגישות הישראלי וכולל מדיניות פרטיות.",
             ["אתרי תדמית ושירות", "טפסים שמגיעים ישר למערכת", "נגישות לפי ת״י 5568", "אבטחה ופרטיות כבר מהתכנון"]),
        ],
        "process_h": "איך אנחנו עובדים",
        "process_p": "ארבעה שלבים, ובסוף כל אחד יודעים בדיוק איפה עומדים.",
        "steps": [
            ("לומדים", "נפגשים, מבינים את העסק ואת מה שמעיק. ממפים את התהליכים ומחשבים כמה זמן וכסף הם עולים היום."),
            ("מתכננים", "מקבלים מסמך ברור: מה נבנה, למה, כמה זה עולה ומתי זה מוכן. בלי הפתעות בהמשך."),
            ("בונים", "בונים בשלבים קצרים ומראים התקדמות לאורך הדרך, כך שאפשר לכוון בזמן."),
            ("מלווים", "מדריכים את הצוות, מתעדים הכול ונשארים זמינים לתמיכה ולשיפורים."),
        ],
        "calc_h": "כמה עולה לכם משימה חוזרת?",
        "calc_p": "בחרו משימה אחת שחוזרת על עצמה בעסק, ובדקו כמה היא עולה בשנה.",
        "calc_fields": [("c-minutes", "כמה דקות לוקחת כל פעם", "15"), ("c-times", "כמה פעמים בשבוע", "20"),
                        ("c-people", "כמה אנשים עושים אותה", "1"), ("c-rate", "עלות שעת עבודה בשקלים", "80")],
        "calc_hours": "שעות עבודה בשנה", "calc_cost": "שקלים בשנה", "calc_btn": "חישוב",
        "calc_note": "החישוב מניח 48 שבועות עבודה בשנה, והוא הערכה בלבד. זו בדיוק הנקודה שממנה אנחנו מתחילים בשיחת ההיכרות.",
        "calc_aria": "התוצאה",
        "principles_h": "מה אפשר לצפות מאיתנו",
        "principles": [
            ("הצעת מחיר כתובה לפני שמתחילים", "יודעים מראש מה מקבלים, כמה זה עולה ומתי."),
            ("הנתונים שלכם נשארים שלכם", "החשבונות, הקוד והמידע רשומים על שמכם, ואפשר לקחת אותם לכל מקום."),
            ("תיעוד מלא", "כל מה שבנינו מתועד, כך שהצוות שלכם, או כל מי שתבחרו, יוכל להמשיך."),
            ("אבטחה ופרטיות מההתחלה", "חושבים על הרשאות, גיבויים והגנה על מידע אישי כבר בשלב התכנון."),
        ],
        "about_h": "מי אנחנו",
        "about": ["קיסטון הוקמה על ידי שחר ואור. אנחנו עובדים ישירות מול הלקוחות שלנו: מי שלומד את העסק שלכם הוא גם מי שבונה את הפתרון.",
                  "זה אומר שאין טלפון שבור בין מי שמבין את הבעיה לבין מי שפותר אותה."],
        "founders": [("שחר", "שותף מייסד", "shahar@keystone.org.il"), ("אור", "שותף מייסד", "or@keystone.org.il")],
        "contact_h": "בואו נדבר",
        "contact_p": "ספרו לנו בכמה מילים מה מעיק עליכם בעסק, ונחזור אליכם.",
        "direct": "אפשר גם לכתוב לנו ישירות:",
        "f": {"name": "שם מלא", "business": "שם העסק", "email": "אימייל", "phone": "טלפון", "message": "במה נוכל לעזור?",
              "message_hint": "לדוגמה: אנחנו מעתיקים הזמנות מהאתר לגיליון ידנית כל יום.",
              "consent": 'קראתי את <a href="/privacy">מדיניות הפרטיות</a>, ואני מסכים או מסכימה שתשתמשו בפרטים כדי לחזור אליי בנוגע לפנייה.',
              "notice": "הפרטים נשמרים אצלנו בלבד ומשמשים רק כדי לחזור אליכם. אינכם חייבים למסור אותם, אבל בלעדיהם לא נוכל לענות. לא נשלח לכם דיוור שיווקי.",
              "required": "שדה חובה", "submit": "שליחת הפנייה", "hp": "השאירו את השדה הזה ריק"},
        "msg": {"name": "כתבו את שמכם המלא.", "email": "כתבו כתובת אימייל תקינה, למשל name@example.com.",
                "phone": "מספר הטלפון יכול להכיל ספרות, רווחים, מקפים וסימן פלוס.", "message": "כתבו לפחות כמה מילים, כדי שנבין במה מדובר.",
                "consent": "כדי שנוכל לחזור אליכם, צריך לאשר את מדיניות הפרטיות.", "sending": "שולחים…", "submit": "שליחת הפנייה",
                "sent": "הפנייה נשלחה. נחזור אליכם בהקדם.", "failed": "הפנייה לא נשלחה. נסו שוב, או כתבו לנו ישירות בדוא״ל.",
                "rate": "נשלחו כמה פניות ברצף. נסו שוב בעוד כמה דקות.", "invalid": "חלק מהשדות לא מולאו נכון. תקנו אותם ושלחו שוב."},
        "footer_links": [("/privacy", "מדיניות פרטיות"), ("/terms", "תנאי שימוש"), ("/accessibility", "הצהרת נגישות")],
        "footer_small": "© 2026 קיסטון. כל הזכויות שמורות.",
        "thanks_title": "הפנייה התקבלה | קיסטון", "thanks_h": "הפנייה התקבלה.", "thanks_p": "תודה. נקרא אותה ונחזור אליכם בהקדם.", "back": "חזרה לדף הבית",
        "nf_title": "הדף לא נמצא | קיסטון", "nf_h": "הדף הזה לא קיים.", "nf_p": "ייתכן שהקישור שגוי או שהדף הועבר.",
        "updated_label": "עדכון אחרון:",
    },
    "en": {
        "dir": "ltr", "other": "he", "other_label": "עברית", "other_href": "/",
        "home": "/en/", "skip": "Skip to main content", "menu": "Menu",
        "brand_word": "KEYSTONE", "site_name": "Keystone",
        "nav": [("#services", "Services"), ("#process", "How we work"), ("#calculator", "Calculator"), ("#about", "About"), ("#contact", "Contact")],
        "title": "Keystone | Business workflow, automation, systems and websites",
        "desc": "Keystone studies how your business works and replaces repetitive manual work with automation, systems and websites that save time and money.",
        "hero_label": "Keystone logo: a stone archway locked by its keystone",
        "h1": "Your business can work a lot smarter.",
        "lede": "We learn how your business runs day to day, then replace repetitive manual work with automation, systems and websites that save time and money.",
        "cta": "Book an intro call", "cta2": "How we work",
        "story_quote": "In a stone arch, the keystone is the last stone set in place. It is the one that holds all the others.",
        "story": ["That is the role we take in your business. Not one more piece of software to maintain, but the link between the people, tools and processes you already have, so everything holds together and runs without wasted effort.",
                  "We start with the work itself: where the time goes, what gets typed twice, what depends on one person remembering. Then we build exactly what is needed."],
        "services_h": "What we do",
        "services_p": "Three areas, one question in each: what will save you the most time and the most mistakes.",
        "services": [
            ("Workflow and automation",
             "We sit with you, map how work flows today and find where it gets stuck: double typing, copying between systems, tracking in spreadsheets, manual reminders. What can be automated, we automate.",
             ["Documents, quotes and invoices", "Data synced between systems", "Customer reminders and follow-ups", "Reports that update themselves"]),
            ("Business systems",
             "A customer management system, an internal tool for your team, connections between the software you already use, or an AI assistant that answers recurring questions. We build what the business needs, not what is easiest to sell.",
             ["Customer and inquiry management", "Internal tools for your team", "Connections between existing software", "AI assistants"]),
            ("Websites",
             "Fast, secure and accessible websites, built around what your customers need to find and do. Every site meets the Israeli accessibility standard and includes a privacy policy.",
             ["Company and service websites", "Forms that feed straight into your systems", "Accessibility to IS 5568", "Security and privacy by design"]),
        ],
        "process_h": "How we work",
        "process_p": "Four stages. At the end of each one you know exactly where things stand.",
        "steps": [
            ("Learn", "We meet, understand the business and what is weighing on it, map the processes and work out what they cost in time and money today."),
            ("Plan", "You get a clear document: what we will build, why, what it costs and when it will be ready. No surprises later."),
            ("Build", "We build in short stages and show progress along the way, so the direction can be adjusted in time."),
            ("Support", "We train your team, document everything and stay available for support and improvements."),
        ],
        "calc_h": "What does a repeated task cost you?",
        "calc_p": "Pick one task that repeats in your business and see what it costs in a year.",
        "calc_fields": [("c-minutes", "Minutes it takes each time", "15"), ("c-times", "Times per week", "20"),
                        ("c-people", "People who do it", "1"), ("c-rate", "Cost of an hour of work (₪)", "80")],
        "calc_hours": "working hours a year", "calc_cost": "shekels a year", "calc_btn": "Calculate",
        "calc_note": "Based on 48 working weeks a year, and an estimate only. It is exactly where we start in the intro call.",
        "calc_aria": "Result",
        "principles_h": "What you can expect from us",
        "principles": [
            ("A written quote before we start", "You know in advance what you get, what it costs and when."),
            ("Your data stays yours", "Accounts, code and information are registered in your name, and you can take them anywhere."),
            ("Full documentation", "Everything we build is documented, so your team, or anyone you choose, can carry on."),
            ("Security and privacy from day one", "Permissions, backups and protection of personal data are part of the plan from the start."),
        ],
        "about_h": "About us",
        "about": ["Keystone was founded by Shahar and Or. We work directly with our clients: the person who learns your business is the person who builds the solution.",
                  "There is no broken telephone between whoever understands the problem and whoever solves it."],
        "founders": [("Shahar", "Co-founder", "shahar@keystone.org.il"), ("Or", "Co-founder", "or@keystone.org.il")],
        "contact_h": "Let’s talk",
        "contact_p": "Tell us in a few words what is weighing on your business, and we will get back to you.",
        "direct": "You can also write to us directly:",
        "f": {"name": "Full name", "business": "Business name", "email": "Email", "phone": "Phone", "message": "How can we help?",
              "message_hint": "For example: every day we copy website orders into a spreadsheet by hand.",
              "consent": 'I have read the <a href="/en/privacy">privacy policy</a> and agree that you use these details to reply to my inquiry.',
              "notice": "Your details stay with us and are used only to reply to you. You are not required to provide them, but without them we cannot answer. We will not send you marketing email.",
              "required": "required", "submit": "Send inquiry", "hp": "Leave this field empty"},
        "msg": {"name": "Enter your full name.", "email": "Enter a valid email address, for example name@example.com.",
                "phone": "A phone number can contain digits, spaces, dashes and a plus sign.", "message": "Write at least a few words so we understand what this is about.",
                "consent": "To reply to you, we need you to accept the privacy policy.", "sending": "Sending…", "submit": "Send inquiry",
                "sent": "Inquiry sent. We will get back to you soon.", "failed": "The inquiry was not sent. Try again, or email us directly.",
                "rate": "Several inquiries were sent in a row. Try again in a few minutes.", "invalid": "Some fields are not filled in correctly. Fix them and send again."},
        "footer_links": [("/en/privacy", "Privacy policy"), ("/en/terms", "Terms of use"), ("/en/accessibility", "Accessibility statement")],
        "footer_small": "© 2026 Keystone. All rights reserved.",
        "thanks_title": "Inquiry received | Keystone", "thanks_h": "Inquiry received.", "thanks_p": "Thank you. We will read it and get back to you soon.", "back": "Back to the home page",
        "nf_title": "Page not found | Keystone", "nf_h": "This page does not exist.", "nf_p": "The link may be wrong, or the page may have moved.",
        "updated_label": "Last updated:",
    },
}


def esc(s):
    return html.escape(s, quote=True)


def head(lang, title, desc, path, alt_path):
    t = T[lang]
    other = t["other"]
    return f"""<!doctype html>
<html lang="{lang}" dir="{t['dir']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}{path}">
<link rel="alternate" hreflang="{lang}" href="{SITE}{path}">
<link rel="alternate" hreflang="{other}" href="{SITE}{alt_path}">
<link rel="alternate" hreflang="x-default" href="{SITE}/">
<meta name="theme-color" content="#18181b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(t['site_name'])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:image" content="{SITE}/assets/img/og.png">
<meta property="og:locale" content="{'he_IL' if lang == 'he' else 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/cormorant-600.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
<script src="/assets/js/site.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">{esc(t['skip'])}</a>"""


def header(lang, on_home, alt_path):
    t = T[lang]
    prefix = "" if on_home else t["home"]
    items = "".join(f'<li><a href="{prefix}{h}">{esc(label)}</a></li>' for h, label in t["nav"])
    return f"""
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="{t['home']}" aria-label="{esc(t['site_name'])}">{mark()}<span class="brand-word">{t['brand_word']}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">{esc(t['menu'])}</button>
    <nav class="nav" id="site-nav" aria-label="{esc(t['menu'])}">
      <ul>{items}</ul>
      <a class="lang-switch" href="{alt_path}" hreflang="{t['other']}" lang="{t['other']}">{t['other_label']}</a>
    </nav>
  </div>
</header>"""


def footer(lang):
    t = T[lang]
    links = "".join(f'<li><a href="{h}">{esc(label)}</a></li>' for h, label in t["footer_links"])
    return f"""
<footer class="site-footer">
  <div class="wrap">
    <div>
      <a class="brand" href="{t['home']}" aria-label="{esc(t['site_name'])}">{mark(gid='g-foot')}<span class="brand-word">{t['brand_word']}</span></a>
      <p class="small">{esc(t['footer_small'])}</p>
    </div>
    <nav aria-label="{'קישורים משפטיים' if lang == 'he' else 'Legal links'}"><ul>{links}</ul></nav>
  </div>
</footer>
</body>
</html>
"""


def home(lang):
    t = T[lang]
    path, alt = ("/", "/en/") if lang == "he" else ("/en/", "/")
    services = "".join(
        f'<li class="service"><h3>{esc(h)}</h3><div><p>{esc(p)}</p><ul>' + "".join(f"<li>{esc(x)}</li>" for x in xs) + "</ul></div></li>"
        for h, p, xs in t["services"])
    steps = "".join(f'<li class="step"><h3>{esc(h)}</h3><p>{esc(p)}</p></li>' for h, p in t["steps"])
    fields = "".join(
        f'<div class="field"><label for="{i}">{esc(l)}</label><input id="{i}" name="{i}" type="number" inputmode="decimal" min="0" step="any" value="{v}"></div>'
        for i, l, v in t["calc_fields"])
    principles = "".join(f"<li><h3>{esc(h)}</h3><p>{esc(p)}</p></li>" for h, p in t["principles"])
    founders = "".join(
        f'<div class="founder"><p class="fname">{esc(n)}</p><p class="frole">{esc(r)}</p><a href="mailto:{e}" dir="ltr">{e}</a></div>'
        for n, r, e in t["founders"])
    f = t["f"]
    m = t["msg"]
    data_msgs = " ".join(f'data-msg-{k}="{esc(v)}"' for k, v in m.items())
    req = f'<span class="req" aria-hidden="true">*</span><span class="visually-hidden"> ({esc(f["required"])})</span>'

    def field(name, label, typ="text", required=False, auto="", extra="", hint=""):
        hint_html = f'<p class="hint" id="hint-{name}">{esc(hint)}</p>' if hint else ""
        described = f"err-{name}" + (f" hint-{name}" if hint else "")
        r = " required" if required else ""
        control = (f'<textarea id="f-{name}" name="{name}" maxlength="4000" aria-describedby="{described}"{r}></textarea>' if typ == "textarea"
                   else f'<input id="f-{name}" name="{name}" type="{typ}" autocomplete="{auto}" aria-describedby="{described}"{r}{extra}>')
        return (f'<div class="field"><label for="f-{name}">{esc(label)}{req if required else ""}</label>{hint_html}{control}'
                f'<p class="error" id="err-{name}" role="alert"></p></div>')

    emails = "".join(f'<a href="mailto:{e}" dir="ltr">{e}</a>' for _, _, e in t["founders"])
    body = f"""{head(lang, t['title'], t['desc'], path, alt)}{header(lang, True, alt)}
<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap">
      <div>
        <h1 id="hero-title"><span class="name">{esc(t['site_name']) if lang == 'he' else 'KEYSTONE'}</span>{esc(t['h1'])}</h1>
        <p class="lede">{esc(t['lede'])}</p>
        <div class="actions">
          <a class="btn btn-gold" href="#contact">{esc(t['cta'])}</a>
          <a class="btn btn-line" href="#process">{esc(t['cta2'])}</a>
        </div>
      </div>
      {hero_arch(esc(t['hero_label']))}
    </div>
  </section>

  <section class="section story" aria-label="{esc(t['site_name'])}">
    <div class="wrap">
      <p class="quote">{esc(t['story_quote'])}</p>
      <div>{''.join(f'<p>{esc(p)}</p>' for p in t['story'])}</div>
    </div>
  </section>

  <section class="section" id="services" aria-labelledby="services-title">
    <div class="wrap">
      <div class="section-head"><h2 id="services-title">{esc(t['services_h'])}</h2><p>{esc(t['services_p'])}</p></div>
      <ul class="services">{services}</ul>
    </div>
  </section>

  <section class="section" id="process" aria-labelledby="process-title">
    <div class="wrap">
      <div class="section-head"><h2 id="process-title">{esc(t['process_h'])}</h2><p>{esc(t['process_p'])}</p></div>
      <ol class="steps">{steps}</ol>
    </div>
  </section>

  <section class="section" id="calculator" aria-labelledby="calc-title">
    <div class="wrap">
      <div class="section-head"><h2 id="calc-title">{esc(t['calc_h'])}</h2><p>{esc(t['calc_p'])}</p></div>
      <div class="calc">
        <form id="calc-form" action="#calculator">{fields}<noscript><p class="muted">{'המחשבון דורש JavaScript.' if lang == 'he' else 'The calculator needs JavaScript.'}</p></noscript></form>
        <div class="calc-result" role="status" aria-live="polite" aria-label="{esc(t['calc_aria'])}">
          <p class="figure"><span class="num" id="calc-hours">240</span><span class="unit">{esc(t['calc_hours'])}</span></p>
          <p class="figure"><span class="num" id="calc-cost">19,200</span><span class="unit">{esc(t['calc_cost'])}</span></p>
          <p class="calc-note">{esc(t['calc_note'])}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="principles-title">
    <div class="wrap">
      <div class="section-head"><h2 id="principles-title">{esc(t['principles_h'])}</h2></div>
      <ul class="principles">{principles}</ul>
    </div>
  </section>

  <section class="section about" id="about" aria-labelledby="about-title">
    <div class="wrap">
      <div><h2 id="about-title">{esc(t['about_h'])}</h2><div class="section-head" style="margin:22px 0 0">{''.join(f'<p>{esc(p)}</p>' for p in t['about'])}</div></div>
      <div class="founders">{founders}</div>
    </div>
  </section>

  <section class="section contact" id="contact" aria-labelledby="contact-title">
    <div class="wrap">
      <div>
        <h2 id="contact-title">{esc(t['contact_h'])}</h2>
        <p class="lede" style="margin-top:18px">{esc(t['contact_p'])}</p>
        <div class="contact-direct"><p class="muted">{esc(t['direct'])}</p>{emails}</div>
      </div>
      <form class="contact-form" id="contact-form" action="/api/contact" method="post" novalidate {data_msgs}>
        <input type="hidden" name="lang" value="{lang}">
        <div class="row">{field('name', f['name'], required=True, auto='name')}{field('business', f['business'], auto='organization')}</div>
        <div class="row">{field('email', f['email'], 'email', True, 'email', ' dir="ltr" inputmode="email"')}{field('phone', f['phone'], 'tel', False, 'tel', ' dir="ltr" inputmode="tel"')}</div>
        {field('message', f['message'], 'textarea', True, hint=f['message_hint'])}
        <div class="hp" aria-hidden="true"><label for="f-website">{esc(f['hp'])}</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="field"><div class="check"><input id="f-consent" name="consent" type="checkbox" value="yes" required aria-describedby="err-consent notice"><label for="f-consent">{f['consent']}{req}</label></div><p class="error" id="err-consent" role="alert"></p></div>
        <p class="notice" id="notice">{esc(f['notice'])}</p>
        <div><button class="btn btn-gold" type="submit">{esc(f['submit'])}</button></div>
        <p class="form-status" id="form-status" role="status" tabindex="-1"></p>
      </form>
    </div>
  </section>
</main>{footer(lang)}"""
    return body.replace(' style="margin:22px 0 0"', ' data-gap').replace(' style="margin-top:18px"', ' data-gap')


def simple(lang, title, h, p, path, alt):
    t = T[lang]
    return (f"{head(lang, title, T[lang]['desc'], path, alt)}{header(lang, False, alt)}\n<main id=\"main\"><div class=\"wrap center-page\">"
            f"<h1>{esc(h)}</h1><p class=\"lede\">{esc(p)}</p><a class=\"btn btn-line\" href=\"{t['home']}\">{esc(t['back'])}</a></div></main>{footer(lang)}")


def doc(lang, title, h1, sections, path, alt):
    t = T[lang]
    body = "".join(f"<h2>{esc(sh)}</h2>{content}" for sh, content in sections)
    return (f"{head(lang, title, T[lang]['desc'], path, alt)}{header(lang, False, alt)}\n<main id=\"main\" class=\"doc\"><div class=\"wrap\"><h1>{esc(h1)}</h1>"
            f"<p class=\"updated\">{esc(t['updated_label'])} {esc(UPDATED[lang])}</p>{body}</div></main>{footer(lang)}")


def P(*paras):
    return "".join(f"<p>{x}</p>" for x in paras)


def UL(*items):
    return "<ul>" + "".join(f"<li>{x}</li>" for x in items) + "</ul>"


MAIL_S = '<a href="mailto:shahar@keystone.org.il" dir="ltr">shahar@keystone.org.il</a>'
MAIL_O = '<a href="mailto:or@keystone.org.il" dir="ltr">or@keystone.org.il</a>'

PRIVACY = {
    "he": ("מדיניות פרטיות | קיסטון", "מדיניות פרטיות", [
        ("מי אנחנו", P("האתר keystone.org.il מופעל על ידי קיסטון (להלן: ״אנחנו״). מדיניות זו מסבירה איזה מידע אישי נאסף באתר, למה, ומה הזכויות שלכם, בהתאם לחוק הגנת הפרטיות, התשמ״א-1981 ותיקוניו, ובכלל זה תיקון 13.",
                       f"לכל שאלה או בקשה בנושא פרטיות אפשר לפנות אלינו בדוא״ל {MAIL_S}.")),
        ("איזה מידע אנחנו אוספים", P("<strong>מידע שאתם מוסרים בטופס יצירת הקשר:</strong> שם מלא, אימייל ותוכן הפנייה (חובה), ושם העסק ומספר טלפון (רשות).",
                                     "<strong>מידע טכני:</strong> כמו בכל אתר, ספק האחסון עשוי לשמור רישומי שרת סטנדרטיים (כתובת IP, סוג הדפדפן ושעת הגישה) לצורכי אבטחה ותפעול. אנחנו משתמשים בכתובת ה-IP באופן זמני רק כדי למנוע שליחה חוזרת ומוגזמת של הטופס, ולא שומרים אותה יחד עם הפנייה.")),
        ("עוגיות ומעקב", P("האתר לא משתמש בעוגיות (Cookies), לא בכלי ניתוח תנועה, לא בפיקסלים של רשתות חברתיות ולא בפרסום ממוקד. אין צורך באישור עוגיות, כי אין כאלה.")),
        ("למה אנחנו משתמשים במידע", P("רק כדי לקרוא את הפנייה שלכם, לחזור אליכם ולנהל את ההתכתבות בנוגע אליה. איננו משתמשים במידע לדיוור שיווקי, איננו מוכרים אותו ואיננו משתפים אותו לצורכי פרסום.")),
        ("האם חובה למסור את המידע", P("אין חובה חוקית למסור לנו מידע. אם לא תמסרו שם, אימייל ותוכן פנייה, לא נוכל לחזור אליכם.")),
        ("למי המידע מועבר", P("המידע נשמר בשרת האתר אצל ספק האחסון שלנו, ומגיע אלינו בדוא״ל. לא נעביר אותו לאף גורם אחר, אלא אם נידרש לכך על פי דין או צו של רשות מוסמכת.")),
        ("אבטחת מידע", P("התקשורת עם האתר מוצפנת (HTTPS). הפניות נשמרות מחוץ לתיקיות הציבוריות של האתר, עם הרשאות גישה מוגבלות, והגישה אליהן שמורה לשחר ולאור בלבד. האתר מוגן בכותרות אבטחה, בהגבלת קצב שליחה ובבדיקת מקור הבקשות. אף מערכת אינה חסינה לחלוטין, ואם יתרחש אירוע אבטחה חמור נפעל כנדרש בחוק.")),
        ("כמה זמן נשמר המידע", P("פניות נשמרות עד 24 חודשים ממועד קבלתן, ונמחקות אוטומטית בתום התקופה. אם תתחילו לעבוד איתנו, נשמור את ההתכתבות כל עוד היא נדרשת לצורך השירות ולפי חובותינו על פי דין.")),
        ("הזכויות שלכם", P("על פי חוק הגנת הפרטיות, אתם רשאים לעיין במידע שנשמר עליכם, לבקש לתקן מידע שגוי, ולבקש למחוק את הפנייה שלכם.",
                           f"כדי לממש זכות, כתבו לנו לכתובת {MAIL_S} ונענה תוך 30 יום. אם אינכם מרוצים מהטיפול, אפשר לפנות לרשות להגנת הפרטיות במשרד המשפטים.")),
        ("קטינים", P("האתר מיועד לבעלי עסקים ולמבוגרים. איננו אוספים ביודעין מידע על קטינים.")),
        ("שינויים במדיניות", P("אם נשנה את המדיניות, נעדכן כאן את התאריך בראש הדף. שינוי מהותי יחול רק על מידע שייאסף אחרי העדכון.")),
    ]),
    "en": ("Privacy policy | Keystone", "Privacy policy", [
        ("Who we are", P("The website keystone.org.il is operated by Keystone (“we”). This policy explains what personal information the site collects, why, and what your rights are, in line with the Israeli Protection of Privacy Law, 5741-1981, as amended, including Amendment 13. If this English version and the Hebrew version differ, the Hebrew version prevails.",
                         f"For any privacy question or request, email {MAIL_S}.")),
        ("What we collect", P("<strong>What you give us in the contact form:</strong> full name, email and your message (required), and business name and phone number (optional).",
                              "<strong>Technical information:</strong> as with any website, our hosting provider may keep standard server logs (IP address, browser type and time of access) for security and operation. We use your IP address only temporarily, to prevent excessive repeat submissions, and do not store it with your inquiry.")),
        ("Cookies and tracking", P("This site uses no cookies, no analytics, no social media pixels and no targeted advertising. There is no cookie banner because there are no cookies.")),
        ("How we use it", P("Only to read your inquiry, reply to you and manage our correspondence about it. We do not use it for marketing email, do not sell it and do not share it for advertising.")),
        ("Do you have to give it", P("There is no legal obligation to give us any information. Without a name, an email and a message, we cannot reply.")),
        ("Who receives it", P("Your inquiry is stored on the website server at our hosting provider and reaches us by email. We do not pass it to anyone else unless the law or a competent authority requires it.")),
        ("Security", P("Traffic to the site is encrypted (HTTPS). Inquiries are stored outside the public folders of the site with restricted permissions, and only Shahar and Or can access them. The site uses security headers, rate limiting and origin checks. No system is completely immune; if a serious security incident occurs we will act as the law requires.")),
        ("How long we keep it", P("Inquiries are kept for up to 24 months from receipt and are then deleted automatically. If you start working with us, we keep the correspondence for as long as the service and our legal duties require.")),
        ("Your rights", P("Under the Protection of Privacy Law you may review the information we hold about you, ask us to correct it, and ask us to delete your inquiry.",
                          f"To use any of these rights, email {MAIL_S} and we will reply within 30 days. If you are not satisfied, you may contact the Privacy Protection Authority at the Israeli Ministry of Justice.")),
        ("Minors", P("The site is meant for business owners and adults. We do not knowingly collect information about minors.")),
        ("Changes", P("If we change this policy we will update the date at the top of this page. A material change applies only to information collected after the update.")),
    ]),
}

TERMS = {
    "he": ("תנאי שימוש | קיסטון", "תנאי שימוש", [
        ("כללי", P("השימוש באתר keystone.org.il כפוף לתנאים אלה. הגלישה באתר מהווה הסכמה להם. התנאים מנוסחים בלשון רבים מטעמי נוחות ומתייחסים לכל המגדרים.")),
        ("מטרת האתר", P("האתר מציג את השירותים של קיסטון ומאפשר ליצור איתנו קשר. התוכן באתר הוא מידע כללי, ואינו מהווה הצעה מחייבת, ייעוץ מקצועי או התחייבות לתוצאה. הצעה מחייבת ניתנת רק בכתב, אחרי שיחה ובחינה של הצרכים שלכם.")),
        ("המחשבון", P("המחשבון באתר מחשב הערכה בלבד, לפי הנתונים שאתם מזינים והנחה של 48 שבועות עבודה בשנה. הוא לא מהווה הבטחה לחיסכון כלשהו.")),
        ("קניין רוחני", P("כל הזכויות בתוכן האתר, בעיצובו, בשם ״קיסטון״ ובלוגו שמורות לקיסטון. אין להעתיק, לשכפל או להשתמש בהם ללא אישור בכתב. הגופנים באתר הם Cormorant Garamond (רישיון SIL Open Font) ו-Hadasim CLM מפרויקט Culmus (רישיון GPL עם חריגת גופנים).")),
        ("שימוש אסור", P("אין לנסות לפרוץ לאתר, לשבש את פעולתו, לשלוח דרכו תוכן פוגעני או בלתי חוקי, או להשתמש בטופס לשליחת דואר זבל.")),
        ("זמינות ואחריות", P("אנחנו פועלים כדי שהאתר יהיה זמין, מדויק ומאובטח, אך הוא ניתן כמות שהוא (AS IS). ככל שהדין מתיר, קיסטון לא תישא באחריות לנזק שנגרם משימוש באתר, מהסתמכות על תוכנו או מתקלה בו.")),
        ("קישורים", P("אם האתר יכלול קישורים לאתרים אחרים, איננו אחראים לתוכן שלהם או למדיניות הפרטיות שלהם.")),
        ("פרטיות ונגישות", P('השימוש במידע אישי מתואר ב<a href="/privacy">מדיניות הפרטיות</a>. מידע על נגישות האתר מופיע ב<a href="/accessibility">הצהרת הנגישות</a>.')),
        ("דין וסמכות שיפוט", P("על תנאים אלה חלים דיני מדינת ישראל בלבד, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.")),
        ("יצירת קשר", P(f"שאלות על תנאי השימוש אפשר לשלוח לכתובת {MAIL_S}.")),
    ]),
    "en": ("Terms of use | Keystone", "Terms of use", [
        ("General", P("Use of keystone.org.il is subject to these terms. By browsing the site you accept them. If this English version and the Hebrew version differ, the Hebrew version prevails.")),
        ("Purpose of the site", P("The site presents Keystone’s services and lets you contact us. Its content is general information. It is not a binding offer, professional advice or a promise of any result. A binding offer is given only in writing, after a conversation and a review of your needs.")),
        ("The calculator", P("The calculator gives an estimate only, based on the numbers you enter and an assumption of 48 working weeks a year. It is not a promise of any saving.")),
        ("Intellectual property", P("All rights in the site’s content and design, the name “Keystone” and the logo belong to Keystone. Do not copy, reproduce or use them without written permission. The fonts used are Cormorant Garamond (SIL Open Font License) and Hadasim CLM from the Culmus project (GPL with font exception).")),
        ("Prohibited use", P("Do not attempt to break into the site, disrupt it, send offensive or unlawful content through it, or use the form to send spam.")),
        ("Availability and liability", P("We work to keep the site available, accurate and secure, but it is provided as is. To the extent the law allows, Keystone is not liable for damage caused by use of the site, reliance on its content or any fault in it.")),
        ("Links", P("If the site links to other websites, we are not responsible for their content or their privacy practices.")),
        ("Privacy and accessibility", P('Use of personal information is described in the <a href="/en/privacy">privacy policy</a>. Accessibility information is in the <a href="/en/accessibility">accessibility statement</a>.')),
        ("Law and jurisdiction", P("These terms are governed solely by the laws of the State of Israel, and the competent courts in Israel have exclusive jurisdiction.")),
        ("Contact", P(f"Questions about these terms can be sent to {MAIL_S}.")),
    ]),
}

ACCESS = {
    "he": ("הצהרת נגישות | קיסטון", "הצהרת נגישות", [
        ("המחויבות שלנו", P("אנחנו רואים בנגישות חלק מאיכות העבודה. האתר נבנה כך שיהיה שמיש לכל אדם, כולל אנשים עם מוגבלות, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ״ח-1998, ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013.")),
        ("רמת הנגישות", P("האתר הותאם לדרישות התקן הישראלי ת״י 5568 ברמה AA, המבוסס על הנחיות WCAG 2.0, ושואף לעמוד גם בהנחיות WCAG 2.1 ברמה AA.")),
        ("מה עשינו באתר", UL(
            "מבנה סמנטי של כותרות, אזורים ורשימות, שמאפשר ניווט נוח בקורא מסך.",
            "ניווט מלא במקלדת, עם סימון פוקוס ברור וקישור ״דילוג לתוכן הראשי״.",
            "ניגודיות צבעים גבוהה בין טקסט לרקע, מעבר לדרישת התקן.",
            "הגדלת טקסט עד 200% בלי אובדן תוכן, ותצוגה מותאמת למסכים קטנים.",
            "תוויות ברורות לכל שדות הטפסים, והודעות שגיאה שמסבירות מה לתקן ומוקראות לקוראי מסך.",
            "תיאור טקסטואלי לתמונות ולגרפיקה בעלת משמעות.",
            "הנפשה אחת בלבד בראש הדף, שמבוטלת אוטומטית כשבמערכת ההפעלה מוגדר ״הפחתת תנועה״.",
            "הגדרת שפה וכיוון כתיבה נכונים בכל עמוד, בעברית ובאנגלית.",
            "אין הגבלות זמן, אין תוכן מהבהב ואין שמע או וידאו שמתחילים לבד.",
            "תמיכה במצב ניגודיות גבוהה של Windows.")),
        ("מגבלות ידועות", P("לא ידועות לנו כרגע מגבלות נגישות באתר. אם נתקלתם בבעיה, נשמח לדעת ולתקן.")),
        ("פנייה לרכז הנגישות", P("רכז הנגישות: שחר.", f"דוא״ל: {MAIL_S}",
                                "בפנייה, ציינו את הדף, את הבעיה ואת הדפדפן או הטכנולוגיה המסייעת שבה השתמשתם. נחזור אליכם תוך 14 יום.")),
    ]),
    "en": ("Accessibility statement | Keystone", "Accessibility statement", [
        ("Our commitment", P("We treat accessibility as part of the quality of our work. The site is built to be usable by everyone, including people with disabilities, in line with the Israeli Equal Rights for Persons with Disabilities Law, 5758-1998, and the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 5773-2013.")),
        ("Conformance level", P("The site has been adapted to Israeli Standard IS 5568 at level AA, which is based on WCAG 2.0, and aims to meet WCAG 2.1 level AA as well.")),
        ("What we did", UL(
            "Semantic structure of headings, regions and lists, for comfortable screen reader navigation.",
            "Full keyboard navigation, with clear focus indicators and a “Skip to main content” link.",
            "High contrast between text and background, beyond what the standard requires.",
            "Text can be enlarged to 200% without loss of content, and the layout adapts to small screens.",
            "Clear labels on every form field, and error messages that explain what to fix and are announced to screen readers.",
            "Text alternatives for meaningful images and graphics.",
            "A single animation at the top of the home page, turned off automatically when “reduce motion” is set in the operating system.",
            "Correct language and text direction on every page, in Hebrew and English.",
            "No time limits, no flashing content and no audio or video that starts by itself.",
            "Support for Windows high contrast mode.")),
        ("Known limitations", P("We are not currently aware of accessibility limitations on the site. If you run into a problem, we want to know and fix it.")),
        ("Contact our accessibility coordinator", P("Accessibility coordinator: Shahar.", f"Email: {MAIL_S}",
                                                    "Please include the page, the problem and the browser or assistive technology you used. We will reply within 14 days.")),
    ]),
}


def write(rel, content):
    full = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)
    print("wrote", rel)


def main():
    write("index.html", home("he"))
    write("en/index.html", home("en"))
    for lang, base in (("he", ""), ("en", "en/")):
        alt_base = "en/" if lang == "he" else ""
        for name, data in (("privacy", PRIVACY), ("terms", TERMS), ("accessibility", ACCESS)):
            title, h1, sections = data[lang]
            write(f"{base}{name}.html", doc(lang, title, h1, sections, f"/{base}{name}", f"/{alt_base}{name}"))
        t = T[lang]
        write(f"{base}thanks.html", simple(lang, t["thanks_title"], t["thanks_h"], t["thanks_p"], f"/{base}thanks", f"/{alt_base}thanks"))
        write(f"{base}404.html", simple(lang, t["nf_title"], t["nf_h"], t["nf_p"], f"/{base}404", f"/{alt_base}404"))
    write("favicon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#18181b"/>'
          f'<g transform="translate(14 12) scale(.72)">{GRAD.format(id="f")}<path fill="url(#f)" d="{ALL_ARCH}"/></g></svg>')
    write("assets/img/logo.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{GRAD.format(id="l")}<path fill="url(#l)" d="{ALL_ARCH}"/></svg>')
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n")
    urls = ["/", "/en/", "/privacy", "/en/privacy", "/terms", "/en/terms", "/accessibility", "/en/accessibility"]
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>2026-11-02</lastmod></url>\n" for u in urls) + "</urlset>\n")
    write(".well-known/security.txt", "Contact: mailto:shahar@keystone.org.il\nExpires: 2027-11-02T00:00:00.000Z\nPreferred-Languages: he, en\n"
          f"Canonical: {SITE}/.well-known/security.txt\nPolicy: {SITE}/en/privacy\n")
    write("site.webmanifest", '{"name":"Keystone","short_name":"Keystone","start_url":"/","display":"browser","background_color":"#18181b","theme_color":"#18181b",'
          '"icons":[{"src":"/favicon.svg","sizes":"any","type":"image/svg+xml"},{"src":"/assets/img/apple-touch-icon.png","sizes":"180x180","type":"image/png"}]}\n')


if __name__ == "__main__":
    main()
