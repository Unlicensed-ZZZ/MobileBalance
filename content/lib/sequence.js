/* sequence.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для последовательного режима опроса учётных записей
 * Редакция:  2025.09.07
 *
*/

let Delay, dbVersion, sleep;                    // Глобальные переменные расширения (из модуля vars.mjs)
import('./../../vars.mjs').then( (module) => {
  Delay = module.Delay;
  dbVersion = module.dbVersion;
  MBResult = module.MBResult;    // Структура ответа на запрос по учётным данным провайдера
  sleep = module.sleep;
})
.catch( (err) => { console.log( `[MB] Error: ${err}` ) } );

async function importAwait() {  // Ожидание завершения импорта значений и функций из модуля
  do {                          // Нужно вызвать в первой инициализируемой функци с await
    await new Promise( resolve => setTimeout( resolve, 50 ) );
  } while ( sleep === undefined );
}

let workWin = 0;                // Объект окна результатов опроса
chrome.windows.getCurrent().then( result => { workWin = result; });
let workTab = 0;                // Объект рабочей вкладки результатов опроса в текущем окне
chrome.tabs.getCurrent().then( result => { workTab = result; });
let inProgress;                 // Статус активности опроса (true = идёт, false = не начат / прерван)
                                // При старте этого скрипта Service Worker должен устанановить его в 'true'
chrome.storage.local.get( 'inProgress' ).then( result => { inProgress = result.inProgress; } ); // Считываем из хранилища
let pStart, pFinish;            // Начало-завершение опроса
let repeatAttempts = 0;         // Количество повторов при неудачном / незавершённом запросе по учётным данным
let poolingWinAlive = false;    // Оставлять открытым окно результатов после завершения опроса
let poolingLogSave = false;     // Сохранять лог после закрытия окна опроса
let paintNegative = false;      // Выделять отрицательные занчения баланса цветом
let provider = [];              // Наборы параметров для провайдеров (plugin-ов)
let accounts = [];              // Наборы параметров для учётных записей
let pollingCycle = [];          // Структура элементов для проведения опроса
let currentNumber = 0;          // Текущие учётные данные в структуре для которых выполняется запрос
let userIntrusion = false;      // Установлена работа пользователя с кнопками окна опроса
let pauseRequested = false;     // Пользователем запрошена остановка опроса
let poolOnce = false;           // Выполнить один текущий запрос, после него отсановиться
// Блок переменных по разрешениям показа уведомлений (оповещений)
let ntfEnable = false, ntfOnError = false, ntfOnProcess = false, ntfOnUpdateDelay = false;


let consoleData = [];           // Массив для сбора сообщений из из консоли (через объект 'console')
function consoleWrap( originalFunction ) {
//       -----------
  return new Proxy( originalFunction, {
    apply( target, thisArg, args ) {
      consoleData.push( ( typeof args[ 0 ] === 'object' ) ? JSON.stringify( args[ 0 ], null, 2 ) : args[ 0 ] + '\r\n' );
      return Reflect.apply( target, thisArg, args );  // Передаём параметры и управление оригинальной функции
    }
  })
}
// Запускаем сбор сообщений из консоли в массиве 'consoleData' (замещаем методы 'console' изменёнными)
window.console.log   = consoleWrap( window.console.log );
window.console.error = consoleWrap( window.console.error );


let dbMB, dbTrnsMB, dbObjStorMB; // Переменные для работы со структурами indexedDB
// Подготавливаем структуры indexedDB к записи результатов запросов
let dbRequest = indexedDB.open( 'BalanceHistory', dbVersion );
dbRequest.onerror = function( evnt ) {
//        -------
  console.log( `[MB] ${evnt.target.error}` );
  pollingDuration.style.color = '#800000';
  pollingDuration.textContent += `${evnt.target.error}`;
  pollingEnd(); // Если не удалось открыть базу ('BalanceHistory') - выходим. Нет смысла проводить опрос
}
dbRequest.onsuccess = async function( evnt ) {
//        ---------
  dbMB = evnt.target.result;
  console.log( `[MB] IndexedDB '${dbMB.name}' opened successfully` );
}
dbRequest.onupgradeneeded = function( evnt ) {
//        ---------------
  console.log( `[MB] IndexedDB '${evnt.target.result.name}' upgrade needed` );
  pollingDuration.style.color = '#800000';
  pollingDuration.textContent += `${evnt.target.error}`;
  pollingEnd(); // Требуется обновление структуры хранилища ('Phones') - выходим, сначала нужно обновление
}


// Добавление новой записи о результате запроса в хранилище 'Phones'
function dbAddRecord( item ) {
//       -------------------
  return new Promise( (resolve, reject) => {
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
    dbObjStorMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    let result = dbObjStorMB.add( item );
    result.onerror = function( evnt ) {
      console.log(`[MB] ${evnt.target.error}`);
      reject( evnt.target.error );
    }
    result.onsuccess = function( evnt ) {
      dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
      // Обновляем количество записей в хранилище на странице настроек, если она открыта
      chrome.management.getSelf()    // Получаем параметры расширения
      .then( function( extnData ) {  // Ищем вкладку с адресом страницы его настроек
        chrome.tabs.query( { url: extnData.optionsUrl } )
        .then( function( result ) {  // Если страница нашлась - обновляем в ней количество записей в хранилище
          if ( result.length > 0 ) chrome.runtime.sendMessage( { message: 'MB_updateRecordsCount' } );
        })
        .catch( function( err ) { console.log( `[MB] Error occured: ${err}` ) } ) 
      })
      resolve( evnt.target.result );
    };
  });
}

// Получение последней записи о результате запроса в хранилище 'Phones'
function dbGetLastRecord( item ) {
//       -----------------------
  return new Promise( ( resolve, reject ) => {
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' ); // Открываем хранилище 'Phones'
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
    dbObjStorMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    let dbIdxMB = dbObjStorMB.index( 'PhoneNumber' );                   // Создаём курсор на индексе по 'PhoneNumber'
    dbCrsrMB = dbIdxMB.openCursor( IDBKeyRange.only( item ), 'prev' );  // По нему запросим последнюю запись = item
    dbCrsrMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    dbCrsrMB.onsuccess = function( evnt ) {
      let dbRec = evnt.target.result;
      if (dbRec) resolve( dbRec.value ) // Найдена запись, возвращаем её значение
      else       resolve( undefined );  // Записей c переданным значением item ещё нет
    }
  });
}

// Удаление в хранилище записей от текущей даты в пределах указанного периода времени
function dbDeleteSameDateRecords( item ) {
//       -------------------------------
  return new Promise( (resolve, reject) => {
    let sameRecordsFound = false; // Признак проведения операций удаления записей
    if ( deleteSameDateRecord > 0 ) { // Если в настройках удаление не установлено, то ничего не делаем
      let recDate; // Дата-время предыдущего запроса
      let curDate = Date.now(); // Текущие дата-время
      // Параметр периода для удаления (задан в часах) переводим в миллисекунды (3600000 = 60 * 60 * 1000)
      let deletePeriod = deleteSameDateRecord * 3600000;
      // Определяем порог даты: значение текущей даты в 00:00:00
      let thresholdDate = new Date().setHours( 0, 0, 0, 0 );

      dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
      dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
      dbObjStorMB.onerror = function( evnt ) {
        console.log( `[MB] ${evnt.target.error}` );
        reject( evnt.target.error );
      }
      let dbIdxMB = dbObjStorMB.index( 'PhoneNumber' ); // Создаём курсор на индексе по 'PhoneNumber'
      // По нему будем запрашивать самые последние (поздние) записи по loginValue (=PhoneNumber) текущих учётных данных
      dbCrsrMB = dbIdxMB.openCursor( IDBKeyRange.only( item ), 'prev' );
      dbCrsrMB.onerror = function( evnt ) {
        console.log( `[MB] ${evnt.target.error}` );
        reject( evnt.target.error );
      }
      dbCrsrMB.onsuccess = function( evnt ) {
        if ( !evnt.target.result ) { // Если в хранилище нет записей с loginValue текущих учётных данных, то выходим
          dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
          resolve( sameRecordsFound );
          return;
        }
        recDate = evnt.target.result.value.QueryDateTime; // Считываем дату-время запроса из найденной записи
        // Если дата запроса в найденной записи = текущей (в пределах порога от 00:00 до текущего времени),
        //   то определяем вхождение времени этого запроса в период, заданный в настройках для удаления
        if ( ( thresholdDate - recDate ) < 0 ) {
          if ( ( (curDate - thresholdDate) - (recDate - thresholdDate) ) < deletePeriod ) {
            evnt.target.result.delete( evnt.target.result.primaryKey ); // Удаляем запись
            sameRecordsFound = true; // Устанавливаем флаг - удаление записей производилось
            dbCrsrMB.result.continue(); // Берём следующую запись запроса по loginValue текущих учётных данных
          }
          else { // Время запроса найденной записи вне периода, заданного в настройках для удаления, выходим
            dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
            resolve( sameRecordsFound );
          }
        }
        else { // Дата запроса в найденной < текущей, выходим
          dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
          resolve( sameRecordsFound );
        }
      }
    }
    else
      resolve( sameRecordsFound );
  });
}


async function beforeunloadListener( evnt ) {
//             --------------------
  await pollingEnd( true );   // Инициируем завершение опроса с закрытием рабочих вкладок провайдеров
  if ( poolingLogSave )       // Если в настройках указано сохранение лога при закрытии окна опроса, то сохраняем его
    await savePollingLog();
};
// Устанвливаем контроль обновления страницы с 'passive = true' - не отменять поведение события по умолчанию
// Отменять поведение события по умолчанию для 'beforeunload' нельзя - появится 'alert'-запрос подтверждения закрытия страницы
window.addEventListener( 'beforeunload', beforeunloadListener, { passive: true } );

initCommonParams();


// Инициализация переменных из local storage
async function initCommonParams() {
//             ------------------
  await importAwait();  // Ожидание завершения импорта значений и функций из модуля
  do {  // Ждём, пока иницализируется объект доступа к хранилищу
    await sleep( 50 );
  } while ( dbMB === undefined );
  // Получаем значения из localStorage
  provider = (await chrome.storage.local.get( 'provider' )).provider;
  accounts = (await chrome.storage.local.get( 'accounts' )).accounts;
  repeatAttempts = (await chrome.storage.local.get( 'repeatAttempts' )).repeatAttempts;
  deleteSameDateRecord = (await chrome.storage.local.get( 'deleteSameDateRecord' )).deleteSameDateRecord;
  poolingWinAlive = (await chrome.storage.local.get( 'poolingWinAlive' )).poolingWinAlive;
  poolingLogSave = (await chrome.storage.local.get( 'poolingLogSave' )).poolingLogSave;
  paintNegative = (await chrome.storage.local.get( 'markNegative' )).markNegative;
  chrome.notifications.getPermissionLevel( async (level) => { // Если есть разрешение на показ уведомлений (оповещений)
    if (level === 'granted') {          // то считываем переменные. Иначе все переменные = false (при их инициализации)
      ntfEnable = (await chrome.storage.local.get( 'notificationsEnable' )).notificationsEnable;
      ntfOnError = (await chrome.storage.local.get( 'notificationsOnError' )).notificationsOnError;
      ntfOnProcess = (await chrome.storage.local.get( 'notificationsOnProcess' )).notificationsOnProcess;
      ntfOnUpdateDelay = (await chrome.storage.local.get( 'notificationsOnUpdateDelay' )).notificationsOnUpdateDelay;
    }
  });
  prepareCycle(); // Готовыим структуры для проведения опроса
  scrollDiv.focus(); // Преходим к таблице, чтобы можно было прокручивать её с клавиатуры
}


// Подготовка структуры для проведения опроса
async function prepareCycle() {
//             --------------
  let d;
  for (let i = 0; i < accounts.length; i++) {              // Формируем наборы параметров учётных данных в порядке,
    if ( accounts[ i ].maintain )                          //   указанном в настройках (последовательный опрос)
      pollingCycle.push( accounts[ i ] );                  //   Копируем только записи, включённые в опрос
  }
  for (let i = 0; i < Object.entries(pollingCycle).length; i++) { // Обогащаем наборы параметрами из общих настроек:
    pollingCycle[ i ].repeatAttempts = repeatAttempts + 1; //   количество повторов при неудачном / незавершённом запросе
                                                           // Добавляем рабочие параметры для запроса:
    pollingCycle[ i ].inDelay = false;                     //   пауза между запросами к провайдеру активна
    pollingCycle[ i ].requestStage = 0;                    //   счётчик текущей части запроса
    pollingCycle[ i ].success = false;                     //   признак успешного завершения запроса
    pollingCycle[ i ].loginText = pollingCycle[ i ].loginValue; //   поле для отображения логина в таблице результатов
    // Если значение логина (номера) похоже на номер телефона, то форматируем поле для отображения логина
    if ( (pollingCycle[ i ].loginValue.length === 10) && Number.isInteger( Number(pollingCycle[ i ].loginValue) ) )
      pollingCycle[ i ].loginText = `(${pollingCycle[ i ].loginValue.slice(0,3)}) ` +
                                    `${pollingCycle[ i ].loginValue.slice(3,6)}-` +
                                    `${pollingCycle[ i ].loginValue.slice(6,8)}-` +
                                    `${pollingCycle[ i ].loginValue.slice(8)}`;
    pollingCycle[ i ].result =                             //   структура-заготовка для результата запроса
      Object.assign( new Object(), MBResult );
    pollingCycle[ i ].result.PhoneNumber =                 //   заполняем в результате запроса поле логина
      pollingCycle[ i ].loginValue;
    pollingCycle[ i ].respondTimeout =                     //   событие для таймера отклика с рабочей вкладки
      new CustomEvent( 'respondTimeout', { detail: { idx: i, account: pollingCycle[ i ] }, bubbles: true } );
    pollingCycle[ i ].сontrolTimeout = null;               //   экземпляр запущенного таймера таймаута
    pollingCycle[ i ].lastState = 'Order';                 //   последнее состояние учётных данных в ходе опроса
    pollingCycle[ i ].htmlTableRowId = '';                 //   идентификатор строки в таблице для отображения
  }

  provider.forEach( async function( item ) {               // Добавляем рабочие параметры в наборы настроек провайдера
    item.pullingTab = -1;                                  //   идентификатор рабочей вкладки для запросов
    item.requestDelayTimer = null;                         //   экземпляр таймера задержки между запросами
    if ( item.helperFile === undefined )                   //   Имя вспомогательного модуля, если не объявлен - создаём
      item.helperFile = ''                                 //     со значением пустой строки
    else {                                                 //   Если вспомогательный модуль для провайдера указан, то
      if ( item.helperFile !== '' ) {
        await fetch( `/providers/${item.helperFile}`, { method: 'HEAD' } )
                                                           //   если файл модуля обнаружен - создаём элемент 'helperFunc'
        .then( () => {                                     //     со значением 'null', в него будет занесена ссылка на
          item.helperFunc = null;                          //     импортированную из модуля функцию
        })
        .catch( ( err ) => {                               //   если файл с таким именем или по такому пути не найден,
          console.log( `[MB] Helper-file "/providers/${item.helperFile}" for provider "${item.description}" error: ${err}` );
          item.helperFile = '';                            //     то создаём позицию 'helperFile' со значением = ''
        });
      }
    }
    // Если определён список внешних модулей-библиотек, то замещаем элементы массива этого списка объектами в формате
    //   { 'имя_фала_1': { moduleFile: 'имя_фала_1', moduleFunc: null, }, ...
    //     'имя_фала_N': { moduleFile: 'имя_фала_N', moduleFunc: null, } }
    // Модули библиотек должны находиться в папке расширения '/providers/modules'
    // В moduleFile элементов объекта - имена файлов модулей-библиотек, в moduleFunc будут занесены ссылки
    //   на функции, экспортируемые этими модулями
    d = {};
    if ( item.modules !== undefined ) {
      for( let i of item.modules ) {
        d[ i ] = { moduleFile: i, moduleFunc: null };
        await fetch( `/providers/modules/${i}`, { method: 'HEAD' } )
        .catch( ( err ) => {                               //     если файл с таким именем или по такому пути не найден,
          console.log( `[MB] Module-file "/providers/modules/${i}" for provider "${item.description}" error: ${err}` );
          d[ i ].moduleFile = '';                          //     то замещаем значение 'moduleFile' значением = ''
        });
      }
      item.modules = d;
    }
  });

  d = new Date();
  document.getElementById( 'poolingPageTitle' ).textContent += // Проставляем дату выполнения опроса
            `    ${(d.getDate() < 10) ? '0' + String(d.getDate()) : String(d.getDate())}.` +
            `${(d.getMonth() < 9) ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
            `${String(d.getFullYear())}`;
  currentNumber = assignCurrentNumber( -1 ); // Определяем первую запись структуры для проведения запроса
  if ( currentNumber < 0 ) {                 // Если нет учётных данных для опроса, то завершаем его
    console.log(`[MB] No login data`);
    pollingStart.style.color = '#800000';
    pollingStart.textContent += 'Нет учётных данных данных для опроса';
    pollingEnd();
  }
  else { // Запуск основного цикла опроса по сообщениям
    await drawPollingItems();                              // Отрисовка учётных записей из состава опроса
    pStart = await drawPollingTime( 'pollingStart' );      // Отрисовка времени начала опроса
    chrome.runtime.onMessage.dispatch( { message: 'MB_pullingTab_new' },
                                       { tab: null, id: self.location.origin }, null );
  }
}


// Проверка структуры для опроса (pollingCycle) на записи с незаконченным запросом
function checkUncompleteRequests() {
//       -------------------------
  let uncompleteArr = [];
  pollingCycle.forEach( function( item, index ) {
   if ( !item.success && (item.repeatAttempts > 0) )
     uncompleteArr.push( index );
  });
  if ( uncompleteArr.length === 0)
    return undefined
  else
    return uncompleteArr;
}


// Проверка структуры для опроса (pollingCycle) на записи с неуспешным запросом
function checkTroubleRequests() {
//       ----------------------
  let troubleArr = [];
  pollingCycle.forEach( function( item, index ) {
   if ( [ 'Fail', 'Error', 'Timeout' ].includes( item.lastState ) )
     troubleArr.push( index );
  });
  if ( troubleArr.length === 0)
    return undefined
  else
    return troubleArr;
}


// Отрисовка учётных записей из состава опроса
function drawPollingItems() {
//       ------------------
  let tableBody = document.getElementById( 'pollingItems' );
  pollingCycle.findIndex( function( item, index ) {
    item.htmlTableRowId = String(index);
    let tableRow = document.createElement( 'tr' );
    tableRow.id = item.htmlTableRowId;
    tableRow.onclick = selectRow;  // selectRow - функция из файла table.js, подключён в html
    tableBody.insertAdjacentElement( 'beforeend', tableRow );
    // Создаём ячейки для строки учётных данных (заголовок: 'Статус', 'Название', 'Номер (логин)' 'Баланс/Кредит', 'Дельта',
    for ( let i = 0; i < 15; i++ ) {                     // 'Не менялся', 'Баланс2/Баланс3', 'SMS', 'Минуты', 'Интернет', 'Блок.',
      let tableCell = document.createElement( 'td' );    // 'До (дата)', 'Услуги', 'Провайдер', 'Получено' )
      switch( i ) {
        case 0: { // Исходный статус записей - в ожидании запроса
          let stateImg = document.createElement( 'img' );
          stateImg.src = '../images/Order.svg';
          stateImg.alt = 'icon';
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-state';
          tableCell.insertAdjacentElement( 'beforeend', stateImg );
          stateImg = document.createElement( 'span' );
          stateImg.style.fontSize = 'x-small';
          stateImg.style.fontWeight = 'bold';
          tableCell.insertAdjacentElement( 'beforeend', stateImg );
          break; }
        case 1: { // Название учётных данных
          tableCell.textContent = item.description;
          break; }
        case 2: { // Логин учётных данных (номер)
          tableCell.style.textAlign = 'center';
          tableCell.textContent = item.loginText;
          break; }
        case 3: { // Поля баланса для учётных данных / кредита при наличии в тарифе (пустые до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.style.fontWeight = 'bold';
          tableCell.id = item.htmlTableRowId + '-balance';
          tableCell.textContent = '';
          break; }
        case 4: { // Поле отличия значения баланса от значения предыдущего запроса (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-delta';
          tableCell.textContent = '';
          break; }
        case 5: { // Поле количества дней в течение которых баланс не изменялся (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-noChange';
          tableCell.textContent = '';
          break; }
        case 6: { // Значения полей 'Balance2' / 'Balance3' при наличии в тарифе (пустые до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-bal23';
          tableCell.textContent = '';
          break; }
        case 7: { // Поле SMS для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-sms';
          tableCell.textContent = '';
          break; }
        case 8: { // Поле минут для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-minutes';
          tableCell.textContent = '';
          break; }
        case 9: { // Поле интернета для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-internet';
          tableCell.textContent = '';
          break; }
        case 10: { // Поле даты завершения оплаченного периода для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-turnOffStr';
          tableCell.textContent = '';
          break; }
        case 11: { // Поле статуса блокировки для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-blockStatus';
          tableCell.textContent = '';
          break; }
        case 12: { // Поле состава услуг для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-uslugiOn';
          tableCell.textContent = '';
          break; }
        case 13: { // Поле логотипа провайдера учётных данных. Если его нет, то ставим картинку по умолчанию
          let pIdx = provider.findIndex( function( pItem ) { // Определяем провайдера для текущих учётных данных
            if ( pItem.name === item.provider ) return true;
          });
          let providerImg = document.createElement( 'img' );
          providerImg.style.height = '24px';
          providerImg.alt = 'icon';
          providerImg.src = ( ( pIdx < 0 ) || ( provider[ pIdx ].icon === '' ) ) ?
            'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23333333" style="transform:rotate(90deg);"%3E \
            %3Cpath d="M9.75 10C8.23122 10 7 11.2312 7 12.75V16.25C7 17.7688 8.23122 19 9.75 19H14.25C15.7688 19 17 17.7688 17 16.25V12.75C17 11.2312 15.7688 10 14.25 10H9.75ZM8.5 12.75C8.5 12.0596 9.05964 11.5 9.75 11.5H12V14H8.5V12.75ZM8.5 15.5H12V17.5H9.75C9.05964 17.5 8.5 16.9404 8.5 16.25V15.5ZM13.5 17.5V11.5H14.25C14.9404 11.5 15.5 12.0596 15.5 12.75V16.25C15.5 16.9404 14.9404 17.5 14.25 17.5H13.5Z"/%3E \
            %3Cpath d="M7.25 2C5.45507 2 4 3.45507 4 5.25V18.75C4 20.5449 5.45507 22 7.25 22H16.75C18.5449 22 20 20.5449 20 18.75V9.28553C20 8.42358 19.6576 7.59693 19.0481 6.98744L15.0126 2.9519C14.4031 2.34241 13.5764 2 12.7145 2H7.25ZM5.5 5.25C5.5 4.2835 6.2835 3.5 7.25 3.5H12.7145C13.1786 3.5 13.6237 3.68437 13.9519 4.01256L17.9874 8.0481C18.3156 8.37629 18.5 8.82141 18.5 9.28553V18.75C18.5 19.7165 17.7165 20.5 16.75 20.5H7.25C6.2835 20.5 5.5 19.7165 5.5 18.75V5.25Z"/%3E \
            %3C/svg%3E' : provider[ pIdx ].icon;
          tableCell.style.textAlign = 'center';
          tableCell.style.verticalAlign = 'middle';
          tableCell.insertAdjacentElement( 'beforeend', providerImg );
          break; }
        case 14: { // Поле времени выполнения запроса по учётным данным (пустое до завершения запроса)
          tableCell.id = item.htmlTableRowId + '-time';
          tableCell.textContent = '';
          break; }
      } /* switch */
      tableRow.insertAdjacentElement( 'beforeend', tableCell );
    }
    return false; // По всем значениям возвращаем false, чтобы пройти по всем элементам
    });
}


// Отрисовка состояния учётных данных
function drawPoolingState( item, state, stage = '' ) {
//       -------------------------------------------
  let stageCell = document.getElementById(String(item) + '-state');
  stageCell.childNodes[0].src = `../images/${state}.svg`;
  stageCell.childNodes[1].textContent = stage;
}


// Отрисовка времени начала и завершения опроса
function drawPollingTime( item ) {
//       -----------------------
  let time = new Date( (Number( (new Date() / 1000).toFixed(0) ) * 1000 )); // Округляем мс, чтобы не сбивали отображение
  document.getElementById( item ).textContent +=
    `${(time.getHours() < 10) ? '0' + String(time.getHours()) : String(time.getHours())}:` +
    `${(time.getMinutes() < 10) ? '0' + String(time.getMinutes()) : String(time.getMinutes())}:` +
    `${(time.getSeconds() < 10) ? '0' + String(time.getSeconds()) : String(time.getSeconds())}`;
  return time;
}


// Отрисовка продолжительности опроса
function drawPollingDuration( start, finish, item ) {
//       ------------------------------------------
  let time = new Date( finish - start );
  document.getElementById( item ).textContent += `  (` +
    `${(time.getMinutes() < 10) ? '0' + String(time.getMinutes()) : String(time.getMinutes())}:` +
    `${(time.getSeconds() < 10) ? '0' + String(time.getSeconds()) : String(time.getSeconds())})`;
  return time;
}


// Завершение опроса, обработка результатов
async function pollingEnd( force = false ) {  // 'force' = 'true' - вкладка результатов опроса закрывается пользователем
//             ---------------------------
  currentNumber = assignCurrentNumber( -1 );              // Проверяем отсутствие записей с незавершёнными запросами
  if ( force || currentNumber < 0 ) {                     // Если все записи в структуре запросов уже были обработаны, то ...
    if ( !force ) // При старте из  обработчика 'beforeunload' запись в localStorage не работает (скрипт падает) Но это и не нужно.
                  //   Если inProgress останется = 'true', то расширенияе поймёт, что запрос был прекращён до его завершения
      await chrome.storage.local.set( { inProgress: inProgress = false } ); // ... сбрасываем статус активности опроса
    setRequestButtons();                                  // ... устанавливаем состояния кнопок управления опросом
    // Актуализируем доступность кнопок запуска опроса в popup-окне и кнопки восстановления
    //   исходных значений ("ремонта") расширения в окне options (если эти окна открыты)
    chrome.runtime.sendMessage( { message: 'MB_actualizeControls' } ) // Если эти окна не открыты, то не будет и кода обработки
    .catch( function() {} );                                          // приёма сообщений от них - снимаем ошибку канала связи
    if ( force || !userIntrusion ) {      // Если пользователь закрывает вкладку результатов опроса / всё окно или пользователь
                                          //   не вмешивался в ход опроса ...
      pFinish = drawPollingTime( 'pollingFinish' );             // ... вычисляем и отображаем время завершения опроса
      drawPollingDuration( pStart, pFinish, 'pollingFinish' );  // ... вычисляем и отображаем продолжительность опроса
      if ( force || !poolingWinAlive ) {  // Если пользователь закрывает вкладку результатов опроса / всё окно или в настройках указано
                                          //   не оставлять его открытым после завершения опроса ('poolingWinAlive' = 'false') ...
        window.removeEventListener( 'beforeunload', beforeunloadListener ); // ... снимаем контроль закрытия вкладки результатов опроса ...
        console.log( `[MB] Finising pooling prosess...` );
        dbMB.close();                                                       // ... закрываем базу ('BalanceHistory') ...
        console.log( `[MB] IndexedDB '${dbMB.name}' closed` );

        let promiseArr = await closingTabs();   // Собираем в массив все promise закрытия рабочих вкладок провайдеров
        Promise.allSettled( promiseArr )        // Контролируем завершение исполнения всех этих promise и только после этого ...
  /* ---- Код .then() ниже выполнится только для закрытия вкладки результатов опроса по опции настроек 'poolingWinAlive' = 'false'.
          Вызов 'pollingEnd' из обработчика 'beforeunload' происходит при уже инициированной браузером процедуре закрытия рабочей вкладки
          опроса. При этом при закрытии всего окна инициируются и вызовы закрытия для всех ещё активных рабочих вкладок провайдеров.
          При закрытии рабочей вкладки опроса дождаться перехода promise закрытия рабочих вкладок провайдеров в статус 'fulfilled'
          возможно. Но далее для обоих случаев (закрытие вкладки или окна) дополнительные действия, в частности сохранение лога,
          реализовать не получается. Процесс закрытия для рабочей вкладки завершается до попыток сохранения лога.
  */    .then( async function() {
          if ( poolingLogSave )                 // Если в настройках указано сохранение лога при закрытии окна опроса, то сохраняем его
            await savePollingLog();
          await chrome.tabs.remove( workTab.id )                            // ... закрываем вкладку результатов опроса
          .catch( async ( err ) => {            // Обрабатываем ошибку 'Tabs cannot be edited right now (user may be dragging a tab).'
            if ( err.message.includes( '(user may be dragging a tab)' ) ) {
              await sleep( 100 );               // После паузы повторяем закрытие вкладки результатов опроса
              await chrome.tabs.remove( workTab.id )
              .catch( function( err ) {} );     // Ошибки (если будут) в этот раз снимаем, чтобы они не остановили работу скрипта
            }
          })
        });
      }
    }
  }
  else { // Если обнаружены записи с незавершёнными запросами - возвращаемся их опрашивать
    await chrome.runtime.onMessage.dispatch( { message: 'MB_pullingTab_new' }, { tab: null, id: self.location.origin } );
  }
}


// Закрытие рабочих вкладок запросов к провайдерам
function closingTabs() {
//       -------------
  let promiseArr = [];                              // Все promise завершающих действий собираем в массив
  provider.forEach( ( item, index ) => {            // Для каждой записи провайдера ...
    if ( item.pullingTab >= 0 ) {                   // ... если для него открывалась рабочая вкладка для запросов ...
      promiseArr.push(
        chrome.tabs.remove( item.pullingTab )       // ...закрываем эту рабочую вкладку ...
        .catch( async ( err ) => {  // Обрабатываем ошибку 'Tabs cannot be edited right now (user may be dragging a tab).'
          if ( err.message.includes( '(user may be dragging a tab)' ) ) {
            await sleep( 100 ); // После паузы повторяем закрытие рабочей вкладки
            await chrome.tabs.remove( item.pullingTab )
            .catch( function( err ) {   // Ошибки (если будут) в этот раз снимаем, чтобы они не остановили работу скрипта, ...
              console.log( `[MB] Error closing tab for '${item.description}': ${err}`);   // ... но в консоли их покажем
            });
          }
          else  // Прочие ошибки пропускаем. Если рабочая вкладка была ранее принудительно закрыта, то тоже
                //   будет ошибка. Игнорируем её - нам такой результат и нужен, но в консоли ошибку покажем
            console.log( `[MB] Error closing tab for '${item.description}': ${err}`);
        }) /* catch */
      ); /* push */
    }
  });
  console.log( `[MB] Closing polling tabs...` );
  // Возвращаем массив всех promise для контроля их исполнения
  return promiseArr;
}


// Получение следующей записи учётных данных для запроса
async function getNextNumber() {
//             ---------------
  if ( pauseRequested || poolOnce ) {   // Пользователь запросил остановку запроса или запрос единичный
    await chrome.storage.local.set( { inProgress: inProgress = false } ); // Сбрасываем статус активности опроса
    setRequestButtons();                // Установка состояния кнопок управления опросом
    // Актуализируем (если окна открыты) доступность кнопок запуска опроса в popup-окне и
    //   восстановления исходных значений расширения в окне options
    chrome.runtime.sendMessage( { message: 'MB_actualizeControls' } ) // Если открытых окон нет,
    .catch( function() {} ); // то нет и кода обработки приёма сообщений - снимаем ошибку канала связи
  }
  else {
    if ( (pollingCycle.findIndex( function( item ) { return (item.inDelay) ? true : false } ) ) < 0) {
      // Если нет учётных данных, ожидающих завершения задержки запросов к провайдеру...
      if ( (pollingCycle[ currentNumber ].lastState === 'Fail') && ntfEnable && ntfOnError )
        throwNotification( pollingCycle[ currentNumber ], 'Fail', { body: 'Ошибка запроса данных' } );
      currentNumber = assignCurrentNumber( currentNumber ); // ...получаем следующую учётную запись для запроса
      if ( currentNumber < 0 )                              // Если её нет, то завершаем опрос
        pollingEnd()
      else { // Если есть, то продолжаем с запросом по следующей записи учётных данных
        await chrome.runtime.onMessage.dispatch( { message: 'MB_pullingTab_new' }, { tab: null, id: self.location.origin } );
      }
    }
  }
}


// Определить очередной элемент для запроса (возвращает индекс в pollingCycle / -1 = нет записи для запроса)
function assignCurrentNumber( paramNumber ) {
//       ----------------------------------
  // Если проход по структуре завершён (paramNumber = последняя запись), начинаем с начала структуры
  let result = (paramNumber >= (pollingCycle.length - 1)) ? -1 : paramNumber;
  // Выбираем записи со следующей и до конца структуры. Берём те, по которым запрос ещё не был успешен и
  //   у них ещё есть попытки повторов по неудачному / незавершённому запросу, и которые не находятся в
  //   ождании завершения задержки запроса к провайдеру
  result = pollingCycle.findIndex( function( item, index ) {
    if ( ( index <= result ) || ( item.inDelay ) || ( item.success ) || ( item.repeatAttempts === 0 ) )
      return false  // Если ничего не найдётся, то будет возвращёно -1
    else {
      return true;  // Элемент определён, возвращаем его индекс
    }
  });
  return result;
}


// Установка и запуск задержки между запросами к провайдеру
async function setRequestDelay( pIdx ) {
//             -----------------------
  pollingCycle.findIndex( function( item, index ) {              // Ставим признак задержки между запросами в
    if (( item.provider === provider[ pIdx ].name ) &&           // записях учётных данных по этому провайдеру,
        ( ( !item.success ) && ( item.repeatAttempts > 0 ) )) {  // у которых запрос ещё не был успешен и ещё есть
        item.inDelay = true;                                     // попытки повторов по неудачному / незавершённому запросу
        drawPoolingState( index, 'Await' );
    }
    return false; // По всем значениям возвращаем false, чтобы пройти по всем элементам
  });
  // Запускаем таймер задержки между запросами к провайдеру (сохраняем его в данных по этому провайдеру)
  provider[ pIdx ].requestDelayTimer =
    setTimeout(
      function() { // Эта функция отработает после завершения времени по таймеру
        removeRequestDelay( pIdx ); // Снимаем таймер задержки между запросами к провайдеру
        pollingCycle.findIndex( function( item, index ) {            // Снимаем признак активности задержки между запросами
          if (( item.provider === provider[ pIdx ].name ) && item.inDelay ) {
            item.inDelay = false;
            let ra = ( ['Error', 'Timeout'].includes( item.lastState ) ) ? String( item.repeatAttempts ) : '';
            drawPoolingState( index, item.lastState, ra );
          }
          return false; // По всем значениям возвращаем false, чтобы пройти по всем элементам
        });
        chrome.runtime.onMessage.dispatch( { message: 'MB_requestDelayComplete', pIdx: pIdx },
                                           { tab: null, id: self.location.origin }, null );
      }, Delay * provider[ pIdx ].requestDelayValue );
  try {
    await chrome.scripting.insertCSS( { target: { tabId: provider[ pIdx ].pullingTab },
                                        files: [ `./options/lib/modal.css` ] });
  } catch( err ) {
    console.log( `[MB] Couldn't inject CSS (for delay banner)\n${err}`);
    pollingCycle.findIndex( function( item, index ) {            // Снимаем признак активности задержки между запросами
      if (( item.provider === provider[ pIdx ].name ) && item.inDelay ) {
        item.inDelay = false;
        let ra = ( ['Error', 'Timeout'].includes( item.lastState ) ) ? String( item.repeatAttempts ) : '';
        drawPoolingState( index, item.lastState, ra );
      }
      return false; // По всем значениям возвращаем false, чтобы пройти по всем элементам
    });
  }
  try {
    await chrome.scripting.executeScript( { target: { tabId: provider[ pIdx ].pullingTab },
                                            files: [ `./content/lib/delayBanner.js` ] });
  } catch( err ) {
    console.log( `[MB] Couldn't inject script (for delay banner)\n${err}`);
    pollingCycle.findIndex( function( item, index ) {            // Снимаем признак активности задержки между запросами
      if (( item.provider === provider[ pIdx ].name ) && item.inDelay ) {
        item.inDelay = false;
        let ra = ( ['Error', 'Timeout'].includes( item.lastState ) ) ? String( item.repeatAttempts ) : '';
        drawPoolingState( index, item.lastState, ra );
      }
      return false; // По всем значениям возвращаем false, чтобы пройти по всем элементам
    });
  }
}

// Снять таймер задержки между запросами к провайдеру
async function removeRequestDelay( pIdx ) {
//             --------------------------
  clearTimeout( provider[ pIdx ].requestDelayTimer );
  provider[ pIdx ].requestDelayTimer = null;
}


// Контроль времени поступления отклика с рабочей вкладки для запроса к провайдеру
async function respondTimeout( evnt ) {
//             ----------------------
  let pIdx = provider.findIndex( function( item ) { // Определяем провайдера для текущих учётных данных
    if ( item.name === evnt.detail.account.provider ) return true;
  });
  evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
  evnt.detail.account.сontrolTimeout = 
    setTimeout(
      function() { // Эта функция отработает после завершения времени по таймеру
        removeTimeoutControl( currentNumber ); // Снимаем таймер таймаута по ответу
        chrome.runtime.onMessage.dispatch( { message: 'MB_workTab_respondTimeout', idx: evnt.detail.idx },
                                           { tab: null, id: self.location.origin }, null );
        let ra = (pollingCycle[ currentNumber ].repeatAttempts > 0) ? // Отражаем статус запроса и оставшиеся попытки
                 String(pollingCycle[ currentNumber ].repeatAttempts) : '';
        pollingCycle[ currentNumber ].lastState = (pollingCycle[ currentNumber ].repeatAttempts > 0) ? 'Timeout' : 'Fail';
        drawPoolingState( currentNumber, pollingCycle[ currentNumber ].lastState, ra );
        return true;
      }, Delay * provider[ pIdx ].respondTimeoutValue );
}

// Запустить таймер таймаута по ответу
async function addTimeoutControl( item ) {
//             -------------------------
  window.addEventListener( 'respondTimeout', respondTimeout );    // Устанавливаем таймер таймаута по ответу
  window.dispatchEvent( pollingCycle[ item ].respondTimeout );
}

// Снять таймер таймаута по ответу
async function removeTimeoutControl( item ) {
//             ----------------------------
  clearTimeout( pollingCycle[ item ].сontrolTimeout );
  window.removeEventListener( 'respondTimeout', respondTimeout ); // Снимаем таймер таймаута по ответу
  pollingCycle[ item ].сontrolTimeout = null;
}


// Контроль завершения обновления страницы на вкладке запроса к провайдеру (по событию chrome.webNavigation.onCompleted)
async function waitPullingTabLoading( details ) {
//             --------------------------------
  // Если это событие пришло 1) при открытии вкладки (url = 'chrome://newtab/'), а не при инициализации запроса
  //                         2) не от самой основной страницы (frameId = 0), а от фрейма в ней (frameId > 0)
  if ( details.url.includes( 'newtab' ) || ( details.frameId > 0 ) )
    return false;            // ...то выходим, это событие нам не нужно
  let idx = provider.findIndex( function( item ) { // Определяем рабочую вкладку провайдера-инициатора
    if ( item.pullingTab === details.tabId ) return true;
  });
  // Если это событие пришло от вкладки текущего запроса (на страницах уже открытых вкладкок могут продолжаться обновления)
  if ( ( idx >= 0 ) && ( provider[ idx ].name === pollingCycle[ currentNumber ].provider ) ) {
    chrome.webNavigation.onCompleted.removeListener( waitPullingTabLoading );    // Снимаем контроль обновления вкладки
    if ( provider[ idx ].respondTimeout ) removeTimeoutControl( currentNumber ); // Снимаем таймер таймаута по ответу
    if ( provider[ idx ].onUpdateDelay )
      await sleep ( Delay * provider[ idx ].onUpdateDelayValue ); // Задержка для догрузки контента рабочей вкладки
    chrome.runtime.onMessage.dispatch( { message: 'MB_pullingTab_ready' },
                                       { tab: null, id: self.location.origin }, null );
    return true;
  }
  else return false;
}


chrome.tabs.onActivated.addListener( async function( activeInfo ) { // Ловля ошибки 'Tabs cannot be edited right now (user may be dragging a tab).'
//---------------------------------
// При активации вкладки симулируем её перемещение (перемещаем её в ту же позицию, где она и была)
// Если событие было вызвано активацией вкладки, уже вызвавшей ошибку, то она будет зафиксирована и не пойдёт дальше
  await chrome.tabs.move( activeInfo.tabId, { index: (await chrome.tabs.get( activeInfo.tabId )).index } )
  .then( () => {} )
  .catch( ( err ) => {
    if ( !err.message.includes( '(user may be dragging a tab)' ) )
      throw err; // Пробрасываем ошибки, отличные от 'Tabs cannot be edited right now (user may be dragging a tab).'
  })
})


// Основной цикл работы с запросами по сообщениям
chrome.runtime.onMessage.addListener(
  async function( request, sender, sendResponse ) {
    switch( request.message ) {
      case 'MB_pullingTab_new': { // Открыть на рабочей вкладке страницу провайдера для обработки
        if ( sendResponse ) sendResponse( 'done' );
        if ( pauseRequested ) { // Пользователем запрошена остановка опроса, запрос не запускаем
          return true; // Заканчиваем работу функции
          break;
        }
        let errTabsAPI = false; // Контроль ошибок при обращениях к chrome.tabs
        // Если активна задержка запросов к провайдеру новый запрос не запускаем
        if ( pollingCycle.findIndex( function( item ) { return (item.inDelay) ? true : false } ) >= 0) {
          return true; // Заканчиваем работу функции
          break;
        }
        pollingCycle[ currentNumber ].requestStage = 0;       // Сброс счётчика частей запроса
        pollingCycle[ currentNumber ].success = false;        // Сброс статуса опроса для запрашиваемых учётных данных
        let idx = provider.findIndex( function( item ) {      // Определяем провайдера для текущих учётных данных
          return ( pollingCycle[ currentNumber ].provider === item.name )
        });
        if ( idx < 0 ) { // Если указанного провайдера нет (он был удалён, а в учётных данных не изменён), то pIdx = -1
          pollingCycle[ currentNumber ].lastState = 'Fail';   // Устанавливаем для учётных данных статус ошибки запроса
          pollingCycle[ currentNumber ].repeatAttempts = 0;   // Сбрасываем счётчик количества попыток запросов
          await drawPoolingState( currentNumber, 'Fail' );    // Отрисовка статуса запроса для строки учётных данных
          console.log( `[MB] Provider defined for "${pollingCycle[ currentNumber ].description}" does not exist`);
          await getNextNumber();                              // Получаем учётные данные для следующего запроса
          return true; // Заканчиваем работу функции
          break;
        }
        if ( provider[ idx ].pullingTab < 0 ) {               // Открываем новую рабочую вкладку для запросов к провайдеру
          await chrome.tabs.create( { active: false } )
          .then( function( result ) {
            provider[ idx ].pullingTab = result.id;           // Сохраняем 'id' вкладки провайдера в объекте его параметров
          })
          .catch( async function( err ) {
            if ( err.message.includes( '(user may be dragging a tab)' ) ) {
              errTabsAPI = true;
              await sleep( 100 ); // После паузы повторяем действие с учётными данными
              await chrome.runtime.onMessage.dispatch( { message: request.message }, { tab: null, id: self.location.origin } );
            }
            else throw err; // Пробрасываем ошибки, отличные от 'Tabs cannot be edited right now (user may be dragging a tab).'
          });
          if ( errTabsAPI ) return true; // При ошибках chrome.tabs заканчиваем работу функции
        }                                                     // ...пропускаем её создание, если вкладка уже есть
        try { // Открываем на рабочей вкладке для запросов к провайдеру его стартовую страницу
          await chrome.tabs.update( provider[ idx ].pullingTab, { url: provider[ idx ].startUrl, autoDiscardable: false } )
          .catch( async function( err ) {
            if ( err.message.includes( '(user may be dragging a tab)' ) ) {
              errTabsAPI = true;
              await sleep( 100 ); // После паузы повторяем действие с учётными данными
              await chrome.runtime.onMessage.dispatch( { message: request.message }, { tab: null, id: self.location.origin } );
            }
            else throw err; // Пробрасываем ошибки, отличные от 'Tabs cannot be edited right now (user may be dragging a tab).'
          });
          if ( errTabsAPI ) return true; // При ошибках chrome.tabs заканчиваем работу функции
          // Если для провайдера запрошено обновление страницы с сервера (сброс кэша), то выполняем обновление страницы с сервера (bypassCache=true)
          if ( provider[ idx ].startUrlBypassCache ) { 
            if ( provider[ idx ].respondTimeout ) addTimeoutControl( currentNumber ); // Запускаем таймер таймаута по ответу
            let resp = undefined;
            do { // Ждём завершения загрузки страницы
              await sleep ( 200 );    // Пауза для завершения загрузки страницы
              if ( pauseRequested ) { // Проверка на остановку запроса - на случай проблем, не дающих закончиться циклу 'do-while'
                return true; // Заканчиваем работу функции
                break;
              }
              else
                resp = await chrome.tabs.get( provider[ idx ].pullingTab );                  // Получаем параметры вкладки,
            } while ( resp !== undefined && resp.status !== 'complete' );                    //   контролируем в них статаус загрузки страницы
            if ( provider[ idx ].respondTimeout ) removeTimeoutControl( currentNumber );     // Снимаем таймер таймаута по ответу
            // Обновление с параметром 'bypassCache' = 'true' должно инициировать загрузку страницы с сервера (как нажатие Ctrl+F5)
            await chrome.tabs.reload( provider[ idx ].pullingTab, { bypassCache: true } )
            .catch( async function( err ) {
              if ( err.message.includes( '(user may be dragging a tab)' ) ) {
                errTabsAPI = true;
                await sleep( 100 );
                await chrome.runtime.onMessage.dispatch( { message: request.message }, { tab: null, id: self.location.origin } );
              }
              else throw err; // Пробрасываем ошибки, отличные от 'Tabs cannot be edited right now (user may be dragging a tab).'
            });
            if ( errTabsAPI ) return true; // При ошибках chrome.tabs заканчиваем работу функции
            console.log( `[MB] Starting page for "${(( provider[ idx ].custom ) ? '\u2605 ' : '') + // Провайдеров добавленных пользователем выделяем '★' в начале наименования
                          provider[ idx ].description}" reloaded from server bypassing cache (due to provider option)` );
          }
          --pollingCycle[ currentNumber ].repeatAttempts;                                 // Уменьшаем счётчик количества попыток запросов
          if ( provider[ idx ].respondTimeout ) addTimeoutControl( currentNumber );       // Запускаем таймер таймаута по ответу
          chrome.webNavigation.onCompleted.addListener( waitPullingTabLoading );          // Запускаем контроль обновления вкладки
          console.log( `[MB] Starting "${(( provider[ idx ].custom ) ? '\u2605 ' : '') +  // Провайдеров добавленных пользователем выделяем '★' в начале наименования
                       provider[ idx ].description}" with "${pollingCycle[ currentNumber ].description}" ` +
                       `(attempts left: ${pollingCycle[ currentNumber ].repeatAttempts})` );
        }
        catch( err ) { // Отражаем статус запроса и оставшиеся попытки
          if ( err.message.includes( '(user may be dragging a tab)' ) ) {
            console.log( `[MB] (catch) ${err}` );
            await sleep( 100 );
            await chrome.runtime.onMessage.dispatch( { message: request.message }, { tab: null, id: self.location.origin } );
            return true; // Заканчиваем работу функции
          }
          else {
            console.log( `[MB] Problem with the tab for "${provider[ idx ].description}", probably it was closed` );
            let ra = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ?
                       String(pollingCycle[ currentNumber ].repeatAttempts) : '';
            pollingCycle[ currentNumber ].lastState = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ? 'Error' : 'Fail';
            drawPoolingState( currentNumber, pollingCycle[ currentNumber ].lastState, ra );
            await getNextNumber(); // Получаем учётные данные для следующего запроса
            return true;          // Заканчиваем работу функции
          }
        }
        return true; // Заканчиваем работу функции
        break;
      }
      case 'MB_pauseRequested': { // Пользователем запрошена остановка опроса
        if ( sendResponse ) sendResponse( 'done' );
        let idx = provider.findIndex( function( item ) { // Определяем провайдера для текущих учётных данных
          return ( pollingCycle[ currentNumber ].provider === item.name )
        });
        chrome.webNavigation.onCompleted.removeListener( waitPullingTabLoading );    // Снимаем контроль обновления вкладки (если он был)
        if ( provider[ idx ].respondTimeout ) removeTimeoutControl( currentNumber ); // Снимаем таймер таймаута по ответу (если он был)
        return true; // Заканчиваем работу функции
        break;
      }
      case 'MB_pullingTab_ready': { // Провести запрос по учётным данным на рабочей вкладке провайдера
        if ( sendResponse ) sendResponse( 'done' );
        let idx = provider.findIndex( function( item ) { // Определяем провайдера для текущих учётных данных
          return ( pollingCycle[ currentNumber ].provider === item.name )
        });
        if ( idx < 0 ) { // Если указанного провайдера нет (он был удалён, а в учётных данных не изменён), то pIdx = -1
          pollingCycle[ currentNumber ].lastState = 'Fail';   // Устанавливаем для учётных данных статус ошибки запроса
          pollingCycle[ currentNumber ].repeatAttempts = 0;   // Сбрасываем счётчик количества попыток запросов
          await drawPoolingState( currentNumber, 'Fail' );    // Отрисовка статуса запроса для строки учётных данных
          console.log( `[MB] Provider defined for "${pollingCycle[ currentNumber ].description}" does not exist`);
          await getNextNumber();                              // Получаем учётные данные для следующего запроса
          return true; // Заканчиваем работу функции
          break;
        }
        if ( provider[ idx ].respondTimeout ) removeTimeoutControl( currentNumber ); // Снимаем таймер таймаута по ответу (если он был)
        if ( pauseRequested ) { // Пользователем запрошена остановка опроса - следующий этап запроса не запускаем
          chrome.webNavigation.onCompleted.removeListener( waitPullingTabLoading );  // Снимаем контроль обновления вкладки (если он был)
          return true; // Заканчиваем работу функции
          break;
        }
        // Если значение текущей части запроса больше их общего количества, то ...
        if ( pollingCycle[ currentNumber ].requestStage >= ( provider[ idx ].scriptActions.length ) ) {
          await getNextNumber(); // ... получаем учётные данные для следующего запроса ...
          return true;           // ... и заканчиваем работу функции
        }
        // Если для провайдера запрошено удаление cookies на стратовой странице (перед авторизацией), то инициируем их очистку
        if ( [ 'login', 'log&pass' ].indexOf( provider[ idx ].scriptActions[ pollingCycle[ currentNumber ].requestStage ] ) >= 0 ) {
          if ( provider[ idx ].startUrlClearCookies == true ) {
            await chrome.scripting.executeScript( { target: { tabId: provider[ idx ].pullingTab }, files: [ `./content/lib/clearCookies.js` ] } )
            .catch( async function( err ) {
              let ra = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ?
                         String(pollingCycle[ currentNumber ].repeatAttempts) : '';
              pollingCycle[ currentNumber ].lastState = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ? 'Error' : 'Fail';
              drawPoolingState( currentNumber, pollingCycle[ currentNumber ].lastState, ra );
              console.log( `[MB] Couldn't inject deleting cookies script for "${(( provider[ idx ].custom ) ? '\u2605 ' : '') +
                           provider[ idx ].description}" + \n${err}` );
              await getNextNumber(); // Получаем учётные данные для следующего запроса
              return true;           // Заканчиваем работу функции
            });
            await sleep ( 300 );     // Пауза для завершения загрузки и выполнения скрипта
            console.log( `[MB] Starting page cookies for "${(( provider[ idx ].custom ) ? '\u2605 ' : '') + // Провайдеров добавленных пользователем выделяем '★' в начале наименования
                          provider[ idx ].description}" deleted (due to provider option)` );
          }
        }
        await drawPoolingState( currentNumber, 'Pooling', String(pollingCycle[ currentNumber ].requestStage) );
        debugger;     // Вставляем на страницу провайдера скрипт текущего этапа запроса
        await chrome.scripting.executeScript( { target: { tabId: provider[ idx ].pullingTab },
              files: [ `/providers/${provider[ idx ].scriptFiles[ pollingCycle[ currentNumber ].requestStage ]}` ] })
        .then( async () => {
          let scriptLost = false;
          console.log( `[MB] Script "${provider[ idx ].scriptFiles[ pollingCycle[ currentNumber ].requestStage ]}" injected` );
          let passw = undefined;                                            // Для этапов запроса, требующих использования пароля, декодируем его
          if ( [ 'password', 'log&pass' ].includes( provider[ idx ].scriptActions[ pollingCycle[ currentNumber ].requestStage ] ) ) {
            let arr = pollingCycle[ currentNumber ].passwValue.split( '' )  // Трансформируем строку в массив символов
                .map( function( c ) { return c.charCodeAt( 0 ); } )         // Меняем в массиве символы на их ASCII-номера
                .map( function( i ) { return i ^ 13; } );                   // XOR-"encryption"
            passw = String.fromCharCode.apply( undefined, arr );            // Трюк: цифровой массив в массив ASCII-символов, объединяя их в единую строку
            passw = decodeURI( atob( passw ) );                             // Декодируем Base64 в ASCII-символы, результат декодируем из UTF-8
          }
          debugger;   // Направляем рабочей вкладке провайдера сообщение с параметрами для текущего этапа запроса
          await chrome.tabs.sendMessage( provider[ idx ].pullingTab, 
                                         { message: 'MB_takeData', 
                                           action:  provider[ idx ].scriptActions[ pollingCycle[ currentNumber ].requestStage ],
                                           login:   pollingCycle[ currentNumber ].loginValue,
                                           passw:   ( passw === undefined ) ? undefined : passw, // Если этап запроса не требует пароля, то исключаем этот параметр
                                           accIdx:  currentNumber,  // Индекс позиции учётных данных в списке опроса
                                           detail:  ( pollingCycle[ currentNumber ].detail === undefined ) ? // Если сохранённых данных нет, то исключаем этот параметр
                                                    undefined : pollingCycle[ currentNumber ].detail
                                         } )
          .then( function( response ) {
            if ( provider[ idx ].scriptActions[ pollingCycle[ currentNumber ].requestStage ] !== 'polling' )  // Для всех этапов, кроме непосредственно запроса,
              chrome.webNavigation.onCompleted.addListener( waitPullingTabLoading );                          // запускаем контроль обновления рабочей вкладки
          })
          .catch( async function( err ) {
            // Обработка ошибки из-за утраты скрипта текущей части запроса, вставленного на страницу провайдера (нет отклика на сообщение)
            if ( err.message.includes( 'Receiving end does not exist' ) ) {
              scriptLost = true;
              chrome.runtime.onMessage.dispatch( { message: 'MB_workTab_repeatCurrentPhase', error: `Script for "${pollingCycle[ currentNumber ].description}"` +
                                                   ` was lost, injecting it again to perform request stage ${pollingCycle[ currentNumber ].requestStage}`,
                                                   accIdx: currentNumber }, // Индекс позиции учётных данных в списке опроса
                                                 { tab: await chrome.tabs.get( provider[ idx ].pullingTab ), id: 'MBpollingCycle' } );
              ++pollingCycle[ currentNumber ].requestStage; // Увеличиваем счётчик частей запроса - он будет уменьшен на 1 в 'MB_workTab_repeatCurrentPhase'
            }
            else
              throw err; // Пробрасываем ошибки, отличные от 'Could not establish connection. Receiving end does not exist.'
          })
          if ( scriptLost ) // При обнаружении утраты скрипта выходим из .then
            return true;
          console.log( `[MB] Message "${provider[ idx ].scriptActions[ pollingCycle[ currentNumber ].requestStage ]}"` +
                       ` sent to "${pollingCycle[ currentNumber ].description}", request stage ${pollingCycle[ currentNumber ].requestStage}`);
          if ( provider[ idx ].respondTimeout ) addTimeoutControl( currentNumber ); // Запускаем таймер таймаута по ответу
          // Для следующего шага запроса будем использовать скрипт следующей его части
          if ( pollingCycle[ currentNumber ].requestStage < ( provider[ idx ].scriptActions.length ) )
            ++pollingCycle[ currentNumber ].requestStage; // Увеличиваем счётчик частей запроса
        })
        .catch( async function( err ) { // Отражаем статус запроса и оставшиеся попытки
          let ra = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ?
                   String(pollingCycle[ currentNumber ].repeatAttempts) : '';
          pollingCycle[ currentNumber ].lastState = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ? 'Error' : 'Fail';
          drawPoolingState( currentNumber, pollingCycle[ currentNumber ].lastState, ra );
          console.log( `[MB] Couldn't inject pooling script: ` + 
                       provider[ idx ].scriptFiles[ pollingCycle[ currentNumber ].requestStage ] + `\n${err}` );
          // Если в настройках провайдера для текущих учётных данных...
          if ( provider[ idx ].requestDelay ) // ...указана задержка между запросами - запускаем её
            setRequestDelay( idx )            // Она по завершению запросит следующие учётные данные сообщением 'MB_requestDelayComplete'
          else
            await getNextNumber(); // Получаем учётные данные для следующего запроса
          return true;             // Заканчиваем работу функции
        });
        return true; // Заканчиваем работу функции
        break;
      }
      case 'MB_workTab_respondTimeout': { // Наступил таймаут по ответу с рабочей вкладки запроса
        if ( sendResponse ) sendResponse( 'done' );
        chrome.webNavigation.onCompleted.removeListener( waitPullingTabLoading ); // Снимаем контроль обновления вкладки (если он был)
        let idx = provider.findIndex( function( item ) { // Определяем провайдера для текущих учётных данных
          return ( pollingCycle[ request.idx ].provider === item.name ) ? true : false
        });
        console.log( `[MB] "${(( provider[ idx ].custom ) ? '\u2605 ' : '') + // Провайдеров добавленных пользователем выделяем '★' в начале наименования
                              provider[ idx ].description}" didn't respond in time for "${pollingCycle[ request.idx ].description}"` );
        pollingCycle[ request.idx ].requestStage = 0;  // Сброс счётчика частей запроса
        pollingCycle[ request.idx ].success = false;   // Сброс статуса опроса для запрашиваемых учётных данных
        // Заканчиваем работу с провайдером по текущим учётным данным (выходим из кабинета, заканчиваем запрос)
        await chrome.tabs.update( provider[ idx ].pullingTab, { url: provider[ idx ].finishUrl, autoDiscardable: false } )
        .catch( async function( err ) {
          console.log( `[MB] Problem with the tab for "${provider[ idx ].description}", probably it was closed` );
          await getNextNumber(); // Получаем учётные данные для следующего запроса
          return true;          // Заканчиваем работу функции
        });
        if ( provider[ idx ].onUpdateDelay )
          await sleep ( Delay * provider[ idx ].onUpdateDelayValue ); // Задержка для догрузки контента рабочей вкладки
        // Если в настройках провайдера для текущих учётных данных...
        if ( provider[ idx ].requestDelay ) // ...указана задержка между запросами - запускаем её
          setRequestDelay( idx )            // Она по завершению запросит следующие учётные данные сообщением 'MB_requestDelayComplete'
        else
          await getNextNumber(); // Получаем учётные данные для следующего запроса
        return true; // Заканчиваем работу функции
        break; }
      case 'MB_workTab_skipNextPhase': { // Плагин запросил пропуск следующего шага своего запроса
        if ( sendResponse ) sendResponse( 'done' );
        let pIdx = -1;
        if ( currentNumber >= 0 ) { // Если текущий экземпляр опроса ещё не завершён, то
          pIdx = provider.findIndex( function( item ) {            // ...определяем провайдера для текущих учётных данных
            if ( ( pollingCycle[ currentNumber ].provider === item.name ) &&    // Если запрос пришёл от вкладки результатов
                 ( ( sender.id === 'MBpollingCycle' ) ||                        // опроса или от рабочей вкладки провайдера,
                   ( sender.tab.id === item.pullingTab ) ) )                    // открытой в этом экземпляре окна опроса
              return true                                                       // (могут быть ещё окна опроса)
            else return false; // Если запрос от "чужой" вкладки, то будет возвращено значение -1
          });
          if ( pIdx >= 0 ) { // Если это запрос от вкладки, открытой в этом экземпляре опроса
            // Выполняем запрос, если он пришёл от вкладки результатов в этом экземпляре опроса или от рабочей вкладки провайдера, для
            //   учётных данных которого нет ожидания отклика плагина 'respondTimeout = false' или ожидание отклика указазано
            //   'respondTimeout = true' и время этого ожидания 'respondTimeoutValue' ещё не закончилось (иначе этот запрос опоздал -
            //   уже направлен запрос по другим учётным данным)
            if ( ( sender.id === 'MBpollingCycle' ) || ( ( request.accIdx === currentNumber ) &&
                 ( ( provider[ pIdx ].respondTimeout === false ) || ( pollingCycle[ currentNumber ].сontrolTimeout !== null ) ) )
               ) {
              console.log( `[MB] Plugin requested to skip next phase: ${request.error}` );
              if ( pollingCycle[ currentNumber ].requestStage < ( provider[ pIdx ].scriptActions.length - 1 ) )
                ++pollingCycle[ currentNumber ].requestStage; // Увеличиваем счётчик частей запроса
            }
          }
        }
        return true; // Заканчиваем работу функции
        break; }
      case 'MB_workTab_repeatCurrentPhase': { // Плагином или вкладкой результатов опроса запрошен повтор текущего шага запроса
      if ( sendResponse ) sendResponse( 'done' );
        let pIdx = -1;
        if ( currentNumber >= 0 ) { // Если текущий экземпляр опроса ещё не завершён, то
          pIdx = provider.findIndex( function( item ) {            // ...определяем провайдера для текущих учётных данных
            if ( ( pollingCycle[ currentNumber ].provider === item.name ) &&    // Если запрос пришёл от вкладки результатов
                 ( ( sender.id === 'MBpollingCycle' ) ||                        // опроса или от рабочей вкладки провайдера,
                   ( sender.tab.id === item.pullingTab ) ) )                    // открытой в этом экземпляре окна опроса
              return true                                                       // (могут быть ещё окна опроса)
            else return false; // Если запрос от "чужой" вкладки, то будет возвращено значение -1
          });
        }
        if ( pIdx >= 0 ) { // Если это запрос от вкладки, открытой в этом экземпляре опроса
          // Выполняем запрос, если он пришёл от вкладки результатов в этом экземпляре опроса или от рабочей вкладки провайдера, для
          //   учётных данных которого нет ожидания отклика плагина 'respondTimeout = false' или ожидание отклика указазано
          //   'respondTimeout = true' и время этого ожидания 'respondTimeoutValue' ещё не закончилось (иначе этот запрос опоздал -
          //   уже направлен запрос по другим учётным данным)
          if ( ( sender.id === 'MBpollingCycle' ) || ( ( request.accIdx === currentNumber ) &&
               ( ( provider[ pIdx ].respondTimeout === false ) || ( pollingCycle[ currentNumber ].сontrolTimeout !== null ) ) )
             ) {
            if ( provider[ pIdx ].respondTimeout ) removeTimeoutControl( currentNumber );   // Снимаем таймер таймаута по ответу
            chrome.webNavigation.onCompleted.removeListener( waitPullingTabLoading );       // Снимаем контроль обновления вкладки (если он был)
            console.log( `[MB] Plugin requested to repeat current phase: ${request.error}` );
            try {
              let tabInfo;
              do {
                tabInfo = await chrome.tabs.get( provider[ pIdx ].pullingTab );
                await sleep ( Delay );
              } while ( tabInfo.status !== 'complete' ); // Дождидаемся завершения загрузки страницы на вкладке запроса
            }
            catch( err ) {
              console.log( `[MB] Error geting tab info for "${provider[ pIdx ].description}", probably it was closed` );
            }
            if ( provider[ pIdx ].onUpdateDelay )
              await sleep ( Delay * provider[ pIdx ].onUpdateDelayValue );  // Задержка для догрузки контента рабочей вкладки
            if ( pollingCycle[ currentNumber ].requestStage !== 0 )         // Если текущая часть запроса не первая, то ...
              --pollingCycle[ currentNumber ].requestStage;                 // ... уменьшаем счётчик частей запроса
            // Инициируем повторное выполнение текущего шага опроса
            chrome.runtime.onMessage.dispatch( { message: 'MB_pullingTab_ready' }, { tab: null, id: self.location.origin } );
          }
        }
        return true; // Заканчиваем работу функции
        break; }
      case 'MB_workTab_takeData': { // Принять результаты запроса от рабочей вкладки запроса
        if ( sendResponse ) sendResponse( 'done' );
        let sameRecordsFound = false; // Признак проведения операций удаления в хранилище записей запросов от той же даты по настройкам расширения
        let idx = -1;
        if ( currentNumber >= 0 ) { // Если текущий экземпляр опроса ещё не завершён, то
          idx = provider.findIndex( function( item ) {         // ...определяем провайдера для текущих учётных данных
            if ( ( pollingCycle[ currentNumber ].provider === item.name ) &&  // Если запрос пришёл от рабочей вкладки
                 ( sender.tab.id === item.pullingTab ) )                      // провайдера, открытой в этом экземпляре
              return true                                                     // окна опроса (могут быть ещё окна опроса)
            else return false; // Если запрос от "чужой" вкладки, то будет возвращено значение -1
          });
        }
        if ( idx >= 0 ) { // Если это запрос от вкладки, открытой в этом экземпляре опроса
          if ( provider[ idx ].respondTimeout ) removeTimeoutControl( currentNumber ); // Снимаем таймер таймаута по ответу
          chrome.webNavigation.onCompleted.removeListener( waitPullingTabLoading );    // Снимаем контроль обновления вкладки (если он был)
        // Заканчиваем работу с провайдером по текущим учётным данным (переходим по 'finishUrl' провайдера, что чаще всего = выходу из кабинета)
          await chrome.tabs.update( provider[ idx ].pullingTab, { url: provider[ idx ].finishUrl, autoDiscardable: false } );
          if ( provider[ idx ].onUpdateDelay )
            await sleep ( Delay * provider[ idx ].onUpdateDelayValue ); // Задержка для догрузки контента рабочей вкладки
        // Фиксируем результаты запроса
          console.log( `[MB] Result from "${(( provider[ idx ].custom ) ? '\u2605 ' : '') + // Провайдеров добавленных пользователем выделяем '★' в начале наименования
                        provider[ idx ].description}" for "${pollingCycle[ currentNumber ].description}": ` +
                       `status = ${JSON.stringify(request.status)}, error = "${request.error}"\n` +
                       `result = ${JSON.stringify(request.data)}` );
          if ( pollingCycle[ currentNumber ].success = request.status ) {       // Если запрос был успешным - меняем статус,
            pollingCycle[ currentNumber ].requestStage = 0;                     //   сбрасываем счётчик частей запроса,
            Object.assign( pollingCycle[ currentNumber ].result, MBResult);     //   очищаем структуру записи результата запроса
            Object.assign( pollingCycle[ currentNumber ].result, request.data); //   сохраняем принятые значения результата запроса
            Object.assign( pollingCycle[ currentNumber ].result,                //   проставляем значение логина
                           { PhoneNumber: pollingCycle[ currentNumber ].loginValue } );
            Object.assign( pollingCycle[ currentNumber ].result,                //   проставляем значение даты / времени
                           { QueryDateTime: Date.now() } );
          // Устанавливаем значения поля Warning = 0, отклонения пока не выявлены
            pollingCycle[ currentNumber ].result.Warning = 0;
          // Удаляем в хранилище записи запросов от той же даты по настройкам расширения
            sameRecordsFound = await dbDeleteSameDateRecords( pollingCycle[ currentNumber ].loginValue );
          // Получаем из indexedDB запись последнего запроса для опрошенных учётных данных
            let lastRec = await dbGetLastRecord( pollingCycle[ currentNumber ].loginValue );
          // Если запись есть, то вычисляем изменения баланса и количество дней без его изменения...
            if ( lastRec ) {                                     // Если в настройках провайдера установлено не учитывать дробную часть баланса
              if ( provider[ idx ].ignoreFractional ) {          //   при оценке его изменения, то отбрасываем дробные части полученных значений
                pollingCycle[ currentNumber ].result.BalDelta =  // ...и проставляем изменение баланса
                  parseFloat( parseFloat( Math.trunc( pollingCycle[ currentNumber ].result.Balance ) - Math.trunc( lastRec.Balance ) ).toFixed(2) );
              }
              else { // ...и проставляем изменение баланса (с учётом дробных частей полученных значений)
                pollingCycle[ currentNumber ].result.BalDelta =
                  parseFloat( parseFloat( pollingCycle[ currentNumber ].result.Balance - lastRec.Balance ).toFixed(2) );
              }
              // Если баланс изменился, то сбрасываем счётчик дней без его изменения
              if (pollingCycle[ currentNumber ].result.BalDelta !== 0) {
                pollingCycle[ currentNumber ].result.NoChangeDays = 0;
              }
              else { // Если баланс не менялся, то вычисляем количество дней без его изменения
                // Пересчитываем в дни значения даты-времени запросов
                let c = Math.trunc( pollingCycle[ currentNumber ].result.QueryDateTime / 1000 / 60 / 60 / 24 );
                let d = Math.trunc( lastRec.QueryDateTime / 1000 / 60 / 60 / 24 );
                pollingCycle[ currentNumber ].result.NoChangeDays = lastRec.NoChangeDays + ( c - d );
              }
            }
            else { // Если записи предыдущего запроса нет, значит это новые учётные данные. Результат будет первой записью
              pollingCycle[ currentNumber ].result.BalDelta = pollingCycle[ currentNumber ].result.NoChangeDays = 0;
            }
          // Сбрасываем выделение цветом и 'bold' для значений в ячейках строки по текущим учётным данным - они могли быть изменены в предыдущем запросе
            let d = document.getElementById( String(currentNumber) );
            d.childNodes.forEach( (item) => { item.style.color = ''; item.style.fontWeight = 'normal'; } );

          // Отображаем значения в таблице результатов
            await drawPoolingState( currentNumber, ( pollingCycle[ currentNumber ].lastState = 'Success' ) );

            // Отображаем значения полей 'Balance' / 'KreditLimit' - значения баланса и кредитного лимита (если он есть)
            // Если значение кредитного лимита есть (не 0), то отображаем его после значения баланса. Если его нет, то отображаем только значение баланса
            createPairBalanceStr( (pollingCycle[ currentNumber ].result.Balance).toFixed(2),
                                  ( pollingCycle[ currentNumber ].result.KreditLimit !== 0 ) ? (pollingCycle[ currentNumber ].result.KreditLimit).toFixed(2) : '-',
                                  document.getElementById( String(currentNumber) + '-balance' ) );

            // Отображаем значения поля 'BalDelta' - изменение баланса по сравнению со значением по предыдущему запросу
            document.getElementById( String(currentNumber) + '-delta' ).textContent =
              (pollingCycle[ currentNumber ].result.BalDelta).toFixed(2);

            // Отображаем значения поля 'NoChangeDays' - количество дней с момента последнего изменения баланса
            d = document.getElementById( String(currentNumber) + '-noChange' );
            if ( lastRec ) { // Если это не первая запись по учётным данным
              let idx = accounts.findIndex( function( item ) { // Находим набор параметров для текущих учётных данных
                return ( ( pollingCycle[ currentNumber ].description === item.description ) &&
                         ( pollingCycle[ currentNumber ].loginValue  === item.loginValue ) ) ? true : false
              });
              // Если баланс не измененялся дольше, чем задано для контроля, то выделяем ячейку цветом и выдаём оповещение
              if ( ( accounts[ idx ].inactiveRemind !== '' ) && ( Number(accounts[ idx ].inactiveRemind > 0) ) &&
                   ( pollingCycle[ currentNumber ].result.NoChangeDays > Number(accounts[ idx ].inactiveRemind) ) ) {
                d.style.color = '#FF0000';
                d.style.fontWeight = 'bold';
                pollingCycle[ currentNumber ].result.Warning |= 1; // Устанавливаем бит 0001 значения поля Warning в 1
                if ( ntfEnable && ntfOnUpdateDelay )
                  throwNotification( pollingCycle[ currentNumber ], 'Alarm', { body: 'Баланс не изменялся более ' +
                                     String(Number(accounts[ idx ].inactiveRemind)) + ' дн.' } );
              }
            }
            d.textContent = String(pollingCycle[ currentNumber ].result.NoChangeDays) + ' дн.';

            // Отображаем значения полей 'Balance2' / 'Balance3'
            d = document.getElementById( String(currentNumber) + '-bal23' );
            d.style.textAlign = 'right';
            d.innerHTML = ( pollingCycle[ currentNumber ].result.Balance2 > 0 ) ? (pollingCycle[ currentNumber ].result.Balance2).toFixed(2) : '-';
            d.innerHTML += ( pollingCycle[ currentNumber ].result.Balance3 > 0 ) ? `<br>${(pollingCycle[ currentNumber ].result.Balance3).toFixed(2)}` : `<br>-`;

            // Отображаем остаток SMS
            if ( !pollingCycle[ currentNumber ].result.SMS )  pollingCycle[ currentNumber ].result.SMS = 0;
            if ( pollingCycle[ currentNumber ].result.SMS < 0 ) { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
              document.getElementById( String(currentNumber) + '-sms' ).style.textAlign = 'center';
              document.getElementById( String(currentNumber) + '-sms' ).textContent = '\u221E';
            }
            else
              document.getElementById( String(currentNumber) + '-sms' ).textContent =
                ( pollingCycle[ currentNumber ].result.SMS === 0 ) ? '' : String(pollingCycle[ currentNumber ].result.SMS );

            // Отображаем остаток голосовых минут
            if ( !pollingCycle[ currentNumber ].result.Minutes )  pollingCycle[ currentNumber ].result.Minutes = 0;
            if ( pollingCycle[ currentNumber ].result.Minutes < 0 ) { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
              document.getElementById( String(currentNumber) + '-minutes' ).style.textAlign = 'center';
              document.getElementById( String(currentNumber) + '-minutes' ).textContent = '\u221E';
            }
            else
              document.getElementById( String(currentNumber) + '-minutes' ).textContent =
                ( pollingCycle[ currentNumber ].result.Minutes === 0 ) ? '' : String(pollingCycle[ currentNumber ].result.Minutes );

            // Отображаем остаток Интернет-трафика
            if ( !pollingCycle[ currentNumber ].result.Internet )  pollingCycle[ currentNumber ].result.Internet = 0;
            if ( pollingCycle[ currentNumber ].result.Internet < 0 ) { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
              document.getElementById( String(currentNumber) + '-internet' ).style.textAlign = 'center';
              document.getElementById( String(currentNumber) + '-internet' ).textContent = '\u221E';
            }
            else { // Выставляем размерность отображения остатка Интернет-трафика (Тб, Гб или Мб) по настройкам для провайдера
              let tmpInetUnits = provider[ idx ].inetUnits;
              if ( tmpInetUnits === 'A' ) {   // При указании в настройках автовыбора определяем размерность отображения остатка Интернет-трафика
                if ( pollingCycle[ currentNumber ].result.Internet < 1024 ) tmpInetUnits = 'M'
                else
                  if ( ( pollingCycle[ currentNumber ].result.Internet / 1024 ) < 1024 ) tmpInetUnits = 'G'
                  else tmpInetUnits = 'T';
              }
              switch ( tmpInetUnits ) {
                case 'T': {
                  d = ( pollingCycle[ currentNumber ].result.Internet / 1048576 ).toFixed(2) + ' Тб';
                  break;
                }
                case 'G': {
                  d = ( pollingCycle[ currentNumber ].result.Internet / 1024 ).toFixed(2) + ' Гб';
                  break;
                }
                case 'M': {
                  d = ( pollingCycle[ currentNumber ].result.Internet ).toFixed(2) + ' Мб';
                  break;
                }
              }
              document.getElementById( String(currentNumber) + '-internet' ).textContent =
                ( pollingCycle[ currentNumber ].result.Internet === 0 ) ? '' : d;
            }

            // Отображаем значение поля 'TurnOffStr' - дата завершения оплаченного периода
            document.getElementById( String(currentNumber) + '-turnOffStr' ).textContent =
              String(pollingCycle[ currentNumber ].result.TurnOffStr);

            // Отображаем значение поля 'BlockStatus' - статус блокировки учётных данных или блокировки тарифа по ним
            d = document.getElementById( String(currentNumber) + '-blockStatus' );
            if ( lastRec ) { // Если это не первая запись по учётным данным
              // то если изменился статус блокировки - выделяем ячейку цветом и выдаём оповещение
              if ( pollingCycle[ currentNumber ].result.BlockStatus !== lastRec.BlockStatus ) {
                d.style.color = '#FF0000';
                d.style.fontWeight = 'bold';
                pollingCycle[ currentNumber ].result.Warning |= 2; // Устанавливаем бит 0010 значения поля Warning в 1
                if ( ntfEnable && ntfOnUpdateDelay )
                  throwNotification( pollingCycle[ currentNumber ], 'Alarm', { body:
                                     'Изменился статус блокировки\nБыло: "' + lastRec.BlockStatus + '"  Стало: "' +
                                     pollingCycle[ currentNumber ].result.BlockStatus + '"' } );
              }
            }
            d.textContent = pollingCycle[ currentNumber ].result.BlockStatus;

            // Отображаем значение поля 'UslugiOn' - состав услуг (платные, бесплатны, подписки, сумма стоимости платных услуг)
            d = document.getElementById( String(currentNumber) + '-uslugiOn' );
            if ( lastRec ) { // Если это не первая запись по учётным данным
              // то если изменился состав или стоимость услуг - выделяем ячейку цветом и выдаём оповещение
              if ( pollingCycle[ currentNumber ].result.UslugiOn !== lastRec.UslugiOn ) {
                d.style.color = '#FF0000';
                d.style.fontWeight = 'bold';
                pollingCycle[ currentNumber ].result.Warning |= 4; // Устанавливаем бит 0100 значения поля Warning в 1
                if ( ntfEnable && ntfOnUpdateDelay )
                  throwNotification( pollingCycle[ currentNumber ], 'Alarm', { body:
                                     'Изменился состав или стоимость услуг\nБыло: "' + lastRec.UslugiOn + '"  Стало: "' +
                                     pollingCycle[ currentNumber ].result.UslugiOn + '"' } );
              }
            }
            d.textContent = pollingCycle[ currentNumber ].result.UslugiOn;

            // Контроль изменения названия тарифа
            if ( lastRec ) { // Если это не первая запись по учётным данным
              // то если изменилось наименование тарифа - выдаём оповещение
              if ( pollingCycle[ currentNumber ].result.TarifPlan !== lastRec.TarifPlan) {
                pollingCycle[ currentNumber ].result.Warning |= 8; // Устанавливаем бит 1000 значения поля Warning в 1
                if ( ntfEnable && ntfOnUpdateDelay ) {
                  throwNotification( pollingCycle[ currentNumber ], 'Alarm', { body:
                                     'Изменился тариф\nБыло: "' + lastRec.TarifPlan + '"  Стало: "' +
                                     pollingCycle[ currentNumber ].result.TarifPlan + '"' } );
                }
              }
            }
            // Формируем дату-время запроса
            createDataStr( new Date( pollingCycle[ currentNumber ].result.QueryDateTime ),
                           document.getElementById( String(currentNumber) + '-time' ) );
          // Сохраняем запись в хранилище
            await dbAddRecord( pollingCycle[ currentNumber ].result );  // Записываем результат в indexedDB
            console.log( `[MB] ${( sameRecordsFound ) ? 'History record updated' : 'New history record added'} in object store` );
          }
          else { // Если запрос неуспешен, то отображаем его статус и оставшиеся попытки запросов
            let ra = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ?
                     String(pollingCycle[ currentNumber ].repeatAttempts) : '';
            pollingCycle[ currentNumber ].lastState = ( pollingCycle[ currentNumber ].repeatAttempts > 0 ) ?
                     'Error' : 'Fail';
            drawPoolingState( currentNumber, pollingCycle[ currentNumber ].lastState, ra );
          }

        // Обновляем для учётных данных значения 'detail' в структурах данных по значениям 'detail' из ответа
          if ( ( request.detail !== undefined ) && ( request.detail.renew !== undefined ) ) {   // Если есть структура 'detail'
            if ( request.detail.renew ) {                     // ... и она содержит требование обновления данных (renew = true)
              let renewDetailData = undefined;
              if ( Object.values( request.detail ).length > 1 ) {   // ... и кроме параметра 'renew' есть данные для сохранения
                renewDetailData = Object.assign( new Object(), request.detail );
                delete renewDetailData.renew;
              }
              await renewDetail( renewDetailData ); // Обновляем значения 'detail' в структурах данных
            }
          }

        // Если в настройках провайдера для текущих учётных данных...
          if ( provider[ idx ].requestDelay ) // ...указана задержка между запросами - запускаем её
            setRequestDelay( idx )            // Она по завершению запросит следующие учётные данные сообщением 'MB_requestDelayComplete'
          else
            await getNextNumber();            // Получаем учётные данные для следующего запроса
          return true; // Заканчиваем работу функции
        }
        else return true; // Заканчиваем работу функции

        async function renewDetail( detail ) { // Обновление значений 'detail' в структурах данных по значениям 'detail' из ответа на запрос
        //    ---------------------
          let idx = accounts.findIndex( function( item ) { // Находим набор параметров для текущих учётных данных
            return ( pollingCycle[ currentNumber ].loginValue === item.loginValue ) ? true : false
          });
          accounts[ idx ].detail = detail; // Обновляем значения 'detail' в структуре данных для опроса
          let fromStoreAccounts = (await chrome.storage.local.get( 'accounts' )).accounts;
          idx = fromStoreAccounts.findIndex( function( item ) { // Находим набор параметров для текущих учётных данных
            return ( pollingCycle[ currentNumber ].loginValue === item.loginValue ) ? true : false
          });
          fromStoreAccounts[ idx ].detail = detail; // Обновляем значения 'detail' в структуре хранилища данных
          await chrome.storage.local.set( { accounts: fromStoreAccounts } ); // Обновляем данные в хранилище
        }

        function createDataStr( d, parentTag ) { // Формирование даты/времени запроса в 2 строки
        //       -----------------------------
          // Если есть элементы отображения даты/времени предыдущего запроса - удаляем их
          while ( parentTag.lastChild ) { parentTag.removeChild( parentTag.lastChild ) };
          // Формируем элементы отображения даты-времени запроса и вставляем их в ячейку строки таблицы
          let newTag = document.createElement( 'p' );
          newTag.textContent = `${(d.getHours() < 10)   ? '0' + String(d.getHours())   : String(d.getHours())}:` +
                               `${(d.getMinutes() < 10) ? '0' + String(d.getMinutes()) : String(d.getMinutes())}:` +
                               `${(d.getSeconds() < 10) ? '0' + String(d.getSeconds()) : String(d.getSeconds())}`;
          newTag.style.margin = '0';
          parentTag.insertAdjacentElement( 'beforeend', newTag );
          newTag = document.createElement( 'p' );
          newTag.textContent = `${(d.getDate() < 10) ? '0' + String(d.getDate())      : String(d.getDate())}.` +
                               `${(d.getMonth() < 9) ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                               `${String(d.getFullYear())}`;
          newTag.style.margin = '0';
          parentTag.insertAdjacentElement( 'beforeend', newTag );
        }

        function createPairBalanceStr( balStr, limitStr, parentTag ) { // Формирование отображения значений в 2 строки
        //       ---------------------------------------------------
          // Если есть элементы отображения значений предыдущего запроса - удаляем их
          while ( parentTag.lastChild ) { parentTag.removeChild( parentTag.lastChild ) };
          let newTag = document.createElement( 'p' );
          newTag.textContent = balStr;
          newTag.style.margin = '0';
          newTag.style.fontWeight = 'bold';
          // Если значение баланса отрицательное и установлено выделение таких значений цветом, то меняем цвет строки баланса
          if ( paintNegative && ( Number(balStr) < 0 ) )  newTag.style.color = '#FF00FF';
          parentTag.insertAdjacentElement( 'beforeend', newTag );
          newTag = document.createElement( 'p' );
          newTag.textContent = limitStr;
          newTag.style.margin = '0';
          newTag.style.fontWeight = 'normal';
          parentTag.insertAdjacentElement( 'beforeend', newTag );
        }
        break;
      }
      case 'MB_giveRequestDelay': { // Сообщаем рабочей вкладке время задержки между запросами для её провайдера
        let idx = provider.findIndex( function( item ) {                   // Если запрос пришёл от рабочей вкладки
          if (sender.tab.id === item.pullingTab)                           // провайдера, открытой в этом экземпляре
            sendResponse( { requestDelayValue: item.requestDelayValue } ); // окна опроса (могут быть ещё окна опроса)
        });
        return (idx < 0) ? false : true; // Если запрос от вкладки открытой в этом экземпляре опроса - это "наше" событие
        break;
      }
      case 'MB_requestDelayComplete': { // Закончилась задержка между запросами для провайдера
        if ( sendResponse ) sendResponse( 'done' );
        await getNextNumber(); // Получаем учётные данные для следующего запроса
        return true; // Заканчиваем работу функции
        break;
      }
      case 'MB_helperClaim': { // Запрошен вызов вспомогательного модуля для провайдера
        if ( sendResponse ) sendResponse( 'done' );
        let idx = provider.findIndex( function( item ) {           // Определяем провайдера для текущих учётных данных
            if ( ( pollingCycle[ currentNumber ].provider === item.name ) &&  // Если запрос пришёл от рабочей вкладки
                 ( sender.tab.id === item.pullingTab ) )                      // провайдера, открытой в этом экземпляре
              return true                                                     // окна опроса (могут быть ещё окна опроса)
            else return false; // Если запрос от "чужой" вкладки, то будет возвращено значение -1
          });
        // Направляем вкладке вспомогательных модулей запрос на выполнение действий
        if ( idx >= 0 ) { // Если это запрос от вкладки, открытой в этом экземпляре опроса
          console.log( `[MB] Plugin "${provider[ idx ].description}" calaimed helper for "${pollingCycle[ currentNumber ].description}"` );
          // В минимизированном окне или на неактивной вкладке результатов окна опроса браузер определяет загруженные вспомогательные
          //   модули и вызываемые ими модули-библиотекм как 'iframe' и останавливает в них работу скриптов
          // Для отработки этих скриптов если окно опроса минимизировано, то временно изменяем для него статус 'minimized' на 'normal',
          //   задаём минимально возможный размер (1x1) и помещаем в видимой области экрана (на 35 пикселей выше нижней границы экрана
          //   (меньше не срабатывает), отступ слева - на четверть от ширины экрана). Вкладку результатов опроса делаем активной (чтобы
          //   исключить ситуацию, когда в окне была выбрана активной вкладка, отличная от вкладки результатов опроса, а потом
          //   пользователь окно свернул)
          // Вызов вспомогательного модуля проводится из файла, указанного для провайдера в 'helperFile'
          // Если модуль не импортирован при предыдущих вызовах, то делаем это
          if ( provider[ idx ].helperFunc === null ) {
            provider[ idx ].helperFunc = await import( `/providers/${provider[ idx ].helperFile}` );
            provider[ idx ].helperFunc = provider[ idx ].helperFunc.default;
          }
          // Выполняем вызов default-функции модуля. Передаваемые аргумены:
          //   provider - объект данных провайдера, для которого нужно импортировать модули библиотек
          //   args     - объект с параметрами, переданными плагином-родителем для выполнения действий
          //              вспомогательным модулем или функциями импортированных библиотек
          console.log( `[MB] "${provider[ idx ].name}_helper" performing  actions for "${pollingCycle[ currentNumber ].description}"...` );

          let tmpWin = await chrome.windows.get( workWin.id, { populate: true } );
          let showWorkWin = false;
          // Если работа проходит в свёрнутом (минимизированном) окне, то 
          if ( tmpWin.state === 'minimized' ) {
            await chrome.tabs.update( workTab.id, { active: true } ); // Активируем вкладку результатов опроса
            // Восстанавливаем окно результатов опроса и позиционируем его в минимально видимой области экрана
            await chrome.windows.update( workWin.id, { state: 'normal', focused: false, height: 1, width: 1,
                                                       top: ( window.screen.height - 35 ), left: ( window.screen.width / 4 ) } );
            showWorkWin = true;
          }
          await provider[ idx ].helperFunc( provider[ idx ], request.args )
          .then( async function( result ) {
            if ( result !== undefined ) {   // Если нет ошибок в работе вспомогательного модуля ...
              if ( result.respond ) {       // ... и есть необходимость направления данных плагину-родителю
                console.log( `[MB] Sending "${provider[ idx ].name}_helper" result to "${pollingCycle[ currentNumber ].description}"...` );
                await chrome.tabs.sendMessage( provider[ idx ].pullingTab, 
                                               { message: 'MB_takeData', action: 'helperResult', helper: result } )
                .catch( async function( err ) { // При ошибках направляем родителю статус 'false', данные = 'undefined'
                  console.log( `[MB] Error sending result from "${provider[ idx ].description}" helper: ${err}` );
                })
              }
            }
          })
          .catch( async function( err ) { // При ошибках направляем родителю статус 'false', данные = 'undefined'
            console.log( `[MB] Error in helper "${provider[ idx ].helperFile}": ${err}` );
            await chrome.tabs.sendMessage( provider[ idx ].pullingTab, 
                                           { message: 'MB_takeData',  action: 'helperResult', helper: { data: undefined, respond: false } } )
            .catch( async function( err ) { // При ошибках направляем родителю статус 'false', данные = 'undefined'
              console.log( `[MB] Error sending result from "${provider[ idx ].description}" helper: ${err}` );
            })
          })

          if ( showWorkWin === true ) { // Если окно результатов опроса было свёрнуто (минимизировано), то 
            await chrome.windows.update( workWin.id, { height: tmpWin.height, width: tmpWin.width, top: tmpWin.top, left: tmpWin.left } )
            .catch( async function( err ) {
              console.log( `Error restoring window size: ${err}` );
            })
            await chrome.windows.update( workWin.id, { state: tmpWin.state, focused: tmpWin.focused } )
            .catch( async function( err ) {
              console.log( `Error restoring window state: ${err}` );
            })
          }

        }
        break;
      }
      case 'MB_showInLog': { // Отображение переданного сообщения в логе опроса
        console.log( request.text );
        break;
      }
      default: {
        return true; // Заканчиваем работу функции
        break;
      }
    } /* switch */
  } /* async function */
);


// Установка состояния кнопок управления опросом
async function setRequestButtons() {
//             -------------------
  btnPause.disabled = true;                 // Блокируем кнопку остановки опроса - он завершён
  btnResume.disabled =                      // Если есть незавершённые запросы - разблокируем кнопку продолжения опроса
    ( await checkUncompleteRequests() === undefined );
  let troubleArr = await checkTroubleRequests();  // Выясняем, есть ли неуспешные запросы
  btnRepeatFailedAll.disabled =             // Если они есть - разблокируем кнопку повторного запроса для всех неуспешных
    ( troubleArr === undefined );
  // selectedRow - переменная текущей выделенной строки из файла table.js, подключён в html
  // Разблокируем кнопку единичного повторного запроса, если...
  if (selectedRow !== undefined) {                                   // ...в таблице выбрана строка,
    btnRepeatFailedSingle.disabled = false;
/*
    // По пожеланим пользователей даём возможность выбирать для повторного запроса не только строки с неуспешным или ещё
    //   не проведённым запросом, но и строки с успешными результатами запроса. По ним можно выполнить запрос повторно,
    //   например, при неполном составе параметров в ответе
    if (troubleArr !== undefined)                                    //    запрос по которой неуспешен
      btnRepeatFailedSingle.disabled =
        ( troubleArr.includes( Number(selectedRow) ) ) ? false : true;
    if (pollingCycle[ Number(selectedRow) ].lastState === 'Order')   // ...или ещё не выполнялся
      btnRepeatFailedSingle.disabled = false;
*/
  }
  else                                      // В остальных случаях кнопку единичного
    btnRepeatFailedSingle.disabled = true;  //   повторного запроса блокируем
  btnConsoleLog.disabled = false;           // Разблокируем кнопку сохранения лога
}


// Обработка выбора строки учётных данных в таблице результатов опроса
scrollDiv.addEventListener( 'click', async function( evnt ) {
//        -----------------
  // Если опрос не идёт и не активна задержка запросов к провайдеру
  if ( !inProgress && (pollingCycle.findIndex( function( item ) { return (item.inDelay) ? true : false } )) < 0)
    setRequestButtons();                                   // Установка состояния кнопок управления опросом
  evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
  return false;
});


// Обработка нажатия кнопок управления опросом
requestTable.addEventListener( 'click', async function( evnt ) {
//           -----------------
  switch ( evnt.target.id ) {
    case 'btnRepeatFailedAll':          // Действия для кнопок повторения / продолжения активностей по запросам
    case 'btnRepeatFailedSingle':
    case 'btnResume': {
      evnt.stopPropagation();           // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      userIntrusion = true;                                             // Пользователь вмешался в ход опроса
      pauseRequested = poolOnce = false;                                // Сбрасываем флаги остановки и единичного запроса
      switch ( evnt.target.id ) {
        case 'btnRepeatFailedAll': {    // По кнопке 'Повторить все незавершённые' запросы
          let troubleArr = await checkTroubleRequests();                // Выясняем, есть ли неуспешные запросы
          if ( troubleArr !== undefined )
            troubleArr.forEach( function( item ) {                      // Для всех записей неуспешных запросов
              if ( pollingCycle[ item ].repeatAttempts === 0 )          //   если все попытки запросов по записи выбраны
                ++pollingCycle[ item ].repeatAttempts;                  //   то добавляем ей 1 попытку
            });
          currentNumber = assignCurrentNumber( -1 ); // Определяем первую запись структуры для проведения запроса
          console.log( `[MB] All unsuccessful queries started by user` );
          break;
        }
        case 'btnRepeatFailedSingle': { // По кнопке 'Повторить запрос для выделенной' строки учётных данных
          poolOnce = true;                                              // Устанавливаем признак единичного запроса
          currentNumber = Number(selectedRow);                          // Выполняем запрос по указанной записи
          if ( pollingCycle[ currentNumber ].repeatAttempts === 0 )     // Если все попытки запросов по записи выбраны
            ++pollingCycle[ currentNumber ].repeatAttempts;             //   то добавляем ей 1 попытку
          console.log( `[MB] Unsuccessful query to "${pollingCycle[ currentNumber ].description}" started by user` );
          break;
        }
        case 'btnResume': {             // По кнопке 'Продолжить опрос'
          currentNumber = assignCurrentNumber( -1 ); // Определяем первую запись структуры для проведения запроса
          console.log( `[MB] Polling resumed by user` );
          break;
        }
      }
      await chrome.storage.local.set( { inProgress: inProgress = true } ); // Устанавливаем статус активности опроса
      btnRepeatFailedAll.disabled = btnRepeatFailedSingle.disabled = btnResume.disabled = btnConsoleLog.disabled = true;
      btnPause.disabled = false;
      scrollDiv.focus();  // Преходим к таблице, чтобы можно было прокручивать её с клавиатуры
      chrome.runtime.onMessage.dispatch( { message: 'MB_pullingTab_new' },
                                         { tab: null, id: window.location.origin }, null );
      break;
    }
    case 'btnPause': { // Остановить опрос
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( !userIntrusion && pStart ) {                                 // Если кнопка нажата впервые и опрос проводился,
        pFinish = drawPollingTime( 'pollingFinish' );                   // ...то отображаем время завершения опроса,...
        drawPollingDuration( pStart, pFinish, 'pollingFinish' );        // ...вычисляем и отображаем его продолжительность
      }
      userIntrusion = true;                                             // Пользователь вмешался в ход опроса
      poolOnce = false;                                                 // Сбрасываем флаг единичного запроса
      pauseRequested = true;                                            // Остановиться после текущего запроса
      btnPause.disabled = true;
      do { // Если задержка запросов к провайдеру активирована, ждём её завершения
        await sleep ( Delay );
      } while ( (pollingCycle.findIndex( function( item ) { return (item.inDelay) ? true : false } )) >= 0 );
      chrome.runtime.onMessage.dispatch( { message: 'MB_pauseRequested' },
                                         { tab: null, id: self.location.origin }, null );
      // Если прерванный запрос не дошёл до стасуса 'fail', меняем его статус на 'error' и перерисовываем состояние
      if (( pollingCycle[ currentNumber ].lastState !== 'Fail' ) && !pollingCycle[ currentNumber ].success ) {
        if ( pollingCycle[ currentNumber ].repeatAttempts === 0 )       // Если все попытки запросов по записи выбраны
          ++pollingCycle[ currentNumber ].repeatAttempts;               //   то добавляем ей 1 попытку
        pollingCycle[ currentNumber ].lastState = 'Error';              //   и меняем статус на 'error'
        drawPoolingState( currentNumber, pollingCycle[ currentNumber ].lastState,
                          String(pollingCycle[ currentNumber ].repeatAttempts) );
      }
      await chrome.storage.local.set( { inProgress: inProgress = false } ); // Сбрасываем статус активности опроса
      setRequestButtons();                                              // Установка состояния кнопок управления опросом
      console.log( `[MB] Pulling stopped by user` );
      scrollDiv.focus();  // Преходим к таблице, чтобы можно было прокручивать её с клавиатуры
      break;
    }
    case 'btnConsoleLog': { // Сохранить лог опроса на диск
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      await savePollingLog();
      break;
    }
  } /* switch */
 
  if ( [ 'btnRepeatFailedAll', 'btnRepeatFailedSingle', 'btnResume' ].includes( evnt.target.id ) ) {
    // Актуализируем (если окна открыты) доступность кнопок запуска опроса в popup-окне и
    //   восстановления исходных значений расширения в окне options
    chrome.runtime.sendMessage( { message: 'MB_actualizeControls' } ) // Если открытых окон нет,
    .catch( function() {} ); // то нет и кода обработки приёма сообщений - снимаем ошибку канала связи
  }
});


// Запросить показ оповещения (notification)
async function throwNotification( item, state, options ) {
//             ------------------
  // Отображение оповещения из окна опроса может терять оповещения, если окно закрывается в конце опроса
  // Поэтому отображение оповещений проводим из Service Worker, а здесь только формируем для них парамерты
  options.badge = '../images/MB.png';
  options.dir = 'ltr';
  options.icon = `../images/${state}.png`;
  options.requireInteraction = (state === 'alarm') ? true : false;
  chrome.runtime.sendMessage( { message: 'MB_showNotification', title: item.description, options: options } );
}


// Формирование текстовой строки даты в формате YYYY-MM-DD
function createDateStr() {
//       ---------------
  let timeStamp = new Date();
  timeStamp.getTime();
  let result = String(timeStamp.getFullYear());
  result += ( ((timeStamp.getMonth()+1)<10) ? ('-0'+String(timeStamp.getMonth()+1)) : ('-'+String(timeStamp.getMonth()+1)) );
  result += ( (timeStamp.getDate()<10) ? ('-0'+String(timeStamp.getDate())) : ('-'+String(timeStamp.getDate())) );
  return result;
}

// Сохранение лога опроса на диск
async function savePollingLog() {
//             ----------------
  return new Promise( (resolve, reject) => {
    let fileNameStr = `${createDateStr()} MB-pollingLog.log`;
    console.log( `[MB] Saving logging data from console to file '${fileNameStr}'` );
    let blob = new Blob( consoleData, { type: 'text/json', endings: 'native' } );
    let link = document.createElement( 'a' );
    link.setAttribute( 'download', fileNameStr );
    link.setAttribute( 'href', window.URL.createObjectURL( blob ) );
    link.click();
    link.remove();
    resolve( true );
  });
}
