/**
 * DeepSeek orca companion — a small, draggable orca for the DSH window.
 *
 * Client-only plugin. It observes the public Session Controller surface
 * (`ctx.sessions`, `ctx.uiSession`, `ctx.connection`) and renders into the
 * `shell.overlay` slot. It reads session status and turn boundaries only —
 * never message text, tools, files or attachments.
 *
 * Safety rules this file follows, learned the hard way:
 *  - the overlay host is a 0x0 fixed element, so even a broken stylesheet
 *    cannot cover the window or swallow clicks;
 *  - retaining a session can synchronously publish a new session list, so the
 *    feed never retains inside a publish (re-entrancy guard + marker first);
 *  - every effect is wrapped, and a React error boundary protects the app.
 */

(() => {
  'use strict';

  /* ---------------------------------------------------------------- art -- */

  /**
   * Species profiles. Each one shares the 160x124 canvas, the face anchors and
   * the prop positions, so a state drawing is the same code for all three.
   * The rim colour keeps a dark animal readable on a dark app background.
   */
  const SPECIES = Object.freeze({
    orca: Object.freeze({
      labelKey: 'species.orca',
      eyeStyle: 'patch',
      eye: { x: 48, y: 55 },
      mouth: { x: 26, y: 76 },
      colors: {
        body: '#0F141A', bodyLight: '#1A2129', rim: '#5F7085',
        white: '#E7EDF4', whiteShade: '#C4D0DD', eye: '#06090D',
        spark: '#C2A469', alert: '#3F5BD1', sweat: '#84A9C4',
        screen: '#090D12', screenGlow: '#7E9CC9', prop: '#E7EDF4', propRim: '#5F7085',
      },
      body: 'M16 76 C16 52 38 36 64 36 C90 36 108 48 116 64 C122 76 118 88 104 95 C84 105 46 104 30 94 C20 88 16 82 16 76 Z',
      snout: '',
      snoutLine: '',
      tail: 'M110 70 L140 34 Q147 40 138 58 L128 68 L140 84 Q147 99 136 101 L110 74 Z',
      dorsal: 'M72 40 L85 12 Q97 15 88 38 Z',
      fin: 'M56 92 C44 94 34 102 38 111 C50 114 62 102 66 95 Z',
      belly: 'M28 82 C42 96 80 98 102 84 C108 92 90 102 66 102 C46 102 30 94 28 82 Z',
      details: '',
    }),
    dolphin: Object.freeze({
      labelKey: 'species.dolphin',
      eyeStyle: 'sclera',
      eye: { x: 46, y: 58 },
      mouth: { x: 17, y: 87 },
      colors: {
        body: '#4A5D72', bodyLight: '#5A6E85', rim: '#8195A9',
        white: '#E8EEF4', whiteShade: '#C6D3DF', eye: '#070B10',
        spark: '#C2A469', alert: '#3F5BD1', sweat: '#84A9C4',
        screen: '#090D12', screenGlow: '#93B0D6', prop: '#E8EEF4', propRim: '#8195A9',
      },
      body: 'M6 86 C6 62 30 42 62 42 C90 42 108 52 116 66 C122 78 118 88 104 94 C84 103 44 102 24 94 C12 90 6 89 6 86 Z',
      snout: '',
      snoutLine: '<path d="M10 88 C15 86 20 85 25 86" stroke="#F4F9FF" stroke-width="2" stroke-linecap="round" fill="none"/>',
      tail: 'M112 72 L138 44 Q146 50 136 66 L128 74 L138 88 Q145 100 134 102 L112 78 Z',
      dorsal: 'M72 46 C82 26 98 18 104 26 C106 34 94 44 86 48 Z',
      fin: 'M58 94 C48 96 39 103 43 111 C53 113 63 103 66 97 Z',
      belly: 'M26 86 C40 98 80 100 102 88 C108 94 90 103 66 103 C46 103 28 98 26 86 Z',
      details: '<path d="M52 60 C58 55 66 53 72 55" stroke="#3E5A78" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".55"/>',
    }),
    humpback: Object.freeze({
      labelKey: 'species.humpback',
      eyeStyle: 'sclera',
      eye: { x: 44, y: 60 },
      mouth: { x: 26, y: 86 },
      colors: {
        body: '#28323B', bodyLight: '#333F49', rim: '#6E8090',
        white: '#E8EEF4', whiteShade: '#C6D3DF', eye: '#070B10',
        spark: '#C2A469', alert: '#3F5BD1', sweat: '#84A9C4',
        screen: '#090D12', screenGlow: '#93B0D6', prop: '#E8EEF4', propRim: '#6E8090',
      },
      body: 'M14 78 C14 54 36 38 64 38 C92 38 110 50 118 66 C124 78 120 90 106 96 C86 106 44 105 28 95 C19 90 14 84 14 78 Z',
      snout: '',
      snoutLine: '',
      tail: 'M110 72 L146 44 Q152 54 138 70 L128 76 L140 94 Q146 108 133 108 L110 78 Z',
      dorsal: 'M96 56 C102 48 112 46 114 52 C115 58 106 62 100 62 Z',
      fin: 'M52 92 C70 106 98 114 110 100 C104 120 68 120 46 102 Z',
      belly: 'M28 84 C42 98 82 100 102 86 C108 94 90 103 66 103 C46 103 30 96 28 84 Z',
      details: `<g stroke="#C8DCEA" stroke-width="1.8" stroke-linecap="round" opacity=".5">
        <path d="M40 93 C52 97 68 98 84 93"/>
        <path d="M46 97 C56 100 68 101 80 97"/>
      </g>
      <g fill="${'#3B4B5B'}" stroke="#B7CFE2" stroke-width="1.4" opacity=".9">
        <circle cx="46" cy="41" r="2.2"/><circle cx="56" cy="39" r="2"/><circle cx="66" cy="40" r="2.2"/>
      </g>`,
    }),
  });

  const SPECIES_KEYS = Object.freeze(Object.keys(SPECIES));

  /** Mouth shapes in local coordinates; each species supplies the anchor. */
  const MOUTHS = Object.freeze({
    smile: (c) => `<path d="M-5 0 q5 4 10 0" stroke="${c.white}" stroke-width="1.9" stroke-linecap="round" fill="none"/>`,
    grin: (c) => `<path d="M-6 -1 q6 8 12 1 q-6 2 -12 -1 z" fill="${c.white}"/>`,
    flat: (c) => `<path d="M-5 1 q5 -2 10 0" stroke="${c.white}" stroke-width="1.9" stroke-linecap="round" fill="none"/>`,
    frown: (c) => `<path d="M-5 2 q5 -4 10 0" stroke="${c.white}" stroke-width="1.9" stroke-linecap="round" fill="none"/>`,
    o: (c) => `<ellipse cx="0" cy="1" rx="2.7" ry="3.2" fill="${c.white}"/>`,
    sleepy: (c) => `<path d="M-4 1 q4 3 8 0" stroke="${c.white}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`,
  });

  /**
   * Eyes for one species and expression. The calm, small eye is what gives the
   * characters their adult look; pupils live in `.orca-pupil`, which the view
   * translates towards the pointer.
   */
  function eyeMarkup(species, eyes, c) {
    const { x, y } = species.eye;
    const patch = species.eyeStyle === 'patch'
      ? `<ellipse cx="${x}" cy="${y}" rx="14.5" ry="7.8" fill="${c.white}" transform="rotate(-9 ${x} ${y})"/>`
      : '';
    const disc = species.eyeStyle === 'patch'
      ? ''
      : `<circle cx="${x}" cy="${y}" r="5.4" fill="${c.eye}" stroke="${c.white}" stroke-width="1.1"/>`;
    const line = species.eyeStyle === 'patch' ? c.eye : c.white;

    if (eyes === 'open' || eyes === 'focus') {
      const dy = eyes === 'focus' ? 1.1 : 0;
      const pupil = species.eyeStyle === 'patch'
        ? `<circle cx="${x - 3.2}" cy="${y + 1.4 + dy}" r="3.4" fill="${c.eye}"/>
           <circle cx="${x - 2.4}" cy="${y + 0.4 + dy}" r="0.8" fill="${c.white}"/>`
        : `<circle cx="${x - 0.3}" cy="${y + 1 + dy}" r="2.1" fill="${c.white}" opacity=".85"/>`;
      return `${patch}${disc}<g class="orca-eyes orca-eyes--open"><g class="orca-pupil">${pupil}</g></g>`;
    }
    if (eyes === 'happy') {
      return `${patch}<path d="M${x - 6} ${y + 2} q6 -7 12 0"
        stroke="${line}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
    }
    if (eyes === 'closed') {
      return `${patch}<path d="M${x - 6} ${y - 1} q6 6 12 0"
        stroke="${line}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
    }
    return `${patch}<path d="M${x - 5} ${y - 4} L${x + 5} ${y + 5} M${x + 5} ${y - 4} L${x - 5} ${y + 5}"
      stroke="${line}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  }

  /**
   * One drawing for a species in a given state.
   * @param {string} speciesKey - orca, dolphin or humpback.
   * @param {object} face - expression switches and props for one state.
   * @returns {string} inert SVG markup.
   */
  function speciesArt(speciesKey, face) {
    const species = SPECIES[speciesKey] || SPECIES.orca;
    const c = species.colors;
    const eyes = face.eyes || 'open';
    const fin = face.fin || 'rest';
    const tilt = face.tilt || '';
    const rim = `stroke="${c.rim}" stroke-width="1.4" stroke-linejoin="round"`;
    const mouth = (MOUTHS[face.mouth || 'smile'] || MOUTHS.smile)(c);

    const props = [];
    if (face.bubbles) {
      props.push(`<g class="orca-bubbles" fill="none" stroke="${c.rim}" stroke-width="1.2" opacity=".5">
        <circle cx="27" cy="22" r="2.2"/><circle cx="19" cy="12" r="1.4"/>
      </g>`);
    }
    if (face.laptop) {
      props.push(`<g class="orca-laptop">
        <rect x="52" y="82" width="28" height="17" rx="2" fill="${c.screen}" stroke="${c.propRim}" stroke-width="1.4"/>
        <path d="M47 99 h38" stroke="${c.propRim}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M57 87 h12 M57 91 h8 M57 95 h14" stroke="${c.screenGlow}" stroke-width="1.6" stroke-linecap="round"/>
      </g>`);
    }
    if (face.sparkles) {
      props.push(`<g class="orca-sparkles" stroke="${c.spark}" stroke-width="1.8" stroke-linecap="round" fill="none">
        <path d="M18 14 v7 M14.5 17.5 h7"/>
        <path d="M114 8 v6 M111 11 h6"/>
        <path d="M130 74 v5 M127.5 76.5 h5"/>
        <circle cx="24" cy="34" r="0.9" fill="${c.spark}" stroke="none"/>
        <circle cx="122" cy="26" r="1.2" fill="${c.spark}" stroke="none"/>
      </g>`);
    }
    if (face.zzz) {
      props.push(`<g class="orca-zzz" fill="${c.rim}" font-family="Georgia, 'Times New Roman', serif" font-style="italic" opacity=".85">
        <text x="98" y="40" font-size="9">z</text>
        <text x="107" y="28" font-size="11">z</text>
        <text x="118" y="15" font-size="13">z</text>
      </g>`);
    }
    if (face.sweat) {
      props.push(`<path class="orca-sweat" d="M89 41 q4.5 6.5 0 9.5 q-4.5 -3 0 -9.5 z" fill="none" stroke="${c.sweat}" stroke-width="1.4"/>`);
    }
    if (face.patch) {
      props.push(`<g class="orca-patch" transform="rotate(-10 50 33)">
        <rect x="38" y="28" width="22" height="8" rx="4" fill="${c.whiteShade}" stroke="${c.rim}" stroke-width="1.1" opacity=".9"/>
        <path d="M44 32 h10" stroke="${c.rim}" stroke-width="1" opacity=".7"/>
      </g>`);
    }
    if (face.alert) {
      props.push(`<g class="orca-alert">
        <circle cx="66" cy="16" r="11" fill="${c.alert}" stroke="${c.white}" stroke-width="1.6"/>
        <path d="M66 10 v6" stroke="${c.white}" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="66" cy="21" r="1.5" fill="${c.white}"/>
      </g>`);
    }
    if (face.approval) {
      props.push(`<g class="orca-alert orca-alert--approval">
        <circle cx="66" cy="16" r="11" fill="${c.spark}" stroke="${c.white}" stroke-width="1.6"/>
        <path d="M61 16 l4 4 L71.5 12.5" stroke="${c.eye}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </g>`);
    }
    if (face.question) {
      props.push(`<g class="orca-alert orca-alert--question">
        <circle cx="66" cy="16" r="11" fill="${c.alert}" stroke="${c.white}" stroke-width="1.6"/>
        <path d="M62.5 13 q0 -3.6 3.5 -3.6 q3.6 0 3.6 3 q0 2.3 -3.6 3.2 v1.2" stroke="${c.white}" stroke-width="2" stroke-linecap="round" fill="none"/>
        <circle cx="66" cy="21" r="1.5" fill="${c.white}"/>
      </g>`);
    }

    const finMarkup = `<path class="orca-fin" d="${species.fin}" fill="${speciesKey === 'humpback' ? c.whiteShade : c.bodyLight}" ${rim} transform="${fin === 'up' ? 'rotate(-34 60 96)' : ''}"/>`;

    return `<svg class="orca-svg" viewBox="0 0 160 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g class="orca-sticker" ${tilt ? `transform="${tilt}"` : ''}>
        <path class="orca-tail" d="${species.tail}" fill="${c.bodyLight}" ${rim}/>
        <path class="orca-dorsal" d="${species.dorsal}" fill="${c.bodyLight}" ${rim}/>
        <path class="orca-body" d="${species.body}" fill="${c.body}" ${rim}/>
        ${species.snout ? `<path class="orca-snout" d="${species.snout}" fill="${c.body}" ${rim}/>` : ''}
        <path class="orca-belly" d="${species.belly}" fill="${c.white}"/>
        ${species.details || ''}
        ${species.snoutLine || ''}
        ${finMarkup}
        ${eyeMarkup(species, eyes, c)}
        <g transform="translate(${species.mouth.x} ${species.mouth.y})">${mouth}</g>
        ${props.join('')}
      </g>
    </svg>`;
  }

  /** Face switches for each state; `pending` adds the approval/question prop. */
  function faceFor(state, pendingKind) {
    const faces = {
      resting: { eyes: 'open', mouth: 'smile', fin: 'rest', bubbles: true },
      working: { eyes: 'focus', mouth: 'flat', fin: 'rest', laptop: true },
      waiting: pendingKind === 'approval'
        ? { eyes: 'open', mouth: 'o', fin: 'up', approval: true }
        : { eyes: 'open', mouth: 'o', fin: 'up', question: true },
      celebrate: { eyes: 'happy', mouth: 'grin', fin: 'up', sparkles: true, tilt: 'rotate(-5 70 76)' },
      sleeping: { eyes: 'closed', mouth: 'sleepy', fin: 'rest', zzz: true },
      error: { eyes: 'dizzy', mouth: 'frown', fin: 'rest', sweat: true, patch: true },
    };
    return faces[state] || faces.resting;
  }

  const ORCA_FACES = Object.freeze({
    resting: faceFor('resting'),
    working: faceFor('working'),
    waiting: faceFor('waiting', 'approval'),
    celebrate: faceFor('celebrate'),
    sleeping: faceFor('sleeping'),
    error: faceFor('error'),
  });

  /** species -> state -> markup, generated once. */
  const SPECIES_ART = Object.freeze(Object.fromEntries(SPECIES_KEYS.map(speciesKey => [
    speciesKey,
    Object.freeze(Object.fromEntries(
      ['resting', 'working', 'waiting', 'celebrate', 'sleeping', 'error']
        .map(state => [state, speciesArt(speciesKey, faceFor(state, 'approval'))]),
    )),
  ])));

  const ORCA_ART = SPECIES_ART.orca;

  /* ---------------------------------------------------------------- i18n -- */

  const MESSAGES = Object.freeze({
    en: Object.freeze({
      'pet.name': 'DeepSeek orca',
      'pet.aria': '{status} Click to say hello; right-click or press Enter for settings; arrow keys move me.',
      'panel.title': 'DeepSeek orca',
      'panel.subtitle': 'A little company while you work.',
      'panel.aria': 'Orca companion settings',
      'panel.close': 'Close settings',
      'setting.scope': 'Follow',
      'setting.scopeCurrent': 'Current session',
      'setting.scopeGlobal': 'All sessions',
      'setting.species': 'Look',
      'species.orca': 'Orca',
      'species.dolphin': 'Dolphin',
      'species.humpback': 'Humpback',
      'setting.sound': 'Completion sound',
      'setting.approvalSound': 'Approval signal',
      'setting.soundVolume': 'Sound volume',
      'setting.size': 'Size',
      'setting.motion': 'Gentle animations',
      'setting.sleep': 'Nap after',
      'setting.seconds30': '30 seconds',
      'setting.minutes2': '2 minutes',
      'setting.minutes5': '5 minutes',
      'action.greet': 'Say hello',
      'action.reset': 'Reset position',
      'action.hide': 'Tuck the orca away',
      'action.restore': 'Bring my orca back',
      'approval.title': 'Approval needed',
      'approval.allow': 'Allow once',
      'approval.reject': 'Reject',
      'approval.more': '+{count} more',
      'approval.tool': '{tool} asks for permission.',
      'approval.session': 'in {session}',
      'approval.dismiss': 'Hide this request',
      'approval.stale': 'This request is no longer pending.',
      'hint.firstRun': 'Right-click me for size, sound and look.',
      'state.resting': 'Just cruising. Ready when you are.',
      'state.unavailable': 'Still here. Waiting for the host.',
      'state.waiting': 'A little help?',
      'state.approval': 'Waiting for your approval.',
      'state.question': 'I have a question for you.',
      'state.sleeping': 'Just a little nap…',
      'state.working': 'On it…',
      'working.start': 'Orca on the job!',
      'working.find': 'Looking for a way…',
      'working.think': 'Let me think this through…',
      'working.progress': 'Making a little progress!',
      'working.settings': 'Right-click me for settings.',
      'state.celebrate': 'Done. Nicely done!',
      'celebrate.again': 'Another one finished. Yay!',
      'celebrate.applause': 'All wrapped up. Give yourself a hand!',
      'celebrate.done': 'Task complete. Well played!',
      'celebrate.team': 'We did it. Go us!',
      'state.error': 'That one hit a snag.',
      'error.try': 'It did not finish. Let’s take a look.',
      'error.check': 'Something went wrong. Worth a check.',
      'error.again': 'A little setback. We can try again.',
      'greeting.text': 'Right here with you.',
      'count.one': '1 session working.',
      'count.many': '{count} sessions working.',
    }),
    ru: Object.freeze({
      'pet.name': 'Косатка DeepSeek',
      'pet.aria': '{status} Нажмите, чтобы поздороваться; правый клик или Enter открывает настройки; стрелки двигают меня.',
      'panel.title': 'Косатка DeepSeek',
      'panel.subtitle': 'Немного компании, пока вы работаете.',
      'panel.aria': 'Настройки косатики-компаньона',
      'panel.close': 'Закрыть настройки',
      'setting.scope': 'Следить за',
      'setting.scopeCurrent': 'Текущей сессией',
      'setting.scopeGlobal': 'Всеми сессиями',
      'setting.species': 'Вид',
      'species.orca': 'Косатка',
      'species.dolphin': 'Дельфин',
      'species.humpback': 'Горбач',
      'setting.sound': 'Звук завершения',
      'setting.approvalSound': 'Сигнал подтверждения',
      'setting.soundVolume': 'Громкость звука',
      'setting.size': 'Размер',
      'setting.motion': 'Мягкие анимации',
      'setting.sleep': 'Засыпает через',
      'setting.seconds30': '30 секунд',
      'setting.minutes2': '2 минуты',
      'setting.minutes5': '5 минут',
      'action.greet': 'Поздороваться',
      'action.reset': 'Сбросить позицию',
      'action.hide': 'Убрать косатку',
      'action.restore': 'Вернуть мою косатку',
      'approval.title': 'Нужно подтверждение',
      'approval.allow': 'Разрешить',
      'approval.reject': 'Отклонить',
      'approval.more': 'ещё {count}',
      'approval.tool': 'Инструмент {tool} просит разрешение.',
      'approval.session': 'в сессии {session}',
      'approval.dismiss': 'Скрыть запрос',
      'approval.stale': 'Запрос уже неактуален.',
      'hint.firstRun': 'Правый клик по мне — размер, звук и вид.',
      'state.resting': 'Просто плаваю. Готова, когда вы готовы.',
      'state.unavailable': 'Я здесь. Жду подключения к хосту.',
      'state.waiting': 'Нужна ваша помощь?',
      'state.approval': 'Жду вашего подтверждения.',
      'state.question': 'У меня есть вопрос к вам.',
      'state.sleeping': 'Немного вздремну…',
      'state.working': 'Уже работаю…',
      'working.start': 'Косатка взялась за дело!',
      'working.find': 'Ищу решение…',
      'working.think': 'Думаю над задачей…',
      'working.progress': 'Продвигаюсь потихоньку!',
      'working.settings': 'Правый клик по мне — настройки.',
      'state.celebrate': 'Готово. Отличная работа!',
      'celebrate.again': 'Ещё одна задача закрыта. Ура!',
      'celebrate.applause': 'Всё сделано. Поаплодируем себе!',
      'celebrate.done': 'Задача выполнена. Хорошо сыграно!',
      'celebrate.team': 'Мы справились. Так держать!',
      'state.error': 'Что-то пошло не так.',
      'error.try': 'Не удалось завершить. Давайте посмотрим.',
      'error.check': 'Возникла ошибка. Стоит проверить.',
      'error.again': 'Небольшая загвоздка. Попробуем ещё раз.',
      'greeting.text': 'Я здесь, рядом.',
      'count.one': '1 сессия в работе.',
      'count.many': 'Сессий в работе: {count}.',
    }),
  });

  /** Only English and Russian ship; anything else falls back to English. */
  function normalizeLanguage(language) {
    const value = typeof language === 'string' ? language.trim().toLowerCase() : '';
    if (value === 'ru' || value.startsWith('ru-') || value.startsWith('ru_')) return 'ru';
    return 'en';
  }

  function translate(language, key, values) {
    const dictionary = MESSAGES[normalizeLanguage(language)];
    const message = dictionary[key] ?? MESSAGES.en[key] ?? key;
    if (!values) return message;
    return message.replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    ));
  }

  /* ---------------------------------------------------------- preferences -- */

  const STORAGE_KEY = 'dsh-plugin-deepseek-orca:v1';
  const SLEEP_CHOICES = Object.freeze([30000, 120000, 300000]);
  const MIN_SCALE = 0.7;
  const MAX_SCALE = 1.6;

  const DEFAULT_PREFERENCES = Object.freeze({
    species: 'orca',
    scale: 1,
    hidden: false,
    motion: true,
    sound: false,
    approvalSound: true,
    soundVolume: 0.4,
    scope: 'global',
    sleepAfterMs: 120000,
    rx: null,
    ry: null,
    seenHint: false,
  });

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function cleanPreferences(value) {
    const source = value && typeof value === 'object' ? value : {};
    const finite = (candidate) => typeof candidate === 'number' && Number.isFinite(candidate);
    return {
      species: SPECIES_KEYS.includes(source.species) ? source.species : DEFAULT_PREFERENCES.species,
      scale: finite(source.scale) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, source.scale)) : DEFAULT_PREFERENCES.scale,
      hidden: source.hidden === true,
      motion: source.motion !== false,
      sound: source.sound === true,
      approvalSound: source.approvalSound !== false,
      soundVolume: finite(source.soundVolume)
        ? Math.min(1, Math.max(0.05, source.soundVolume))
        : DEFAULT_PREFERENCES.soundVolume,
      scope: source.scope === 'current' ? 'current' : 'global',
      sleepAfterMs: SLEEP_CHOICES.includes(source.sleepAfterMs) ? source.sleepAfterMs : DEFAULT_PREFERENCES.sleepAfterMs,
      rx: finite(source.rx) ? clamp01(source.rx) : null,
      ry: finite(source.ry) ? clamp01(source.ry) : null,
      seenHint: source.seenHint === true,
    };
  }

  /** Keep the pet inside the viewport, below the window chrome band. */
  function clampPosition(x, y, width, height, viewportWidth, viewportHeight, top) {
    const margin = 12;
    const maxX = Math.max(margin, viewportWidth - width - margin);
    const maxY = Math.max(margin, viewportHeight - height - margin);
    return {
      x: Math.min(maxX, Math.max(margin, x)),
      y: Math.min(maxY, Math.max(Math.min(top, maxY), y)),
    };
  }

  /* ---------------------------------------------------------------- mood -- */

  const NOTICE_MS = 4600;
  const GREETING_MS = 2100;
  const WORKING_KEYS = Object.freeze([
    'state.working', 'working.start', 'working.find', 'working.think', 'working.progress',
  ]);
  const CELEBRATION_KEYS = Object.freeze([
    'state.celebrate', 'celebrate.again', 'celebrate.applause', 'celebrate.done', 'celebrate.team',
  ]);
  const ERROR_KEYS = Object.freeze(['state.error', 'error.try', 'error.check', 'error.again']);

  /** Pick an index that differs from `previous` when there is a choice. */
  function nextVariant(size, previous, random) {
    const count = Math.max(1, size - (previous >= 0 ? 1 : 0));
    const draw = Math.min(count - 1, Math.max(0, Math.floor(random() * count)));
    return previous >= 0 && draw >= previous ? draw + 1 : draw;
  }

  /**
   * Pure mood machine: time and randomness are injected, `update()` receives a
   * snapshot from WhaleFeed. No DOM, no I/O.
   */
  class OrcaMood {
    constructor(options) {
      const settings = options || {};
      this.now = typeof settings.now === 'function' ? settings.now : () => Date.now();
      this.random = typeof settings.random === 'function' ? settings.random : Math.random;
      this.sleepAfterMs = settings.sleepAfterMs || DEFAULT_PREFERENCES.sleepAfterMs;
      this.snapshot = { available: false, running: false, pending: false, workingCount: 0 };
      this.scopeKey = undefined;
      this.noticeId = undefined;
      this.noticeReason = undefined;
      this.noticeUntil = 0;
      this.idleSince = this.now();
      this.interactionUntil = 0;
      this.workingKey = undefined;
      this.workingIndex = -1;
      this.celebrateIndex = -1;
      this.errorIndex = -1;
    }

    update(snapshot, at) {
      const now = typeof at === 'number' ? at : this.now();
      const next = snapshot || { available: false };
      if (next.scopeKey !== this.scopeKey) {
        this.scopeKey = next.scopeKey;
        this.noticeId = next.notice ? next.notice.id : undefined;
        this.noticeReason = undefined;
        this.noticeUntil = 0;
        this.idleSince = now;
        this.interactionUntil = 0;
        this.workingKey = undefined;
        this.workingIndex = -1;
      }
      const wasBusy = this.snapshot.running === true || this.snapshot.pending === true;
      if (next.available === true && next.running === true && (!wasBusy || this.workingKey === undefined)) {
        this.workingIndex = nextVariant(WORKING_KEYS.length, this.workingIndex, this.random);
        this.workingKey = WORKING_KEYS[this.workingIndex];
      }
      if (next.notice && next.notice.id !== this.noticeId) {
        this.noticeId = next.notice.id;
        if (next.notice.reason === 'completed' || next.notice.reason === 'error') {
          this.noticeReason = next.notice.reason;
          this.noticeUntil = now + NOTICE_MS;
          if (next.notice.reason === 'error') {
            this.errorIndex = nextVariant(ERROR_KEYS.length, this.errorIndex, this.random);
          } else {
            this.celebrateIndex = nextVariant(CELEBRATION_KEYS.length, this.celebrateIndex, this.random);
          }
        }
      }
      if (next.running === true || next.pending === true) this.idleSince = now;
      if (next.available !== true) {
        this.noticeReason = undefined;
        this.noticeUntil = 0;
        this.idleSince = now;
      }
      this.snapshot = next;
      return this.view(now);
    }

    touch(at) {
      const now = typeof at === 'number' ? at : this.now();
      this.idleSince = now;
      this.interactionUntil = now + GREETING_MS;
      return this.view(now);
    }

    view(at) {
      const now = typeof at === 'number' ? at : this.now();
      const snapshot = this.snapshot;
      const noticeActive = snapshot.available === true
        && this.noticeReason !== undefined
        && now < this.noticeUntil;
      let state = 'resting';
      if (snapshot.available === true) {
        if (snapshot.pending === true) state = 'waiting';
        else if (noticeActive) state = this.noticeReason === 'error' ? 'error' : 'celebrate';
        else if (snapshot.running === true) state = 'working';
        else if (now - Math.max(this.idleSince, this.noticeUntil) >= this.sleepAfterMs) state = 'sleeping';
      }
      const noticeKey = noticeActive
        ? (this.noticeReason === 'error' ? ERROR_KEYS[this.errorIndex] : CELEBRATION_KEYS[this.celebrateIndex])
        : undefined;
      const greeting = now < this.interactionUntil;
      const pendingKind = state === 'waiting' ? snapshot.pendingKind : undefined;
      let messageKey;
      if (snapshot.available !== true) messageKey = 'state.unavailable';
      else if (noticeKey) messageKey = noticeKey;
      else if (greeting) messageKey = 'greeting.text';
      else if (state === 'waiting') {
        messageKey = pendingKind === 'approval'
          ? 'state.approval'
          : pendingKind === 'question' ? 'state.question' : 'state.waiting';
      } else if (state === 'working') messageKey = this.workingKey || 'state.working';
      else messageKey = `state.${state}`;
      const workingCount = state === 'working'
        ? Math.max(0, Math.floor(Number(snapshot.workingCount || 0)))
        : 0;
      return {
        state,
        noticeKey,
        noticeReason: noticeActive ? this.noticeReason : undefined,
        messageKey,
        greeting,
        pendingKind,
        workingCount,
        available: snapshot.available === true,
      };
    }
  }

  /* ---------------------------------------------------------------- feed -- */

  const RETAIN_SOURCE = 'deepseekOrca';
  const RETAIN_LIMIT = 4;
  const RELEASE_AFTER_MS = 20000;

  function maxSeqOf(entries) {
    let max = -1;
    for (const item of entries || []) {
      if (item && item.type === 'event' && item.event && Number.isFinite(item.event.seq)) {
        max = Math.max(max, item.event.seq);
      }
    }
    return max;
  }

  /**
   * Turns the public Session Controller surface into the snapshot the mood
   * needs. Turn boundaries come from the event window of a retained Session;
   * only `turn/start`, `turn/end` and the end reason are inspected.
   *
   * Retaining publishes a new session list synchronously, so a retain/release
   * never happens inside the store's own notification: `publish` is re-entrant
   * safe and store changes are coalesced into one microtask.
   */
  class OrcaFeed {
    constructor(ctx, options) {
      const settings = options || {};
      this.ctx = ctx;
      this.onSnapshot = typeof settings.onSnapshot === 'function' ? settings.onSnapshot : () => {};
      this.getPreferences = typeof settings.getPreferences === 'function'
        ? settings.getPreferences
        : () => DEFAULT_PREFERENCES;
      this.now = typeof settings.now === 'function' ? settings.now : () => Date.now();
      this.observers = new Map();
      this.retaining = new Set();
      this.subscriptions = [];
      this.notice = undefined;
      this.publishing = false;
      this.dirty = false;
      this.scheduled = false;
      this.disposed = false;
    }

    start() {
      const watch = (store) => {
        if (!store || typeof store.subscribe !== 'function') return () => {};
        try {
          const off = store.subscribe(() => this.schedule());
          return typeof off === 'function' ? off : () => {};
        } catch {
          return () => {};
        }
      };
      this.subscriptions.push(watch(this.store('sessions', 'list')));
      this.subscriptions.push(watch(this.store('uiSession', 'sessionStatus')));
      this.subscriptions.push(watch(this.store('connection', 'state')));
      this.publish();
      return this;
    }

    store(serviceKey, property) {
      try {
        const service = typeof this.ctx.get === 'function' ? this.ctx.get(serviceKey) : this.ctx[serviceKey];
        if (!service) return undefined;
        return property === undefined ? service : service[property];
      } catch {
        return undefined;
      }
    }

    catalog() {
      const list = this.store('sessions', 'list');
      try {
        return list?.getSnapshot?.() || { byId: {}, ids: [], phase: 'pending' };
      } catch {
        return { byId: {}, ids: [], phase: 'pending' };
      }
    }

    statuses() {
      const source = this.store('uiSession', 'sessionStatus');
      try {
        return source?.getSnapshot?.() || new Map();
      } catch {
        return new Map();
      }
    }

    connected() {
      const state = this.store('connection', 'state');
      try {
        return state?.getSnapshot?.() === 'connected';
      } catch {
        return false;
      }
    }

    currentSessionId() {
      const byId = this.catalog().byId || {};
      for (const [id, row] of Object.entries(byId)) {
        if ((row?.retainedBy?.mainView ?? 0) > 0) return id;
      }
      return undefined;
    }

    runningOf(id, row) {
      const status = this.statuses().get(id);
      if (typeof status?.running === 'boolean') return status.running;
      return row?.running === true;
    }

    /** Sessions this orca follows, in catalog order. */
    scopedSessions() {
      const catalog = this.catalog();
      const statuses = this.statuses();
      const preferences = this.getPreferences() || DEFAULT_PREFERENCES;
      const current = this.currentSessionId();
      const rows = [];
      for (const [id, row] of Object.entries(catalog.byId || {})) {
        if (!row || row.origin === 'subagent') continue;
        if (preferences.scope === 'current' && id !== current) continue;
        const status = statuses.get(id);
        rows.push({
          id,
          row,
          running: this.runningOf(id, row),
          pending: Boolean(status && status.pendingInteraction != null),
          pendingKind: status && status.pendingInteraction ? status.pendingInteraction.kind : undefined,
          current: id === current,
        });
      }
      return rows;
    }

    snapshot() {
      const rows = this.scopedSessions();
      const statuses = this.statuses();
      const catalog = this.catalog();
      const current = this.currentSessionId();
      let workingCount = 0;
      let waitingCount = 0;
      let running = false;
      let pendingKind;
      for (const row of rows) {
        if (row.pending) {
          waitingCount += 1;
          // Approval is the more urgent request when several sessions wait.
          if (row.pendingKind === 'approval') pendingKind = 'approval';
          else if (pendingKind === undefined && row.pendingKind !== undefined) pendingKind = row.pendingKind;
        }
        if (row.running) {
          running = true;
          if (!row.pending) workingCount += 1;
        }
      }
      // Approvals waiting in *other* sessions: the companion offers a decision
      // without the user switching conversations.
      const approvals = [];
      for (const [id, status] of statuses) {
        const pending = status && status.pendingInteraction;
        if (!pending || pending.kind !== 'approval' || pending.answerable === false) continue;
        if (id === current) continue;
        if (approvals.length >= 3) break;
        const title = catalog.byId && catalog.byId[id] ? catalog.byId[id].displayTitle : undefined;
        approvals.push({
          sessionId: id,
          key: pending.key,
          toolName: typeof pending.toolName === 'string' ? pending.toolName : '',
          reason: typeof pending.reason === 'string' ? pending.reason : undefined,
          displayReason: pending.displayReason,
          sessionTitle: typeof title === 'string' ? title : '',
          answer: (decision) => pending.answer(decision),
        });
      }
      if (this.notice && this.now() - this.notice.at > 10000) this.notice = undefined;
      const available = this.connected() && rows.length > 0;
      const preferences = this.getPreferences() || DEFAULT_PREFERENCES;
      const scopeKey = preferences.scope === 'current'
        ? `current:${this.currentSessionId() || ''}`
        : 'global:all';
      return {
        available,
        running,
        pending: waitingCount > 0,
        pendingKind,
        workingCount,
        waitingCount,
        approvals,
        notice: available ? this.notice : undefined,
        scopeKey,
      };
    }

    /** Coalesce store notifications into one publish on the next microtask. */
    schedule() {
      if (this.disposed || this.scheduled) return;
      this.scheduled = true;
      Promise.resolve().then(() => {
        this.scheduled = false;
        if (!this.disposed) this.publish();
      });
    }

    publish() {
      if (this.disposed) return;
      if (this.publishing) {
        this.dirty = true;
        return;
      }
      this.publishing = true;
      try {
        let guard = 0;
        do {
          this.dirty = false;
          this.syncObservers();
          this.onSnapshot(this.snapshot());
          guard += 1;
        } while (this.dirty && !this.disposed && guard < 4);
      } finally {
        this.publishing = false;
      }
    }

    syncObservers() {
      if (this.disposed) return;
      const now = this.now();
      const wanted = new Set();
      const running = this.scopedSessions().filter(row => row.running);
      for (const row of running) {
        wanted.add(row.id);
        const observer = this.observers.get(row.id);
        if (observer) {
          observer.keepAlive = now;
          observer.observed = true;
          continue;
        }
        if (this.retaining.has(row.id)) continue;
        if (this.observers.size >= RETAIN_LIMIT) continue;
        this.retain(row.id);
      }
      for (const [id, observer] of [...this.observers]) {
        if (wanted.has(id)) continue;
        if (now - observer.keepAlive < RELEASE_AFTER_MS) continue;
        this.release(id);
      }
    }

    retain(id) {
      this.retaining.add(id);
      let reference;
      try {
        const sessions = this.store('sessions');
        if (!sessions || typeof sessions.retain !== 'function') return;
        reference = sessions.retain(id, { source: RETAIN_SOURCE });
      } catch {
        return;
      } finally {
        this.retaining.delete(id);
      }
      if (this.disposed) {
        try { reference.release(); } catch { /* already gone */ }
        return;
      }
      const observer = {
        reference,
        seenSeq: -1,
        revision: -1,
        keepAlive: this.now(),
        observed: true,
        stop: () => {},
        source: undefined,
      };
      try {
        const eventSource = reference.binding.session.eventSource;
        const initial = eventSource.getSnapshot();
        observer.source = eventSource;
        observer.revision = initial.revision;
        observer.seenSeq = maxSeqOf(initial.entries);
        const off = eventSource.subscribe(() => this.read(id, observer));
        observer.stop = typeof off === 'function' ? off : () => {};
      } catch {
        try { reference.release(); } catch { /* already gone */ }
        return;
      }
      this.observers.set(id, observer);
    }

    release(id) {
      const observer = this.observers.get(id);
      if (!observer) return;
      this.observers.delete(id);
      try { observer.stop(); } catch { /* already gone */ }
      try { observer.reference.release(); } catch { /* already gone */ }
    }

    read(id, observer) {
      if (this.disposed) return;
      let frame;
      try { frame = observer.source.getSnapshot(); } catch { return; }
      if (!frame || frame.revision === observer.revision) return;
      observer.revision = frame.revision;
      const change = frame.change;
      if (!change || change.kind === 'replace') {
        observer.seenSeq = Math.max(observer.seenSeq, maxSeqOf(change ? change.entries : frame.entries));
        return;
      }
      if (change.kind !== 'append') return;
      for (const item of change.entries || []) {
        if (!item || item.type !== 'event' || !item.event) continue;
        const event = item.event;
        if (!Number.isFinite(event.seq) || event.seq <= observer.seenSeq) continue;
        observer.seenSeq = event.seq;
        this.boundary(id, observer, event);
      }
    }

    boundary(id, observer, event) {
      if (event.type === 'turn/start') {
        observer.observed = true;
        return;
      }
      if (event.type !== 'turn/end') return;
      const reason = event.data && event.data.reason ? event.data.reason.kind : undefined;
      const witnessed = observer.observed === true;
      observer.observed = false;
      if (!witnessed) return;
      if (reason !== 'completed' && reason !== 'error') return;
      this.notice = { id: `${id}:${event.seq}`, reason, sessionId: id, at: this.now() };
      this.publish();
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const id of [...this.observers.keys()]) this.release(id);
      for (const off of this.subscriptions.splice(0)) {
        try { off(); } catch { /* already gone */ }
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.__DeepSeekOrca__ = {
      ...window.__DeepSeekOrca__,
      OrcaMood, OrcaFeed,
    };
  }

  /* --------------------------------------------------------------- chime -- */

  /**
   * A two-note "ding" through Web Audio: no files, no network, created lazily
   * and silenced entirely when the preference is off.
   */
  class OrcaChime {
    constructor(win) {
      this.window = win;
      this.context = null;
      this.lastPlayedAt = 0;
    }

    get supported() {
      return Boolean(this.window && (this.window.AudioContext || this.window.webkitAudioContext));
    }

    /** Create or resume the audio context; safe to call from any handler. */
    unlock() {
      if (!this.supported) return false;
      try {
        if (!this.context) {
          const Ctor = this.window.AudioContext || this.window.webkitAudioContext;
          this.context = new Ctor();
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
        return true;
      } catch {
        return false;
      }
    }

    play(kind, volume) {
      if (!this.unlock()) return false;
      const now = Date.now();
      if (now - this.lastPlayedAt < 400) return false;
      this.lastPlayedAt = now;
      const patterns = {
        complete: { notes: [783.99, 1046.5], step: 0.12, length: 0.3 },
        error: { notes: [392, 311.13, 261.63], step: 0.12, length: 0.3 },
        // Approval requests get their own urgent-but-soft double note.
        attention: { notes: [659.25, 880], step: 0.17, length: 0.24 },
      };
      const pattern = patterns[kind] || patterns.complete;
      try {
        const context = this.context;
        const start = context.currentTime;
        const level = Math.min(1, Math.max(0.05, Number(volume) || 0.4)) * 0.2;
        const gain = context.createGain();
        const end = start + pattern.step * pattern.notes.length + pattern.length;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        gain.connect(context.destination);
        pattern.notes.forEach((frequency, index) => {
          const at = start + index * pattern.step;
          const osc = context.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, at);
          osc.connect(gain);
          osc.start(at);
          osc.stop(at + pattern.length);
        });
        return true;
      } catch {
        return false;
      }
    }

    dispose() {
      const context = this.context;
      this.context = null;
      if (context && typeof context.close === 'function') {
        try { context.close().catch(() => {}); } catch { /* already closed */ }
      }
    }
  }

  /* ---------------------------------------------------------------- view -- */

  const PET_BASE_SIZE = 152;
  const IDLE_PAINT_MS = 400;

  const VIEW_CSS = `
    :host { font-family: var(--dsw-font-family, "Segoe UI", system-ui, sans-serif); }
    *, *::before, *::after { box-sizing: border-box; }
    .layer { position: fixed; left: 0; top: 0; width: 0; height: 0; }
    .bubble {
      position: fixed;
      max-width: 236px;
      padding: 8px 12px;
      border-radius: 14px;
      background: var(--dsw-alias-bg-layer-2, rgba(27, 33, 58, .97));
      color: var(--dsw-alias-label-primary, #eef1ff);
      border: 1px solid var(--dsw-alias-border-l2, rgba(143, 169, 224, .22));
      box-shadow: 0 10px 26px rgba(4, 8, 24, .3);
      font-size: 12.5px;
      line-height: 1.42;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity .18s ease, transform .18s ease;
      z-index: 2;
    }
    .bubble[hidden] { display: none; }
    .bubble.is-visible { opacity: 1; transform: translateY(0); }
    .bubble::after {
      content: "";
      position: absolute;
      left: var(--tail-x, 50%);
      bottom: -5px;
      width: 10px;
      height: 10px;
      margin-left: -5px;
      background: inherit;
      border-right: 1px solid var(--dsw-alias-border-l2, rgba(143, 169, 224, .22));
      border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(143, 169, 224, .22));
      transform: rotate(45deg);
      border-bottom-right-radius: 2px;
    }
    .bubble[data-side="below"]::after {
      bottom: auto;
      top: -5px;
      border: 0;
      border-left: 1px solid var(--dsw-alias-border-l2, rgba(143, 169, 224, .22));
      border-top: 1px solid var(--dsw-alias-border-l2, rgba(143, 169, 224, .22));
    }
    .pet-wrap {
      position: fixed;
      left: 0;
      top: 0;
      width: 152px;
      height: 152px;
      pointer-events: none;
      z-index: 3;
    }
    .pet-wrap[hidden] { display: none; }
    .pet {
      display: block;
      width: 100%;
      height: 100%;
      padding: 0;
      margin: 0;
      border: 0;
      background: transparent;
      cursor: grab;
      touch-action: none;
      pointer-events: auto;
      -webkit-tap-highlight-color: transparent;
      position: relative;
    }
    .pet:active { cursor: grabbing; }
    .pet:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE);
      outline-offset: 6px;
      border-radius: 26px;
    }
    .art { position: absolute; inset: 0; display: block; }
    .orca-svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      filter: drop-shadow(0 8px 12px rgba(4, 8, 22, .35));
      transform-origin: 50% 88%;
      will-change: transform;
    }
    .badge {
      position: absolute;
      top: 10px;
      right: 12px;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 10px;
      background: var(--dsw-alias-brand-primary, #4D6BFE);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 20px;
      text-align: center;
      box-shadow: 0 3px 10px rgba(6, 12, 34, .4);
      pointer-events: none;
    }
    .badge[hidden] { display: none; }
    .restore {
      position: fixed;
      right: 22px;
      bottom: 22px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--dsw-alias-border-l2, rgba(143, 169, 224, .28));
      background: var(--dsw-alias-bg-layer-2, rgba(27, 33, 58, .96));
      color: var(--dsw-alias-label-secondary, #dfe6fb);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 8px 22px rgba(4, 8, 24, .28);
    }
    .restore[hidden] { display: none; }
    .restore:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(120, 140, 255, .16)); }
    .restore:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE); outline-offset: 2px; }
    .restore svg { flex: none; }
    .panel {
      position: fixed;
      width: 292px;
      max-width: calc(100vw - 24px);
      max-height: min(76vh, 520px);
      overflow: auto;
      padding: 12px 14px 14px;
      border-radius: var(--dsw-radius-lg, 14px);
      background: var(--dsw-alias-bg-layer-2, #f5f7ff);
      color: var(--dsw-alias-label-primary, #1b2340);
      border: 1px solid var(--dsw-alias-border-l2, rgba(20, 30, 80, .12));
      box-shadow: 0 18px 44px rgba(3, 7, 26, .35);
      pointer-events: auto;
      z-index: 4;
    }
    .panel[hidden] { display: none; }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .panel-title { font-size: 13.5px; font-weight: 600; }
    .close {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; padding: 0;
      border: 0; border-radius: 8px; background: transparent;
      color: var(--dsw-alias-label-tertiary, #79839f); cursor: pointer;
    }
    .close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(120, 140, 255, .14)); color: var(--dsw-alias-label-primary, #1b2340); }
    .close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE); outline-offset: 1px; }
    .panel-sub {
      margin: 2px 0 10px;
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--dsw-alias-label-tertiary, #79839f);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 32px;
      padding: 2px 0;
      font-size: 12.5px;
    }
    .row[hidden] { display: none; }
    .row-label { color: var(--dsw-alias-label-secondary, #4b5474); flex: 1 1 auto; min-width: 0; }
    .divider { height: 1px; margin: 8px 0 6px; background: var(--dsw-alias-border-l1, rgba(20, 30, 80, .08)); }
    select {
      appearance: none;
      min-width: 118px;
      max-width: 152px;
      padding: 5px 24px 5px 8px;
      border-radius: 8px;
      border: 1px solid var(--dsw-alias-border-l2, rgba(20, 30, 80, .14));
      background-color: transparent;
      background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
      background-position: calc(100% - 13px) 50%, calc(100% - 9px) 50%;
      background-size: 4px 4px, 4px 4px;
      background-repeat: no-repeat;
      color: inherit;
      font: inherit;
      font-size: 12.5px;
      cursor: pointer;
    }
    select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE); outline-offset: 1px; }
    input[type="range"] {
      width: 118px;
      flex: 0 0 auto;
      accent-color: var(--dsw-alias-brand-primary, #4D6BFE);
      cursor: pointer;
    }
    input[type="range"]:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE); outline-offset: 2px; }
    .size-value {
      color: var(--dsw-alias-label-tertiary, #79839f);
      font-variant-numeric: tabular-nums;
    }
    input.switch {
      appearance: none;
      position: relative;
      width: 34px;
      height: 20px;
      margin: 0;
      flex: 0 0 auto;
      border-radius: 999px;
      border: 1px solid var(--dsw-alias-border-l2, rgba(20, 30, 80, .16));
      background: var(--dsw-alias-bg-layer-3, rgba(120, 135, 170, .26));
      cursor: pointer;
      transition: background .16s ease;
    }
    input.switch::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--dsw-alias-switch-thumb, #fff);
      box-shadow: 0 1px 3px rgba(10, 18, 48, .35);
      transition: transform .16s ease;
    }
    input.switch:checked { background: var(--dsw-alias-brand-primary, #4D6BFE); }
    input.switch:checked::after { transform: translateX(14px); }
    input.switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE); outline-offset: 2px; }
    .panel-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .action {
      flex: 1 1 auto;
      min-width: 84px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--dsw-alias-border-l2, rgba(20, 30, 80, .14));
      background: transparent;
      color: var(--dsw-alias-label-secondary, #4b5474);
      font: inherit;
      font-size: 11.5px;
      cursor: pointer;
    }
    .action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(120, 140, 255, .14)); }
    .action:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4D6BFE); outline-offset: 1px; }

    .approval {
      position: fixed;
      width: 264px;
      max-width: calc(100vw - 24px);
      padding: 10px 12px 12px;
      border-radius: var(--dsw-radius-lg, 14px);
      background: var(--dsw-alias-bg-layer-2, #f5f7ff);
      color: var(--dsw-alias-label-primary, #1b2340);
      border: 1px solid var(--dsw-alias-border-l2, rgba(20, 30, 80, .12));
      box-shadow: 0 18px 44px rgba(3, 7, 26, .35);
      pointer-events: auto;
      z-index: 5;
    }
    .approval[hidden] { display: none; }
    .approval-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .approval-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
    .approval-dot {
      width: 7px; height: 7px; flex: none; border-radius: 50%;
      background: var(--dsw-alias-state-warn-primary, #b08d2e);
      box-shadow: 0 0 0 3px var(--dsw-alias-state-warn-tertiary, rgba(176, 141, 46, .18));
    }
    .approval-text {
      margin: 7px 0 0;
      font-size: 12px;
      line-height: 1.45;
      color: var(--dsw-alias-label-secondary, #4b5474);
      overflow-wrap: anywhere;
    }
    .approval-session {
      display: block;
      margin-top: 3px;
      font-size: 10.5px;
      color: var(--dsw-alias-label-tertiary, #79839f);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .approval-more { margin-top: 2px; font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #79839f); }
    .approval-more[hidden] { display: none; }
    .approval-actions { display: flex; gap: 6px; margin-top: 9px; }
    .approval-allow, .approval-reject {
      flex: 1 1 0;
      padding: 6px 8px;
      border-radius: 8px;
      font: inherit;
      font-size: 11.5px;
      cursor: pointer;
    }
    .approval-allow {
      border: 1px solid var(--dsw-alias-brand-primary, #3F5BD1);
      background: var(--dsw-alias-brand-primary, #3F5BD1);
      color: var(--dsw-alias-label-on-color, #fff);
    }
    .approval-allow:hover { filter: brightness(1.08); }
    .approval-reject {
      border: 1px solid var(--dsw-alias-border-l2, rgba(20, 30, 80, .16));
      background: transparent;
      color: var(--dsw-alias-label-secondary, #4b5474);
    }
    .approval-reject:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(120, 140, 255, .14)); }
    .approval-allow:focus-visible, .approval-reject:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary, #3F5BD1);
      outline-offset: 1px;
    }
    .approval-allow[disabled], .approval-reject[disabled] { opacity: .55; cursor: default; }
    .approval-error {
      margin: 7px 0 0;
      font-size: 10.5px;
      color: var(--dsw-alias-state-error-primary, #b4232a);
    }
    .approval-error[hidden] { display: none; }

    @keyframes orca-bob {
      0%, 100% { transform: translateY(0) rotate(-1.5deg); }
      50% { transform: translateY(-7px) rotate(1.5deg); }
    }
    @keyframes orca-fast-bob {
      0%, 100% { transform: translateY(0) rotate(-1deg); }
      50% { transform: translateY(-4px) rotate(1deg); }
    }
    @keyframes orca-hop {
      0%, 100% { transform: translateY(0) scale(1, 1) rotate(-4deg); }
      30% { transform: translateY(-16px) scale(.98, 1.03) rotate(3deg); }
      55% { transform: translateY(0) scale(1.03, .97) rotate(-2deg); }
      75% { transform: translateY(-6px) scale(1, 1) rotate(2deg); }
    }
    @keyframes orca-breathe {
      0%, 100% { transform: scale(1, 1) translateY(0); }
      50% { transform: scale(1.02, .97) translateY(2px); }
    }
    @keyframes orca-shake {
      0%, 100% { transform: translateX(0) rotate(0); }
      25% { transform: translateX(-2px) rotate(-1deg); }
      75% { transform: translateX(2px) rotate(1deg); }
    }
    @keyframes orca-blink {
      0%, 93%, 100% { transform: scaleY(1); }
      95.5% { transform: scaleY(.1); }
    }
    @keyframes orca-twinkle { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    @keyframes orca-drift {
      0%, 100% { opacity: .5; transform: translateY(2px); }
      50% { opacity: 1; transform: translateY(-3px); }
    }
    [data-state="resting"] .orca-svg { animation: orca-bob 4.2s ease-in-out infinite; }
    [data-state="working"] .orca-svg { animation: orca-fast-bob 2.1s ease-in-out infinite; }
    [data-state="waiting"] .orca-svg { animation: orca-bob 2.8s ease-in-out infinite; }
    [data-state="celebrate"] .orca-svg { animation: orca-hop 1.05s ease-in-out 2; }
    [data-state="sleeping"] .orca-svg { animation: orca-breathe 5.2s ease-in-out infinite; }
    [data-state="error"] .orca-svg { animation: orca-shake 1.6s ease-in-out 2; }
    .orca-eyes--open { animation: orca-blink 6.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    .orca-pupil {
      transform: translate(calc(var(--look-x, 0) * 1px), calc(var(--look-y, 0) * 1px));
      transition: transform .16s ease-out;
    }
    .orca-sparkles { animation: orca-twinkle 1.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    .orca-zzz { animation: orca-drift 4s ease-in-out infinite; }
    [data-motion="false"] .orca-svg,
    [data-motion="false"] .orca-eyes--open,
    [data-motion="false"] .orca-sparkles,
    [data-motion="false"] .orca-zzz { animation: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .orca-svg, .orca-eyes--open, .orca-sparkles, .orca-zzz { animation: none !important; }
      .bubble { transition: none; }
    }
  `;

  /** Small DOM builder; no innerHTML anywhere in this plugin. */
  function el(doc, tag, attributes, children) {
    const node = doc.createElement(tag);
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'text') node.textContent = String(value);
        else if (key === 'className') node.className = String(value);
        else if (key === 'hidden') node.hidden = value === true;
        else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children || []) if (child) node.append(child);
    return node;
  }

  /** Parse trusted local SVG markup into an importable node. */
  function svgNode(doc, win, markup) {
    try {
      const parsed = new win.DOMParser().parseFromString(markup, 'image/svg+xml');
      if (!parsed || !parsed.documentElement || parsed.documentElement.nodeName === 'parsererror') return null;
      return doc.importNode(parsed.documentElement, true);
    } catch {
      return null;
    }
  }

  function iconNode(doc, win, pathData, size) {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${pathData}"/></svg>`;
    return svgNode(doc, win, markup);
  }

  /**
   * The orca's DOM: a host element holding one shadow root. All coordinates are
   * viewport coordinates, and the host itself stays 0x0 so it can never cover
   * the application or block a click.
   */
  class OrcaView {
    constructor(hostElement, options) {
      const settings = options || {};
      this.host = hostElement;
      this.document = hostElement.ownerDocument;
      this.window = this.document.defaultView || window;
      this.language = normalizeLanguage(settings.language);
      this.now = typeof settings.now === 'function' ? settings.now : () => Date.now();
      this.onPreferences = typeof settings.onPreferences === 'function' ? settings.onPreferences : undefined;
      this.listeners = [];
      this.disposed = false;
      this.lastView = {};
      this.currentArtState = undefined;
      this.position = { x: 0, y: 0 };
      this.petSize = PET_BASE_SIZE;

      this.storage = settings.storage;
      if (this.storage === undefined) {
        try { this.storage = this.window.localStorage; } catch { this.storage = null; }
      }
      let saved;
      try { saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
      this.preferences = cleanPreferences(saved);
      // Migrate absolute pixel positions written by 1.0 to relative ones.
      if (this.preferences.rx === null && saved && Number.isFinite(saved.x)) {
        const size = Math.round(PET_BASE_SIZE * this.preferences.scale);
        this.preferences.rx = clamp01(saved.x / Math.max(1, this.window.innerWidth - size));
        this.preferences.ry = clamp01((Number.isFinite(saved.y) ? saved.y : 0) / Math.max(1, this.window.innerHeight - size));
      }
      this.mood = new OrcaMood({ now: this.now, sleepAfterMs: this.preferences.sleepAfterMs });
      this.chime = new OrcaChime(this.window);
      this.look = { x: 0, y: 0 };
      this.lookFrame = 0;
      this.noticeSeen = undefined;
      this.hintUntil = 0;
      this.speciesKey = this.preferences.species;
      this.resolveText = typeof settings.resolveText === 'function' ? settings.resolveText : undefined;
      this.approvals = [];
      this.visibleApproval = undefined;
      this.lastApprovalKey = undefined;
      this.answeredApprovals = new Set();
      this.approvalDismissedKey = undefined;
      this.approvalBusy = false;
      this.cardVisible = false;
      // The first-run tip waits for the first calm moment instead of covering a
      // running turn or a pending approval.
      this.hintPending = !this.preferences.seenHint;

      // Inline host styles: a 0x0 fixed box that never intercepts pointer input.
      this.host.setAttribute('style', [
        'position: fixed', 'left: 0', 'top: 0', 'width: 0', 'height: 0',
        'pointer-events: none', 'z-index: 60', 'overflow: visible',
      ].join(';'));

      this.root = hostElement.shadowRoot || hostElement.attachShadow({ mode: 'open' });
      this.root.replaceChildren();
      const style = this.document.createElement('style');
      style.textContent = VIEW_CSS;
      this.root.append(style);

      this.build();
      this.bind();
      this.applyPreferences();
      this.setLanguage(this.language);
      this.paint();
      this.interval = this.window.setInterval(() => {
        if (this.disposed || this.document.hidden) return;
        this.paint();
      }, IDLE_PAINT_MS);
      this.listeners.push(() => this.window.clearInterval(this.interval));
    }

    build() {
      const doc = this.document;
      const win = this.window;

      this.bubbleText = el(doc, 'span', { className: 'bubble-text' });
      this.bubble = el(doc, 'div', { className: 'bubble', hidden: true }, [this.bubbleText]);

      this.art = el(doc, 'span', { className: 'art', 'aria-hidden': 'true' });
      this.badge = el(doc, 'span', { className: 'badge', hidden: true });
      this.button = el(doc, 'button', { type: 'button', className: 'pet', 'aria-haspopup': 'dialog' }, [this.art, this.badge]);
      this.petWrap = el(doc, 'div', { className: 'pet-wrap', 'data-state': 'resting', 'data-motion': 'true' }, [this.button]);

      const closeIcon = iconNode(doc, win, 'M6 6l12 12M18 6L6 18', 16);
      this.closeButton = el(doc, 'button', { type: 'button', className: 'close' }, [closeIcon]);

      this.scopeSelect = el(doc, 'select', { id: 'orca-scope' }, [
        el(doc, 'option', { value: 'current', 'data-i18n': 'setting.scopeCurrent' }),
        el(doc, 'option', { value: 'global', 'data-i18n': 'setting.scopeGlobal' }),
      ]);
      this.speciesSelect = el(doc, 'select', { id: 'orca-species' }, SPECIES_KEYS.map(speciesKey => (
        el(doc, 'option', { value: speciesKey, 'data-i18n': SPECIES[speciesKey].labelKey })
      )));
      this.sizeRange = el(doc, 'input', { id: 'orca-size', type: 'range', min: '70', max: '160', step: '5' });
      this.sizeValue = el(doc, 'output', { className: 'size-value' });
      this.motionSwitch = el(doc, 'input', { id: 'orca-motion', type: 'checkbox', role: 'switch', className: 'switch' });
      this.soundSwitch = el(doc, 'input', { id: 'orca-sound', type: 'checkbox', role: 'switch', className: 'switch' });
      this.approvalSoundSwitch = el(doc, 'input', { id: 'orca-approval-sound', type: 'checkbox', role: 'switch', className: 'switch' });
      this.volumeRange = el(doc, 'input', { id: 'orca-volume', type: 'range', min: '10', max: '100', step: '5' });
      this.volumeValue = el(doc, 'output', { className: 'size-value' });
      this.sleepSelect = el(doc, 'select', { id: 'orca-sleep' }, [
        el(doc, 'option', { value: '30000', 'data-i18n': 'setting.seconds30' }),
        el(doc, 'option', { value: '120000', 'data-i18n': 'setting.minutes2' }),
        el(doc, 'option', { value: '300000', 'data-i18n': 'setting.minutes5' }),
      ]);

      const row = (labelNode, control) => el(doc, 'div', { className: 'row' }, [
        el(doc, 'label', { className: 'row-label', for: control.getAttribute('id') }, [labelNode]),
        control,
      ]);

      this.panelTitle = el(doc, 'strong', { className: 'panel-title', 'data-i18n': 'panel.title' });
      this.panelSub = el(doc, 'p', { className: 'panel-sub', 'data-i18n': 'panel.subtitle' });
      this.panel = el(doc, 'section', { className: 'panel', role: 'dialog', 'aria-modal': 'false', hidden: true }, [
        el(doc, 'div', { className: 'panel-head' }, [this.panelTitle, this.closeButton]),
        this.panelSub,
        row(el(doc, 'span', { 'data-i18n': 'setting.scope' }), this.scopeSelect),
        row(el(doc, 'span', { 'data-i18n': 'setting.species' }), this.speciesSelect),
        el(doc, 'div', { className: 'row' }, [
          el(doc, 'label', { className: 'row-label', for: 'orca-size' }, [
            el(doc, 'span', { 'data-i18n': 'setting.size' }),
            el(doc, 'span', { text: ' ' }),
            this.sizeValue,
          ]),
          this.sizeRange,
        ]),
        row(el(doc, 'span', { 'data-i18n': 'setting.motion' }), this.motionSwitch),
        row(el(doc, 'span', { 'data-i18n': 'setting.sound' }), this.soundSwitch),
        row(el(doc, 'span', { 'data-i18n': 'setting.approvalSound' }), this.approvalSoundSwitch),
        el(doc, 'div', { className: 'row', 'data-sound-row': '' }, [
          el(doc, 'label', { className: 'row-label', for: 'orca-volume' }, [
            el(doc, 'span', { 'data-i18n': 'setting.soundVolume' }),
            el(doc, 'span', { text: ' ' }),
            this.volumeValue,
          ]),
          this.volumeRange,
        ]),
        row(el(doc, 'span', { 'data-i18n': 'setting.sleep' }), this.sleepSelect),
        el(doc, 'div', { className: 'divider' }),
        el(doc, 'div', { className: 'panel-actions' }, [
          el(doc, 'button', { type: 'button', className: 'action', 'data-action': 'greet', 'data-i18n': 'action.greet' }),
          el(doc, 'button', { type: 'button', className: 'action', 'data-action': 'reset', 'data-i18n': 'action.reset' }),
          el(doc, 'button', { type: 'button', className: 'action', 'data-action': 'hide', 'data-i18n': 'action.hide' }),
        ]),
      ]);

      const restoreIcon = iconNode(doc, win, 'M3 16c3-5 8-8 13-8 2 0 4 .5 5 1.5M18 8l3-1-1 3', 16);
      this.restore = el(doc, 'button', { type: 'button', className: 'restore', hidden: true }, [
        restoreIcon,
        el(doc, 'span', { 'data-i18n': 'action.restore' }),
      ]);

      // Cross-session approval card: decision without switching conversations.
      const dismissIcon = iconNode(doc, win, 'M6 6l12 12M18 6L6 18', 14);
      this.approvalDot = el(doc, 'span', { className: 'approval-dot' });
      this.approvalText = el(doc, 'p', { className: 'approval-text' });
      this.approvalSession = el(doc, 'span', { className: 'approval-session' });
      this.approvalMore = el(doc, 'div', { className: 'approval-more', hidden: true });
      this.approvalError = el(doc, 'p', { className: 'approval-error', hidden: true });
      this.approvalAllow = el(doc, 'button', { type: 'button', className: 'approval-allow', 'data-i18n': 'approval.allow' });
      this.approvalReject = el(doc, 'button', { type: 'button', className: 'approval-reject', 'data-i18n': 'approval.reject' });
      this.approvalDismiss = el(doc, 'button', {
        type: 'button', className: 'close', 'data-i18n-aria': 'approval.dismiss',
      }, [dismissIcon]);
      this.approvalCard = el(doc, 'section', { className: 'approval', role: 'group', hidden: true }, [
        el(doc, 'div', { className: 'approval-head' }, [
          el(doc, 'strong', { className: 'approval-title' }, [
            this.approvalDot,
            el(doc, 'span', { 'data-i18n': 'approval.title' }),
          ]),
          this.approvalDismiss,
        ]),
        this.approvalText,
        this.approvalSession,
        this.approvalMore,
        el(doc, 'div', { className: 'approval-actions' }, [this.approvalReject, this.approvalAllow]),
        this.approvalError,
      ]);

      this.root.append(
        el(doc, 'div', { className: 'layer' }, [
          this.bubble, this.petWrap, this.approvalCard, this.panel, this.restore,
        ]),
      );
    }

    /* --------------------------------------------------------- plumbing -- */

    listen(target, type, handler, options) {
      if (!target) return;
      target.addEventListener(type, handler, options);
      this.listeners.push(() => target.removeEventListener(type, handler, options));
    }

    bind() {
      this.listen(this.button, 'pointerdown', (event) => {
        this.chime.unlock();
        this.pointerDown(event);
      });
      this.listen(this.button, 'pointermove', (event) => this.pointerMove(event));
      this.listen(this.button, 'pointerup', (event) => this.pointerEnd(event));
      this.listen(this.button, 'pointercancel', (event) => this.pointerEnd(event, true));
      this.listen(this.button, 'lostpointercapture', () => {
        this.drag = undefined;
        delete this.petWrap.dataset.dragging;
      });
      this.listen(this.button, 'click', (event) => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        if (event.detail === 0) this.openPanel();
        else this.greet();
      });
      this.listen(this.button, 'contextmenu', (event) => {
        event.preventDefault();
        this.openPanel();
      });
      this.listen(this.button, 'keydown', (event) => {
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const delta = directions[event.key];
        if (!delta) return;
        event.preventDefault();
        const step = event.shiftKey ? 20 : 5;
        const next = clampPosition(
          this.position.x + delta[0] * step,
          this.position.y + delta[1] * step,
          this.petSize, this.petSize,
          this.window.innerWidth, this.window.innerHeight, this.topClearance(),
        );
        this.preferences.rx = clamp01(next.x / Math.max(1, this.window.innerWidth - this.petSize));
        this.preferences.ry = clamp01(next.y / Math.max(1, this.window.innerHeight - this.petSize));
        this.reposition();
        this.save();
      });
      this.listen(this.closeButton, 'click', () => this.closePanel());
      this.listen(this.approvalAllow, 'click', () => this.decideApproval('allowed-once'));
      this.listen(this.approvalReject, 'click', () => this.decideApproval('rejected'));
      this.listen(this.approvalDismiss, 'click', () => {
        if (this.visibleApproval) this.approvalDismissedKey = this.visibleApproval.key;
        this.paint();
      });
      this.listen(this.root, 'keydown', (event) => {
        if (event.key !== 'Escape' || this.panel.hidden) return;
        event.preventDefault();
        this.closePanel();
      });
      this.listen(this.document, 'pointerdown', (event) => {
        this.chime.unlock();
        if (this.panel.hidden) return;
        if (event.composedPath().includes(this.host)) return;
        this.closePanel(false);
      });
      this.listen(this.window, 'resize', () => this.reposition());
      this.listen(this.window, 'storage', (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        let next;
        try { next = cleanPreferences(JSON.parse(event.newValue || 'null')); } catch { return; }
        const scopeChanged = next.scope !== this.preferences.scope;
        this.preferences = next;
        this.applyPreferences();
        if (scopeChanged) this.notifyPreferences();
        this.paint();
      });

      // The pupils follow the pointer, throttled to one frame.
      this.listen(this.window, 'pointermove', (event) => this.trackPointer(event), { passive: true });
      this.listen(this.window, 'pointerleave', () => this.setLook(0, 0));
      this.listen(this.window, 'blur', () => this.setLook(0, 0));
      // Browsers keep Web Audio suspended until a gesture; any app interaction
      // unlocks the approval signal before it is needed.
      this.listen(this.document, 'pointerdown', () => this.chime.unlock(), { capture: true, passive: true });
      this.listen(this.document, 'keydown', () => this.chime.unlock(), { capture: true, passive: true });

      this.listen(this.sizeRange, 'input', () => {
        this.preferences.scale = Number(this.sizeRange.value) / 100;
        this.applyPreferences();
        this.save();
      });
      this.listen(this.speciesSelect, 'change', () => {
        this.preferences.species = SPECIES_KEYS.includes(this.speciesSelect.value)
          ? this.speciesSelect.value
          : 'orca';
        this.speciesKey = this.preferences.species;
        this.currentArtState = undefined;
        this.save();
        this.paint();
      });
      this.listen(this.scopeSelect, 'change', () => {
        this.preferences.scope = this.scopeSelect.value === 'current' ? 'current' : 'global';
        this.save();
        this.notifyPreferences();
        this.paint();
      });
      this.listen(this.motionSwitch, 'change', () => {
        this.preferences.motion = this.motionSwitch.checked;
        this.applyPreferences();
        this.save();
      });
      this.listen(this.soundSwitch, 'change', () => {
        this.preferences.sound = this.soundSwitch.checked;
        this.applyPreferences();
        this.save();
        if (this.preferences.sound) {
          this.chime.unlock();
          this.chime.play('complete', this.preferences.soundVolume);
        }
      });
      this.listen(this.volumeRange, 'input', () => {
        this.preferences.soundVolume = Number(this.volumeRange.value) / 100;
        this.volumeValue.textContent = `${this.volumeRange.value}%`;
        this.save();
      });
      this.listen(this.volumeRange, 'change', () => {
        if (this.preferences.sound) this.chime.play('complete', this.preferences.soundVolume);
      });
      this.listen(this.approvalSoundSwitch, 'change', () => {
        this.preferences.approvalSound = this.approvalSoundSwitch.checked;
        this.applyPreferences();
        this.save();
        if (this.preferences.approvalSound) {
          this.chime.unlock();
          this.chime.play('attention', this.preferences.soundVolume);
        }
      });
      this.listen(this.sleepSelect, 'change', () => {
        this.preferences.sleepAfterMs = Number(this.sleepSelect.value);
        this.mood.sleepAfterMs = this.preferences.sleepAfterMs;
        this.save();
        this.paint();
      });
      this.listen(this.restore, 'click', () => {
        this.preferences.hidden = false;
        this.mood.touch();
        this.applyPreferences();
        this.save();
        this.button.focus();
        this.paint();
      });
      for (const action of this.root.querySelectorAll('[data-action]')) {
        this.listen(action, 'click', () => {
          const kind = action.dataset.action;
          if (kind === 'greet') this.greet();
          else if (kind === 'reset') {
            this.preferences.rx = null;
            this.preferences.ry = null;
            this.reposition();
            this.save();
          } else if (kind === 'hide') {
            this.preferences.hidden = true;
            this.closePanel(false);
            this.applyPreferences();
            this.save();
            this.restore.focus();
          }
        });
      }
    }

    /** Aim the pupils at the pointer, in SVG user units. */
    trackPointer(event) {
      if (this.disposed || this.preferences.hidden) return;
      if (this.lookFrame) return;
      this.lookFrame = this.window.requestAnimationFrame(() => {
        this.lookFrame = 0;
        if (this.disposed) return;
        const size = this.petSize;
        const centerX = this.position.x + size / 2;
        const centerY = this.position.y + size * 0.45;
        const halfWidth = Math.max(160, this.window.innerWidth / 2);
        const halfHeight = Math.max(160, this.window.innerHeight / 2);
        const x = Math.max(-1, Math.min(1, (event.clientX - centerX) / halfWidth));
        const y = Math.max(-1, Math.min(1, (event.clientY - centerY) / halfHeight));
        this.setLook(Number((x * 2.4).toFixed(2)), Number((y * 1.8).toFixed(2)));
      });
    }

    setLook(x, y) {
      this.look = { x, y };
      try {
        this.art.style.setProperty('--look-x', `${x}`);
        this.art.style.setProperty('--look-y', `${y}`);
      } catch { /* optional */ }
    }

    notifyPreferences() {
      try {
        if (typeof this.onPreferences === 'function') this.onPreferences(this.preferences);
      } catch { /* a feed refresh must never break the pet */ }
    }

    /* --------------------------------------------------------- behaviour -- */

    greet() {
      this.mood.touch();
      this.paint();
    }

    save() {
      try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.preferences)); } catch { /* optional */ }
    }

    applyPreferences() {
      const prefs = this.preferences;
      this.sizeRange.value = String(Math.round(prefs.scale * 100));
      this.sizeValue.textContent = `${this.sizeRange.value}%`;
      this.scopeSelect.value = prefs.scope;
      this.speciesSelect.value = prefs.species;
      this.motionSwitch.checked = prefs.motion;
      this.soundSwitch.checked = prefs.sound;
      this.approvalSoundSwitch.checked = prefs.approvalSound;
      this.volumeRange.value = String(Math.round(prefs.soundVolume * 100));
      this.volumeValue.textContent = `${this.volumeRange.value}%`;
      this.sleepSelect.value = String(prefs.sleepAfterMs);
      this.mood.sleepAfterMs = prefs.sleepAfterMs;
      this.petWrap.dataset.motion = String(prefs.motion);
      this.petWrap.hidden = prefs.hidden;
      this.bubble.hidden = prefs.hidden;
      this.restore.hidden = !prefs.hidden;
      if (prefs.hidden) {
        this.approvalCard.hidden = true;
        this.cardVisible = false;
      }
      for (const row of this.root.querySelectorAll('[data-sound-row]')) {
        row.hidden = !(prefs.sound || prefs.approvalSound);
      }
      if (prefs.hidden) this.closePanel(false);
      this.reposition();
    }

    reposition() {
      const prefs = this.preferences;
      this.petSize = Math.round(PET_BASE_SIZE * prefs.scale);
      this.petWrap.style.width = `${this.petSize}px`;
      this.petWrap.style.height = `${this.petSize}px`;
      const maxX = Math.max(1, this.window.innerWidth - this.petSize);
      const maxY = Math.max(1, this.window.innerHeight - this.petSize);
      // Relative position: the pet keeps its place when the window resizes.
      const x = prefs.rx === null ? this.window.innerWidth - this.petSize - 26 : prefs.rx * maxX;
      const y = prefs.ry === null ? this.window.innerHeight - this.petSize - 92 : prefs.ry * maxY;
      this.placeAt(x, y);
    }

    /** Move to a pixel position, clamped, without persisting it. */
    placeAt(x, y) {
      this.position = clampPosition(
        x, y, this.petSize, this.petSize,
        this.window.innerWidth, this.window.innerHeight, this.topClearance(),
      );
      this.petWrap.style.left = `${this.position.x}px`;
      this.petWrap.style.top = `${this.position.y}px`;
      this.placeBubble();
      if (this.cardVisible) this.placeCard();
      if (!this.panel.hidden) this.positionPanel();
    }

    /** Persist the current pixel position as viewport ratios. */
    savePosition() {
      const maxX = Math.max(1, this.window.innerWidth - this.petSize);
      const maxY = Math.max(1, this.window.innerHeight - this.petSize);
      this.preferences.rx = clamp01(this.position.x / maxX);
      this.preferences.ry = clamp01(this.position.y / maxY);
    }

    topClearance() {
      try {
        const raw = this.window.getComputedStyle(this.document.documentElement)
          .getPropertyValue('--dsh-frame-top-clearance');
        const value = parseFloat(raw);
        return Number.isFinite(value) && value > 0 ? value + 8 : 56;
      } catch {
        return 56;
      }
    }

    placeBubble() {
      if (this.disposed || this.preferences.hidden) return;
      this.bubble.hidden = false;
      const width = this.bubble.offsetWidth;
      const height = this.bubble.offsetHeight;
      if (!width || !height) return;
      const size = this.petSize;
      const clearance = this.topClearance();
      let left = this.position.x + size / 2 - width / 2;
      let top = this.position.y - height - 10;
      let side = 'above';
      if (top < clearance) {
        side = 'below';
        top = this.position.y + size + 10;
      }
      const maxLeft = this.window.innerWidth - width - 8;
      left = Math.max(8, Math.min(maxLeft, left));
      top = Math.max(4, Math.min(this.window.innerHeight - height - 4, top));
      this.bubble.style.left = `${left}px`;
      this.bubble.style.top = `${top}px`;
      this.bubble.dataset.side = side;
      const tail = this.position.x + size / 2 - left;
      this.bubble.style.setProperty('--tail-x', `${Math.max(18, Math.min(width - 18, tail))}px`);
      this.bubble.classList.add('is-visible');
    }

    positionPanel() {
      const panel = this.panel;
      panel.hidden = false;
      panel.style.visibility = 'hidden';
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const size = this.petSize;
      let left = this.position.x + size / 2 - width / 2;
      let top = this.position.y - height - 12;
      if (top < 8) top = this.position.y + size + 12;
      left = Math.max(8, Math.min(this.window.innerWidth - width - 8, left));
      top = Math.max(8, Math.min(this.window.innerHeight - height - 8, top));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = '';
    }

    openPanel() {
      this.panel.hidden = false;
      this.positionPanel();
      this.closeButton.focus();
    }

    closePanel(focus) {
      if (this.panel.hidden) return;
      this.panel.hidden = true;
      if (focus !== false) this.button.focus();
    }

    pointerDown(event) {
      if (event.button !== 0 || !event.isPrimary) return;
      this.suppressClick = false;
      this.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        originX: this.position.x,
        originY: this.position.y,
        moved: false,
      };
      try { this.button.setPointerCapture(event.pointerId); } catch { /* optional */ }
    }

    pointerMove(event) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      this.petWrap.dataset.dragging = 'true';
      this.placeAt(drag.originX + dx, drag.originY + dy);
    }

    pointerEnd(event, cancelled) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      this.suppressClick = drag.moved || cancelled === true;
      if (drag.moved) {
        this.savePosition();
        this.save();
      }
      this.drag = undefined;
      delete this.petWrap.dataset.dragging;
      try {
        if (this.button.hasPointerCapture(event.pointerId)) this.button.releasePointerCapture(event.pointerId);
      } catch { /* optional */ }
    }

    setLanguage(language) {
      if (this.disposed) return;
      this.language = normalizeLanguage(language);
      this.host.setAttribute('lang', this.language);
      for (const element of this.root.querySelectorAll('[data-i18n]')) {
        element.textContent = translate(this.language, element.dataset.i18n);
      }
      for (const element of this.root.querySelectorAll('[data-i18n-aria]')) {
        element.setAttribute('aria-label', translate(this.language, element.dataset.i18nAria));
      }
      this.closeButton.setAttribute('aria-label', translate(this.language, 'panel.close'));
      this.panel.setAttribute('aria-label', translate(this.language, 'panel.aria'));
      this.paint();
      if (!this.panel.hidden) this.positionPanel();
    }

    /** Feed one snapshot from OrcaFeed into the mood machine. */
    update(snapshot) {
      if (this.disposed) return;
      try {
        this.approvals = Array.isArray(snapshot && snapshot.approvals) ? snapshot.approvals : [];
        const head = this.approvals[0];
        const headKey = head ? head.key : undefined;
        if (head && headKey !== this.lastApprovalKey && this.preferences.approvalSound) {
          this.chime.play('attention', this.preferences.soundVolume);
        }
        this.lastApprovalKey = headKey;
        const before = this.mood.noticeId;
        this.mood.update(snapshot, this.now());
        if (this.mood.noticeId !== before && this.mood.noticeReason !== undefined && this.preferences.sound) {
          this.chime.play(this.mood.noticeReason === 'error' ? 'error' : 'complete', this.preferences.soundVolume);
        }
        this.paint();
      } catch { /* a malformed snapshot must never break the overlay */ }
    }

    /** Artwork for the current species and state, including the waiting variant. */
    artFor(view) {
      const speciesKey = SPECIES_ART[this.speciesKey] ? this.speciesKey : 'orca';
      if (view.state === 'waiting') {
        return speciesArt(speciesKey, faceFor('waiting', view.pendingKind));
      }
      return SPECIES_ART[speciesKey][view.state] || SPECIES_ART[speciesKey].resting;
    }

    paint() {
      if (this.disposed) return;
      const view = this.mood.view(this.now());
      const previous = this.lastView || {};
      const artKey = `${this.speciesKey}:${view.state}:${view.state === 'waiting' ? (view.pendingKind || '') : ''}`;
      if (this.currentArtState !== artKey) {
        this.currentArtState = artKey;
        this.petWrap.dataset.state = view.state;
        const node = svgNode(this.document, this.window, this.artFor(view));
        if (node) {
          this.art.replaceChildren(node);
          this.setLook(this.look.x, this.look.y);
        } else if (!this.art.firstChild) {
          this.art.replaceChildren();
        }
      }
      const count = view.workingCount;
      this.badge.hidden = count <= 0;
      this.badge.textContent = count > 99 ? '99+' : String(count);
      const now = this.now();
      if (this.hintPending && view.state === 'resting' && !view.noticeKey) {
        this.hintPending = false;
        this.hintUntil = now + 9000;
        this.preferences.seenHint = true;
        this.save();
      }
      const showHint = now < this.hintUntil && view.state === 'resting' && !view.noticeKey;
      const text = translate(this.language, showHint ? 'hint.firstRun' : view.messageKey);
      if (this.bubbleText.textContent !== text) this.bubbleText.textContent = text;
      const status = count > 0
        ? `${text} ${translate(this.language, count === 1 ? 'count.one' : 'count.many', { count })}`
        : text;
      const aria = translate(this.language, 'pet.aria', { status });
      if (this.button.getAttribute('aria-label') !== aria) this.button.setAttribute('aria-label', aria);
      this.lastView = view;
      const cardVisible = this.paintApproval();
      if (cardVisible) {
        this.bubble.hidden = true;
        this.bubble.classList.remove('is-visible');
      } else {
        this.bubble.hidden = this.preferences.hidden;
        this.placeBubble();
      }
    }

    /** Short human description of one pending approval request. */
    describeApproval(approval) {
      const reason = approval.displayReason;
      if (reason && typeof reason === 'object') {
        try {
          const resolved = this.resolveText ? this.resolveText(reason) : undefined;
          if (typeof resolved === 'string' && resolved.trim()) return resolved.trim().slice(0, 200);
        } catch { /* fall through to the dictionary */ }
        const fallback = reason[this.language] || reason.en;
        if (typeof fallback === 'string' && fallback.trim()) return fallback.trim().slice(0, 200);
      }
      if (typeof approval.reason === 'string' && approval.reason.trim()) {
        return approval.reason.trim().slice(0, 200);
      }
      return translate(this.language, 'approval.tool', { tool: approval.toolName || 'tool' });
    }

    setApprovalEnabled(enabled) {
      this.approvalAllow.disabled = !enabled;
      this.approvalReject.disabled = !enabled;
    }

    /** Render the cross-session approval card; returns whether it is visible. */
    paintApproval() {
      const list = (this.approvals || []).filter(candidate => candidate
        && !this.answeredApprovals.has(candidate.key)
        && candidate.key !== this.approvalDismissedKey);
      const first = list[0];
      this.visibleApproval = first;
      if (!first || this.preferences.hidden) {
        this.approvalCard.hidden = true;
        this.cardVisible = false;
        return false;
      }
      if (!this.cardVisible) this.approvalError.hidden = true;
      this.cardVisible = true;
      this.approvalCard.hidden = false;
      const description = this.describeApproval(first);
      if (this.approvalText.textContent !== description) this.approvalText.textContent = description;
      const title = first.sessionTitle
        ? translate(this.language, 'approval.session', { session: first.sessionTitle.slice(0, 28) })
        : '';
      this.approvalSession.textContent = title;
      this.approvalSession.hidden = title === '';
      this.approvalMore.hidden = list.length < 2;
      this.approvalMore.textContent = translate(this.language, 'approval.more', { count: list.length - 1 });
      this.setApprovalEnabled(!this.approvalBusy);
      this.placeCard();
      return true;
    }

    /** Place the approval card above the companion, below it when there is no room. */
    placeCard() {
      const card = this.approvalCard;
      if (!card || card.hidden) return;
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      if (!width || !height) return;
      const size = this.petSize;
      const clearance = this.topClearance();
      let left = this.position.x + size / 2 - width / 2;
      let top = this.position.y - height - 10;
      if (top < clearance) top = this.position.y + size + 10;
      left = Math.max(8, Math.min(this.window.innerWidth - width - 8, left));
      top = Math.max(4, Math.min(this.window.innerHeight - height - 4, top));
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }

    /** Answer one approval from another session. */
    decideApproval(decision) {
      const approval = this.visibleApproval;
      if (!approval || this.approvalBusy) return;
      this.approvalBusy = true;
      this.setApprovalEnabled(false);
      this.approvalError.hidden = true;
      Promise.resolve()
        .then(() => approval.answer(decision))
        .then(() => {
          this.answeredApprovals.add(approval.key);
        })
        .catch(() => {
          this.approvalError.textContent = translate(this.language, 'approval.stale');
          this.approvalError.hidden = false;
        })
        .finally(() => {
          this.approvalBusy = false;
          if (!this.disposed) this.paint();
        });
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      if (this.lookFrame) {
        try { this.window.cancelAnimationFrame(this.lookFrame); } catch { /* optional */ }
        this.lookFrame = 0;
      }
      this.chime.dispose();
      for (const off of this.listeners.splice(0).reverse()) {
        try { off(); } catch { /* already gone */ }
      }
      try { this.root.replaceChildren(); } catch { /* already gone */ }
      try { this.host.removeAttribute('lang'); } catch { /* already gone */ }
      try { this.host.removeAttribute('style'); } catch { /* already gone */ }
    }
  }

  if (typeof window !== 'undefined') {
    window.__DeepSeekOrca__ = {
      ...window.__DeepSeekOrca__,
      OrcaView, OrcaChime, SPECIES, SPECIES_ART, SPECIES_KEYS, speciesArt, faceFor, PET_BASE_SIZE, VIEW_CSS,
    };
  }

  /* -------------------------------------------------------------- plugin -- */

  const PLUGIN_ID = 'dsh-plugin-deepseek-orca';

  function readLanguage(ctx) {
    try {
      const snapshot = ctx.locale.getSnapshot();
      return normalizeLanguage(snapshot ? snapshot.active : 'en');
    } catch {
      return 'en';
    }
  }

  function watchLanguage(ctx, onChange) {
    let locale;
    try { locale = ctx.locale; } catch { return () => {}; }
    if (!locale || typeof locale.subscribe !== 'function') return () => {};
    let previous = readLanguage(ctx);
    let off;
    try {
      off = locale.subscribe(() => {
        const next = readLanguage(ctx);
        if (next === previous) return;
        previous = next;
        onChange(next);
      });
    } catch {
      return () => {};
    }
    return () => {
      try { if (typeof off === 'function') off(); } catch { /* already gone */ }
    };
  }

  /**
   * React entry. One host element, one view and one feed per mount.
   * Everything is guarded: a failure leaves an empty host instead of
   * propagating out of the effect and unmounting the application tree.
   */
  function createOverlay(React, ctx) {
    const h = React.createElement;

    class OverlayBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        console.error('[deepseek-orca] overlay disabled after an error', error);
      }

      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    function Pet() {
      const hostRef = React.useRef(null);
      React.useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let view;
        let feed;
        let stopLanguage = () => {};
        try {
          view = new OrcaView(host, {
            language: readLanguage(ctx),
            resolveText: (reason) => {
              try {
                const locale = ctx.locale;
                return typeof locale.resolveText === 'function' ? locale.resolveText(reason) : undefined;
              } catch {
                return undefined;
              }
            },
            onPreferences: () => {
              try { if (feed && !feed.disposed) feed.publish(); } catch { /* ignore */ }
            },
          });
          feed = new OrcaFeed(ctx, {
            getPreferences: () => view.preferences,
            onSnapshot: (snapshot) => view.update(snapshot),
          });
          stopLanguage = watchLanguage(ctx, (language) => view.setLanguage(language));
          feed.start();
        } catch (error) {
          console.error('[deepseek-orca] companion unavailable', error);
          try { stopLanguage(); } catch { /* ignore */ }
          try { if (feed) feed.dispose(); } catch { /* ignore */ }
          try { if (view) view.dispose(); } catch { /* ignore */ }
          view = undefined;
          feed = undefined;
        }
        return () => {
          try { stopLanguage(); } catch { /* ignore */ }
          try { if (feed) feed.dispose(); } catch { /* ignore */ }
          try { if (view) view.dispose(); } catch { /* ignore */ }
        };
      }, []);
      return h('div', { ref: hostRef, 'data-deepseek-orca': '' });
    }

    return function OrcaOverlay() {
      return h(OverlayBoundary, null, h(Pet, null));
    };
  }

  if (typeof window !== 'undefined') {
    window.__DeepSeekOrca__ = {
      SPECIES, SPECIES_ART, SPECIES_KEYS, ORCA_ART, ORCA_FACES, speciesArt, faceFor,
      MESSAGES, normalizeLanguage, translate,
      DEFAULT_PREFERENCES, cleanPreferences, clampPosition, STORAGE_KEY,
      OrcaMood, OrcaFeed, OrcaView, OrcaChime, PET_BASE_SIZE, VIEW_CSS,
      PLUGIN_ID, createOverlay,
    };
  }

  if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
    try {
      window.__ModuleLoader__.load({
        id: PLUGIN_ID,
        factory(require) {
          let React;
          try {
            React = require('react');
          } catch (error) {
            console.error('[deepseek-orca] React is unavailable', error);
            return { apply() {} };
          }
          return {
            inject: ['slots', 'locale'],
            apply(ctx) {
              try {
                const Overlay = createOverlay(React, ctx);
                ctx.slots.inject('shell.overlay', () => ctx.slots.register({
                  name: 'shell.overlay',
                  id: PLUGIN_ID,
                  order: 90,
                }, Overlay));
              } catch (error) {
                console.error('[deepseek-orca] could not register the overlay', error);
              }
            },
          };
        },
      });
    } catch (error) {
      console.error('[deepseek-orca] client module was rejected', error);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = (typeof window !== 'undefined' && window.__DeepSeekOrca__) || {};
  }
})();
