/* Tamil labels for the EN / தமிழ் toggle: headings, navigation, buttons and short labels.
   Body paragraphs, review quotes, the address and all facts stay in English.

   TO REVIEW: this Tamil was written carefully but not by a native speaker.
   Please have a native Tamil speaker check every line before relying on it.

   Each entry is [CSS selector, Tamil text]. The toggle swaps the first text in
   the matched element, so icons and screen-reader extras stay in place. */
window.BN_I18N = {
  ta: [
    /* navigation and header */
    ['.hd-nav a[href="#collections"]', 'தொகுப்புகள்'],
    ['.hd-nav a[href="#experience"]', 'அனுபவம்'],
    ['.hd-nav a[href="#reviews"]', 'மதிப்புரைகள்'],

    /* hero */
    ['.hero-kicker .ups', 'அழகுசாதனக் கடை · அண்ணா நகர்'],
    ['#heroHeading .curtain:nth-child(1) > span', 'அழகு,'],
    ['#heroHeading .curtain:nth-child(2) em', 'ஊட்டமுடன்.'],
    ['.hero-cta .btn-solid', 'தொகுப்புகளைப் பாருங்கள்'],
    ['.hero-cta .btn-ghost', 'வழி அறிய'],
    ['#heroBadge > span:last-child', '1,716 Google மதிப்புரைகள்'],
    ['#heroBadge .badge-extra', 'தரைத் தளம், VR சென்னை'],
    ['.stage-chip[data-product="perfume"]', 'தனிநபர் பராமரிப்பு'],
    ['.stage-chip[data-product="serum"]', 'சருமப் பராமரிப்பு'],
    ['.stage-chip[data-product="lipstick"]', 'ஒப்பனை'],
    ['.stage-chip[data-product="compact"]', 'ஒப்பனை'],
    ['.stage-chip[data-product="nail-polish"]', 'ஒப்பனை'],
    ['.stage-chip[data-product="cream-jar"]', 'சருமப் பராமரிப்பு'],


    /* collections */
    ['#collections .sec-head .ups', 'தொகுப்புகள்'],
    ['#collections .sec-head h2', 'ஆறு அலமாரிகள், ஒரே கவுண்டர்.'],
    ['.col-cta[data-wa-ask="Makeup"]', 'ஒப்பனை பற்றி கேளுங்கள்'],
    ['.col-cta[data-wa-ask="Skincare"]', 'சருமப் பராமரிப்பு பற்றி கேளுங்கள்'],
    ['.col-cta[data-wa-ask="Haircare"]', 'கூந்தல் பராமரிப்பு பற்றி கேளுங்கள்'],
    ['.col-cta[data-wa-ask="Men\'s Grooming"]', 'ஆண்கள் பராமரிப்பு பற்றி கேளுங்கள்'],
    ['.col-cta[data-wa-ask="Personal Care"]', 'தனிநபர் பராமரிப்பு பற்றி கேளுங்கள்'],
    ['.col-cta[data-wa-ask="Gifting"]', 'பரிசுகள் பற்றி கேளுங்கள்'],

    /* shelf guide */
    ['#shelf-guide .sec-head .ups', 'உங்கள் அலமாரி'],
    ['#shelf-guide .sec-head h2', 'எங்கே தொடங்குவது? மூன்று கேள்விகள்.'],
    ['[data-i18n="guide.q1"]', 'நீங்கள் எதைத் தேடுகிறீர்கள்?'],
    ['[data-i18n="guide.q2"]', 'யாருக்காக?'],
    ['[data-i18n="guide.q3"]', 'எவ்வளவு வழிகாட்டல் வேண்டும்?'],
    ['[data-i18n="guide.back"]', 'பின்செல்'],
    ['[data-i18n="guide.again"]', 'மீண்டும் தொடங்கு'],
    ['[data-i18n="guide.send"]', 'என் பதில்களை WhatsApp-இல் அனுப்பு'],
    ['[data-i18n="guide.start"]', 'இங்கிருந்து தொடங்குங்கள்'],

    /* experience */
    ['#experience .sec-head .ups', 'கவுண்டரில்'],
    ['#experience .sec-head h2', 'ஆன்லைன் ஆர்டரில் கிடைக்காதது இதுதான்.'],

    /* men's */
    ['#mens .ups', 'ஆண்களுக்கு'],
    ['#mens h2', 'ஆண்கள் பராமரிப்புக்குத் தனி அலமாரி.'],
    ['#mens .btn-ghost', 'பராமரிப்பு பற்றி கேளுங்கள்'],

    /* reviews */
    ['#reviews .sec-head .ups', 'மதிப்புரைகள்'],
    ['#reviews .sec-head h2', 'மக்கள் தொடர்ந்து சொல்வது.'],
    ['.rev-link', 'Google-இல் 1,716 மதிப்புரைகளையும் படியுங்கள்'],

    /* enquire */
    ['#enquire .sec-head .ups', 'நேரடித் தொடர்பு'],
    ['#enquire .sec-head h2', 'படிவ வரிசை வேண்டாம், கடையுடன் நேரடியாகப் பேசுங்கள்.'],
    ['#waSend', 'WhatsApp-இல் அனுப்பு'],
    ['#waCopy', 'செய்தியை நகலெடு'],

    /* visit */
    ['#visit .sec-head .ups', 'வருகை'],
    ['#visit .sec-head h2', 'தரைத் தளம், ஏட்ரியத்தைக் கடந்து.'],
    ['[data-i18n="visit.address"]', 'முகவரி'],
    ['[data-i18n="visit.hours"]', 'நேரம்'],
    ['[data-i18n="visit.save"]', 'எங்கள் தொடர்பைச் சேமிக்கவும்'],
    ['[data-i18n="visit.saveLabel"]', 'தொடர்பு அட்டை'],
    ['[data-i18n="map.load"]', 'வரைபடத்தை இங்கே காட்டு'],

    /* quick bar */
    ['.mbar a:nth-child(1)', 'அழை'],
    ['.mbar a:nth-child(3)', 'வழி'],
    ['.dots .dot[href="#top"] .dot-label', 'மேலே']
  ],

  /* strings built by script (open-now chip, guide answers, lightbox) */
  strings: {
    en: {
      openNow: 'Open now, closes 10 PM', closedNow: 'Closed now', closes: 'Closes 10 PM',
      step: 'Question {n} of 3', suggest: 'Start at the {shelf} shelf',
      'photo': 'Photo {n} of {total}', close: 'Close photo', prev: 'Previous photo', next: 'Next photo',
      guidePoint: 'Head straight to the {shelf} shelf when you arrive.',
      guideQuick: 'Send your answers and ask the counter for a quick suggestion.',
      guideWalk: 'Ask at the counter for a personal consultation.',
      guideGift: 'Buying for someone else? The Gifting shelf is worth a look too.'
    },
    ta: {
      openNow: 'இப்போது திறந்துள்ளது, இரவு 10 மணிக்கு மூடப்படும்', closedNow: 'இப்போது மூடப்பட்டுள்ளது', closes: 'இரவு 10 மணிக்கு மூடப்படும்',
      step: 'கேள்வி {n} / 3', suggest: '{shelf} அலமாரியில் தொடங்குங்கள்',
      'photo': 'படம் {n} / {total}', close: 'படத்தை மூடு', prev: 'முந்தைய படம்', next: 'அடுத்த படம்',
      guidePoint: 'வந்தவுடன் நேராக {shelf} அலமாரிக்குச் செல்லுங்கள்.',
      guideQuick: 'உங்கள் பதில்களை அனுப்பி, கவுண்டரிடம் ஒரு சிறு பரிந்துரை கேளுங்கள்.',
      guideWalk: 'கவுண்டரில் தனிப்பட்ட ஆலோசனை கேளுங்கள்.',
      guideGift: 'வேறொருவருக்கு வாங்குகிறீர்களா? பரிசுகள் அலமாரியையும் பாருங்கள்.'
    }
  },

  /* shelf names and guide answers, English first */
  shelves: {
    'Makeup': 'ஒப்பனை', 'Skincare': 'சருமப் பராமரிப்பு', 'Haircare': 'கூந்தல் பராமரிப்பு',
    "Men's Grooming": 'ஆண்கள் பராமரிப்பு', 'Personal Care': 'தனிநபர் பராமரிப்பு', 'Gifting': 'பரிசுகள்'
  },
  answers: {
    'Colour for face, eyes or lips': 'முகம், கண், உதடுக்கான நிறங்கள்',
    'A skin routine': 'சருமப் பராமரிப்பு முறை',
    'Something for hair': 'கூந்தலுக்கு ஏதாவது',
    'Shaving and grooming': 'ஷேவிங் மற்றும் பராமரிப்பு',
    'Everyday essentials': 'அன்றாடத் தேவைகள்',
    'A present for someone': 'ஒருவருக்குப் பரிசு',
    'Me': 'எனக்கு', 'Someone else': 'வேறொருவருக்கு', 'Him': 'அவருக்கு (ஆண்)', 'Not sure yet': 'இன்னும் முடிவில்லை',
    'Just point me to the shelf': 'அலமாரியைக் காட்டினால் போதும்',
    'A quick suggestion': 'ஒரு சிறு பரிந்துரை',
    'Walk me through it at the counter': 'கவுண்டரில் விளக்கமாகச் சொல்லுங்கள்'
  }
};
