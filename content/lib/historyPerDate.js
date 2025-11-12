/* historyPerDate.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для окна истории запросов расширения MobileBalance по датам
 * Редакция:  2025.11.11
 *
*/

let Delay, dbVersion, sleep;                    // Глобальные переменные расширения (из модуля vars.mjs)
import('./../../vars.mjs').then( (module) => {
  Delay = module.Delay;
  dbVersion = module.dbVersion;
  sleep = module.sleep;
})
.catch( (err) => { console.log( `[MB] Error: ${err}` ) } );

async function importAwait() {  // Ожидание завершения импорта значений и функций из модуля
  do {                          // Нужно вызвать в первой инициализируемой функци с await
    await new Promise( resolve => setTimeout( resolve, 50 ) );
  } while ( sleep === undefined );
}

let provider = [];                              // Наборы параметров для провайдеров (plugin-ов)
let accounts = [];                              // Наборы параметров для учётных записей
let paintNegative = false;                      // Выделять отрицательные занчения баланса цветом
const workDates = {                             // Объект рабочих переменных с датами для выборок
  curDate: null, maxDate: null, minDate: null,
  curDateStr: '', maxDateStr: '', minDateStr: '',
  respDatePrev: null, respDateNext: null
};

let dbMB, dbTrnsMB, dbObjStorMB, dbCrsrMB;      // Переменные для работы со структурами indexedDB
let dbRequest = indexedDB.open( 'BalanceHistory', dbVersion );
dbRequest.onerror = function( evnt ) {
//        -------
  console.log( `[MB] ${evnt.target.error}` );
}
dbRequest.onupgradeneeded = function( evnt ) {
//        ---------------
  console.log( `[MB] IndexedDB '${evnt.target.result.name}' upgrade needed` );
}
dbRequest.onsuccess = function( evnt ) {
//        ---------
  dbMB = evnt.target.result;
}


// Формирование из даты объекта 'Date' строки в формате <ГГГГ-ММ-ДД>
function makeInputDateStr( inpDate ) {
//       ---------------------------
  return `${String(inpDate.getFullYear())}-` +
         `${(inpDate.getMonth() < 9) ? '0' + String(inpDate.getMonth() + 1) : String(inpDate.getMonth() + 1)}-` +
         `${(inpDate.getDate() < 10) ? '0' + String(inpDate.getDate()) : String(inpDate.getDate())}`;
}

// Формирование из строки в формате <ГГГГ-ММ-ДД> объекта даты 'Date'
function makeInputDateObj( inpDate ) {
//       ---------------------------
  d = new Date();
  d.setFullYear( Number(inpDate.split( '-' )[ 0 ]) );
  d.setMonth( Number(inpDate.split( '-' )[ 1 ]) - 1 );
  d.setDate( Number(inpDate.split( '-' )[ 2 ]) );
  d.setHours( 0, 0, 0, 0 );
  return d;
}

// Формирование даты для поиска запросов
function calcBoundDates( inpDate ) {
//       -------------------------
  // Начало запросов по входящей дате всегда от начала суток, устанавливаем время 00:00:00
  workDates.respDatePrev = new Date( inpDate );
  workDates.respDatePrev.setHours( 0, 0, 0, 0 );
  // Конец запросов по входящей дате всегда в конце суток, устанавливаем время 23:59:59
  workDates.respDateNext = new Date( Number( workDates.respDatePrev ) + 86399999 );
  // 86399999 = сутки - 1 мсек = 86400000 - 1 = (1000 * 60 * 60 * 24) - 1
}


// Получение граничных записей о запросах в хранилище 'Phones'
async function dbGetTotalBounds( dir ) {
//             -----------------------
  return new Promise((resolve, reject) => {
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' ); // Открываем хранилище 'Phones'
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
    dbObjStorMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    dbCrsrMB = dbObjStorMB.openCursor( null, dir ); // Создаём курсор обратного направления на первичном ключе
    dbCrsrMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    dbCrsrMB.onsuccess = function( evnt ) {
      let dbRec = evnt.target.result;
      if (dbRec) resolve( dbRec.value ) // В хранилище есть записи, возвращаем значение последней записи
      else       resolve( undefined );  // Записей ещё нет
    }
  });
}

// Получение записей истории за дату 'workDates.curDate'
async function dbGetBoundRecords() {
//             -------------------
  return new Promise((resolve, reject) => {
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' );  // Открываем хранилище 'Phones'
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
    dbObjStorMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    dbCrsrMB = dbObjStorMB.openCursor(                        // Создаём курсор на первичном ключе
      IDBKeyRange.bound( Number(workDates.respDatePrev),      //   в диапазоне времени по дате 'curSate'
                         Number(workDates.respDateNext) ) );
    dbCrsrMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    let response = [];
    dbCrsrMB.onsuccess = function( evnt ) {
      let dbRec = evnt.target.result;
      if ( dbRec ) {
        response.push( dbRec.value );
        dbRec.continue();
      }
      else
        resolve( response );
    }
  });
}

initCommonParams();


// Инициализация переменных из 'local.storage' и дат для запросов
async function initCommonParams() {
//             ------------------
  await importAwait();  // Ожидание завершения импорта значений и функций из модуля
  do {  // Ждём, пока иницализируется объект доступа к хранилищу
    await sleep( 50 );
  } while ( dbMB === undefined );
  // Получаем записи с минимальным и максимальным значениями даты запроса в хранилище
  let d = await dbGetTotalBounds( 'next' );
  workDates.minDate = new Date( ( d !== undefined ) ? ( d.QueryDateTime ) : null );
  d = await dbGetTotalBounds( 'prev' );
  workDates.maxDate = new Date( ( d !== undefined ) ? ( d.QueryDateTime ) : null );
  if ( ( workDates.curDate = new Date() ) > workDates.maxDate )   // Если текущая дата больше максимальной,
    workDates.curDate = workDates.maxDate;                        //   то текущую дату принимаем = максимальной
  calcBoundDates( workDates.curDate );                            // Определяем диапазон времени для поиска записей
  // Заносим значения в <input type='date'>
  curDateInput.value = workDates.curDateStr = makeInputDateStr( workDates.curDate );  // Текущая дата в формате <ГГГГ-ММ-ДД>
  curDateInput.max   = workDates.maxDateStr = makeInputDateStr( workDates.maxDate );  // Максимальная дата в формате <ГГГГ-ММ-ДД>
  curDateInput.min   = workDates.minDateStr = makeInputDateStr( workDates.minDate );  // Максимальная дата в формате <ГГГГ-ММ-ДД>

  provider = (await chrome.storage.local.get( 'provider' )).provider;
  accounts = (await chrome.storage.local.get( 'accounts' )).accounts;
  paintNegative = (await chrome.storage.local.get( 'markNegative' )).markNegative;
  chrome.storage.local.get( 'historyShowMaintained' )             // Считываем режим отображения учётных данных, исключённых из опроса
  .then( async function( result ) {                               // Если это значение есть - актуализаруем переключатель
    if ( result.historyShowMaintained !== undefined ) {
      showMaintained.checked = result.historyShowMaintained;
    }
    else { // Если значения в хранилище нет - создаём его со значением true (= показывать учётные данные, исключённые из опроса)
      chrome.storage.local.set( { historyShowMaintained: true } );
      showMaintained.checked = true;
    }
  })

  accounts.forEach( function( item ) {                            // Обогащаем наборы параметрами из общих настроек:
    item.loginText = item.loginValue;                             //   - поле для отображения логина в таблице результатов
    // Если значение логина (номера) похоже на номер телефона, то форматируем поле отображение логина
    if ( (item.loginValue.length === 10) && Number.isInteger( Number(item.loginValue) ) )
      item.loginText = `(${item.loginValue.slice(0,3)}) ${item.loginValue.slice(3,6)}-` +
                       `${item.loginValue.slice(6,8)}-${item.loginValue.slice(8)}`;
    item.htmlTableRowId = '';                                     //   - идентификатор строки в таблице отображения результатов
  });
  showTable();                                                    // Отрисовываем результаты запроса на последнюю дату опроса
  // Сделать элементы управления доступными
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = false;
  scrollDiv.focus();                                              // Преходим к таблице, чтобы можно было прокручивать её с клавиатуры
}


async function hideTable() {
//             -----------
  pollingItems.classList.remove( 'makeVisible' );           // Скрыть строки, пока идут операции по их изменению
  pollingTitles.classList.remove( 'makeVisible' );          // Скрыть заголовки, пока не завершено формирование строк
  let tableBody = document.getElementById( 'pollingItems' );
  for ( let i = --tableBody.childElementCount; i >= 0; --i) // Очищаем предыдущую таблицу опроса
    tableBody.children[ i ].remove();
}

async function showTable() {
//             -----------
  await drawPollingItems();                                 // Отрисовываем результаты опроса на выбранную дату
  pollingTitles.classList.add( 'makeVisible' );             // Отобразить заголовки - строки сформированы
  pollingItems.classList.add( 'makeVisible' );              // Отобразить строки - их формирование завершено
}

window.addEventListener( 'keydown', async function( evnt ) {
//     ----------------
  switch( evnt.key ) {
    case 'ArrowLeft': {
      // На время выполнения измемений сделать элементы управления недоступными
      changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = true;
      curDateInput.stepDown();  // Уменьшаем дату на один день (если она меньше минимальной)
      break; }
    case 'ArrowRight': {
      // На время выполнения измемений сделать элементы управления недоступными
      changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = true;
      curDateInput.stepUp();    // Увеличиваем дату на один день (если она меньше максимальной)
      break; }
  }
})

window.addEventListener( 'keyup', async function( evnt ) {
//     ----------------
  switch( evnt.key ) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      hideTable();
      workDates.curDate = makeInputDateObj( curDateInput.value );
      workDates.curDateStr = makeInputDateStr( workDates.curDate );
      calcBoundDates( workDates.curDate );  // Определяем диапазон времени для поиска записей
      showTable();
      // Сделать элементы управления доступными - изменения завершены
      changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = false;
      scrollDiv.focus(); // Преходим к таблице, чтобы можно было прокручивать её с клавиатуры
      break;
    }
  }
})

prevDate.addEventListener( 'click', async function( evnt ) {
//       ----------------
  // На время выполнения измемений сделать элементы управления недоступными
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = true;
  hideTable();
  curDateInput.stepDown();  // Уменьшаем дату на один день (если она меньше минимальной)
  workDates.curDate = makeInputDateObj( curDateInput.value );
  workDates.curDateStr = makeInputDateStr( workDates.curDate );
  calcBoundDates( workDates.curDate );  // Определяем диапазон времени для поиска записей
  showTable();
  // Сделать элементы управления доступными - изменения завершены
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = false;
  evnt.target.focus(); // Оставляем фокус на кнопке, если она была 'нажата' с клавиатуры, то можно сделать это повторно
})

nextDate.addEventListener( 'click', async function( evnt ) {
//       ----------------
  // На время выполнения измемений сделать элементы управления недоступными
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = true;
  hideTable();
  curDateInput.stepUp();  // Увеличиваем дату на один день (если она меньше максимальной)
  workDates.curDate = makeInputDateObj( curDateInput.value );
  workDates.curDateStr = makeInputDateStr( workDates.curDate );
  calcBoundDates( workDates.curDate );  // Определяем диапазон времени для поиска записей
  showTable();
  // Сделать элементы управления доступными - изменения завершены
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = false;
  evnt.target.focus(); // Оставляем фокус на кнопке, если она была 'нажата' с клавиатуры, то можно сделать это повторно
})

curDateInput.addEventListener( 'keydown', async function( evnt ) {
//           ----------------
  // Запрещаем прямой ввод значений в поля <input type='date'>
  if ( evnt.key !== 'Tab' )   // для всех клавиш, кроме 'Tab'
    evnt.preventDefault();
})

curDateInput.addEventListener( 'change', async function( evnt ) {
//           ----------------
  // На время выполнения измемений сделать элементы управления недоступными
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = true;
  hideTable();
  if ( evnt.target.validity.valid ) {     // Принимаем дату, если в ней нет ошибок
    workDates.curDate = makeInputDateObj( curDateInput.value );
    workDates.curDateStr = makeInputDateStr( workDates.curDate );
    calcBoundDates( workDates.curDate );  // Определяем диапазон времени для поиска записей
  }
  showTable();
  // Сделать элементы управления доступными - изменения завершены
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = false;
})

// Обработка изменений переключателя отображения учётных данных, исключённых из опроса
showMaintained.addEventListener( 'change', async function() {
  // На время выполнения измемений сделать элементы управления недоступными
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = true;
  hideTable();
  chrome.storage.local.set( { historyShowMaintained: showMaintained.checked } ); // Сохраняем значение в хранилище
  showTable();
  // Сделать элементы управления доступными - изменения завершены
  changeMode.disabled = curDateInput.disabled = prevDate.disabled = nextDate.disabled = showMaintained.disabled = false;
});


// Открыть сайт провайдера
function providerOpenSite ( event ) {
  if ( !event.type === 'click' ) return; // Реагируем только на клик кнопки мыши
  let tabId = undefined;
  let tabIndex = undefined;
  let winId = undefined;
  let startUrl = event.currentTarget.dataset.startUrl;
  let startUrlBypassCache = event.currentTarget.dataset.startUrlBypassCache === '1';
  let startUrlClearCookies = event.currentTarget.dataset.startUrlClearCookies === '1';

  chrome.tabs.create( { active: false } )                                               // Создаём новую неактивную вкладку
  .then( function( response ) {
    tabId =    response.id;                                                             // Открываем на созданной вкладке сайт провайдера
    tabIndex = response.index;
    winId =    response.windowId;
    chrome.tabs.update( tabId, { url: startUrl, autoDiscardable: false } )
    .then( async function ( response ) {
      if ( startUrlClearCookies || startUrlBypassCache ) {
        let pageResponse = undefined;
        do { // Ждём завершения загрузки страницы
          await sleep ( 200 );                                                          // Пауза для завершения загрузки страницы
          pageResponse = await chrome.tabs.get( tabId );                                // Получаем параметры вкладки,
        } while ( pageResponse !== undefined && pageResponse.status !== 'complete' );   //   контролируем в них статаус загрузки страницы

        // Если для провайдера запрошено удаление cookies со страницы авторизации, то инициируем их очистку
        if ( startUrlClearCookies ) {
          if ( pageResponse.url !== '' ) {  // Получаем из параметров вкладки актуальный URL (после перехода на StartURL могли быть перенаправления)
            let domainStr = ( new URL( pageResponse.url ) ).hostname.split( '.' );
            domainStr = domainStr[ domainStr.length - 2 ] + '.' + domainStr[ domainStr.length - 1 ]; // Выделяем из URL только домен первого уровня
            // Получаем для выявленного домена все cookie в браузере
            await chrome.cookies.getAll( { domain: domainStr } )
            .then( async function( cookieArr ) {
              if ( cookieArr.length > 0 ) { // Если cookie для выявленного домена в браузере найдены, то удаляем их
                for ( let i = cookieArr.length - 1; i >= 0; --i ) {
                  await chrome.cookies.remove( { name: cookieArr[ i ].name,
                                                 url: `http${( cookieArr[ i ].secure ? 's' : '' )}://` +
                                                      `${cookieArr[ i ].domain}${cookieArr[ i ].path}` } )
                  .catch( function( err ) {} ); // Ошибки подавляем
                }
              }
            })
            .catch( function( err ) {} ); // Ошибки подавляем
          }
        }
        // Если выполнялось удаление cookies для провайдера, то обновление страницы уже завершено и нужно обновить её повторно. Но если запрошено и
        //  обновление страницы с сервера, то она будет обновлена при обработке этого параметра

        // Если для провайдера запрошено обновление страницы с сервера, то выполняем его с параметром 'bypassCache: true' (аналог нажатия Ctrl+F5)
        if ( startUrlBypassCache )
          await chrome.tabs.reload( tabId, { bypassCache: true } )
        else  // Повторное обновление страницы после удаления cookies для провайдера
          await chrome.tabs.update( tabId, { url: startUrl, autoDiscardable: false } )
      }
      return chrome.tabs.highlight( { windowId: winId, tabs: tabIndex } );  // Переходим на вкладку с сайтом провайдера
    })
    .catch( function( err ) { console.log( `[MB] Error occured: ${err}` ) });
  })
}


// Отрисовка учётных записей опроса на выбранную дату в порядке, указанном в настройках
async function drawPollingItems() {
//             ------------------
  let tableBody = document.getElementById( 'pollingItems' );
  if ( accounts.length === 0 ) {
    let tableRow = document.createElement( 'tr' );
    let tableCell = document.createElement( 'td' );
    tableCell.setAttribute( 'colspan', pollingTitles.children[ 0 ].childElementCount );
    tableCell.style.textAlign = 'center';
    tableCell.style.fontSize = 'medium';
    tableCell.style.color = '#800000';
    tableCell.textContent = `Не определены учётные данные для отображения истории запросов`;
    tableCell.style.width = '-webkit-fill-available';
    tableRow.insertAdjacentElement( 'beforeend', tableCell );
    tableBody.insertAdjacentElement( 'beforeend', tableRow );
    return;
  }
  let responseRecords = await dbGetBoundRecords();      // Получаем записи истории запросов на дату 'workDates.curDate'
  accounts.findIndex( function( item, index ) {
    if ( !item.maintain && !showMaintained.checked )    // Не формировать строки для записей, исключённых из опроса
      return false;
    item.htmlTableRowId = String(index);
    let tableRow = document.createElement( 'tr' );
    tableRow.id = item.htmlTableRowId;
    if ( !item.maintain ) // Для учётных данных с отметкой 'без участия в опросе' меняем стиль
      tableRow.classList.toggle( 'noMaintain' );
    tableBody.insertAdjacentElement( 'beforeend', tableRow );
    // Выясняем, есть ли в истории запись по учётным данным
    let recIdx = responseRecords.findIndex( function( recItem, recIndex ) {
      return ( recItem.PhoneNumber === item.loginValue );
    });
    // Создаём ячейки для строки учётных данных (заголовок: 'Название', 'Номер (логин)' 'Баланс/Кредит', 'Дельта', 'Не менялся',
    //   'Баланс2/Баланс3', 'SMS', 'Минуты', 'Интернет', 'Блок.', 'До (дата)', 'Услуги', 'Провайдер', 'Получено' )
    for ( let i = 0; i < pollingTitles.children[ 0 ].childElementCount; i++ ) {
      let tableCell = document.createElement( 'td' );
      switch( i ) {
        case 0: { // Поле времени выполнения запроса по учётным данным (пустое до завершения запроса)
          tableCell.style.textAlign = 'left';
          tableCell.id = item.htmlTableRowId + '-time';
          if ( recIdx >= 0 )
            createDataStr( new Date( responseRecords[ recIdx ].QueryDateTime ), tableCell );
          break; }
        case 1: { // Название учётных данных
          tableCell.style.textAlign = 'left';
          tableCell.id = item.htmlTableRowId + '-description';
          tableCell.textContent = item.description;
          break; }
        case 2: { // Логин учётных данных (номер)
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-login';
          tableCell.textContent = item.loginText;
          break; }
        case 3: { // Поля баланса для учётных данных / кредита при наличии в тарифе (пустые до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.style.fontWeight = 'bold';
          tableCell.id = item.htmlTableRowId + '-balance';
          if ( recIdx >= 0 )
          createPairBalanceStr( responseRecords[ recIdx ].Balance.toFixed(2),
                                ( responseRecords[ recIdx ].KreditLimit !== 0 ) ? responseRecords[ recIdx ].KreditLimit.toFixed(2) : '-',
                                tableCell );
          break; }
        case 4: { // Поле отличия значения баланса от значения предыдущего запроса (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-delta';
          tableCell.textContent = ( recIdx >= 0 ) ? responseRecords[ recIdx ].BalDelta.toFixed(2) : '';
          break; }
        case 5: { // Поле количества дней в течение которых баланс не изменялся (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-noChange';
          if ( recIdx >= 0 ) {
            tableCell.textContent = `${responseRecords[ recIdx ].NoChangeDays} дн.`;
            if ( (responseRecords[ recIdx ].Warning & 1) === 1 ) { // Выделяем цветом, если баланс не изменялся дольше, чем указано
              tableCell.style.color = '#FF0000';
              tableCell.style.fontWeight = 'bold';
            }
          }
          else tableCell.textContent = '';
          break; }
        case 6: { // Значения полей 'Balance2' / 'Balance3' при наличии в тарифе (пустые до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-bal23';
          if ( recIdx >= 0 ) {
            tableCell.innerHTML = ( responseRecords[ recIdx ].Balance2 > 0 ) ? responseRecords[ recIdx ].Balance2.toFixed(2) : '-';
            tableCell.innerHTML += ( responseRecords[ recIdx ].Balance3 > 0 ) ? `<br>${responseRecords[ recIdx ].Balance3.toFixed(2)}` : `<br>-`;
          }
          break; }
        case 7: { // Поле SMS для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-sms';
          if ( recIdx >= 0 ) {
            if ( responseRecords[ recIdx ].SMS < 0 ) { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
            tableCell.style.textAlign = 'center';
            tableCell.textContent = '\u221E';
            }
            else
              tableCell.textContent = ( responseRecords[ recIdx ].SMS === 0 ) ? '' : String(responseRecords[ recIdx ].SMS);
          }
          break; }
        case 8: { // Поле минут для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-minutes';
          if ( recIdx >= 0 ) {
            if ( responseRecords[ recIdx ].Minutes < 0 ) { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
            tableCell.style.textAlign = 'center';
            tableCell.textContent = '\u221E';
            }
            else
              tableCell.textContent = ( responseRecords[ recIdx ].Minutes === 0 ) ? '' : String(responseRecords[ recIdx ].Minutes);
          }
          break; }
        case 9: { // Поле интернета для учётных данных (пустое до завершения запроса)
          tableCell.textContent = '';
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-internet';
          if ( recIdx >= 0 ) {
            if ( responseRecords[ recIdx ].Internet < 0 ) {         // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
              tableCell.style.textAlign = 'center';
              tableCell.textContent = '\u221E';
            }
            if ( responseRecords[ recIdx ].Internet > 0 ) {         // Отображаем интернет-трафик в единицах, указанных в настройках для провайдера
              let pIdx = provider.findIndex( function( pItem ) {    // Определяем провайдера для текущих учётных данных
                if ( pItem.name === item.provider ) return true;
              });
              let tmpInetUnits = ( pIdx < 0 ) ? 'A': provider[ pIdx ].inetUnits;  // Если провайдер не найден, то отображанм остаток Интернет-трафика с автовыбором размерности
              if ( tmpInetUnits === 'A' ) {                                       // При указании автовыбора определяем размерность отображения остатка Интернет-трафика
                if ( responseRecords[ recIdx ].Internet < 1024 ) tmpInetUnits = 'M'
                else
                  if ( ( responseRecords[ recIdx ].Internet / 1024 ) < 1024 ) tmpInetUnits = 'G'
                  else tmpInetUnits = 'T';
              }
              switch ( tmpInetUnits ) {
                case 'T': {
                  tableCell.textContent = ( responseRecords[ recIdx ].Internet / 1048576 ).toFixed(2) + ' Тб';
                  break;
                }
                case 'G': {
                  tableCell.textContent = ( responseRecords[ recIdx ].Internet / 1024 ).toFixed(2) + ' Гб';
                  break;
                }
                case 'M': {
                  tableCell.textContent = ( responseRecords[ recIdx ].Internet ).toFixed(2) + ' Мб';
                  break;
                }
              }
              tableCell.style.whiteSpace = 'nowrap';
            }
          }
          break; }
        case 10: { // Поле даты завершения оплаченного периода для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-turnOffStr';
          if ( recIdx >= 0 )
            tableCell.textContent = responseRecords[ recIdx ].TurnOffStr;
          break; }
        case 11: { // Поле статуса блокировки для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-blockStatus';
          if ( recIdx >= 0 ) {
            tableCell.textContent = responseRecords[ recIdx ].BlockStatus;
            if ( (responseRecords[ recIdx ].Warning & 2) === 2 ) { // Выделяем цветом, если изменился статус блокировки
              tableCell.style.color = '#FF0000';
              tableCell.style.fontWeight = 'bold';
            }
          }
          break; }
        case 12: { // Поле состава услуг для учётных данных (пустое до завершения запроса)
          tableCell.style.textAlign = 'right';
          tableCell.id = item.htmlTableRowId + '-uslugiOn';
          if ( recIdx >= 0 ) {
            tableCell.textContent = responseRecords[ recIdx ].UslugiOn;
            if ( (responseRecords[ recIdx ].Warning & 4) === 4 ) { // Выделяем цветом, если изменился состав или стоимость услуг
              tableCell.style.color = '#FF0000';
              tableCell.style.fontWeight = 'bold';
            }
          }
          break; }
        case 13: { // Поле логотипа провайдера учётных данных. Если его нет, то ставим картинку по умолчанию
          tableCell.style.textAlign = 'center';
          tableCell.style.verticalAlign = 'middle';
          let pIdx = provider.findIndex( function( pItem ) { // Определяем провайдера для текущих учётных данных
            if ( pItem.name === item.provider ) return true;
          });
          let providerImg = document.createElement( 'img' );
          providerImg.style.height = '24px';
          providerImg.alt = 'icon';
          providerImg.style.cursor = 'pointer';
          providerImg.setAttribute( 'tabindex', '-1' ); // Отключаем возможность перехода на ссылку клавишей табуляции
          providerImg.src = ( ( pIdx < 0 ) || ( provider[ pIdx ].icon === '' ) ) ?
            'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23333333" style="transform:rotate(90deg);"%3E \
            %3Cpath d="M9.75 10C8.23122 10 7 11.2312 7 12.75V16.25C7 17.7688 8.23122 19 9.75 19H14.25C15.7688 19 17 17.7688 17 16.25V12.75C17 11.2312 15.7688 10 14.25 10H9.75ZM8.5 12.75C8.5 12.0596 9.05964 11.5 9.75 11.5H12V14H8.5V12.75ZM8.5 15.5H12V17.5H9.75C9.05964 17.5 8.5 16.9404 8.5 16.25V15.5ZM13.5 17.5V11.5H14.25C14.9404 11.5 15.5 12.0596 15.5 12.75V16.25C15.5 16.9404 14.9404 17.5 14.25 17.5H13.5Z"/%3E \
            %3Cpath d="M7.25 2C5.45507 2 4 3.45507 4 5.25V18.75C4 20.5449 5.45507 22 7.25 22H16.75C18.5449 22 20 20.5449 20 18.75V9.28553C20 8.42358 19.6576 7.59693 19.0481 6.98744L15.0126 2.9519C14.4031 2.34241 13.5764 2 12.7145 2H7.25ZM5.5 5.25C5.5 4.2835 6.2835 3.5 7.25 3.5H12.7145C13.1786 3.5 13.6237 3.68437 13.9519 4.01256L17.9874 8.0481C18.3156 8.37629 18.5 8.82141 18.5 9.28553V18.75C18.5 19.7165 17.7165 20.5 16.75 20.5H7.25C6.2835 20.5 5.5 19.7165 5.5 18.75V5.25Z"/%3E \
            %3C/svg%3E' : provider[ pIdx ].icon;
          if ( pIdx < 0 ) { // Если провайдер не найден, то ссылку на сайт провайдера не формируем
            providerImg.title = 'Провайдер не определён';
            providerImg.setAttribute( 'data-start-url', '' );
            providerImg.setAttribute( 'data-start-url-bypass-cache', '0' );
          }
          else {
            providerImg.title = 'Открыть сайт';
            providerImg.setAttribute( 'data-start-url', provider[ pIdx ].startUrl );
            providerImg.setAttribute( 'data-start-url-bypass-cache', ( provider[ pIdx ].startUrlBypassCache )? '1' : '0' );
            providerImg.setAttribute( 'data-start-url-clear-cookies', ( provider[ pIdx ].startUrlClearCookies )? '1' : '0' );
            providerImg.onclick = providerOpenSite;
          }
          tableCell.insertAdjacentElement( 'beforeend', providerImg );
          break; }
        case 14: {  // Тарифный план по учётным данным
          tableCell.style.textAlign = 'left';
          tableCell.id = item.htmlTableRowId + '-tarifPlan';
          if ( recIdx >= 0 ) {
            tableCell.textContent = responseRecords[ recIdx ].TarifPlan;
            if ( (responseRecords[ recIdx ].Warning & 8) === 8 ) { // Выделяем цветом, если изменился тариф
              tableCell.style.color = '#FF0000';
              tableCell.style.fontWeight = 'bold';
            }
          }
          break; }
        case 15: {  // Лицевой счёт
          tableCell.style.textAlign = 'center';
          tableCell.id = item.htmlTableRowId + '-licSchet';
          if ( recIdx >= 0 )
            tableCell.textContent = responseRecords[ recIdx ].LicSchet;
          break; }
        case 16: {  // ФИО владельца
          tableCell.style.textAlign = 'left';
          tableCell.id = item.htmlTableRowId + '-userName';
          if ( recIdx >= 0 )
            tableCell.textContent = responseRecords[ recIdx ].UserName;
          break; }
      } /* switch */
      tableRow.insertAdjacentElement( 'beforeend', tableCell );
    }
    return false; // По всем значениям возвращаем false, чтобы пройти по всем элементам
  });

  function createPairBalanceStr( balStr, limitStr, parentTag ) { // Формирование отображения значений в 2 строки
  //       ---------------------------------------------------
    // Если есть элементы отображения значений предыдущего запроса - удаляем их
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

  function createDataStr( d, parentTag ) { // Формирование даты/времени запроса в 2 строки
  //       -----------------------------
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
}


changeMode.addEventListener( 'click', function( evnt ) {
//         ----------------
  window.location.replace( './history.html' );
})
