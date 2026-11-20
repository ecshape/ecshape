/**
 * Legal audit 2026-11: texts of the first-login consent step, the health declaration and the
 * "Privacy & my data" settings card. he / en / fr written here; other interface languages fall back to English.
 * DRAFT — requires review by an Israeli lawyer.
 */
export type ConsentLang = 'he' | 'en' | 'fr';

export const HEALTH_QUESTIONS = ['heart', 'chest', 'dizzy', 'chronic', 'meds', 'joints', 'pregnant', 'eating', 'supervised'] as const;
export type HealthQuestion = (typeof HEALTH_QUESTIONS)[number];

interface ConsentCopy {
  title: string;
  intro: string;
  staffIntro: string;
  terms: [string, string, string, string]; // before, terms link, middle, privacy link
  health: string;
  age: string;
  declTitle: string;
  declIntro: string;
  yes: string;
  no: string;
  q: Record<HealthQuestion, string>;
  notes: string;
  clearance: string;
  disclaimer: string;
  submit: string;
  logout: string;
  error: string;
  required: string;
  // settings card
  cardTitle: string;
  cardText: string;
  exportBtn: string;
  exportDone: string;
  exportError: string;
  withdrawBtn: string;
  withdrawConfirm: string;
  deleteBtn: string;
  deleteTitle: string;
  deleteText: string;
  deleteType: string;
  deleteConfirm: string;
  deleteError: string;
  cancel: string;
  staffDelete: string;
  policies: string;
  // trainer view of a trainee
  declNone: string;
  declOk: string;
  declClearance: string;
  declAt: string;
}

export const CONSENT_COPY: Record<ConsentLang, ConsentCopy> = {
  he: {
    title: 'לפני שמתחילים',
    staffIntro: 'כדי להשתמש ב-ECshape יש לאשר את תנאי השימוש ומדיניות הפרטיות. כמאמן/ת תטפל/י במידע בריאותי של מתאמנים: השתמש/י בו רק לצורך הליווי, אל תשתף/י אותו, ושמור/י על הסיסמה. אם את/ה מלווה מתאמנים משלך, את/ה האחראי/ת למידע שלהם.',
    intro: 'כדי ללוות אותך אנחנו צריכים לשמור מידע בריאותי (משקל, מידות, תמונות התקדמות, תזונה, שינה ופציעות). זהו מידע רגיש במיוחד, ולכן אנחנו מבקשים את הסכמתך המפורשת. אפשר לחזור בך בכל עת בהגדרות.',
    terms: ['קראתי ואני מסכים/ה ל', 'תנאי השימוש', ' ול', 'מדיניות הפרטיות'],
    health: 'אני מסכים/ה במפורש שהמאמן שלי ו-ECshape יעבדו את המידע הבריאותי שאמסור (כולל תמונות התקדמות וצ׳אט) לצורך הליווי בלבד, כמפורט במדיניות הפרטיות, כולל אחסון אצל ספקי ענן ועיבוד בכלי בינה מלאכותית.',
    age: 'אני בן/בת 18 ומעלה, או שהורה/אפוטרופוס אישר את הליווי בכתב.',
    declTitle: 'הצהרת בריאות',
    declIntro: 'ענו בכנות. התשובות נשמרות ומוצגות למאמן שלכם בלבד.',
    yes: 'כן', no: 'לא',
    q: {
      heart: 'האם רופא אמר לך פעם שיש לך בעיית לב או לחץ דם גבוה?',
      chest: 'האם את/ה חש/ה כאב בחזה במנוחה, בפעילות יומיומית או במאמץ?',
      dizzy: 'האם איבדת שיווי משקל בגלל סחרחורת, או איבדת הכרה, ב-12 החודשים האחרונים?',
      chronic: 'האם אובחנת במחלה כרונית אחרת (למשל סוכרת, אסתמה, מחלת כליות)?',
      meds: 'האם את/ה נוטל/ת כיום תרופות מרשם למחלה כרונית?',
      joints: 'האם יש לך בעיה בעצמות, במפרקים או ברקמות רכות (גב, ברך, ירך) שעלולה להחמיר בפעילות?',
      pregnant: 'האם את בהריון, או ילדת בחצי השנה האחרונה?',
      eating: 'האם יש לך, או הייתה לך, הפרעת אכילה?',
      supervised: 'האם רופא אמר לך לבצע פעילות גופנית רק תחת השגחה רפואית?',
    },
    notes: 'משהו נוסף שחשוב שהמאמן יידע? (לא חובה)',
    clearance: 'עניתם "כן" לפחות על שאלה אחת: לפני תחילת האימונים יש לקבל אישור בכתב מרופא. המאמן יראה זאת ויתאים את התוכנית.',
    disclaimer: 'ECshape אינה מספקת ייעוץ רפואי, אבחון או טיפול, ואינה תחליף לרופא או לדיאטנית קלינית. הפסיקו פעילות ופנו לרופא אם מופיעים כאב, סחרחורת או קוצר נשימה.',
    submit: 'אישור והמשך', logout: 'יציאה', error: 'השמירה נכשלה. נסו שוב.', required: 'יש לסמן את כל האישורים ולענות על כל השאלות.',
    cardTitle: 'פרטיות והמידע שלי',
    cardText: 'אפשר להוריד עותק של כל המידע שנשמר עליך, לחזור בך מההסכמה לעיבוד מידע בריאותי או למחוק את החשבון.',
    exportBtn: 'הורדת המידע שלי (ZIP)', exportDone: 'הקובץ ירד למכשיר.', exportError: 'ההורדה נכשלה. נסו שוב.',
    withdrawBtn: 'ביטול ההסכמה למידע בריאותי',
    withdrawConfirm: 'בלי הסכמה זו לא נוכל להמשיך בליווי, והאפליקציה תבקש ממך לאשר מחדש או למחוק את החשבון. להמשיך?',
    deleteBtn: 'מחיקת החשבון',
    deleteTitle: 'מחיקת החשבון לצמיתות',
    deleteText: 'כל המידע שלך יימחק: פרופיל, מדידות, תמונות התקדמות, ארוחות, אימונים, צ׳ק-אין, הודעות צ׳אט וקבצים. לא ניתן לשחזר. מומלץ להוריד קודם את המידע.',
    deleteType: 'כדי לאשר, הקלידו DELETE',
    deleteConfirm: 'מחיקה לצמיתות', deleteError: 'המחיקה נכשלה. נסו שוב או פנו אלינו.', cancel: 'ביטול',
    staffDelete: 'למחיקת חשבון מאמן יש לפנות אלינו: החשבון כולל מידע של מתאמנים.',
    policies: 'מדיניות הפרטיות ותנאי השימוש',
    declNone: 'טרם מולאה הצהרת בריאות', declOk: 'הצהרת בריאות: תקינה', declClearance: 'הצהרת בריאות: נדרש אישור רופא', declAt: 'מולאה ב-',
  },
  en: {
    title: 'Before you start',
    staffIntro: 'To use ECshape, please accept the terms and the privacy policy. As a coach you handle clients’ health information: use it only for their coaching, do not share it, and keep your password safe. If you coach your own clients, you are responsible for their data.',
    intro: 'To coach you we need to store health information (weight, measurements, progress photos, food, sleep and injuries). This is especially sensitive information, so we ask for your explicit consent. You can withdraw it at any time in Settings.',
    terms: ['I have read and agree to the ', 'Terms of use', ' and the ', 'Privacy policy'],
    health: 'I explicitly consent to my coach and ECshape processing the health information I provide (including progress photos and chat) only for my coaching, as described in the privacy policy, including storage with cloud providers and processing by AI tools.',
    age: 'I am 18 or older, or a parent/guardian has approved the coaching in writing.',
    declTitle: 'Health declaration',
    declIntro: 'Please answer honestly. Your answers are stored and shown only to your coach.',
    yes: 'Yes', no: 'No',
    q: {
      heart: 'Has a doctor ever told you that you have a heart condition or high blood pressure?',
      chest: 'Do you feel chest pain at rest, during daily activities or when exercising?',
      dizzy: 'In the last 12 months, have you lost your balance because of dizziness, or lost consciousness?',
      chronic: 'Have you been diagnosed with another chronic condition (e.g. diabetes, asthma, kidney disease)?',
      meds: 'Do you currently take prescription medicine for a chronic condition?',
      joints: 'Do you have a bone, joint or soft-tissue problem (back, knee, hip) that activity could make worse?',
      pregnant: 'Are you pregnant, or have you given birth in the last six months?',
      eating: 'Do you have, or have you had, an eating disorder?',
      supervised: 'Has a doctor told you to exercise only under medical supervision?',
    },
    notes: 'Anything else your coach should know? (optional)',
    clearance: 'You answered "yes" to at least one question: get written approval from a doctor before you start training. Your coach will see this and adapt the plan.',
    disclaimer: 'ECshape does not provide medical advice, diagnosis or treatment and does not replace a doctor or clinical dietitian. Stop and see a doctor if you feel pain, dizziness or shortness of breath.',
    submit: 'Agree and continue', logout: 'Log out', error: 'Saving failed. Please try again.', required: 'Please tick every box and answer every question.',
    cardTitle: 'Privacy & my data',
    cardText: 'Download a copy of everything stored about you, withdraw your consent to health-data processing, or delete your account.',
    exportBtn: 'Download my data (ZIP)', exportDone: 'The file was downloaded.', exportError: 'The download failed. Please try again.',
    withdrawBtn: 'Withdraw health-data consent',
    withdrawConfirm: 'Without this consent we cannot keep coaching you, and the app will ask you to agree again or delete your account. Continue?',
    deleteBtn: 'Delete my account',
    deleteTitle: 'Delete your account permanently',
    deleteText: 'All your data will be deleted: profile, measurements, progress photos, meals, workouts, check-ins, chat messages and files. This cannot be undone. Download your data first if you want a copy.',
    deleteType: 'To confirm, type DELETE',
    deleteConfirm: 'Delete permanently', deleteError: 'Deletion failed. Try again or contact us.', cancel: 'Cancel',
    staffDelete: 'To delete a coach account, contact us: it holds other people’s data.',
    policies: 'Privacy policy and terms',
    declNone: 'No health declaration yet', declOk: 'Health declaration: all clear', declClearance: 'Health declaration: doctor’s approval needed', declAt: 'Filled in on ',
  },
  fr: {
    title: 'Avant de commencer',
    staffIntro: 'Pour utiliser ECshape, acceptez les conditions et la politique de confidentialité. En tant que coach, vous traitez des données de santé d’élèves : utilisez-les uniquement pour leur accompagnement, ne les partagez pas et protégez votre mot de passe. Si vous suivez vos propres élèves, vous êtes responsable de leurs données.',
    intro: 'Pour vous accompagner, nous devons conserver des données de santé (poids, mensurations, photos de progression, alimentation, sommeil, blessures). Ce sont des données particulièrement sensibles : nous vous demandons donc votre consentement explicite. Vous pouvez le retirer à tout moment dans les réglages.',
    terms: ['J’ai lu et j’accepte les ', 'Conditions d’utilisation', ' et la ', 'Politique de confidentialité'],
    health: 'Je consens explicitement à ce que mon coach et ECshape traitent les données de santé que je fournis (y compris photos de progression et chat) uniquement pour mon accompagnement, comme décrit dans la politique de confidentialité, y compris leur hébergement chez des prestataires cloud et leur traitement par des outils d’IA.',
    age: 'J’ai 18 ans ou plus, ou un parent/tuteur a approuvé l’accompagnement par écrit.',
    declTitle: 'Déclaration de santé',
    declIntro: 'Répondez honnêtement. Vos réponses sont conservées et visibles uniquement par votre coach.',
    yes: 'Oui', no: 'Non',
    q: {
      heart: 'Un médecin vous a-t-il déjà dit que vous aviez un problème cardiaque ou de l’hypertension ?',
      chest: 'Ressentez-vous une douleur thoracique au repos, au quotidien ou à l’effort ?',
      dizzy: 'Au cours des 12 derniers mois, avez-vous perdu l’équilibre à cause de vertiges, ou perdu connaissance ?',
      chronic: 'Avez-vous reçu le diagnostic d’une autre maladie chronique (diabète, asthme, maladie rénale…) ?',
      meds: 'Prenez-vous actuellement des médicaments sur ordonnance pour une maladie chronique ?',
      joints: 'Avez-vous un problème osseux, articulaire ou des tissus mous (dos, genou, hanche) que l’activité pourrait aggraver ?',
      pregnant: 'Êtes-vous enceinte, ou avez-vous accouché au cours des six derniers mois ?',
      eating: 'Avez-vous, ou avez-vous eu, un trouble du comportement alimentaire ?',
      supervised: 'Un médecin vous a-t-il dit de ne faire de l’exercice que sous surveillance médicale ?',
    },
    notes: 'Autre chose que votre coach devrait savoir ? (facultatif)',
    clearance: 'Vous avez répondu « oui » à au moins une question : obtenez l’accord écrit d’un médecin avant de commencer. Votre coach le verra et adaptera le programme.',
    disclaimer: 'ECshape ne fournit ni avis médical, ni diagnostic, ni traitement et ne remplace pas un médecin ou un diététicien. Arrêtez et consultez un médecin en cas de douleur, vertige ou essoufflement.',
    submit: 'Accepter et continuer', logout: 'Se déconnecter', error: 'L’enregistrement a échoué. Réessayez.', required: 'Cochez toutes les cases et répondez à toutes les questions.',
    cardTitle: 'Confidentialité et mes données',
    cardText: 'Téléchargez une copie de toutes vos données, retirez votre consentement au traitement des données de santé ou supprimez votre compte.',
    exportBtn: 'Télécharger mes données (ZIP)', exportDone: 'Le fichier a été téléchargé.', exportError: 'Le téléchargement a échoué. Réessayez.',
    withdrawBtn: 'Retirer le consentement (données de santé)',
    withdrawConfirm: 'Sans ce consentement, nous ne pouvons plus vous accompagner ; l’application vous demandera de l’accepter à nouveau ou de supprimer votre compte. Continuer ?',
    deleteBtn: 'Supprimer mon compte',
    deleteTitle: 'Supprimer définitivement votre compte',
    deleteText: 'Toutes vos données seront supprimées : profil, mensurations, photos, repas, séances, check-ins, messages et fichiers. Action irréversible. Téléchargez vos données d’abord si vous voulez une copie.',
    deleteType: 'Pour confirmer, tapez DELETE',
    deleteConfirm: 'Supprimer définitivement', deleteError: 'La suppression a échoué. Réessayez ou contactez-nous.', cancel: 'Annuler',
    staffDelete: 'Pour supprimer un compte coach, contactez-nous : il contient les données d’autres personnes.',
    policies: 'Politique de confidentialité et conditions',
    declNone: 'Pas encore de déclaration de santé', declOk: 'Déclaration de santé : RAS', declClearance: 'Déclaration de santé : accord médical requis', declAt: 'Remplie le ',
  },
};

export const consentCopy = (lang: string): ConsentCopy => {
  const l = (lang || 'he').slice(0, 2);
  return CONSENT_COPY[(l === 'he' || l === 'fr' ? l : 'en') as ConsentLang];
};
