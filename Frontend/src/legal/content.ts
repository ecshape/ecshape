/**
 * Legal pages of the site and the app (privacy, terms, health notice, accessibility, credits & licences) in he / en / fr.
 * QA #84 first version; rewritten in the legal audit of 2026-11 (docs/legal/compliance-audit-2026-11.md) against the
 * Israeli Privacy Protection Law 5741-1981 incl. Amendment 13 (s.11 notice), the Data Security Regulations 2017,
 * the Consumer Protection Law (s.14C, 13D) and its cancellation regulations, Communications Law s.30A, the Service
 * Accessibility Regulations 2013 (reg. 35, IS 5568), the GDPR (Art. 9, 13, 15-21) and Meta's Platform Terms.
 *
 * DRAFT — requires review by an Israeli lawyer.
 * Texts in [brackets] marked "TO FILL IN" / "להשלמה" / "À COMPLÉTER" are business facts nobody has given us yet:
 * fill them in BUSINESS below before publishing. Never invent them.
 */
export type LegalDoc = 'privacy' | 'terms' | 'health' | 'accessibility' | 'credits';
export type LegalLang = 'he' | 'en' | 'fr';
export interface LegalSection { h: string; p: string[]; id?: string }
export interface LegalPage { title: string; updated: string; intro: string; sections: LegalSection[] }

/** Every legal page, in menu order (footer, legal page tabs, login). */
export const LEGAL_DOCS: LegalDoc[] = ['privacy', 'terms', 'health', 'accessibility', 'credits'];

const UPDATED = '2026-11-20';

/** Business facts. Replace each placeholder with the real value (same value in every language where it is a number). */
const BUSINESS = {
  he: {
    name: '[להשלמה: שם העסק הרשום / שם העוסק]',
    id: '[להשלמה: מספר ע.מ / ח.פ]',
    address: '[להשלמה: כתובת למשלוח דואר]',
    email: '[להשלמה: כתובת אימייל לפניות פרטיות]',
    phone: '[להשלמה: טלפון]',
    dpo: '[להשלמה: ממונה הגנת פרטיות, אם מונה — שם ודרך פנייה]',
    a11yName: '[להשלמה: שם רכז/ת הנגישות]',
    a11yPhone: '[להשלמה: טלפון רכז/ת הנגישות]',
    a11yEmail: '[להשלמה: אימייל רכז/ת הנגישות]',
    a11yAudit: '[להשלמה: תאריך בדיקת הנגישות האחרונה ומי ביצע אותה]',
    premises: '[להשלמה: האם יש סטודיו/חדר כושר קבוע, כתובתו והסדרי הנגישות בו]',
    region: '[להשלמה: אזור השרתים של Railway, למשל EU-West / US-East]',
    smtp: '[להשלמה: ספק שליחת האימייל]',
    leadDays: '[להשלמה: תקופת שמירת פניות, מומלץ 12 חודשים]',
  },
  en: {
    name: '[TO FILL IN: registered business name / name of the dealer]',
    id: '[TO FILL IN: dealer (Osek) / company number]',
    address: '[TO FILL IN: postal address]',
    email: '[TO FILL IN: privacy contact email]',
    phone: '[TO FILL IN: phone]',
    dpo: '[TO FILL IN: data protection officer, if appointed — name and contact]',
    a11yName: '[TO FILL IN: accessibility coordinator’s name]',
    a11yPhone: '[TO FILL IN: accessibility coordinator’s phone]',
    a11yEmail: '[TO FILL IN: accessibility coordinator’s email]',
    a11yAudit: '[TO FILL IN: date of the last accessibility review and who did it]',
    premises: '[TO FILL IN: whether there is a fixed studio/gym, its address and its accessibility arrangements]',
    region: '[TO FILL IN: Railway server region, e.g. EU-West / US-East]',
    smtp: '[TO FILL IN: email sending provider]',
    leadDays: '[TO FILL IN: how long enquiries are kept, 12 months recommended]',
  },
  fr: {
    name: '[À COMPLÉTER : nom commercial enregistré]',
    id: '[À COMPLÉTER : numéro d’entreprise (Osek / H.P.)]',
    address: '[À COMPLÉTER : adresse postale]',
    email: '[À COMPLÉTER : e-mail pour les questions de confidentialité]',
    phone: '[À COMPLÉTER : téléphone]',
    dpo: '[À COMPLÉTER : délégué à la protection des données, s’il est désigné — nom et contact]',
    a11yName: '[À COMPLÉTER : nom du référent accessibilité]',
    a11yPhone: '[À COMPLÉTER : téléphone du référent accessibilité]',
    a11yEmail: '[À COMPLÉTER : e-mail du référent accessibilité]',
    a11yAudit: '[À COMPLÉTER : date du dernier audit d’accessibilité et qui l’a réalisé]',
    premises: '[À COMPLÉTER : existence d’un studio/salle fixe, adresse et accessibilité]',
    region: '[À COMPLÉTER : région des serveurs Railway, ex. EU-West / US-East]',
    smtp: '[À COMPLÉTER : prestataire d’envoi des e-mails]',
    leadDays: '[À COMPLÉTER : durée de conservation des demandes, 12 mois recommandés]',
  },
} as const;

export const LEGAL_NAV: Record<LegalLang, Record<LegalDoc, string> & { back: string; updatedLabel: string; footerLabel: string }> = {
  he: { privacy: 'מדיניות פרטיות', terms: 'תנאי שימוש וביטול', health: 'הצהרה רפואית', accessibility: 'הצהרת נגישות', credits: 'קרדיטים ורישיונות', back: 'חזרה לאתר', updatedLabel: 'עודכן לאחרונה', footerLabel: 'מידע משפטי' },
  en: { privacy: 'Privacy policy', terms: 'Terms & cancellation', health: 'Health notice', accessibility: 'Accessibility statement', credits: 'Credits & licences', back: 'Back to the site', updatedLabel: 'Last updated', footerLabel: 'Legal' },
  fr: { privacy: 'Politique de confidentialité', terms: 'Conditions et annulation', health: 'Avertissement santé', accessibility: 'Déclaration d’accessibilité', credits: 'Crédits et licences', back: 'Retour au site', updatedLabel: 'Dernière mise à jour', footerLabel: 'Mentions légales' },
};

const CREDITS_ITEMS = {
  he: [
    ['מאגר התרגילים', 'free-exercise-db (github.com/yuhonas/free-exercise-db) — נחלת הכלל (The Unlicense), כולל התמונות.'],
    ['תרגילים נוספים', 'wger.de — רישיון CC BY-SA 4.0. שינויים: תרגום ועיבוד לתצוגה באפליקציה. התוכן המעובד זמין באותו רישיון.'],
    ['מוצרי מזון וברקודים', 'Open Food Facts (openfoodfacts.org) — מאגר ברישיון Open Database License (ODbL) ותוכן ברישיון Database Contents License; תמונות מוצרים ברישיון CC BY-SA. הקרדיט מוצג ליד כל תמונה. מאגר נגזר שנבנה מנתוני Open Food Facts ומופץ לציבור יופץ גם הוא ברישיון ODbL.'],
    ['ערכים תזונתיים', 'USDA FoodData Central — נחלת הכלל (CC0).'],
    ['תמונות מזון', 'Wikimedia Commons — רישיונות חופשיים (CC0, נחלת הכלל, CC BY, CC BY-SA). שם הצלם והרישיון מוצגים ליד כל תמונה.'],
    ['זיהוי מזון מתמונה', 'מודל CLIP (OpenAI, רישיון MIT) בגרסת Xenova/clip-vit-base-patch32 (רישיון MIT), רץ על השרת שלנו.'],
    ['לוגואים של ספקי AI', 'Simple Icons (CC0). הסימנים הם סימני מסחר של בעליהם ומוצגים רק לזיהוי הספק.'],
    ['גופנים', 'Heebo, Karantina, Anton, Racing Sans One — רישיון SIL Open Font License 1.1, מאוחסנים אצלנו דרך Fontsource.'],
    ['אייקונים', 'Lucide (רישיון ISC).'],
    ['תוכנה בקוד פתוח', 'האתר והאפליקציה בנויים על תוכנות קוד פתוח, ובהן React, Vite, Radix UI, Tailwind CSS, Lenis (רישיון MIT), GSAP (רישיון "Standard no charge" של GSAP), FastAPI, SQLAlchemy, Pydantic (רישיון MIT) ו-Pillow (רישיון MIT-CMU). הרשימה המלאה ונוסחי הרישיונות: /licenses.txt.'],
    ['תוכן שנוצר בעזרת בינה מלאכותית', 'חלק מהטקסטים (מאמרים, תרגומים, טיוטות של תוכניות ותפריטים) נכתבים בעזרת כלי AI ונבדקים על ידי המאמן לפני פרסום או שליחה. תרגומי ממשק לשפות נוספות נעשים אוטומטית.'],
    ['תמונות ותוצאות מתאמנים', 'תמונות הלפני/אחרי וההמלצות באתר הן של מתאמנים אמיתיים ומתפרסמות בהסכמתם בכתב. תוצאות משתנות מאדם לאדם.'],
  ],
  en: [
    ['Exercise library', 'free-exercise-db (github.com/yuhonas/free-exercise-db) — public domain (The Unlicense), images included.'],
    ['More exercises', 'wger.de — CC BY-SA 4.0 licence. Changes: translated and adapted for display in the app. The adapted content is available under the same licence.'],
    ['Food products and barcodes', 'Open Food Facts (openfoodfacts.org) — database under the Open Database License (ODbL), contents under the Database Contents License; product photos under CC BY-SA. Credit is shown next to each photo. Any derived database built from Open Food Facts data that we make public is shared under the ODbL as well.'],
    ['Nutrition values', 'USDA FoodData Central — public domain (CC0).'],
    ['Food photos', 'Wikimedia Commons — free licences (CC0, public domain, CC BY, CC BY-SA). The author and licence are shown next to each photo.'],
    ['Food recognition from photos', 'CLIP model (OpenAI, MIT licence) in the Xenova/clip-vit-base-patch32 build (MIT licence), running on our own server.'],
    ['AI provider logos', 'Simple Icons (CC0). The marks are trademarks of their owners, shown only to identify the provider.'],
    ['Fonts', 'Heebo, Karantina, Anton, Racing Sans One — SIL Open Font License 1.1, self-hosted through Fontsource.'],
    ['Icons', 'Lucide (ISC licence).'],
    ['Open-source software', 'The site and the app are built on open-source software, including React, Vite, Radix UI, Tailwind CSS, Lenis (MIT licence), GSAP (GSAP Standard “no charge” licence), FastAPI, SQLAlchemy, Pydantic (MIT licence) and Pillow (MIT-CMU licence). Full list and licence texts: /licenses.txt.'],
    ['AI-assisted content', 'Some texts (articles, translations, draft plans and menus) are written with the help of AI tools and are reviewed by the coach before they are published or sent. Interface translations into extra languages are automatic.'],
    ['Client photos and results', 'The before/after photos and testimonials on the site are of real clients and are published with their written consent. Results vary from person to person.'],
  ],
  fr: [
    ['Bibliothèque d’exercices', 'free-exercise-db (github.com/yuhonas/free-exercise-db) — domaine public (The Unlicense), images comprises.'],
    ['Exercices supplémentaires', 'wger.de — licence CC BY-SA 4.0. Modifications : traduction et adaptation à l’affichage dans l’application. Le contenu adapté est disponible sous la même licence.'],
    ['Produits alimentaires et codes-barres', 'Open Food Facts (openfoodfacts.org) — base sous Open Database License (ODbL), contenus sous Database Contents License ; photos de produits sous CC BY-SA. Le crédit est affiché à côté de chaque photo. Toute base dérivée de données Open Food Facts que nous rendons publique est partagée elle aussi sous ODbL.'],
    ['Valeurs nutritionnelles', 'USDA FoodData Central — domaine public (CC0).'],
    ['Photos d’aliments', 'Wikimedia Commons — licences libres (CC0, domaine public, CC BY, CC BY-SA). L’auteur et la licence sont affichés à côté de chaque photo.'],
    ['Reconnaissance des aliments sur photo', 'Modèle CLIP (OpenAI, licence MIT), version Xenova/clip-vit-base-patch32 (licence MIT), exécuté sur notre propre serveur.'],
    ['Logos des fournisseurs d’IA', 'Simple Icons (CC0). Les marques appartiennent à leurs propriétaires et servent uniquement à identifier le fournisseur.'],
    ['Polices', 'Heebo, Karantina, Anton, Racing Sans One — licence SIL Open Font License 1.1, auto-hébergées via Fontsource.'],
    ['Icônes', 'Lucide (licence ISC).'],
    ['Logiciels libres', 'Le site et l’application reposent sur des logiciels libres, dont React, Vite, Radix UI, Tailwind CSS, Lenis (licence MIT), GSAP (licence standard « no charge » de GSAP), FastAPI, SQLAlchemy, Pydantic (licence MIT) et Pillow (licence MIT-CMU). Liste complète et textes des licences : /licenses.txt.'],
    ['Contenus assistés par IA', 'Certains textes (articles, traductions, ébauches de programmes et de menus) sont rédigés avec l’aide d’outils d’IA et relus par le coach avant publication ou envoi. Les traductions de l’interface vers d’autres langues sont automatiques.'],
    ['Photos et résultats des élèves', 'Les photos avant/après et les témoignages du site sont ceux de vrais élèves, publiés avec leur accord écrit. Les résultats varient d’une personne à l’autre.'],
  ],
} as const;

const H = BUSINESS.he;
const E = BUSINESS.en;
const F = BUSINESS.fr;

export const LEGAL: Record<LegalLang, Record<LegalDoc, LegalPage>> = {
  he: {
    privacy: {
      title: 'מדיניות פרטיות', updated: UPDATED,
      intro: 'מדיניות זו מסבירה איזה מידע אישי נאסף באתר ECshape ובאפליקציה, למה, למי הוא מועבר, כמה זמן הוא נשמר ומה הזכויות שלך. היא נכתבה בהתאם לחוק הגנת הפרטיות, התשמ"א-1981 (כולל תיקון 13 וחובת היידוע בסעיף 11), לתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017, ול-GDPR עבור משתמשים מהאיחוד האירופי ומבריטניה.',
      sections: [
        { h: 'מי אחראי למידע', p: [`בעל השליטה במאגר: ${H.name}, ${H.id}, ${H.address}. מאמן: אליאור קרמיזי (ECshape).`, `לפניות בנושא פרטיות: ${H.email} · ${H.phone}. ${H.dpo}.`, 'כשמאמן אחר משתמש בפלטפורמה ללווי המתאמנים שלו, הוא אחראי למידע של מתאמניו, ו-ECshape מעבדת אותו עבורו.'] },
        { h: 'איזה מידע נאסף', p: ['טופס יצירת קשר באתר: שם, טלפון ו/או אימייל, מטרה, מסלול מועדף והודעה חופשית. אין צורך לכתוב בו מידע רפואי.', 'חשבון באפליקציה (נפתח על ידי המאמן): שם, אימייל, שם משתמש, תמונת פרופיל, מועדי כניסה.', 'מידע בריאותי — מידע רגיש במיוחד: משקל, מידות היקפים, תמונות התקדמות, צ׳ק-אין יומי (שינה, רעב, צעדים), ארוחות ותמונות ארוחות, אימונים וביצועים, פציעות, העדפות תזונה, ותשובות הצהרת הבריאות.', 'צ׳אט עם המאמן: הודעות, תמונות והודעות קוליות.', 'רישום ההסכמות שנתת (מה, מתי, מאיזה דפדפן וכתובת IP).', 'דיווחי תקלות שבחרת לשלוח בכפתור QA: הטקסט וצילום המסך (שעשוי להראות מידע מהמסך). הם נקראים על ידי צוות ECshape וכלי הפיתוח שלו, כולל עוזרי קוד מבוססי AI, ונמחקים כשהטיפול מסתיים.', 'מידע טכני: כתובת IP, סוג דפדפן ומכשיר, יומני שרת לצורכי אבטחה; סטטיסטיקות שימוש מ-Google Analytics — רק אם אישרת עוגיות סטטיסטיקה.', 'אינסטגרם: אם הגבת לפוסט של ECshape במילת מפתח, מזהה המשתמש והתגובה שלך מעובדים כדי לשלוח תשובה אוטומטית. הם לא נשמרים אצלנו.'] },
        { h: 'למה המידע משמש ועל איזה בסיס', p: ['מתן שירותי הליווי (תוכנית אימון, תפריט, מעקב, קשר עם המאמן) — על בסיס ההתקשרות איתך, ולגבי מידע בריאותי — על בסיס הסכמתך המפורשת.', 'מענה לפנייה מהאתר — על בסיס בקשתך.', 'אבטחה, מניעת שימוש לרעה ועמידה בדין — על בסיס חובה חוקית ואינטרס לגיטימי.', 'שיפור האתר (סטטיסטיקות מצטברות) — רק בהסכמתך לעוגיות.', 'לא נשלח דיוור שיווקי בלי הסכמה נפרדת מראש (סעיף 30א לחוק התקשורת), ותמיד אפשר להסיר את עצמך. המידע לא נמכר ולא משמש לפרסום של צד שלישי.'] },
        { h: 'האם חובה למסור את המידע', p: ['אין חובה חוקית למסור מידע. בלי פרטי קשר לא נוכל לחזור אליך, ובלי מידע בריאותי לא נוכל להתאים לך תוכנית ולעקוב אחר ההתקדמות.'] },
        { h: 'בינה מלאכותית', p: ['חלק מהתכונות נעזרות בספקי AI חיצוניים: זיהוי מזון בתמונה, תרגום, ועוזר AI למאמן ("Agent EC") שיכול לקרוא נתוני מתאמנים — שם, צ׳ק-אין, משקלים — ופניות מהאתר כדי לסכם אותם ולהציע תוכניות. התוכן נשלח לספק שהמאמן בחר (OpenAI, Google Gemini, Anthropic, OpenRouter, Mistral, Groq, xAI או DeepSeek) ועשוי לכלול מידע בריאותי. זיהוי מזון בסיסי רץ על השרת שלנו.', 'ההחלטות המקצועיות מתקבלות על ידי המאמן. אין קבלת החלטות אוטומטית בעלת השפעה משפטית או מהותית עליך.'] },
        { h: 'למי המידע מועבר', p: [`אחסון: Railway (שרתים, מסד נתונים וקבצים; ${H.region}).`, 'ספקי AI כמפורט למעלה; שירות תרגום MyMemory (טקסטים לתרגום).', `Google Analytics (רק בהסכמה); jsDelivr (טעינת תמונות של מאגר התרגילים — כתובת ה-IP נחשפת לו; הגופנים מאוחסנים אצלנו); YouTube במצב פרטיות מוגברת (youtube-nocookie) לסרטוני הדגמה; ספק האימייל לאיפוס סיסמה (${H.smtp}).`, 'Meta: אינסטגרם (תשובות אוטומטיות) ו-WhatsApp, אם בחרת לפנות אלינו שם — בכפוף לתנאים של Meta.', 'מאגרי מזון ותרגילים (Open Food Facts, USDA, wger) מקבלים רק מילות חיפוש וברקודים, בלי פרטים אישיים.', 'רשויות מוסמכות, כשהדין מחייב.'] },
        { h: 'העברה אל מחוץ לישראל', p: ['חלק מהספקים נמצאים מחוץ לישראל (ארה"ב, האיחוד האירופי, ולגבי DeepSeek — סין). ההעברה נעשית לפי תקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה), התשס"א-2001. למשתמשים מהאיחוד האירופי: ישראל נהנית מהחלטת הלימות של הנציבות האירופית, והעברות הלאה נעשות עם אמצעי הגנה מתאימים כגון סעיפים חוזיים תקניים.'] },
        { h: 'כמה זמן המידע נשמר', p: ['מידע החשבון והליווי נשמר כל עוד החשבון פעיל, ועד 24 חודשים לאחר סיום הליווי, אלא אם ביקשת מחיקה מוקדמת.', `פניות מהאתר שלא הבשילו לליווי: ${H.leadDays}.`, 'רישום הסכמות נשמר כל עוד יש בו צורך להוכחת ההסכמה.', 'עם מחיקת החשבון נמחקים גם הקבצים (תמונות התקדמות, תמונות והקלטות מהצ׳אט, תמונת פרופיל).'] },
        { h: 'אבטחת מידע', p: ['החיבור מוצפן (HTTPS), סיסמאות נשמרות כגיבוב, הגישה מוגבלת למאמן שלך, לך ולמנהלי המערכת, ותמונות הצ׳אט עוברות קידוד מחדש שמסיר מטא-דאטה של המצלמה. אנו פועלים לפי תקנות אבטחת המידע, ובמקרה של אירוע אבטחה חמור נדווח לרשות להגנת הפרטיות, ונודיע לך כשהדין מחייב.'] },
        { h: 'הזכויות שלך', id: 'rights', p: ['לעיין במידע עליך (סעיף 13 לחוק), לבקש לתקן או למחוק אותו (סעיף 14), לקבל עותק במבנה נפוץ, להתנגד לשימוש, ולחזור בך מהסכמה בכל עת (בלי לפגוע בחוקיות השימוש שנעשה לפני כן).', 'באפליקציה: פרופיל › "פרטיות והמידע שלי" — הורדת כל המידע (ZIP), ביטול ההסכמה למידע בריאותי, ומחיקת החשבון לצמיתות.', `אחרת: ${H.email}, או וואטסאפ / טופס יצירת הקשר. נשיב תוך 30 יום.`, 'אפשר להגיש תלונה לרשות להגנת הפרטיות (gov.il/privacy), ותושבי האיחוד האירופי או בריטניה — לרשות הפיקוח במדינתם (למשל ICO).'] },
        { h: 'עוגיות ואחסון בדפדפן', p: ['הכרחיים (תמיד פעילים, באחסון המקומי של הדפדפן — לא עוגיות): access_token (התחברות); ec-query-cache-v1 — עותק של מסכי האפליקציה ששמור במכשיר שלך כדי שייפתחו מיד, והוא עשוי לכלול מידע בריאותי, ונמחק כשמתנתקים; העדפות ממשק (i18nextLng לשפה, theme למראה, מצב סרגל הצד ותזכורות); cookie_consent (בחירתך בנושא עוגיות); ec_intro (אנימציית פתיחה, לסשן בלבד). במכשיר משותף — התנתקו בסיום.', 'סטטיסטיקה (רק אחרי "מאשר/ת" בבאנר): עוגיות Google Analytics _ga ו-_ga_<מזהה>, לתקופה של עד שנתיים.', 'אפשר לשנות את הבחירה בכל עת דרך "הגדרות עוגיות" בתחתית האתר.'] },
        { h: 'אינסטגרם ומחיקת מידע של Meta', id: 'instagram', p: ['איננו שומרים מידע מאינסטגרם: מזהי התגובות נשמרים בזיכרון זמני בלבד לצורך מניעת כפילויות. לבקשת מחיקה או בירור: פנו אלינו בכתובת שלמעלה, או הסירו את ההרשאה של האפליקציה בהגדרות האינסטגרם שלכם.'] },
        { h: 'קטינים', p: ['השירות מיועד לבני 18 ומעלה. ליווי מתחת לגיל 18 ייעשה רק באישור בכתב של הורה או אפוטרופוס. איננו אוספים ביודעין מידע על ילדים מתחת לגיל 13.'] },
        { h: 'שינויים', p: ['נעדכן מדיניות זו מעת לעת; התאריך בראש העמוד מציין את העדכון האחרון. שינוי מהותי יוצג באפליקציה ויתבקש אישורך מחדש.'] },
      ],
    },
    terms: {
      title: 'תנאי שימוש וביטול', updated: UPDATED,
      intro: `תנאים אלה חלים על השימוש באתר ECshape ובאפליקציה ועל שירותי הליווי. נותן השירות: ${H.name}, ${H.id}, ${H.address}, ${H.email}, ${H.phone}.`,
      sections: [
        { h: 'השירות', p: ['ECshape מציעה ליווי כושר ותזונה: אימון אישי פנים אל פנים, ליווי אונליין וקבוצות אימון — עם תוכניות אימון, תפריטים, מעקב התקדמות וקשר עם המאמן באפליקציה.', 'התוכן באתר (מאמרים, סרטונים, טיפים) הוא מידע כללי ואינו ייעוץ אישי.'] },
        { h: 'מי יכול להשתמש', p: ['השירות מיועד לבני 18 ומעלה (מתחת לגיל 18 — רק באישור בכתב של הורה או אפוטרופוס).', 'חשבון באפליקציה נפתח על ידי המאמן. בכניסה הראשונה יש לאשר את התנאים, את מדיניות הפרטיות ואת עיבוד המידע הבריאותי, ולמלא הצהרת בריאות.'] },
        { h: 'בריאות', p: ['השירות אינו ייעוץ רפואי, אבחון או טיפול. לפני תחילת ליווי קראו את "ההצהרה הרפואית" ומלאו בכנות את הצהרת הבריאות. אם ענית "כן" על אחת השאלות — יש לקבל אישור רופא לפני תחילת האימונים.'] },
        { h: 'מחירים והתקשרות', p: ['המחיר, מה כלול, משך הליווי ותנאי התשלום נמסרים לך לפני ההתקשרות, וכוללים מע"מ כשהוא חל.', 'כשההתקשרות נעשית מרחוק (טלפון, וואטסאפ, זום או אינטרנט), נמסור לך בכתב, לפני ההתקשרות או לכל המאוחר עם תחילת השירות, מסמך גילוי לפי סעיף 14ג לחוק הגנת הצרכן: פרטי העסק, תיאור השירות, המחיר הכולל, תנאי התשלום, מועד תחילת השירות ומשכו, ותנאי הביטול.'] },
        { h: 'ביטול עסקה והחזרים', id: 'cancellation', p: ['עסקה מרחוק: אפשר לבטל תוך 14 יום מיום ההתקשרות או מיום קבלת מסמך הגילוי, לפי המאוחר, ובלבד שהביטול נעשה לפחות 2 ימים שאינם ימי מנוחה לפני מועד תחילת השירות אם נקבע. אנשים עם מוגבלות, אזרחים ותיקים ועולים חדשים זכאים לתקופת ביטול מוארכת כקבוע בדין.', 'ההחזר יינתן תוך 14 יום מקבלת הודעת הביטול, בניכוי התמורה היחסית לשירות שכבר ניתן, ודמי ביטול בשיעור 5% מהמחיר או 100 ₪ — הנמוך מביניהם — כקבוע בתקנות הגנת הצרכן (ביטול עסקה), התשע"א-2010.', 'עסקה מתמשכת (מנוי חודשי): אפשר לבטל בכל עת בהודעה בכל דרך שבה נעשתה ההתקשרות — טלפון, אימייל, וואטסאפ או בכתב. הביטול ייכנס לתוקף תוך 3 ימי עסקים, ולא תחויב/י לאחר מכן (סעיף 13ד לחוק).', `הודעת ביטול: ${H.email}, ${H.phone}, וואטסאפ או טופס יצירת הקשר. נאשר בכתב את קבלתה.`] },
        { h: 'חשבון ושימוש הוגן', p: ['עליך למסור פרטים נכונים ולשמור על סיסמתך. החשבון אישי ואין להעבירו.', 'אין להעתיק, להפיץ או למכור תוכניות, תפריטים או תוכן מהאפליקציה, ואין לנסות לפגוע במערכת.'] },
        { h: 'תוכן ותוצאות', p: ['תמונות לפני/אחרי והמלצות באתר הן של מתאמנים אמיתיים ומתפרסמות בהסכמתם. תוצאות משתנות מאדם לאדם ותלויות בהתמדה, תזונה, שינה, מצב בריאותי ונתונים אישיים — הן אינן הבטחה לתוצאה.', 'חלק מהטקסטים ומטיוטות התוכניות נכתבים בעזרת כלי AI ונבדקים על ידי המאמן. ערכים תזונתיים והערכות קלוריות (כולל זיהוי מזון מתמונה) הם הערכה בלבד.'] },
        { h: 'קניין רוחני', p: ['התכנים, העיצוב, הלוגו, התמונות והתוכניות שייכים ל-ECshape או לבעלי רישיון ומוגנים בזכויות יוצרים. רישיונות של תוכן צד שלישי מפורטים בעמוד "קרדיטים ורישיונות".'] },
        { h: 'אחריות', p: ['השירות ניתן "כמות שהוא". ככל שהדין מתיר, ECshape אינה אחראית לנזק שנגרם משימוש שלא לפי ההנחיות, ממידע שגוי או חלקי שנמסר (כולל בהצהרת הבריאות), או מתקלות בשירותי צד שלישי. אין באמור כדי לגרוע מזכויות צרכן שאינן ניתנות להתניה.'] },
        { h: 'סיום', p: ['אפשר למחוק את החשבון בכל עת מההגדרות. נוכל להשעות חשבון שמשתמש בשירות בניגוד לתנאים, לאחר הודעה.'] },
        { h: 'דין וסמכות', p: ['על תנאים אלה חל הדין הישראלי. סמכות השיפוט — לבתי המשפט המוסמכים במחוז תל אביב, בלי לגרוע מזכויות קוגנטיות של צרכנים במדינת מגוריהם.'] },
      ],
    },
    health: {
      title: 'הצהרה רפואית', updated: UPDATED,
      intro: 'ECshape מספקת אימון כושר וליווי תזונתי כללי. חשוב לקרוא את ההצהרה הזו לפני תחילת אימונים או שינוי תזונתי.',
      sections: [
        { h: 'לא ייעוץ רפואי', p: ['השירות, האפליקציה והתוכן באתר אינם ייעוץ רפואי, אבחון או טיפול, ואינם תחליף לרופא, לדיאטנית קלינית או לפיזיותרפיסט. המאמן אינו רופא ואינו דיאטן קליני.'] },
        { h: 'התייעצו עם רופא', p: ['מומלץ להתייעץ עם רופא לפני תחילת תוכנית אימון או שינוי תזונתי — ובוודאי אם יש לך מחלת לב, לחץ דם גבוה, סוכרת, מחלה כרונית, פציעה, הריון או לידה בחצי השנה האחרונה, נטילת תרופות קבועות, או היסטוריה של הפרעות אכילה.', 'בכניסה הראשונה לאפליקציה תתבקש/י למלא הצהרת בריאות. תשובה "כן" על אחת השאלות מחייבת אישור רופא בכתב לפני תחילת האימונים.'] },
        { h: 'בזמן האימון', p: ['הפסיקו מיד ופנו לטיפול רפואי אם מופיעים כאב בחזה, סחרחורת, קוצר נשימה חריג, עילפון או כל תסמין חריג. במקרה חירום חייגו 101 (מד"א).'] },
        { h: 'תזונה', p: ['התפריטים, יעדי הקלוריות והערכים התזונתיים הם הערכה כללית, מבוססים על מאגרים פתוחים (Open Food Facts, USDA) ועשויים להיות לא מדויקים. אינם מיועדים לטיפול במחלה או במצב רפואי.', 'אם יש לך או הייתה לך הפרעת אכילה, פנו לגורם מקצועי לפני מעקב קלוריות או ירידה במשקל.'] },
        { h: 'תוצאות', p: ['תוצאות משתנות מאדם לאדם. תוצאות של מתאמנים אחרים, כולל תמונות לפני/אחרי, אינן הבטחה לתוצאה שלך.'] },
      ],
    },
    accessibility: {
      title: 'הצהרת נגישות', updated: UPDATED,
      intro: 'ECshape מחויבת לאפשר לכל אדם, כולל אנשים עם מוגבלות, להשתמש באתר ובאפליקציה בשוויון ובכבוד, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998, ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013 (תקנה 35).',
      sections: [
        { h: 'רמת הנגישות', p: ['האתר והאפליקציה הותאמו לתקן הישראלי ת"י 5568, המבוסס על הנחיות WCAG 2.0, ברמה AA.', `בדיקת הנגישות האחרונה: ${H.a11yAudit}. הצהרה זו עודכנה ב-20 בנובמבר 2026.`] },
        { h: 'מה עשינו', p: ['ניווט מלא במקלדת ומיקוד נראה לעין.', 'תמיכה בקוראי מסך: כותרות מסודרות, תוויות לכפתורים ולתמונות, הודעות מצב.', 'ניגודיות צבעים מספקת, מצב כהה ובהיר.', 'כיבוד הגדרת "הפחתת תנועה" של המכשיר — אנימציות מושבתות.', 'הגדלת טקסט עד 200% בלי אובדן תוכן, ותצוגה מותאמת לטלפונים.', 'האתר זמין בעברית, אנגלית וצרפתית (ובתרגום אוטומטי לרוסית ולערבית), עם כיוון כתיבה מתאים.'] },
        { h: 'מגבלות ידועות', p: ['ייתכן שחלק מהתכנים של צד שלישי (סרטוני הדגמה מוטמעים, תמונות מוצרים) אינם נגישים במלואם, ושלסרטונים אין כתוביות. אפשר לקבל כל מידע כזה בדרך חלופית — פנו אלינו.'] },
        { h: 'נגישות פיזית', p: [`אימונים אישיים מתקיימים במקום שנוח למתאמן (חדר כושר, בית או בחוץ), ונתאים את המקום לצרכים שלך. ${H.premises}.`] },
        { h: 'רכז/ת הנגישות', p: [`${H.a11yName} · טלפון: ${H.a11yPhone} · אימייל: ${H.a11yEmail}.`, 'נתקלת בבעיה? ציינו את העמוד ואת הבעיה, ונחזור אליך תוך 7 ימי עסקים. אפשר לקבל את השירות גם בטלפון, בוואטסאפ או באימייל.'] },
      ],
    },
    credits: {
      title: 'קרדיטים ורישיונות', updated: UPDATED,
      intro: 'האפליקציה משתמשת במאגרים, תמונות ותוכנה של צד שלישי ברישיונות חופשיים. תודה ליוצרים — והנה הפירוט, כפי שהרישיונות מחייבים.',
      sections: CREDITS_ITEMS.he.map(([h, p]) => ({ h, p: [p] })),
    },
  },
  en: {
    privacy: {
      title: 'Privacy policy', updated: UPDATED,
      intro: 'This policy explains what personal information the ECshape site and app collect, why, who receives it, how long it is kept and what your rights are. It follows the Israeli Privacy Protection Law 5741-1981 (including Amendment 13 and the notice duty of section 11), the Privacy Protection (Data Security) Regulations 5777-2017, and the GDPR / UK GDPR for users in the EU and the UK.',
      sections: [
        { h: 'Who is responsible', p: [`Controller: ${E.name}, ${E.id}, ${E.address}. Coach: Elior Cremisi (ECshape).`, `Privacy contact: ${E.email} · ${E.phone}. ${E.dpo}.`, 'When another coach uses the platform for their own clients, that coach is responsible for their clients’ data and ECshape processes it on their behalf.'] },
        { h: 'What we collect', p: ['Site contact form: name, phone and/or email, goal, preferred programme and a free message. You do not need to write any medical information in it.', 'App account (opened by your coach): name, email, username, profile photo, sign-in times.', 'Health information — especially sensitive data: weight, body measurements, progress photos, daily check-ins (sleep, hunger, steps), meals and meal photos, workouts and performance, injuries, food preferences, and your health-declaration answers.', 'Chat with your coach: messages, photos and voice messages.', 'A record of the consents you gave (what, when, from which browser and IP address).', 'Bug reports you choose to send with the QA button: the text and a screenshot (which can show what was on your screen). They are read by the ECshape team and its development tools, including AI coding assistants, and deleted once handled.', 'Technical data: IP address, browser and device type, server logs for security; usage statistics from Google Analytics — only if you accepted statistics cookies.', 'Instagram: if you comment on an ECshape post with a keyword, your user ID and comment are processed to send an automatic reply. We do not store them.'] },
        { h: 'Why we use it, and on what basis', p: ['To provide the coaching (training plan, meal plan, tracking, contact with your coach) — to perform our agreement with you; for health information — on your explicit consent (GDPR Art. 9(2)(a)).', 'To answer a request from the site — at your request.', 'Security, abuse prevention and legal compliance — legal obligation and legitimate interest.', 'Improving the site (aggregated statistics) — only with your cookie consent.', 'We never send marketing messages without separate prior consent (Israeli Communications Law s.30A), and you can always unsubscribe. Your information is never sold or used for third-party advertising.'] },
        { h: 'Do you have to give it?', p: ['There is no legal obligation. Without contact details we cannot get back to you, and without health information we cannot tailor a plan or track your progress.'] },
        { h: 'Artificial intelligence', p: ['Some features use external AI providers: food recognition in photos, translation, and the coach’s AI assistant ("Agent EC"), which can read client data — name, check-ins, weights — and site enquiries to summarise them and suggest plans. The content is sent to the provider your coach chose (OpenAI, Google Gemini, Anthropic, OpenRouter, Mistral, Groq, xAI or DeepSeek) and can include health information. Basic food recognition runs on our own server.', 'Professional decisions are made by the coach. No automated decision with legal or similarly significant effect is made about you.'] },
        { h: 'Who receives it', p: [`Hosting: Railway (servers, database and files; ${E.region}).`, 'AI providers as listed above; the MyMemory translation service (texts to translate).', `Google Analytics (only with consent); jsDelivr (loading exercise-library images — it sees your IP address; fonts are hosted by us); YouTube in privacy-enhanced mode (youtube-nocookie) for demo videos; the email provider for password resets (${E.smtp}).`, 'Meta: Instagram (automatic replies) and WhatsApp if you choose to contact us there — subject to Meta’s terms.', 'Food and exercise databases (Open Food Facts, USDA, wger) receive only search words and barcodes, never personal details.', 'Authorities, when the law requires it.'] },
        { h: 'Transfers outside Israel', p: ['Some providers are outside Israel (USA, EU and, for DeepSeek, China). Transfers follow the Privacy Protection (Transfer of Data to Databases Abroad) Regulations 5761-2001. For EU users: Israel benefits from a European Commission adequacy decision, and onward transfers use appropriate safeguards such as Standard Contractual Clauses.'] },
        { h: 'How long we keep it', p: ['Account and coaching data are kept while the account is active and up to 24 months after the coaching ends, unless you ask for earlier deletion.', `Site enquiries that did not become coaching: ${E.leadDays}.`, 'Consent records are kept as long as they are needed to prove the consent.', 'Deleting the account also deletes the files (progress photos, chat photos and recordings, profile photo).'] },
        { h: 'Security', p: ['Connections are encrypted (HTTPS), passwords are stored hashed, access is limited to your coach, you and system administrators, and chat photos are re-encoded to strip camera metadata. We follow the Data Security Regulations; after a severe security incident we report to the Privacy Protection Authority and notify you where the law requires it.'] },
        { h: 'Your rights', id: 'rights', p: ['To see the information about you (s.13 of the Law), ask to correct or delete it (s.14), receive a copy in a common format, object to a use, and withdraw a consent at any time (without affecting what was done before).', 'In the app: Profile › "Privacy & my data" — download all your data (ZIP), withdraw your health-data consent, and delete your account permanently.', `Otherwise: ${E.email}, WhatsApp or the contact form. We answer within 30 days.`, 'You may complain to the Israeli Privacy Protection Authority (gov.il/privacy) or, in the EU/UK, to your supervisory authority (e.g. the ICO).'] },
        { h: 'Cookies and browser storage', p: ['Essential (always on, in your browser’s local storage — not cookies): access_token (sign-in); ec-query-cache-v1 — a copy of the app screens kept on your device so they open instantly, which can include health information and is deleted when you log out; interface preferences (i18nextLng for language, theme for appearance, sidebar state and reminders); cookie_consent (your cookie choice); ec_intro (opening animation, this session only). On a shared device, log out when you finish.', 'Statistics (only after "Accept" in the banner): the Google Analytics cookies _ga and _ga_<id>, for up to two years.', 'You can change your choice at any time with "Cookie settings" at the bottom of the site.'] },
        { h: 'Instagram and Meta data deletion', id: 'instagram', p: ['We do not store Instagram data: comment IDs are kept only in temporary memory to avoid double replies. To ask for deletion or information, write to the address above, or remove the app’s access in your Instagram settings.'] },
        { h: 'Minors', p: ['The service is for people aged 18 and over. Clients under 18 are coached only with written consent from a parent or guardian. We do not knowingly collect information about children under 13.'] },
        { h: 'Changes', p: ['We update this policy from time to time; the date at the top shows the latest version. A material change is shown in the app and you are asked to agree again.'] },
      ],
    },
    terms: {
      title: 'Terms & cancellation', updated: UPDATED,
      intro: `These terms apply to the ECshape site, the app and the coaching services. Provider: ${E.name}, ${E.id}, ${E.address}, ${E.email}, ${E.phone}.`,
      sections: [
        { h: 'The service', p: ['ECshape offers fitness and nutrition coaching: in-person personal training, online coaching and group training — with training plans, meal plans, progress tracking and contact with the coach in the app.', 'Content on the site (articles, videos, tips) is general information, not personal advice.'] },
        { h: 'Who can use it', p: ['The service is for people aged 18 and over (under 18 only with written consent from a parent or guardian).', 'App accounts are opened by the coach. At the first sign-in you must accept these terms, the privacy policy and the processing of health information, and fill in the health declaration.'] },
        { h: 'Health', p: ['The service is not medical advice, diagnosis or treatment. Before starting, read the "Health notice" and answer the health declaration honestly. If you answered "yes" to any question, get a doctor’s approval before you start training.'] },
        { h: 'Prices and agreement', p: ['The price, what is included, the duration and the payment terms are given to you before you agree, and include VAT where it applies.', 'When the agreement is made at a distance (phone, WhatsApp, Zoom or online), we give you in writing — before the agreement or at the latest when the service starts — a disclosure document under section 14C of the Israeli Consumer Protection Law: business details, description of the service, total price, payment terms, start date and duration, and cancellation terms.'] },
        { h: 'Cancellation and refunds', id: 'cancellation', p: ['Distance agreements: you may cancel within 14 days of the agreement or of receiving the disclosure document, whichever is later, provided you cancel at least 2 days that are not rest days before the service starts, if a start date was set. Persons with disabilities, senior citizens and new immigrants are entitled to the longer cancellation period set by law.', 'The refund is made within 14 days of receiving the cancellation notice, less the proportional price of service already given and a cancellation fee of 5% of the price or NIS 100, whichever is lower, as set by the Consumer Protection (Cancellation of Transaction) Regulations 5771-2010.', 'Ongoing agreements (monthly subscription): you may cancel at any time by notice through any channel the agreement was made in — phone, email, WhatsApp or in writing. The cancellation takes effect within 3 business days, and you will not be charged after that (section 13D of the Law).', `Cancellation notices: ${E.email}, ${E.phone}, WhatsApp or the contact form. We confirm receipt in writing.`, 'EU and UK consumers also keep any mandatory withdrawal rights of their country.'] },
        { h: 'Account and fair use', p: ['Give accurate details and keep your password safe. Your account is personal and may not be transferred.', 'Do not copy, share or sell plans, menus or app content, and do not try to harm the system.'] },
        { h: 'Content and results', p: ['Before/after photos and testimonials on the site are of real clients and are published with their consent. Results vary from person to person and depend on consistency, diet, sleep, health and personal factors — they are not a promise of yours.', 'Some texts and draft plans are written with AI tools and reviewed by the coach. Nutrition values and calorie estimates (including food recognition from photos) are estimates only.'] },
        { h: 'Intellectual property', p: ['Content, design, logo, photos and plans belong to ECshape or its licensors and are protected by copyright. Third-party licences are listed on the "Credits & licences" page.'] },
        { h: 'Liability', p: ['The service is provided "as is". To the extent the law allows, ECshape is not liable for damage caused by use against the guidance, by wrong or incomplete information you provided (including in the health declaration), or by outages of third-party services. Nothing here limits consumer rights that cannot be waived.'] },
        { h: 'Ending', p: ['You can delete your account at any time from Settings. We may suspend an account used against these terms, after notice.'] },
        { h: 'Law and jurisdiction', p: ['These terms are governed by Israeli law. The competent courts of the Tel Aviv district have jurisdiction, without prejudice to mandatory consumer rights in your country of residence.'] },
      ],
    },
    health: {
      title: 'Health notice', updated: UPDATED,
      intro: 'ECshape provides fitness training and general nutrition coaching. Please read this notice before you start training or change your diet.',
      sections: [
        { h: 'Not medical advice', p: ['The service, the app and the content on the site are not medical advice, diagnosis or treatment and do not replace a doctor, clinical dietitian or physiotherapist. The coach is not a doctor or a clinical dietitian.'] },
        { h: 'See a doctor', p: ['Consult a doctor before starting a training plan or changing your diet — especially if you have heart disease, high blood pressure, diabetes, a chronic illness, an injury, are pregnant or gave birth in the last six months, take regular medication, or have a history of eating disorders.', 'At your first sign-in the app asks you to fill in a health declaration. A "yes" to any question requires a doctor’s written approval before you start training.'] },
        { h: 'While training', p: ['Stop immediately and seek medical help if you feel chest pain, dizziness, unusual shortness of breath, faintness or any unusual symptom. In an emergency in Israel call 101 (Magen David Adom).'] },
        { h: 'Nutrition', p: ['Menus, calorie targets and nutrition values are general estimates, based on open databases (Open Food Facts, USDA), and may be inaccurate. They are not meant to treat any disease or medical condition.', 'If you have or had an eating disorder, talk to a professional before tracking calories or losing weight.'] },
        { h: 'Results', p: ['Results vary from person to person. Other clients’ results, including before/after photos, are not a promise of yours.'] },
      ],
    },
    accessibility: {
      title: 'Accessibility statement', updated: UPDATED,
      intro: 'ECshape is committed to letting everyone, including people with disabilities, use the site and the app equally and with dignity, under the Israeli Equal Rights for Persons with Disabilities Law 5758-1998 and the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations 5773-2013 (regulation 35).',
      sections: [
        { h: 'Accessibility level', p: ['The site and the app were adapted to Israeli Standard IS 5568, based on the WCAG 2.0 guidelines, at level AA.', `Last accessibility review: ${E.a11yAudit}. This statement was updated on 20 November 2026.`] },
        { h: 'What we did', p: ['Full keyboard navigation and a visible focus.', 'Screen-reader support: ordered headings, labels for buttons and images, status announcements.', 'Sufficient colour contrast, dark and light modes.', 'The device’s "reduce motion" setting is respected — animations are turned off.', 'Text can be enlarged to 200 % without losing content; layouts adapt to phones.', 'The site is available in Hebrew, English and French (and machine-translated into Russian and Arabic) with the right reading direction.'] },
        { h: 'Known limitations', p: ['Some third-party content (embedded demo videos, product photos) may not be fully accessible, and videos have no captions. Any such information is available another way — contact us.'] },
        { h: 'Physical accessibility', p: [`Personal training takes place where it suits the client (a gym, at home or outdoors), and we adapt the place to your needs. ${E.premises}.`] },
        { h: 'Accessibility coordinator', p: [`${E.a11yName} · phone: ${E.a11yPhone} · email: ${E.a11yEmail}.`, 'Found a problem? Tell us the page and the problem and we reply within 7 business days. The service is also available by phone, WhatsApp or email.'] },
      ],
    },
    credits: {
      title: 'Credits & licences', updated: UPDATED,
      intro: 'The app uses third-party databases, photos and software under free licences. Thank you to their authors — here are the details the licences ask for.',
      sections: CREDITS_ITEMS.en.map(([h, p]) => ({ h, p: [p] })),
    },
  },
  fr: {
    privacy: {
      title: 'Politique de confidentialité', updated: UPDATED,
      intro: 'Cette politique explique quelles données personnelles le site et l’application ECshape collectent, pourquoi, qui les reçoit, combien de temps elles sont conservées et quels sont vos droits. Elle suit la loi israélienne sur la protection de la vie privée 5741-1981 (amendement 13 et obligation d’information de l’article 11 compris), le règlement israélien de 2017 sur la sécurité des données, et le RGPD pour les utilisateurs de l’UE et du Royaume-Uni.',
      sections: [
        { h: 'Responsable du traitement', p: [`Responsable : ${F.name}, ${F.id}, ${F.address}. Coach : Elior Cremisi (ECshape).`, `Contact confidentialité : ${F.email} · ${F.phone}. ${F.dpo}.`, 'Lorsqu’un autre coach utilise la plateforme pour ses propres élèves, ce coach est responsable de leurs données et ECshape les traite pour son compte.'] },
        { h: 'Ce que nous collectons', p: ['Formulaire de contact : nom, téléphone et/ou e-mail, objectif, formule souhaitée et message libre. Inutile d’y indiquer des informations médicales.', 'Compte de l’application (ouvert par votre coach) : nom, e-mail, identifiant, photo de profil, heures de connexion.', 'Données de santé — données particulièrement sensibles : poids, mensurations, photos de progression, check-ins quotidiens (sommeil, faim, pas), repas et photos de repas, séances et performances, blessures, préférences alimentaires et réponses à la déclaration de santé.', 'Chat avec votre coach : messages, photos et messages vocaux.', 'L’enregistrement de vos consentements (quoi, quand, depuis quel navigateur et quelle adresse IP).', 'Les signalements de bug que vous envoyez avec le bouton QA : le texte et une capture d’écran (qui peut montrer ce qui était à l’écran). Ils sont lus par l’équipe ECshape et ses outils de développement, y compris des assistants de code IA, et supprimés une fois traités.', 'Données techniques : adresse IP, type de navigateur et d’appareil, journaux serveur pour la sécurité ; statistiques Google Analytics — uniquement si vous avez accepté les cookies de statistiques.', 'Instagram : si vous commentez une publication d’ECshape avec un mot-clé, votre identifiant et votre commentaire sont traités pour envoyer une réponse automatique. Nous ne les conservons pas.'] },
        { h: 'Finalités et bases légales', p: ['Fournir l’accompagnement (programme, plan nutritionnel, suivi, contact avec le coach) — exécution du contrat ; pour les données de santé — votre consentement explicite (art. 9(2)(a) RGPD).', 'Répondre à une demande du site — à votre demande.', 'Sécurité, prévention des abus et respect de la loi — obligation légale et intérêt légitime.', 'Améliorer le site (statistiques agrégées) — uniquement avec votre consentement aux cookies.', 'Nous n’envoyons jamais de message marketing sans consentement préalable distinct (loi israélienne sur les communications, art. 30A), et vous pouvez toujours vous désinscrire. Vos données ne sont jamais vendues ni utilisées pour de la publicité de tiers.'] },
        { h: 'Êtes-vous obligé de les fournir ?', p: ['Aucune obligation légale. Sans coordonnées nous ne pouvons pas vous recontacter, et sans données de santé nous ne pouvons pas adapter un programme ni suivre vos progrès.'] },
        { h: 'Intelligence artificielle', p: ['Certaines fonctions utilisent des fournisseurs d’IA externes : reconnaissance des aliments sur photo, traduction, et l’assistant IA du coach (« Agent EC »), qui peut lire les données des élèves — nom, check-ins, poids — et les demandes du site pour les résumer et proposer des programmes. Le contenu est envoyé au fournisseur choisi par votre coach (OpenAI, Google Gemini, Anthropic, OpenRouter, Mistral, Groq, xAI ou DeepSeek) et peut inclure des données de santé. La reconnaissance d’aliments de base s’exécute sur notre propre serveur.', 'Les décisions professionnelles sont prises par le coach. Aucune décision automatisée produisant des effets juridiques ou significatifs n’est prise à votre sujet.'] },
        { h: 'Qui les reçoit', p: [`Hébergement : Railway (serveurs, base de données et fichiers ; ${F.region}).`, 'Les fournisseurs d’IA cités ; le service de traduction MyMemory (textes à traduire).', `Google Analytics (uniquement avec consentement) ; jsDelivr (chargement des images de la bibliothèque d’exercices — il voit votre adresse IP ; les polices sont hébergées chez nous) ; YouTube en mode confidentialité renforcée (youtube-nocookie) pour les vidéos ; le prestataire d’e-mails de réinitialisation du mot de passe (${F.smtp}).`, 'Meta : Instagram (réponses automatiques) et WhatsApp si vous choisissez de nous y contacter — selon les conditions de Meta.', 'Les bases d’aliments et d’exercices (Open Food Facts, USDA, wger) ne reçoivent que des mots de recherche et des codes-barres, jamais de données personnelles.', 'Les autorités, lorsque la loi l’exige.'] },
        { h: 'Transferts hors d’Israël', p: ['Certains prestataires sont hors d’Israël (États-Unis, UE et, pour DeepSeek, Chine). Les transferts respectent le règlement israélien de 2001 sur le transfert de données vers l’étranger. Pour les utilisateurs de l’UE : Israël bénéficie d’une décision d’adéquation de la Commission européenne, et les transferts ultérieurs utilisent des garanties appropriées comme les clauses contractuelles types.'] },
        { h: 'Durée de conservation', p: ['Les données du compte et du suivi sont conservées tant que le compte est actif et jusqu’à 24 mois après la fin du suivi, sauf demande de suppression anticipée.', `Demandes du site qui n’ont pas abouti à un suivi : ${F.leadDays}.`, 'Les preuves de consentement sont conservées tant qu’elles sont nécessaires pour prouver le consentement.', 'La suppression du compte supprime aussi les fichiers (photos de progression, photos et enregistrements du chat, photo de profil).'] },
        { h: 'Sécurité', p: ['Connexions chiffrées (HTTPS), mots de passe stockés hachés, accès limité à votre coach, à vous et aux administrateurs, et photos du chat réencodées pour retirer les métadonnées de l’appareil. Nous appliquons le règlement sur la sécurité des données ; en cas d’incident grave, nous le signalons à l’Autorité israélienne de protection de la vie privée et vous en informons lorsque la loi l’exige.'] },
        { h: 'Vos droits', id: 'rights', p: ['Accéder à vos données (art. 13 de la loi), les faire rectifier ou effacer (art. 14), en recevoir une copie dans un format courant, vous opposer à un traitement et retirer un consentement à tout moment (sans effet sur ce qui a été fait avant).', 'Dans l’application : Profil › « Confidentialité et mes données » — télécharger toutes vos données (ZIP), retirer le consentement aux données de santé et supprimer définitivement votre compte.', `Sinon : ${F.email}, WhatsApp ou le formulaire de contact. Réponse sous 30 jours.`, 'Vous pouvez saisir l’Autorité israélienne de protection de la vie privée (gov.il/privacy) ou, dans l’UE, votre autorité de contrôle (la CNIL en France).'] },
        { h: 'Cookies et stockage du navigateur', p: ['Essentiels (toujours actifs, dans le stockage local du navigateur — pas des cookies) : access_token (connexion) ; ec-query-cache-v1 — une copie des écrans de l’application conservée sur votre appareil pour qu’ils s’ouvrent instantanément, pouvant contenir des données de santé et effacée à la déconnexion ; préférences d’interface (i18nextLng pour la langue, theme pour l’apparence, barre latérale et rappels) ; cookie_consent (votre choix) ; ec_intro (animation d’ouverture, pour la session). Sur un appareil partagé, déconnectez-vous à la fin.', 'Statistiques (uniquement après « Accepter » dans le bandeau) : cookies Google Analytics _ga et _ga_<id>, jusqu’à deux ans.', 'Vous pouvez modifier votre choix à tout moment via « Paramètres des cookies » en bas du site.'] },
        { h: 'Instagram et suppression des données Meta', id: 'instagram', p: ['Nous ne conservons aucune donnée Instagram : les identifiants de commentaires restent uniquement en mémoire temporaire pour éviter les doublons. Pour une demande de suppression ou d’information, écrivez à l’adresse ci-dessus, ou retirez l’accès de l’application dans vos réglages Instagram.'] },
        { h: 'Mineurs', p: ['Le service s’adresse aux personnes de 18 ans et plus. Les moins de 18 ans ne sont suivis qu’avec l’accord écrit d’un parent ou tuteur. Nous ne collectons pas sciemment de données sur des enfants de moins de 13 ans.'] },
        { h: 'Modifications', p: ['Cette politique est mise à jour de temps en temps ; la date en haut indique la dernière version. Une modification importante est signalée dans l’application et votre accord vous est redemandé.'] },
      ],
    },
    terms: {
      title: 'Conditions et annulation', updated: UPDATED,
      intro: `Ces conditions s’appliquent au site, à l’application et aux services d’accompagnement ECshape. Prestataire : ${F.name}, ${F.id}, ${F.address}, ${F.email}, ${F.phone}.`,
      sections: [
        { h: 'Le service', p: ['ECshape propose un accompagnement sportif et nutritionnel : coaching individuel en présentiel, suivi en ligne et entraînements en groupe — avec programmes, plans nutritionnels, suivi des progrès et contact avec le coach dans l’application.', 'Les contenus du site (articles, vidéos, conseils) sont des informations générales, pas un conseil personnalisé.'] },
        { h: 'Qui peut l’utiliser', p: ['Le service s’adresse aux personnes de 18 ans et plus (moins de 18 ans uniquement avec l’accord écrit d’un parent ou tuteur).', 'Les comptes sont ouverts par le coach. À la première connexion, vous devez accepter ces conditions, la politique de confidentialité et le traitement des données de santé, et remplir la déclaration de santé.'] },
        { h: 'Santé', p: ['Le service n’est ni un avis médical, ni un diagnostic, ni un traitement. Avant de commencer, lisez l’« Avertissement santé » et répondez honnêtement à la déclaration de santé. Si vous avez répondu « oui » à une question, obtenez l’accord d’un médecin avant de commencer.'] },
        { h: 'Prix et engagement', p: ['Le prix, le contenu, la durée et les modalités de paiement vous sont communiqués avant votre engagement, TVA comprise lorsqu’elle s’applique.', 'Pour un engagement à distance (téléphone, WhatsApp, Zoom ou en ligne), nous vous remettons par écrit — avant l’engagement ou au plus tard au début du service — un document d’information selon l’article 14C de la loi israélienne sur la protection du consommateur : coordonnées de l’entreprise, description du service, prix total, modalités de paiement, date de début et durée, conditions d’annulation.'] },
        { h: 'Annulation et remboursement', id: 'cancellation', p: ['Engagement à distance : vous pouvez annuler dans les 14 jours suivant l’engagement ou la réception du document d’information, selon la date la plus tardive, à condition d’annuler au moins 2 jours ouvrés avant le début du service si une date a été fixée. Les personnes handicapées, les seniors et les nouveaux immigrants bénéficient du délai prolongé prévu par la loi.', 'Le remboursement intervient dans les 14 jours suivant la réception de l’annulation, déduction faite de la part du service déjà fourni et de frais d’annulation de 5 % du prix ou 100 ₪, le montant le plus bas étant retenu, conformément au règlement israélien de 2010 sur l’annulation des transactions.', 'Engagement continu (abonnement mensuel) : vous pouvez résilier à tout moment par tout moyen utilisé pour l’engagement — téléphone, e-mail, WhatsApp ou par écrit. La résiliation prend effet sous 3 jours ouvrés et aucun prélèvement n’a lieu ensuite (article 13D de la loi).', `Notifications d’annulation : ${F.email}, ${F.phone}, WhatsApp ou le formulaire de contact. Nous confirmons la réception par écrit.`, 'Les consommateurs de l’UE et du Royaume-Uni conservent leurs droits légaux de rétractation.'] },
        { h: 'Compte et usage loyal', p: ['Donnez des informations exactes et protégez votre mot de passe. Le compte est personnel et non transférable.', 'Il est interdit de copier, diffuser ou vendre les programmes, menus ou contenus de l’application, ou de nuire au système.'] },
        { h: 'Contenus et résultats', p: ['Les photos avant/après et les témoignages du site sont ceux de vrais élèves, publiés avec leur accord. Les résultats varient selon la régularité, l’alimentation, le sommeil, la santé et des facteurs personnels — ils ne constituent pas une promesse.', 'Certains textes et ébauches de programmes sont rédigés avec des outils d’IA et relus par le coach. Les valeurs nutritionnelles et estimations caloriques (y compris la reconnaissance d’aliments sur photo) ne sont que des estimations.'] },
        { h: 'Propriété intellectuelle', p: ['Contenus, design, logo, photos et programmes appartiennent à ECshape ou à ses concédants et sont protégés par le droit d’auteur. Les licences de tiers figurent sur la page « Crédits et licences ».'] },
        { h: 'Responsabilité', p: ['Le service est fourni « en l’état ». Dans les limites de la loi, ECshape n’est pas responsable des dommages liés à un usage contraire aux consignes, à des informations inexactes ou incomplètes (y compris dans la déclaration de santé) ou aux pannes de services tiers. Rien ici ne limite les droits impératifs des consommateurs.'] },
        { h: 'Fin du service', p: ['Vous pouvez supprimer votre compte à tout moment depuis les réglages. Nous pouvons suspendre un compte utilisé contrairement aux présentes conditions, après notification.'] },
        { h: 'Droit applicable', p: ['Ces conditions sont régies par le droit israélien ; les tribunaux compétents du district de Tel-Aviv sont compétents, sans préjudice des droits impératifs des consommateurs de votre pays de résidence.'] },
      ],
    },
    health: {
      title: 'Avertissement santé', updated: UPDATED,
      intro: 'ECshape propose de l’entraînement sportif et un accompagnement nutritionnel général. Lisez cet avertissement avant de commencer à vous entraîner ou de changer d’alimentation.',
      sections: [
        { h: 'Pas un avis médical', p: ['Le service, l’application et les contenus du site ne sont ni un avis médical, ni un diagnostic, ni un traitement, et ne remplacent pas un médecin, un diététicien ou un kinésithérapeute. Le coach n’est ni médecin ni diététicien.'] },
        { h: 'Consultez un médecin', p: ['Consultez un médecin avant de commencer un programme ou de changer d’alimentation — surtout en cas de maladie cardiaque, hypertension, diabète, maladie chronique, blessure, grossesse ou accouchement dans les six derniers mois, traitement régulier, ou antécédents de troubles alimentaires.', 'À votre première connexion, l’application vous demande de remplir une déclaration de santé. Un « oui » à une question impose l’accord écrit d’un médecin avant de commencer.'] },
        { h: 'Pendant l’entraînement', p: ['Arrêtez immédiatement et consultez en cas de douleur thoracique, vertige, essoufflement inhabituel, malaise ou tout symptôme inhabituel. En cas d’urgence en Israël, appelez le 101 (Magen David Adom) ; en France, le 15 ou le 112.'] },
        { h: 'Nutrition', p: ['Les menus, objectifs caloriques et valeurs nutritionnelles sont des estimations générales, issues de bases ouvertes (Open Food Facts, USDA), et peuvent être inexacts. Ils ne visent à traiter aucune maladie.', 'Si vous avez ou avez eu un trouble alimentaire, parlez-en à un professionnel avant de compter les calories ou de perdre du poids.'] },
        { h: 'Résultats', p: ['Les résultats varient d’une personne à l’autre. Ceux des autres élèves, y compris les photos avant/après, ne constituent pas une promesse.'] },
      ],
    },
    accessibility: {
      title: 'Déclaration d’accessibilité', updated: UPDATED,
      intro: 'ECshape s’engage à permettre à chacun, y compris aux personnes en situation de handicap, d’utiliser le site et l’application à égalité et dans la dignité, conformément à la loi israélienne de 1998 sur l’égalité des droits des personnes handicapées et à son règlement de 2013 sur l’accessibilité des services (article 35).',
      sections: [
        { h: 'Niveau d’accessibilité', p: ['Le site et l’application ont été adaptés à la norme israélienne IS 5568, basée sur les WCAG 2.0, niveau AA.', `Dernier audit d’accessibilité : ${F.a11yAudit}. Déclaration mise à jour le 20 novembre 2026.`] },
        { h: 'Ce que nous avons fait', p: ['Navigation complète au clavier et focus visible.', 'Compatibilité avec les lecteurs d’écran : titres structurés, libellés des boutons et images, annonces d’état.', 'Contraste suffisant, modes sombre et clair.', 'Respect du réglage « réduire les animations » de l’appareil.', 'Texte agrandissable à 200 % sans perte de contenu ; affichage adapté aux téléphones.', 'Site disponible en hébreu, anglais et français (et traduit automatiquement en russe et en arabe) avec le bon sens de lecture.'] },
        { h: 'Limites connues', p: ['Certains contenus de tiers (vidéos de démonstration intégrées, photos de produits) peuvent ne pas être entièrement accessibles, et les vidéos n’ont pas de sous-titres. Ces informations sont disponibles autrement — contactez-nous.'] },
        { h: 'Accessibilité physique', p: [`Les séances individuelles ont lieu là où cela convient à l’élève (salle, domicile ou extérieur), et nous adaptons le lieu à vos besoins. ${F.premises}.`] },
        { h: 'Référent accessibilité', p: [`${F.a11yName} · téléphone : ${F.a11yPhone} · e-mail : ${F.a11yEmail}.`, 'Vous avez rencontré un problème ? Indiquez la page et le problème : réponse sous 7 jours ouvrés. Le service est aussi disponible par téléphone, WhatsApp ou e-mail.'] },
      ],
    },
    credits: {
      title: 'Crédits et licences', updated: UPDATED,
      intro: 'L’application utilise des bases de données, photos et logiciels de tiers sous licences libres. Merci à leurs auteurs — voici le détail demandé par les licences.',
      sections: CREDITS_ITEMS.fr.map(([h, p]) => ({ h, p: [p] })),
    },
  },
};
