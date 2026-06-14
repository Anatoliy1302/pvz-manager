import fs from 'fs';

const path = 'C:/pvz/src/i18n/locales/kk/legal.ts';

const content = `export default {
  privacy: {
    title: 'Құпиялылық саясаты',
    updated: 'Жаңартылды: {{date}}',
    emailSubject: 'ПВЗ персоналы — жеке деректер',
    sections: {
      general: {
        title: '1. Жалпы ережелер',
        p1: 'Осы Құпиялылық саясаты «{{appName}}» мобильді қосымшасының (бұдан әрі — Қосымша) пайдаланушыларының жеке деректерін өңдеу тәртібін сипаттайды.',
        p2: 'Жеке деректер операторы: {{operator}}.',
        p3: 'Қосымшаны пайдалана отырып, осы Саясаттың шарттарымен келісесіз. Келіспесеңіз, Қосымшаны пайдаланбаңыз.',
      },
      data: {
        title: '2. Біз қандай деректерді өңдейміз',
        intro: 'Қосымша жұмысы үшін мына деректер категориялары өңделуі мүмкін:',
        i1: '• сәйкестендіру деректері: аты, телефон нөмірі, жүйедегі рөл (ие, әкімші, қызметкер);',
        i2: '• жұмыс деректері: ауысымдар, кесте, сағаттар, есептеулер, төлемдер, айыппұлдар мен бонустар, ауысым өтініштері;',
        i3: '• байланыс деректері: ПВЗ ішкі чатындағы хабарламалар;',
        i4: '• техникалық деректер: хабарландырулар үшін құрылғы push-токені, бұлттық сервис арқылы кіру кезіндегі сессия деректері;',
        i5: '• сіздің таңдауыңызбен: профиль фотосы, биометриялық аутентификация деректері (Face ID / саусақ ізi) — тек құрылғыда жылдам кіру үшін;',
        i6: '• гeolokaciya функцияларын paydalanğanda — jumys auyсыmdary shembерinde koordinattar (ПВЗ иesi qосssa).',
      },
      purposes: {
        title: '3. Өңdeу мaқsatтары',
        intro: 'Дерекter myna maқsatтарда paydalanylady:',
        i1: '• Qosymshaga tirkeu jane kiru;',
        i2: '• PVZ personalynyn auysymdary men kestesin uiyymdastyrу;',
        i3: '• jumys uaqtyn jane esepteulерdi esepteu;',
        i4: '• qyzmetkerler arasynda habar almasu;',
        i5: '• auysymdar, otinishter jane habarlamalar turaly habarlandyruлар jiberu;',
        i6: '• qauipsizdik pen servistin turakty jumysyn qamtamasyz etu.',
      },
      storage: {
        title: '4. Дерекter kayda saqtalady',
        intro: 'Дерекter myna jerlerde saqtaluymy kn:',
        i1: '• qurylgynyzda qorgalgan saqtaуyshта lokaldy;',
        i2: '• Supabase bult infrastrukturasında (bult rejimi qosylgan jane telefonmen kirgende);',
        i3: '• Expo push-habarlandyruлар servisinin serverlerinde — tek habarlandyruлар jetkizu ushin qurylgı tokeni.',
        i4: 'PVZ iesi (jumys berushi) personaldy basqaru ushin Qosymshany paydalanu shemberinde qyzmetkerlerinin jumys derekterine qol jetkisedi.',
      },
      sharing: {
        title: '5. Ushinshi tulgalarga beru',
        p1: 'Biz jeke derekterdi jarnama jelilerine satpaimyz jane bermeymiz.',
        intro: 'Beru tek myna jagdayda mumkin:',
        i1: '• hosting pen habarlandyruлар jetkizudi qamtamasyz etetin texnikalyq seriktesterge (servis jumysy ushin qajet koleмde);',
        i2: '• zanama talaby boyynsha.',
      },
      retention: {
        title: '6. Saqtau merzimi',
        p1: 'Дерекter akkauntynyz belsendi jane Qosymsha paydalanylgan kezde, sondai-aq zanama talaptaryn oryndau jane esep jurgizu ushin qajet merzimde saqtalady.',
        p2: 'Akkaunt joyylgannan keyin nemese surau boyynsha derekter zanda ozgeshe kozdelmese, aqylga qylys merzimde joyylady nemese anonimdelenedi.',
      },
      rights: {
        title: '7. Sizdin quqyqtarynyz',
        intro: 'Jeke derekter turaly zanamaga saykes siz:',
        i1: '• ondeletin derekter turaly aqparat aluga;',
        i2: '• profilde derekterdi naqtylau nemese tuzetuge;',
        i3: '• push-habarlandyruлар men biometriyaga kelisimdi qurylgı men Qosymsha bapтаularы arqyly qaytaruga;',
        i4: '• derekterdi joy surauyn operatordyn baylanys email-ine jiberuge quqylysynyz.',
      },
      security: {
        title: '8. Qauipsizdik',
        p1: 'Biz qorgaunyn uyymdastyrushylyq jane texnikalyq sharalarын qoldanamyz: rolderdi bolu, derekterdi berudin qorgalgan arnalary (HTTPS), sezimtal derekterdi qurylgynyn qorgalgan saqtaуyshynda saqtau.',
        p2: 'Derekterdi beru nemese saqtauyn eshbir adisi absolutti qauipsizdikti kepidlemeydi, biraq biz aqparatty ruqsatsyz qol jetkizuden qorgauga tyrysamyz.',
      },
      children: {
        title: '9. Balalar',
        p1: 'Qosymsha 18 jasqa tolмаган adamdarga arnalmaган. Biz kameletke tolмаgandardyn derekterin sanaly turde jinamaymyz.',
      },
      changes: {
        title: '10. Sayasat ozgeristeri',
        p1: 'Biz osy Sayasatty jangarta alamyz. Aktualdy nusqa arqashan Qosymshada qoljetimdi. Ozgerister jariyalangannan keyin paydalanudy jalғastyrу jangartylgan redakciymen kelisudi bildiredi.',
      },
      contacts: {
        title: '11. Baylanys',
        p1: 'Jeke derekterdi ondeu meseleleri boyynsha {{operator}} operatoryna habarlasynyz:',
      },
    },
  },
} as const;
`;

fs.writeFileSync(path, content);
console.log('written');
