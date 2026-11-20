/**
 * Legal audit 2026-11: notices the public site always shows, whatever the trainer edits in Studio → My site
 * (Studio overrides the marketing texts, never these). DRAFT — requires review by an Israeli lawyer.
 * - form: completes the Studio-editable purpose line with the s.11 items (no legal duty to give the data) + policy link.
 * - resultsNote: before/after photos are real, consented, and not typical / not a promise (Consumer Protection Law s.2).
 * - businessLine: business identification in the footer (name, number, address). Placeholders until filled in.
 */
type L = 'he' | 'en' | 'fr' | 'ru' | 'ar';

const N: Record<L, { form: string; policy: string; results: string; business: string; cookiePolicy: string }> = {
  he: {
    form: 'אין חובה חוקית למסור אותם, ואין צורך לכתוב כאן מידע רפואי.',
    policy: 'מדיניות הפרטיות',
    results: 'מתאמנים אמיתיים, בהסכמתם. התוצאות משתנות מאדם לאדם ואינן מובטחות.',
    business: '[להשלמה: שם העסק] · [להשלמה: ע.מ / ח.פ] · [להשלמה: כתובת]',
    cookiePolicy: 'פרטים במדיניות הפרטיות',
  },
  en: {
    form: 'There is no legal obligation to give them, and please don’t write medical information here.',
    policy: 'Privacy policy',
    results: 'Real clients, shown with their consent. Results vary from person to person and are not guaranteed.',
    business: '[TO FILL IN: business name] · [TO FILL IN: dealer / company no.] · [TO FILL IN: address]',
    cookiePolicy: 'Details in the privacy policy',
  },
  fr: {
    form: 'Aucune obligation légale de les donner, et n’écris pas d’informations médicales ici.',
    policy: 'Politique de confidentialité',
    results: 'De vrais élèves, avec leur accord. Les résultats varient d’une personne à l’autre et ne sont pas garantis.',
    business: '[À COMPLÉTER : nom commercial] · [À COMPLÉTER : n° d’entreprise] · [À COMPLÉTER : adresse]',
    cookiePolicy: 'Détails dans la politique de confidentialité',
  },
  ru: {
    form: 'Закон не обязывает их указывать; пожалуйста, не пишите здесь медицинскую информацию.',
    policy: 'Политика конфиденциальности',
    results: 'Реальные клиенты, с их согласия. Результаты у всех разные и не гарантированы.',
    business: '[TO FILL IN: business name] · [TO FILL IN: dealer / company no.] · [TO FILL IN: address]',
    cookiePolicy: 'Подробнее в политике конфиденциальности',
  },
  ar: {
    form: 'لا يوجد التزام قانوني بتقديمها، ويرجى عدم كتابة معلومات طبية هنا.',
    policy: 'سياسة الخصوصية',
    results: 'متدربون حقيقيون، بموافقتهم. تختلف النتائج من شخص لآخر وليست مضمونة.',
    business: '[TO FILL IN: business name] · [TO FILL IN: dealer / company no.] · [TO FILL IN: address]',
    cookiePolicy: 'التفاصيل في سياسة الخصوصية',
  },
};

export const siteNotices = (lang: string) => N[((lang || 'he').slice(0, 2) as L)] ?? N.en;
