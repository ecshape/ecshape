/**
 * QA #84: legal pages of the site and the app (privacy, terms, accessibility, credits & licences) in he / en / fr.
 * Written as a solid starting point for an Israeli online coaching business that also serves French / English
 * speakers (Privacy Protection Law 5741-1981 incl. Amendment 13, GDPR principles, Consumer Protection Law, Equal Rights
 * for Persons with Disabilities regulations / IS 5568). Have them reviewed by a lawyer before relying on them.
 */
export type LegalDoc = 'privacy' | 'terms' | 'accessibility' | 'credits';
export type LegalLang = 'he' | 'en' | 'fr';
export interface LegalSection { h: string; p: string[] }
export interface LegalPage { title: string; updated: string; intro: string; sections: LegalSection[] }

const UPDATED = '2026-11-16';

export const LEGAL_NAV: Record<LegalLang, Record<LegalDoc, string> & { back: string; updatedLabel: string; footerLabel: string }> = {
  he: { privacy: 'מדיניות פרטיות', terms: 'תנאי שימוש', accessibility: 'הצהרת נגישות', credits: 'קרדיטים ורישיונות', back: 'חזרה לאתר', updatedLabel: 'עודכן לאחרונה', footerLabel: 'מידע משפטי' },
  en: { privacy: 'Privacy policy', terms: 'Terms of use', accessibility: 'Accessibility statement', credits: 'Credits & licences', back: 'Back to the site', updatedLabel: 'Last updated', footerLabel: 'Legal' },
  fr: { privacy: 'Politique de confidentialité', terms: 'Conditions d’utilisation', accessibility: 'Déclaration d’accessibilité', credits: 'Crédits et licences', back: 'Retour au site', updatedLabel: 'Dernière mise à jour', footerLabel: 'Mentions légales' },
};

const CREDITS_ITEMS = {
  he: [
    ['מאגר התרגילים', 'free-exercise-db (github.com/yuhonas/free-exercise-db) — נחלת הכלל (The Unlicense), כולל התמונות.'],
    ['תרגילים נוספים', 'wger.de — רישיון CC BY-SA 4.0. שינויים: תרגום ועיבוד לתצוגה באפליקציה.'],
    ['מוצרי מזון וברקודים', 'Open Food Facts (openfoodfacts.org) — מאגר ברישיון ODbL, תמונות מוצרים ברישיון CC BY-SA. הקרדיט מוצג ליד כל תמונה.'],
    ['ערכים תזונתיים', 'USDA FoodData Central — נחלת הכלל (CC0).'],
    ['תמונות מזון', 'Wikimedia Commons — רישיונות חופשיים (CC0, נחלת הכלל, CC BY, CC BY-SA). שם הצלם והרישיון מוצגים ליד כל תמונה.'],
    ['זיהוי מזון מתמונה', 'מודל CLIP (OpenAI, רישיון MIT) בגרסת Xenova/clip-vit-base-patch32 (רישיון MIT), רץ על השרת שלנו.'],
    ['לוגואים של ספקי AI', 'Simple Icons (CC0). הסימנים הם סימני מסחר של בעליהם ומוצגים רק לזיהוי הספק.'],
    ['גופנים', 'Heebo, Karantina, Anton, Racing Sans One — Google Fonts, רישיון SIL Open Font License.'],
    ['אייקונים', 'Lucide (רישיון ISC).'],
    ['תמונות ותוצאות מתאמנים', 'כל התמונות, הצילומים וההמלצות באתר שייכים ל-ECshape ומוצגים בהסכמת המתאמנים.'],
  ],
  en: [
    ['Exercise library', 'free-exercise-db (github.com/yuhonas/free-exercise-db) — public domain (The Unlicense), images included.'],
    ['More exercises', 'wger.de — CC BY-SA 4.0 licence. Changes: translated and adapted for display in the app.'],
    ['Food products and barcodes', 'Open Food Facts (openfoodfacts.org) — database under the ODbL, product photos under CC BY-SA. Credit is shown next to each photo.'],
    ['Nutrition values', 'USDA FoodData Central — public domain (CC0).'],
    ['Food photos', 'Wikimedia Commons — free licences (CC0, public domain, CC BY, CC BY-SA). The author and licence are shown next to each photo.'],
    ['Food recognition from photos', 'CLIP model (OpenAI, MIT licence) in the Xenova/clip-vit-base-patch32 build (MIT licence), running on our own server.'],
    ['AI provider logos', 'Simple Icons (CC0). The marks are trademarks of their owners, shown only to identify the provider.'],
    ['Fonts', 'Heebo, Karantina, Anton, Racing Sans One — Google Fonts, SIL Open Font License.'],
    ['Icons', 'Lucide (ISC licence).'],
    ['Client photos and results', 'All photos, pictures and testimonials on the site belong to ECshape and are shown with the clients’ consent.'],
  ],
  fr: [
    ['Bibliothèque d’exercices', 'free-exercise-db (github.com/yuhonas/free-exercise-db) — domaine public (The Unlicense), images comprises.'],
    ['Exercices supplémentaires', 'wger.de — licence CC BY-SA 4.0. Modifications : traduction et adaptation à l’affichage dans l’application.'],
    ['Produits alimentaires et codes-barres', 'Open Food Facts (openfoodfacts.org) — base sous licence ODbL, photos de produits sous CC BY-SA. Le crédit est affiché à côté de chaque photo.'],
    ['Valeurs nutritionnelles', 'USDA FoodData Central — domaine public (CC0).'],
    ['Photos d’aliments', 'Wikimedia Commons — licences libres (CC0, domaine public, CC BY, CC BY-SA). L’auteur et la licence sont affichés à côté de chaque photo.'],
    ['Reconnaissance des aliments sur photo', 'Modèle CLIP (OpenAI, licence MIT), version Xenova/clip-vit-base-patch32 (licence MIT), exécuté sur notre propre serveur.'],
    ['Logos des fournisseurs d’IA', 'Simple Icons (CC0). Les marques appartiennent à leurs propriétaires et servent uniquement à identifier le fournisseur.'],
    ['Polices', 'Heebo, Karantina, Anton, Racing Sans One — Google Fonts, licence SIL Open Font License.'],
    ['Icônes', 'Lucide (licence ISC).'],
    ['Photos et résultats des élèves', 'Toutes les photos et tous les témoignages du site appartiennent à ECshape et sont publiés avec l’accord des élèves.'],
  ],
} as const;

export const LEGAL: Record<LegalLang, Record<LegalDoc, LegalPage>> = {
  he: {
    privacy: {
      title: 'מדיניות פרטיות', updated: UPDATED,
      intro: 'ECshape (אליאור קרמיזי, מאמן כושר אישי וליווי אונליין) מכבדת את פרטיותך. כאן מוסבר איזה מידע נאסף באתר ובאפליקציה, למה, למי הוא מועבר ומה הזכויות שלך, בהתאם לחוק הגנת הפרטיות, התשמ"א-1981 ותיקון 13 לחוק, ולעקרונות ה-GDPR עבור משתמשים מאירופה.',
      sections: [
        { h: 'איזה מידע נאסף', p: ['פרטים שמסרת בטופס יצירת קשר: שם, טלפון, אימייל, מטרה והודעה.', 'פרטי חשבון באפליקציה: שם, אימייל, תמונת פרופיל.', 'מידע בריאותי ואישי שבחרת לשתף לצורך הליווי: משקל, מידות היקפים, תמונות התקדמות, צ׳ק-אין יומי (שינה, רעב, צעדים), ארוחות, אימונים, פציעות והעדפות תזונה. זהו מידע רגיש ונשמר בהתאם.', 'הודעות בצ׳אט עם המאמן ותמונות ארוחות שהעלית.', 'מידע טכני: סוג דפדפן ומכשיר, וסטטיסטיקות שימוש מ-Google Analytics — רק אם אישרת עוגיות.'] },
        { h: 'למה המידע משמש', p: ['כדי לתת לך את שירותי הליווי: תוכנית אימון, תפריט, מעקב התקדמות ותקשורת עם המאמן.', 'כדי לחזור אליך אחרי פנייה מהאתר.', 'כדי לשפר את האתר והאפליקציה (סטטיסטיקות מצטברות בלבד).', 'המידע לא נמכר ולא משמש לפרסום של צד שלישי.'] },
        { h: 'בינה מלאכותית', p: ['תכונות כמו זיהוי מזון מתמונה ותרגום טקסטים עשויות לשלוח את התמונה או הטקסט לספק AI (Anthropic, Google, OpenAI ואחרים) או לעבד אותם במודל שרץ על השרת שלנו. נשלח רק מה שנדרש לפעולה, ללא שמך.', 'המאמן עשוי להיעזר בעוזר AI לניתוח התקדמות ובניית תוכניות. ההחלטות המקצועיות מתקבלות על ידי המאמן.'] },
        { h: 'מי מקבל את המידע', p: ['ספקי תשתית שמאחסנים את המערכת עבורנו (שרתי ענן כגון Railway ו-Vercel), ספקי AI כאמור, ו-Google Analytics (אם אישרת עוגיות). חלק מהספקים נמצאים מחוץ לישראל; ההעברה נעשית בהתאם לתקנות הגנת הפרטיות (העברת מידע אל מחוץ לגבולות המדינה).', 'גורם מוסמך על פי דין, אם נדרש.'] },
        { h: 'שמירה ואבטחה', p: ['החיבור מוצפן (HTTPS), סיסמאות ומפתחות נשמרים מוצפנים, והגישה למידע מוגבלת למאמן ולמתאמן עצמו.', 'המידע נשמר כל עוד החשבון פעיל, ועד 24 חודשים לאחר סיום הליווי לצורך המשכיות ושירות, אלא אם ביקשת מחיקה מוקדמת.'] },
        { h: 'עוגיות', p: ['האתר משתמש בעוגיות הכרחיות לתפקוד ובאחסון מקומי בדפדפן. עוגיות סטטיסטיקה (Google Analytics) נטענות רק אחרי אישור בבאנר העוגיות, ואפשר לשנות את הבחירה בכל עת דרך "הגדרות עוגיות" בתחתית האתר.'] },
        { h: 'הזכויות שלך', p: ['לעיין במידע שנשמר עליך, לבקש לתקן אותו או למחוק אותו, להתנגד לשימוש מסוים ולבקש עותק של המידע.', 'לפנייה: דרך הוואטסאפ או טופס יצירת הקשר באתר. נשיב תוך 30 יום. אם לא קיבלת מענה, אפשר לפנות לרשות להגנת הפרטיות.'] },
        { h: 'קטינים', p: ['השירות מיועד לבני 18 ומעלה. ליווי של מתאמנים מתחת לגיל 18 ייעשה רק בהסכמת הורה או אפוטרופוס.'] },
        { h: 'שינויים', p: ['נעדכן מדיניות זו מעת לעת; התאריך בראש העמוד מציין את העדכון האחרון.'] },
      ],
    },
    terms: {
      title: 'תנאי שימוש', updated: UPDATED,
      intro: 'השימוש באתר ECshape ובאפליקציה כפוף לתנאים אלה. השימוש בשירות מהווה הסכמה להם.',
      sections: [
        { h: 'השירות', p: ['ECshape מציעה ליווי כושר ותזונה אישי ואונליין: תוכניות אימון, תפריטים, מעקב התקדמות וקשר עם המאמן דרך האפליקציה.', 'התוכן באתר (מאמרים, סרטונים, טיפים) הוא מידע כללי ואינו ייעוץ אישי.'] },
        { h: 'הצהרת בריאות — חשוב', p: ['השירות אינו ייעוץ רפואי, אבחון או טיפול, ואינו תחליף לרופא, דיאטנית קלינית או פיזיותרפיסט.', 'לפני תחילת תוכנית אימון או שינוי תזונתי מומלץ להתייעץ עם רופא, ובמיוחד אם יש לך מחלה, פציעה, הריון, סוכרת, בעיות לב או לחץ דם, או היסטוריה של הפרעות אכילה. עליך למלא את שאלון ההתאמה בכנות.', 'עליך להפסיק פעילות ולפנות לרופא אם מופיעים כאב, סחרחורת, קוצר נשימה או כל תסמין חריג.', 'תוצאות משתנות מאדם לאדם; תוצאות של מתאמנים אחרים אינן הבטחה לתוצאה.'] },
        { h: 'חשבון ושימוש הוגן', p: ['עליך למסור פרטים נכונים ולשמור על סיסמתך. החשבון אישי ואין להעבירו.', 'אין להעתיק, להפיץ או למכור תוכניות, תפריטים או תוכן מהאפליקציה, ואין לנסות לפגוע במערכת.'] },
        { h: 'תשלום, ביטול והחזרים', p: ['מחירי התוכניות מוצגים לפני התשלום. ביטול עסקה ייעשה בהתאם לחוק הגנת הצרכן, התשמ"א-1981 ותקנות הגנת הצרכן (ביטול עסקה): עסקה מרחוק ניתן לבטל תוך 14 יום מיום ההתקשרות, והחזר יינתן בניכוי החלק היחסי של שירות שכבר ניתן ודמי ביטול כקבוע בדין.', 'לבקשת ביטול: וואטסאפ או טופס יצירת הקשר באתר.'] },
        { h: 'קניין רוחני', p: ['התכנים, העיצוב, הלוגו, התמונות והתוכניות שייכים ל-ECshape או לבעלי רישיון, ומוגנים בזכויות יוצרים. רישיונות של תוכן צד שלישי מפורטים בעמוד "קרדיטים ורישיונות".', 'תמונות והמלצות של מתאמנים מתפרסמות רק בהסכמתם בכתב.'] },
        { h: 'אחריות', p: ['השירות ניתן "כמות שהוא". ECshape אינה אחראית לנזק שנגרם משימוש שאינו לפי ההנחיות, ממידע שגוי שנמסר, או מתקלות בשירותי צד שלישי, ככל שהדין מתיר.'] },
        { h: 'דין וסמכות', p: ['על תנאים אלה חל הדין הישראלי. סמכות השיפוט הבלעדית — לבתי המשפט המוסמכים במחוז תל אביב.'] },
      ],
    },
    accessibility: {
      title: 'הצהרת נגישות', updated: UPDATED,
      intro: 'ECshape מחויבת לאפשר לכל אדם, כולל אנשים עם מוגבלות, להשתמש באתר ובאפליקציה בנוחות, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות ולתקנות הנגישות לשירות (תקן ישראלי 5568, המבוסס על WCAG 2.0 ברמה AA).',
      sections: [
        { h: 'מה עשינו', p: ['ניווט מלא במקלדת ומיקוד נראה לעין.', 'תמיכה בקוראי מסך: כותרות מסודרות, תיאורים לכפתורים ולתמונות, הודעות מצב.', 'ניגודיות צבעים מספקת, מצב כהה ובהיר.', 'כיבוד הגדרת "הפחתת תנועה" של המכשיר — אנימציות מושבתות.', 'הגדלת טקסט עד 200% בלי אובדן תוכן, ותצוגה מותאמת לטלפונים.', 'האתר זמין בעברית, אנגלית וצרפתית, עם כיוון כתיבה מתאים.'] },
        { h: 'מגבלות ידועות', p: ['ייתכן שחלק מהתכנים של צד שלישי (סרטוני הדגמה מוטמעים, תמונות מוצרים) אינם נגישים במלואם. אנחנו ממשיכים לשפר.'] },
        { h: 'פנייה בנושא נגישות', p: ['נתקלת בבעיה? נשמח לשמוע ולתקן. פנו אלינו בוואטסאפ או בטופס יצירת הקשר באתר, ציינו את העמוד ואת הבעיה. נחזור אליך תוך 7 ימי עסקים.'] },
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
      intro: 'ECshape (Elior Cremisi, personal trainer and online coaching) respects your privacy. This page explains what information the site and the app collect, why, who receives it and what your rights are, under the Israeli Privacy Protection Law 5741-1981 (including Amendment 13) and the GDPR principles for users in Europe.',
      sections: [
        { h: 'What we collect', p: ['Details you give in the contact form: name, phone, email, goal and message.', 'App account details: name, email, profile photo.', 'Health and personal information you choose to share for coaching: weight, body measurements, progress photos, daily check-ins (sleep, hunger, steps), meals, workouts, injuries and food preferences. This is sensitive information and is protected accordingly.', 'Chat messages with your coach and meal photos you upload.', 'Technical data: browser and device type, and usage statistics from Google Analytics — only if you accepted cookies.'] },
        { h: 'Why we use it', p: ['To provide the coaching: training plan, meal plan, progress tracking and contact with your coach.', 'To get back to you after a request from the site.', 'To improve the site and the app (aggregated statistics only).', 'Your information is never sold or used for third-party advertising.'] },
        { h: 'Artificial intelligence', p: ['Features such as recognising food in a photo or translating texts may send that photo or text to an AI provider (Anthropic, Google, OpenAI and others) or process it with a model running on our own server. Only what the feature needs is sent, without your name.', 'Your coach may use an AI assistant to analyse progress and draft plans. Professional decisions are made by the coach.'] },
        { h: 'Who receives it', p: ['Infrastructure providers hosting the system for us (cloud servers such as Railway and Vercel), AI providers as described, and Google Analytics (if you accepted cookies). Some providers are outside Israel; transfers follow the Privacy Protection (Transfer of Data to Databases Abroad) Regulations and, for EU users, appropriate safeguards.', 'Authorities, when required by law.'] },
        { h: 'Storage and security', p: ['Connections are encrypted (HTTPS), passwords and keys are stored encrypted, and access is limited to your coach and you.', 'Information is kept while the account is active and up to 24 months after coaching ends, for continuity and service, unless you ask for earlier deletion.'] },
        { h: 'Cookies', p: ['The site uses cookies and browser storage that are needed for it to work. Statistics cookies (Google Analytics) load only after you accept them in the cookie banner; you can change your choice at any time with "Cookie settings" at the bottom of the site.'] },
        { h: 'Your rights', p: ['To see the information we hold about you, ask to correct or delete it, object to a use, and receive a copy of it.', 'Contact us through WhatsApp or the site’s contact form. We answer within 30 days. If you are not satisfied you may contact the Privacy Protection Authority (or your EU data protection authority).'] },
        { h: 'Minors', p: ['The service is for people aged 18 and over. Clients under 18 are coached only with a parent’s or guardian’s consent.'] },
        { h: 'Changes', p: ['We update this policy from time to time; the date at the top shows the latest version.'] },
      ],
    },
    terms: {
      title: 'Terms of use', updated: UPDATED,
      intro: 'Using the ECshape site and app is subject to these terms. By using the service you accept them.',
      sections: [
        { h: 'The service', p: ['ECshape offers personal and online fitness and nutrition coaching: training plans, meal plans, progress tracking and contact with the coach through the app.', 'Content on the site (articles, videos, tips) is general information, not personal advice.'] },
        { h: 'Health notice — important', p: ['The service is not medical advice, diagnosis or treatment and does not replace a doctor, clinical dietitian or physiotherapist.', 'Before starting a training plan or changing your diet, consult a doctor — especially if you have an illness, injury, pregnancy, diabetes, heart or blood-pressure problems, or a history of eating disorders. Answer the intake questionnaire honestly.', 'Stop and see a doctor if you feel pain, dizziness, shortness of breath or any unusual symptom.', 'Results vary from person to person; other clients’ results are not a promise of yours.'] },
        { h: 'Account and fair use', p: ['Give accurate details and keep your password safe. Your account is personal and may not be transferred.', 'Do not copy, share or sell plans, menus or app content, and do not try to harm the system.'] },
        { h: 'Payment, cancellation and refunds', p: ['Program prices are shown before payment. Cancellations follow the Israeli Consumer Protection Law 5741-1981 and the Consumer Protection (Cancellation of Transaction) Regulations: a distance purchase may be cancelled within 14 days, with a refund less the share of service already given and any cancellation fee allowed by law. EU consumers keep their statutory withdrawal rights.', 'To cancel: WhatsApp or the site’s contact form.'] },
        { h: 'Intellectual property', p: ['Content, design, logo, photos and plans belong to ECshape or its licensors and are protected by copyright. Third-party licences are listed on the "Credits & licences" page.', 'Client photos and testimonials are published only with their written consent.'] },
        { h: 'Liability', p: ['The service is provided "as is". To the extent the law allows, ECshape is not liable for damage caused by use against the guidance, by wrong information you provided, or by outages of third-party services.'] },
        { h: 'Law and jurisdiction', p: ['These terms are governed by Israeli law. The competent courts of the Tel Aviv district have exclusive jurisdiction, without prejudice to mandatory consumer rights in your country.'] },
      ],
    },
    accessibility: {
      title: 'Accessibility statement', updated: UPDATED,
      intro: 'ECshape is committed to letting everyone, including people with disabilities, use the site and the app comfortably, in line with the Israeli Equal Rights for Persons with Disabilities Law and its service accessibility regulations (Israeli Standard 5568, based on WCAG 2.0 level AA).',
      sections: [
        { h: 'What we did', p: ['Full keyboard navigation and a visible focus.', 'Screen-reader support: ordered headings, labels for buttons and images, status announcements.', 'Sufficient colour contrast, dark and light modes.', 'The device’s "reduce motion" setting is respected — animations are turned off.', 'Text can be enlarged to 200 % without losing content; layouts adapt to phones.', 'The site is available in Hebrew, English and French with the right reading direction.'] },
        { h: 'Known limitations', p: ['Some third-party content (embedded demo videos, product photos) may not be fully accessible. We keep improving.'] },
        { h: 'Accessibility contact', p: ['Found a problem? We want to hear about it and fix it. Contact us through WhatsApp or the site’s contact form with the page and the problem. We reply within 7 business days.'] },
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
      intro: 'ECshape (Elior Cremisi, coach sportif personnel et accompagnement en ligne) respecte votre vie privée. Cette page explique quelles informations le site et l’application collectent, pourquoi, qui les reçoit et quels sont vos droits, selon la loi israélienne sur la protection de la vie privée 5741-1981 (amendement 13 compris) et les principes du RGPD pour les utilisateurs européens.',
      sections: [
        { h: 'Ce que nous collectons', p: ['Les informations du formulaire de contact : nom, téléphone, e-mail, objectif et message.', 'Les informations du compte : nom, e-mail, photo de profil.', 'Les informations de santé et personnelles que vous choisissez de partager pour le suivi : poids, mensurations, photos de progression, check-ins quotidiens (sommeil, faim, pas), repas, séances, blessures et préférences alimentaires. Ce sont des données sensibles, protégées en conséquence.', 'Les messages échangés avec votre coach et les photos de repas envoyées.', 'Des données techniques : type de navigateur et d’appareil, et statistiques d’utilisation Google Analytics — uniquement si vous avez accepté les cookies.'] },
        { h: 'À quoi elles servent', p: ['Fournir l’accompagnement : programme d’entraînement, plan nutritionnel, suivi des progrès et contact avec le coach.', 'Vous recontacter après une demande sur le site.', 'Améliorer le site et l’application (statistiques agrégées uniquement).', 'Vos données ne sont jamais vendues ni utilisées pour de la publicité de tiers.'] },
        { h: 'Intelligence artificielle', p: ['Des fonctions comme la reconnaissance des aliments sur photo ou la traduction peuvent envoyer la photo ou le texte à un fournisseur d’IA (Anthropic, Google, OpenAI, etc.) ou les traiter avec un modèle exécuté sur notre serveur. Seul le nécessaire est envoyé, sans votre nom.', 'Votre coach peut utiliser un assistant IA pour analyser les progrès et préparer des programmes. Les décisions professionnelles sont prises par le coach.'] },
        { h: 'Qui les reçoit', p: ['Les hébergeurs du système (serveurs cloud comme Railway et Vercel), les fournisseurs d’IA mentionnés et Google Analytics (si vous avez accepté les cookies). Certains sont situés hors d’Israël et de l’UE ; les transferts respectent la réglementation israélienne et, pour les utilisateurs européens, des garanties appropriées.', 'Les autorités, lorsque la loi l’exige.'] },
        { h: 'Conservation et sécurité', p: ['Les connexions sont chiffrées (HTTPS), les mots de passe et clés stockés chiffrés, et l’accès est limité à votre coach et à vous.', 'Les données sont conservées tant que le compte est actif et jusqu’à 24 mois après la fin du suivi, sauf demande de suppression anticipée.'] },
        { h: 'Cookies', p: ['Le site utilise des cookies et un stockage local nécessaires à son fonctionnement. Les cookies de statistiques (Google Analytics) ne sont chargés qu’après votre accord dans le bandeau ; vous pouvez modifier votre choix à tout moment via « Paramètres des cookies » en bas du site.'] },
        { h: 'Vos droits', p: ['Accéder à vos données, les faire rectifier ou effacer, vous opposer à un traitement et en recevoir une copie.', 'Contactez-nous par WhatsApp ou via le formulaire du site. Réponse sous 30 jours. Vous pouvez aussi saisir l’Autorité israélienne de protection de la vie privée ou la CNIL.'] },
        { h: 'Mineurs', p: ['Le service s’adresse aux personnes de 18 ans et plus. Les moins de 18 ans ne sont suivis qu’avec l’accord d’un parent ou tuteur.'] },
        { h: 'Modifications', p: ['Cette politique est mise à jour de temps en temps ; la date en haut indique la dernière version.'] },
      ],
    },
    terms: {
      title: 'Conditions d’utilisation', updated: UPDATED,
      intro: 'L’utilisation du site et de l’application ECshape est soumise aux présentes conditions. En utilisant le service, vous les acceptez.',
      sections: [
        { h: 'Le service', p: ['ECshape propose un accompagnement sportif et nutritionnel personnel et en ligne : programmes, plans nutritionnels, suivi des progrès et contact avec le coach dans l’application.', 'Les contenus du site (articles, vidéos, conseils) sont des informations générales, pas un conseil personnalisé.'] },
        { h: 'Avertissement santé — important', p: ['Le service n’est ni un avis médical, ni un diagnostic, ni un traitement, et ne remplace pas un médecin, un diététicien ou un kinésithérapeute.', 'Avant de commencer un programme ou de changer d’alimentation, consultez un médecin — surtout en cas de maladie, blessure, grossesse, diabète, problème cardiaque ou de tension, ou d’antécédents de troubles alimentaires. Répondez honnêtement au questionnaire.', 'Arrêtez et consultez un médecin en cas de douleur, vertige, essoufflement ou symptôme inhabituel.', 'Les résultats varient d’une personne à l’autre ; ceux des autres élèves ne constituent pas une promesse.'] },
        { h: 'Compte et usage loyal', p: ['Donnez des informations exactes et protégez votre mot de passe. Le compte est personnel et non transférable.', 'Il est interdit de copier, diffuser ou vendre les programmes, menus ou contenus de l’application, ou de nuire au système.'] },
        { h: 'Paiement, annulation et remboursement', p: ['Les prix sont affichés avant le paiement. L’annulation suit la loi israélienne sur la protection du consommateur et ses règlements : un achat à distance peut être annulé sous 14 jours, avec un remboursement déduction faite de la part du service déjà fourni et des frais autorisés par la loi. Les consommateurs de l’UE conservent leur droit légal de rétractation.', 'Pour annuler : WhatsApp ou le formulaire du site.'] },
        { h: 'Propriété intellectuelle', p: ['Contenus, design, logo, photos et programmes appartiennent à ECshape ou à ses concédants et sont protégés par le droit d’auteur. Les licences de tiers figurent sur la page « Crédits et licences ».', 'Les photos et témoignages d’élèves ne sont publiés qu’avec leur accord écrit.'] },
        { h: 'Responsabilité', p: ['Le service est fourni « en l’état ». Dans les limites de la loi, ECshape n’est pas responsable des dommages liés à un usage contraire aux consignes, à des informations inexactes fournies ou aux pannes de services tiers.'] },
        { h: 'Droit applicable', p: ['Ces conditions sont régies par le droit israélien ; les tribunaux compétents du district de Tel-Aviv sont seuls compétents, sans préjudice des droits impératifs des consommateurs de votre pays.'] },
      ],
    },
    accessibility: {
      title: 'Déclaration d’accessibilité', updated: UPDATED,
      intro: 'ECshape s’engage à permettre à chacun, y compris aux personnes en situation de handicap, d’utiliser le site et l’application confortablement, conformément à la loi israélienne sur l’égalité des droits des personnes handicapées et à la norme israélienne 5568 (basée sur WCAG 2.0 niveau AA).',
      sections: [
        { h: 'Ce que nous avons fait', p: ['Navigation complète au clavier et focus visible.', 'Compatibilité avec les lecteurs d’écran : titres structurés, libellés des boutons et images, annonces d’état.', 'Contraste suffisant, modes sombre et clair.', 'Respect du réglage « réduire les animations » de l’appareil.', 'Texte agrandissable à 200 % sans perte de contenu ; affichage adapté aux téléphones.', 'Site disponible en hébreu, anglais et français avec le bon sens de lecture.'] },
        { h: 'Limites connues', p: ['Certains contenus de tiers (vidéos de démonstration intégrées, photos de produits) peuvent ne pas être entièrement accessibles. Nous continuons d’améliorer.'] },
        { h: 'Nous contacter', p: ['Vous avez rencontré un problème ? Écrivez-nous par WhatsApp ou via le formulaire du site en précisant la page et le problème. Réponse sous 7 jours ouvrés.'] },
      ],
    },
    credits: {
      title: 'Crédits et licences', updated: UPDATED,
      intro: 'L’application utilise des bases de données, photos et logiciels de tiers sous licences libres. Merci à leurs auteurs — voici le détail demandé par les licences.',
      sections: CREDITS_ITEMS.fr.map(([h, p]) => ({ h, p: [p] })),
    },
  },
};

