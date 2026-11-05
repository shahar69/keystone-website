'use strict';
const path=require('node:path');
const PDFDocument=require('pdfkit');
const bidi=require('bidi-js')();
const {textField,HttpError,escape:e}=require('./security');
const CATALOG=[
 {id:'presence',name:'נוכחות שמתחילה שיחה',setup:8500,monthly:490,scope:'אתר שירות עד 6 עמודים; תוכן בסיסי; התאמה למובייל; טופס עם תיבת פניות; הכנת חיפוש ושיתוף; הדרכה ומסירה.'},
 {id:'followup',name:'פנייה שממשיכה לטיפול',setup:9500,monthly:790,scope:'מיפוי תהליך אחד; חיבור מקור פניות אחד; תיבת טיפול או CRM קיים; מעקב ותזכורת; בדיקת כשל וכפילות; הדרכת אחראי.'},
 {id:'commerce',name:'חנות שמוכנה להזמנה',setup:16500,monthly:890,scope:'חנות עד 30 מוצרים ראשונים; קטגוריות; תשלום דרך ספק מאושר; משלוח בסיסי; מיילי הזמנה; בדיקת הזמנה וביטול בסביבת בדיקה.'},
 {id:'care',name:'טיפול שוטף',setup:1500,monthly:990,scope:'כניסה מסודרת לנכס קיים; ניטור זמינות; עדכונים וגיבויים בהיקף שסוכם; עד 3 שעות שינויים בחודש; סקירת פניות ותקלות חודשית.'}
];
function parseProposal(data,lead){
 const item=CATALOG.find(p=>p.id===textField(data,'package',30));if(!item)throw new HttpError(422,'package');
 if(!/^\d+(?:\.\d{1,2})?$/.test(String(data.setup??''))||!/^\d+(?:\.\d{1,2})?$/.test(String(data.monthly??'')))throw new HttpError(422,'price');
 const setup=Number(data.setup),monthly=Number(data.monthly);if(!Number.isFinite(setup)||!Number.isFinite(monthly)||setup<0||setup>500000||monthly<0||monthly>100000)throw new HttpError(422,'price');
 return {id:require('node:crypto').randomUUID(),createdAt:new Date().toISOString(),client:lead.business||lead.name,contact:lead.name,package:item.id,title:item.name,setup,monthly,scope:textField(data,'scope',2000,20),timeline:textField(data,'timeline',300,3),notes:textField(data,'proposalNotes',1000),approved:data.approved==='yes',vat:'המחירים לפני מע״מ, ככל שחל. מעמד העסק ושיעור המס יאומתו לפני הצעה מחייבת.'};
}
function proposalForm(lead,csrf){const p=CATALOG[0];return `<details class="proposal-builder"><summary>הכנת הצעה ממותגת · PDF בעברית</summary><p>נקודות הפתיחה הן המלצה פנימית לבדיקה, ואינן מחירון מאושר. ההורדה אינה שולחת דבר ללקוח.</p><form method="post" action="/admin/proposal"><input type="hidden" name="csrf" value="${e(csrf)}"><input type="hidden" name="id" value="${e(lead.id)}"><label>נקודת פתיחה<select name="package" data-proposal-package>${CATALOG.map(x=>`<option value="${x.id}" data-setup="${x.setup}" data-monthly="${x.monthly}" data-scope="${e(x.scope)}">${x.name}</option>`).join('')}</select></label><div class="proposal-prices"><label>הקמה בש״ח<input type="number" name="setup" min="0" max="500000" step="0.01" value="${p.setup}" required></label><label>שירות חודשי בש״ח<input type="number" name="monthly" min="0" max="100000" step="0.01" value="${p.monthly}" required></label></div><label>תוצרים והיקף<textarea name="scope" maxlength="2000" rows="4" required>${p.scope}</textarea></label><label>לוח זמנים ותלויות<input name="timeline" maxlength="300" value="ייקבע לאחר קבלת התוכן וההרשאות ואישור ההיקף." required></label><label>הערות ותנאים נוספים<textarea name="proposalNotes" maxlength="1000" rows="2"></textarea></label><label class="checkbox"><input type="checkbox" name="approved" value="yes">בדקתי ואישרתי את המחירים, ההיקף והתנאים להצעה הזאת.</label><button class="btn" type="submit">שמירת גרסה והורדת PDF</button></form>${lead.proposals?.length?`<p>גרסאות שנוצרו: ${lead.proposals.length}. האחרונה: ${e(lead.proposals.at(-1).createdAt)}. קובץ שהורד אינו הוכחת שליחה או קבלה.</p>`:''}</details>`;}
function createProposalPDF(p){return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',margin:44,info:{Title:'Keystone — '+p.title,Author:'Keystone',Subject:p.approved?'הצעה לבחינה':'טיוטה פנימית בלבד'}}),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
 doc.registerFont('Hebrew',path.join(__dirname,'../tools/fonts/hadasim-400.ttf'));
 let y=135,page=0;
 function pageHead(){page++;doc.rect(0,0,596,104).fill('#19191b');doc.font('Helvetica').fontSize(24).fillColor('#d8ba75').text('K E Y S T O N E',44,34,{lineBreak:false});doc.fontSize(9).text('keystone.org.il',44,73,{lineBreak:false});doc.font('Hebrew');y=132;}
 function line(text,size=14,color='#232326'){
   if(y>755){doc.addPage();pageHead();}doc.font('Hebrew').fontSize(size).fillColor(color);
   const visual=bidi.getReorderedString(text,bidi.getEmbeddingLevels(text,'rtl'));const widths=[...visual].map(c=>doc.widthOfString(c));let x=551-widths.reduce((a,b)=>a+b,0);
   [...visual].forEach((c,i)=>{doc.text(c,x,y,{lineBreak:false});x+=widths[i];});y+=size*1.4;
 }
 function paragraph(text,size=14){for(const part of String(text).split('\n')){let row='';for(const word of part.split(/\s+/)){const next=(row+' '+word).trim();doc.font('Hebrew').fontSize(size);if(doc.widthOfString(next)>505&&row){line(row,size);row=word;}else row=next;while(doc.widthOfString(row)>505){let cut=row.length;while(cut>1&&doc.widthOfString(row.slice(0,cut))>505)cut--;line(row.slice(0,cut),size);row=row.slice(cut);}}if(row)line(row,size);}y+=8;}
 pageHead();line(p.approved?'הצעת עבודה לבחינה':'טיוטה פנימית — טרם אושרה',16,'#886623');paragraph(p.title,27);paragraph('לכבוד '+p.client+' | איש קשר: '+p.contact);paragraph('תאריך: '+p.createdAt.slice(0,10)+' | מזהה: '+p.id.slice(0,8),11);
 paragraph('מה מקבלים',19);paragraph(p.scope);
 paragraph('השקעה ותנאי תשלום',19);paragraph(`הקמה: ${p.setup.toLocaleString('he-IL')} ₪ | שירות חודשי: ${p.monthly.toLocaleString('he-IL')} ₪`);paragraph(p.vat,11);paragraph('הצעת תנאי תשלום: 40% בתחילת העבודה, 40% בהצגת גרסה לבדיקה, 20% במסירה. שירות חודשי מתחיל רק מהמועד שיוסכם. התנאים טעונים אישור הצדדים.',12);
 paragraph('לוח זמנים',19);paragraph(p.timeline);
 paragraph('גבולות ומסירה',19);paragraph('עלויות ספקים, אחסון, דומיין, הודעות, סליקה ורישיונות אינן כלולות אלא אם נכתב אחרת. תוכן, הרשאות ואישור פרסום באחריות הלקוח. שינוי היקף יתומחר ויאושר בנפרד. אין התחייבות לדירוג בחיפוש או להכנסות. תיקוני אי־התאמה להיקף יטופלו לפני המסירה. הרשאות, קוד ותנאי בעלות יוסדרו בכתב.',12);
 if(p.notes){paragraph('הערות',19);paragraph(p.notes,12);}paragraph('המסמך הוא הצעה לבחינה, אינו חשבונית ואינו חוזה חתום. תוקף מוצע: 14 ימים; ההתקשרות מתחילה רק לאחר הסכמה כתובה על ההיקף, התנאים ולוח הזמנים.',11);paragraph('שחר: 050-564-0429 | אור: 053-273-3808',12);doc.end();
});}
module.exports={CATALOG,parseProposal,proposalForm,createProposalPDF};
