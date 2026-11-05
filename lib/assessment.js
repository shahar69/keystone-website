'use strict';
const QUESTIONS = {
  he: [
    'באיזו תדירות מעתיקים אצלכם את אותם פרטים בין מערכות?',
    'כמה מהעבודה השבועית חוזרת על עצמה לפי אותם כללים?',
    'באיזו תדירות צריך להזכיר ידנית שמשימה מחכה לטיפול?',
    'באיזו תדירות קשה לדעת מי אחראי לפנייה ומה השלב הבא?',
    'באיזו תדירות מידע חשוב מפוזר בין הודעות, קבצים וגיליונות?',
    'באיזו תדירות צריך לבנות ידנית תמונת מצב כדי לקבל החלטה?',
    'באיזו תדירות לקוח צריך לשאול שוב כדי להבין מה אתם מציעים?',
    'באיזו תדירות קשה ללקוח לפנות או לבצע פעולה מהטלפון?',
    'באיזו תדירות לא ברור מאיפה הגיעה פנייה ומה קרה אחריה?'
  ],
  en: [
    'How often do you copy the same details between tools?',
    'How much weekly work repeats according to the same rules?',
    'How often do you manually remind people that work is waiting?',
    'How often is the owner or next step of an enquiry unclear?',
    'How often is important information scattered across messages and files?',
    'How often do you assemble a status report manually to make a decision?',
    'How often must a customer ask again to understand your offer?',
    'How often is it difficult for a customer to act from their phone?',
    'How often is an enquiry’s source or outcome unknown?'
  ]
};
QUESTIONS.he.push('באיזו תדירות פנייה מחכה למענה כשאתם עסוקים?', 'באיזו תדירות הצעה שנשלחה נשארת ללא המשך טיפול?', 'באיזו תדירות לקוח לא מגיע לתור או שוכח לאשר אותו?', 'באיזו תדירות צריך לרדוף אחרי מסמך או תשלום?', 'באיזו תדירות לקוחות מרוצים נעלמים בלי פנייה חוזרת?', 'באיזו תדירות עדכון באתר או בגוגל נדחה כי אין מי שיטפל בו?');
QUESTIONS.en.push('How often does an enquiry wait while you are busy?', 'How often is a quote sent without a follow-up?', 'How often does a customer miss or forget to confirm an appointment?', 'How often do you chase a document or payment?', 'How often do satisfied customers disappear without a follow-up?', 'How often are website or Google updates postponed because nobody owns them?');
const LABELS = { he: ['כמעט אף פעם', 'לפעמים', 'לעיתים קרובות', 'כמעט תמיד'], en: ['Almost never', 'Sometimes', 'Often', 'Almost always'] };
const AREAS = { he: ['עבודה חוזרת', 'מידע ומעקב', 'הדרך של הלקוח'], en: ['Repetitive work', 'Information and follow-up', 'The customer journey'] };
AREAS.he.push('פניות ומכירה', 'המשך טיפול בעסק');
AREAS.en.push('Enquiries and sales', 'Ongoing business care');
const RECS = {
  he: [
    ['שמרו על מה שעובד. בחרו משימה אחת ומדדו זמן ותדירות לפני שמחליטים על אוטומציה.', 'מפו משימה חוזרת אחת: קלט, כללים, אישור אנושי ודרך ידנית למקרה תקלה.'],
    ['הגדירו אחראי, סטטוס ותאריך פעולה לכל פנייה, ובדקו אם הכלי הקיים מספיק.', 'רכזו מעקב בתהליך אחד עם אחראי, שלב ותזכורת. בדקו חיבור למערכות הקיימות.'],
    ['בדקו מהטלפון שאפשר להבין את ההצעה וליצור קשר בלי עזרה.', 'התחילו במסלול אחד: מקור הפנייה, הסבר השירות, פעולה ברורה ומעקב אחרי הטיפול.']
  ],
  en: [
    ['Keep what works. Measure the time and frequency of one task before choosing automation.', 'Map one repeated task: inputs, rules, human approval and a manual fallback.'],
    ['Give every enquiry an owner, status and next action date. Check whether your existing tool is enough.', 'Bring follow-up into one process with an owner, stage and reminder. Assess existing integrations.'],
    ['Use your phone to check whether the offer and contact route are clear without help.', 'Start with one journey: enquiry source, service explanation, a clear action and recorded follow-up.']
  ]
};
RECS.he.push(['שמרו זמן קבוע למעקב אחר פניות והצעות; בדקו פעם בשבוע פנייה אחת מתחילתה ועד סופה.', 'הגדירו מענה ראשוני, אחראי ומועד חזרה. חברו בקשת תור ליומן ולתזכורת, ורק אחר כך הוסיפו אוטומציה.'], ['רכזו עדכונים, לקוחות חוזרים ומסמכים אצל אחראי אחד עם רשימת בדיקה חודשית.', 'בחרו משימה שנדחית בקביעות. הגדירו מי מטפל, איזה אישור נדרש ומה עושים אם החיבור לספק נכשל.']);
RECS.en.push(['Keep a regular follow-up window and review one enquiry from arrival to outcome each week.', 'Define a first response, owner and callback time. Connect appointment requests to a calendar and reminder before automating.'], ['Give recurring updates, returning customers and documents one owner and a monthly checklist.', 'Choose a task that is repeatedly postponed. Define its owner, required approval and what happens if the provider connection fails.']);
const PLANS = {
 he:[['בחרו משימה אחת, תעדו 5 ביצועים ומדדו זמן ושגיאות.','בנו חיבור עם אישור אנושי ודרך ידנית חלופית.','השוו 10 ביצועים חדשים לקו הבסיס: זמן, שגיאות ועלות.'],['עברו על 10 פניות וסמנו למי חסרים אחראי, שלב או מועד.','רכזו את המעקב וחברו רק את מקורות המידע הנחוצים.','בדקו שאין פנייה ללא צעד הבא ושהייצוא והשחזור עובדים.'],['פתחו מהטלפון את הקישור שאתם שולחים ללקוח ובצעו פנייה.','תקנו תחילה הצעה לא ברורה, דרך קשר חסרה או טופס תקול.','בדקו שמקור הפנייה נשמר ושאדם בעסק מקבל אותה.'],['מדדו זמן תגובה ועברו על הצעות שלא קיבלו תשובה.','קבעו מענה ומעקב מורשים, עם עצירה כשלקוח לא מעוניין.','עקבו אחר זמני תגובה, פגישות ולקוחות שהמשיכו בפועל.'],['אספו משימות שנדחו בשבוע האחרון ובחרו אחת לפי השפעתה.','קבעו שירות קבוע: עדכונים, תזכורות, מסמכים או לקוחות חוזרים.','בדקו השלמה, חריגים ועלות שירות לפני הרחבה.']],
 en:[['Record five runs of one task, measuring time and errors.','Build a connection with human approval and a manual fallback.','Compare ten new runs against the baseline: time, errors and cost.'],['Review ten enquiries for missing owners, stages or dates.','Bring follow-up together and connect only necessary data sources.','Check every enquiry has a next step and test export and recovery.'],['Open your shared link on a phone and submit an enquiry.','Fix an unclear offer, missing contact route or broken form first.','Verify the enquiry source is recorded and someone receives it.'],['Measure response time and review unanswered quotes.','Define permitted responses and follow-ups, stopping when a customer declines.','Track response time, appointments and customers who actually continue.'],['Collect last week’s postponed tasks and choose one by impact.','Assign recurring care: updates, reminders, documents or customer follow-up.','Review completion, exceptions and service cost before expanding.']]
};
function assess(answers, lang = 'he') {
  if (!Array.isArray(answers) || ![9,15].includes(answers.length) || answers.some(x => !Number.isInteger(x) || x < 0 || x > 3)) throw new TypeError('invalid_answers');
  lang = lang === 'en' ? 'en' : 'he';
  const areas = Array.from({length:answers.length/3},(_,i) => {
    const score = Math.round(answers.slice(i * 3, i * 3 + 3).reduce((a, b) => a + b, 0) / 9 * 100);
    return { key: ['automation', 'business-systems', 'websites','lead-management','ongoing-care'][i], label: AREAS[lang][i], score, recommendation: RECS[lang][i][score >= 50 ? 1 : 0], plan:PLANS[lang][i] };
  });
  return { version: answers.length===15?2:1, language: lang, answers, score: Math.round(answers.reduce((a, b) => a + b, 0) / (answers.length*3) * 100), areas };
}
module.exports = { QUESTIONS, LABELS, AREAS, assess };
