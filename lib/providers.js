'use strict';
// One explicit boundary for external operations. Review never loads credentials.
function createProviders({mode='disabled',adapters={}}={}) {
  const mock=mode==='mock';
  async function perform(operation,input={}) {
    if(mode==='live'&&typeof adapters[operation]==='function'){const value=await adapters[operation](input);return {mode:'live',available:value.mode!=='disabled',operation,...value};}
    if(!mock) return {mode:'disabled',available:false,operation};
    const en=input.lang==='en';
    const question=String(input.message||'').toLowerCase();
    let reply=en?'Shahar and Or build websites, handle enquiries and connect your daily work. Shall we arrange an introduction?':'שחר ואור בונים אתרים, מטפלים בפניות ומחברים את העבודה בעסק. נקבע שיחת היכרות?';
    if(/מחיר|כמה עולה|cost|price/.test(question))reply=en?'The founders prepare a fixed scope and setup price, with a separate monthly care plan. Prices are confirmed after they understand your business.':'המייסדים מכינים תכולה ומחיר הקמה ברורים, עם טיפול חודשי בנפרד. מחיר סופי נקבע אחרי שמכירים את העסק.';
    else if(/לקוח|תיק עבודות|client|portfolio/.test(question))reply=en?'Keystone is a new company. Client case studies will appear after the work and results are approved. You can try the enquiry experience here.':'קיסטון היא חברה חדשה. מקרי בוחן יופיעו אחרי אישור הלקוחות והתוצאות. בינתיים אפשר לנסות כאן את הטיפול בפנייה.';
    else if(/אתר|website|shop|חנות/.test(question))reply=en?'We build new websites and shops, rescue existing sites, and connect enquiries, booking and daily operations around the business.':'אנחנו בונים אתרים וחנויות חדשים, משפרים אתרים קיימים ומחברים פניות, תיאום ותפעול סביב העסק.';
    else if(/קול|טלפון|voice|phone/.test(question))reply=en?'We can plan a receptionist that answers from your business knowledge, collects details and hands important calls to a person. This local conversation is a preview.':'אפשר לתכנן נציג שעונה מתוך הידע של העסק, אוסף פרטים ומעביר שיחות חשובות לאדם. השיחה המקומית הזאת היא המחשה.';
    else if(/מי אתם|who are|מייסד/.test(question))reply=en?'We are Shahar and Or, the founders of Keystone. We learn your business, build the connections and stay to keep them working.':'אנחנו שחר ואור, המייסדים של קיסטון. לומדים את העסק, בונים את החיבורים ונשארים כדי שהם ימשיכו לעבוד.';
    const answers={
      voice:{transcript:en?'Hello, I’m Keystone’s receptionist. What does your business need help with?':'שלום, הגעתם לקיסטון. איפה העסק שלכם צריך עזרה?',audio:null},
      reply:{transcript:reply},
      slots:{slots:['10:00','12:30','16:00']},
      booking:{state:'review_only',message:en?'Your preferred time is saved for the local review.':'הזמן שבחרתם נשמר לסקירה המקומית.'},
      places:{rating:4.3,reviews:38,hours:'09:00–18:00',photos:7,unansweredReviews:null,localRank:null},
      notify:{state:'mock',delivered:false},
      delivery:{state:'mock',delivered:false}
    };
    if(!Object.hasOwn(answers,operation))throw new Error('Unknown provider operation');
    return {mode:'mock',available:true,operation,...answers[operation]};
  }
  return {mode:mock?'mock':'disabled',perform};
}
module.exports={createProviders};
