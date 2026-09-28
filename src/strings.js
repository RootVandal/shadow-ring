// All player-facing text. The coach speaks like a trainer in the corner:
// short, imperative, on "ты".

export const KIND = { jab: 'Джеб', cross: 'Кросс', hook: 'Хук', upper: 'Апперкот' };
export const KIND_LOWER = { jab: 'джеб', cross: 'кросс', hook: 'хук', upper: 'апперкот' };
export const SIDE = { left: 'левой', right: 'правой' };
export const DEFENSE_WORD = { slip: 'УКЛОН', duck: 'НЫРОК', guard: 'БЛОК' };

export const TIPS = {
  // Framing
  no_person: 'Встань перед камерой',
  too_far: 'Подойди на шаг ближе — плохо видно руки',
  too_close: 'Отойди на шаг назад',
  partial: 'Отойди назад: локти и кулаки должны быть в кадре',
  off_left: 'Сдвинься вправо — встань по центру',
  off_right: 'Сдвинься влево — встань по центру',
  dark: 'Темновато. Включи свет или встань лицом к окну',
  hold_still: 'Замри на секунду в стойке',

  // Guard
  guard_low_left: 'Левый кулак упал — подними к подбородку',
  guard_low_right: 'Правый кулак упал — подними к подбородку',
  guard_wide_left: 'Левый кулак далеко от лица — прижми к щеке',
  guard_wide_right: 'Правый кулак далеко от лица — прижми к щеке',
  guard_high_left: 'Левый кулак выше головы — опусти к подбородку',
  guard_high_right: 'Правый кулак выше головы — опусти к подбородку',
  guard_out_left: 'Левая рука вытянута — верни кулак к лицу',
  guard_out_right: 'Правая рука вытянута — верни кулак к лицу',
  guard_elbow_left: 'Левый локоть вниз, кулак вверх — предплечье стоит вертикально',
  guard_elbow_right: 'Правый локоть вниз, кулак вверх — предплечье стоит вертикально',
  guard_open: 'Руки упали! Кулаки к подбородку, иначе пропустишь всё',

  // Punch technique
  straight_short: 'Не довёл удар — выпрямляй руку до конца',
  straight_slow: 'Медленно. Прямой — как выстрел: резко вперёд и сразу назад',
  hook_short: 'Хук короткий — веди кулак по дуге через центр',
  hook_slow: 'Хук вялый — доворачивай корпус, бей резче',
  hook_straight_arm: 'Хук прямой рукой — это размах. Согни локоть под 90°',
  hook_low_elbow: 'Локоть ниже плеча — подними его: хук идёт горизонтально',
  upper_short: 'Апперкот снизу вверх: опусти кулак к груди и толкни до подбородка',
  upper_slow: 'Апперкот должен взрываться снизу — резче',
  upper_straight_arm: 'Апперкот бьётся согнутой рукой — не выпрямляй локоть',
  other_hand_dropped: 'Вторая рука ушла вниз — держи её у подбородка, пока бьёшь',
  no_return: 'Верни руку в стойку — вытянутая рука открывает голову',
  tired: 'Выдохся. Бей сериями по 2–3 удара и отдыхай в стойке',

  // Movements that looked like punches but weren't
  attempt_straight_short: 'Почти прямой — толкай кулак дальше вперёд, к камере',
  attempt_straight_slow: 'Это толчок, а не удар — выбрасывай руку резко',
  attempt_hook_short: 'Почти хук — шире дуга, проведи кулак через центр',
  attempt_hook_slow: 'Для хука не хватило скорости — резче разворот',
  attempt_upper_short: 'Почти апперкот — начни ниже, у груди, и толкай вверх',
  attempt_upper_slow: 'Апперкот должен быть взрывным — снизу резко вверх',

  // Defense lessons (after being hit)
  hit_straight_open: 'Пропустил прямой. От прямого — уклон в сторону или блок',
  hit_hook_open: 'Пропустил хук. От хука — нырок вниз или блок',
  hit_upper_open: 'Пропустил апперкот. От апперкота — уклон в сторону',
  hit_half_guard: 'Одна рука — полблока. Закрывайся двумя кулаками',
  hit_hook_slipped: 'Уклон от хука не спасает — ныряй вниз',
  hit_upper_ducked: 'Нырнул под апперкот — хуже не придумать. От него уходи в сторону',
  hit_upper_guard: 'Апперкот пробивает блок снизу — лучше уклон в сторону',
  slip_stale: 'Завис в уклоне. Уклон — в момент удара, потом сразу назад',
  duck_stale: 'Не сиди внизу: нырок в момент удара и сразу вверх',

  // Praise
  good_block: 'Блок держит. Теперь отвечай!',
  good_dodge: 'Ушёл! Бей сразу — контратака сильнее',
  good_counter: 'Контратака! Удар на треть сильнее',
  clean: '{kind} — чисто, {q}%',
};

/** Where the preview should point for a tip: which fist or elbow is wrong. */
export const TIP_FOCUS = {
  guard_low_left: { joint: 'wrist', side: 'left', to: 'guard' },
  guard_low_right: { joint: 'wrist', side: 'right', to: 'guard' },
  guard_wide_left: { joint: 'wrist', side: 'left', to: 'guard' },
  guard_wide_right: { joint: 'wrist', side: 'right', to: 'guard' },
  guard_high_left: { joint: 'wrist', side: 'left', to: 'guard' },
  guard_high_right: { joint: 'wrist', side: 'right', to: 'guard' },
  guard_out_left: { joint: 'wrist', side: 'left', to: 'guard' },
  guard_out_right: { joint: 'wrist', side: 'right', to: 'guard' },
  guard_elbow_left: { joint: 'elbow', side: 'left', to: 'down' },
  guard_elbow_right: { joint: 'elbow', side: 'right', to: 'down' },
  guard_open: { joint: 'wrist', side: 'both', to: 'guard' },
  hook_low_elbow: { joint: 'elbow', to: 'up' },
  hook_straight_arm: { joint: 'elbow' },
  upper_straight_arm: { joint: 'elbow' },
  straight_short: { joint: 'wrist' },
  other_hand_dropped: { joint: 'wrist', other: true, to: 'guard' },
  no_return: { joint: 'wrist', to: 'guard' },
};

export const UI = {
  title: 'Бой с тенью',
  tagline: 'Бокс через веб-камеру. Бьёшь по-настоящему — соперник чувствует. Тренер в углу видит каждую ошибку.',
  start: 'Выйти на ринг',
  privacy: 'Скелет считается прямо на устройстве, видео никуда не загружается. В онлайн-бою соперник видит твою камеру напрямую, без серверов — это выключается в настройках.',
  howTo: [
    ['01', 'Отойди от камеры на 1,5–2 м', 'чтобы в кадре были голова, плечи, локти и кулаки'],
    ['02', 'Прими стойку', 'кулаки у подбородка — так игра запомнит тебя'],
    ['03', 'Дальше — только руками', 'меню выбирается поднятой рукой, мышь не нужна'],
  ],
  loadingModel: 'Загружаем трекинг тела',
  startingCamera: 'Включаем камеру…',
  cameraErrors: {
    insecure: 'Камера работает только по https или на localhost. Открой игру по ссылке на деплой.',
    unsupported: 'Этот браузер не умеет в камеру. Нужен свежий Chrome, Edge, Firefox или Safari.',
    denied: 'Доступ к камере запрещён. Нажми на значок камеры в адресной строке → «Разрешить» и обнови страницу.',
    notfound: 'Камера не найдена. Подключи веб-камеру и попробуй снова.',
    busy: 'Камера занята другой программой (Zoom, Teams, OBS?). Закрой её и попробуй снова.',
    unknown: 'Не получилось включить камеру.',
  },
  retry: 'Попробовать снова',
  setupTitle: 'Встань в кадр',
  checks: { body: 'Ты в кадре', arms: 'Видны локти и кулаки', distance: 'Расстояние', light: 'Свет' },
  calibTitle: 'Прими стойку',
  calibText: 'Кулаки у подбородка, локти вниз. Замри на секунду — игра запомнит твою стойку.',
  calibDone: 'Стойка есть!',
  menuTitle: 'Выбери бой',
  handHint: 'Подними руку — появится перчатка-курсор. Задержи её на кнопке.',
  modes: {
    train: ['Разминка с тренером', 'Все удары и защита за 2 минуты. Тренер поправит технику.'],
    bot: ['Спарринг с Тенью', 'Бот, который телеграфирует удары и учится на твоих привычках.'],
    online: ['Онлайн-бой', 'Живой соперник из любой точки мира. У обоих по 100 HP.'],
    records: ['Рекорды', 'Лучшие бои и прогресс техники.'],
  },
  levels: { easy: ['Лёгкий', 'медленные удары, подсказки защиты'], normal: ['Средний', 'комбинации, читает привычки'], hard: ['Жёсткий', 'быстрый и хитрый'] },
  back: 'Назад',
  menu: 'В меню',
  rematch: 'Реванш',
  skip: 'Пропустить',
  settings: 'Настройки',
};
