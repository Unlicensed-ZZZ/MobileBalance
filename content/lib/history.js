/* history.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для окна истории запросов расширения MobileBalance по учётным данным
 * Редакция:  2025.08.04
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

let provider = [];                         // Наборы параметров для провайдеров (plugin-ов)
let accounts = [];                         // Наборы параметров для учётных записей
let paintNegative = false;                 // Выделять отрицательные занчения баланса цветом

let dbMB, dbTrnsMB, dbObjStorMB, dbCrsrMB; // Переменные для работы со структурами indexedDB
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


// Текущее количества записей в хранилище по учётным данным
async function dbRecordsCount( item = '' ) {
//             ---------------------------
  return new Promise( (resolve, reject) => {
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' );
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );

    dbObjStorMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    // Если нет входного параметра (пустая строка), то получаем общее количество записей в хранилище
    // Если входной параметр (логин) есть, то получаем количество записей с его значением с помощью индекса
    let dbRecCntMB = ( item === '') ? dbObjStorMB.count() : dbObjStorMB.index( 'PhoneNumber' ).count( item );

    dbRecCntMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    dbRecCntMB.onsuccess = function( evnt ) {
      resolve( dbRecCntMB.result );
    }
  });
}

initCommonParams();


// Инициализация переменных из local storage
async function initCommonParams() {
//             ------------------
  await importAwait();  // Ожидание завершения импорта значений и функций из модуля
  do {  // Ждём, пока иницализируется объект доступа к хранилищу
    await sleep( 50 );
  } while ( dbMB === undefined );
  provider = (await chrome.storage.local.get( 'provider' )).provider;
  accounts = (await chrome.storage.local.get( 'accounts' )).accounts;
  paintNegative = (await chrome.storage.local.get( 'markNegative' )).markNegative;
  accounts.forEach( function( item ) {
    item.loginText = item.loginValue; // добавляем в структуру поле для отображения логина в таблице
    // Если значение логина (номера) похоже на номер телефона, то форматируем поле для отображения логина
    if ( (item.loginValue.length === 10) && Number.isInteger( Number(item.loginValue) ) )
      item.loginText = `(${item.loginValue.slice(0,3)}) ${item.loginValue.slice(3,6)}-` +
                       `${item.loginValue.slice(6,8)}-${item.loginValue.slice(8)}`;
  });
  Promise.allSettled(
    // Функция отрисовки возвращает массив promise по получению количества записей в хранилище для каждой строки данных.
    // Контролируем их исполнение и только после этого идём дальше. Делаем это для того, чтобы показать таблицу
    // заголовочного списка учётных данных только после её формирования. Иначе она "дрожит", наполняясь значениями
    drawHistoryItems()            // Отрисовка списка учётных данных в порядке, указанном в настройках
  ).then( () => {
    // Таблица заголовочного списка учётных данных скрыта (class='makeBlind'). Делаем её видимой
    historyItems.style.height = 'auto';
    historyItems.classList.add( 'makeVisible' );
    // Кнопка смены режима отображения истории запросов (по учётным данным / по датам) не активна, чтобы избежать её
    //   нажатия до получения данных из хранилища. Иначе будут ошибки работы с хранилищем. Теперь данные получены
    changeMode.disabled = false;  // Активируем кнопку
    historyItems.focus();         // Преходим к таблице, чтобы можно было прокручивать её с клавиатуры
  });
}


// Открыть сайт провайдера
function providerOpenSite ( event ) {
  if ( !event.type === 'click' ) return; // Реагируем только на клик кнопки мыши
  let tabId = undefined;
  let tabIndex = undefined;
  let winId = undefined;
  let startUrl = event.currentTarget.dataset.startUrl;
  let startUrlBypassCache = event.currentTarget.dataset.startUrlBypassCache === '1';
  let startUrlClearCookies = event.currentTarget.dataset.startUrlClearCookies === '1';

  chrome.tabs.create( { active: false } )                                   // Создаём новую вкладку
  .then( function( response ) {
    tabId =    response.id;                                                 // Открываем на созданной вкладке сайт провайдера
    tabIndex = response.index;
    winId =    response.windowId;
    chrome.tabs.update( tabId, { url: startUrl, autoDiscardable: false } )
    .then( async function ( response ) {
      if ( startUrlClearCookies || startUrlBypassCache ) {
        let resp = undefined;
        do { // Ждём завершения загрузки страницы
          await sleep( 200 );                                               // Пауза для завершения загрузки страницы
          resp = await chrome.tabs.get( tabId );                            // Получаем параметры вкладки,
        } while ( resp !== undefined && resp.status !== 'complete' );       //   контролируем в них статаус загрузки страницы
        // Если для провайдера запрошено удаление cookies со страницы авторизации, то инициируем их очистку
        if ( startUrlClearCookies ) {
          await chrome.scripting.executeScript( { target: { tabId: tabId }, files: [ `./content/lib/clearCookies.js` ] } );
          await sleep( 300 );                                               // Пауза для завершения загрузки и выполнения скрипта
        }
        // Если для провайдера запрошено обновление страницы с сервера (сброс кэша), то выполняем обновление страницы с сервера (bypassCache=true)
        if ( startUrlBypassCache ) { // Обновление с параметром 'bypassCache' = 'true' должно инициировать загрузку страницы с сервера (как нажатие Ctrl+F5)
          await chrome.tabs.reload( tabId, { bypassCache: true } );
          await sleep( 200 );                                               // Пауза для завершения загрузки страницы
        }
      }
      return chrome.tabs.highlight( { windowId: winId, tabs: tabIndex } );  // Переходим на вкладку с сайтом провайдера
    })
    .catch( function ( err ) { console.log( `[MB] Error occured: ${err}` ) } ) 
  })
}


// Отрисовка заголовочного списка учётных данных в порядке, указанном в настройках
function drawHistoryItems() {
//       ------------------
  let promiseArr = [];
  dbRecordsCount()
  .then( (result) => {
    totalRecCounter.innerHTML = `Записей:&nbsp;<b>${String(result)}</b>`;
  });
  if (accounts.length === 0) {
    let tableRow = document.createElement( 'tr' );
    let tableCell = document.createElement( 'td' );
    tableCell.setAttribute( 'colspan', historyTitles.children[ 0 ].childElementCount );
    tableCell.style.textAlign = 'center';
    tableCell.style.fontSize = 'medium';
    tableCell.style.color = '#800000';
    tableCell.textContent = `Не определены учётные данные для отображения истории запросов`;
    tableCell.style.width = '-webkit-fill-available';
    tableRow.insertAdjacentElement( 'beforeend', tableCell );
    tableRow.style.display = 'flex';
    historyItems.insertAdjacentElement( 'beforeend', tableRow );
    return promiseArr;
  }
  accounts.forEach( function( item, index ) {
    let pIdx = provider.findIndex( function( pItem ) { // Определяем провайдера для текущих учётных данных
      return ( pItem.name === item.provider );
    });
    let tableRow = document.createElement( 'tr' );
    tableRow.id = `${String(index)}-(${item.loginValue})`;
    if (!item.maintain) // Для учётных данных с отметкой 'без участия в опросе' меняем стиль
      tableRow.classList.toggle( 'noMaintain' );
    historyItems.insertAdjacentElement( 'beforeend', tableRow );
    // Создаём ячейки для строки учётных данных ( заголовок: 'Название', 'Номер (логин)',
    //   'Провайдер', 'ячейка для кнопок управления записями' )
    for ( let i = 0; i < historyTitles.children[ 0 ].childElementCount; i++ ) {
      let tableCell = document.createElement( 'td' );
      switch( i ) {
        case 0: { // Название учётных данных
          tableCell.style.textAlign = 'left';
          tableCell.style.flex = '0 1 25em';
          tableCell.textContent = item.description;
          break; }
        case 1: { // Логин учётных данных (номер)
          tableCell.style.textAlign = 'center';
          tableCell.style.flex = '0 1 10em';
          tableCell.textContent = item.loginText;
          break; }
        case 2: {
          let wrapperDiv = document.createElement( 'div' );
          wrapperDiv.style.display = 'flex';
          wrapperDiv.style.alignItems = 'center';
          wrapperDiv.style.justifyContent = 'space-between';
//          wrapperDiv.style.pointerEvents = 'none'; // Не давать элементам внутри div реагировать на события мыши
//        Убрано после того, как понадобилось сделать кликабельным изображение логотипа провайдера
          let providerName = document.createElement( 'div' );
          providerName.textContent = ( pIdx < 0 ) ? 'Параметры провайдера не найдены' :
            (( provider[ pIdx ].custom ) ? '\u2605 ' : '') + provider[ pIdx ].description; // Провайдеров добавленных пользователем выделяем '★' в начале наименования
          wrapperDiv.insertAdjacentElement( 'beforeend', providerName );
          let providerSite = document.createElement( 'img' );
          providerSite.src = ( ( pIdx < 0 ) || ( provider[ pIdx ].icon === '' ) ) ?
            'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23333333" style="transform:rotate(90deg);"%3E \
            %3Cpath d="M9.75 10C8.23122 10 7 11.2312 7 12.75V16.25C7 17.7688 8.23122 19 9.75 19H14.25C15.7688 19 17 17.7688 17 16.25V12.75C17 11.2312 15.7688 10 14.25 10H9.75ZM8.5 12.75C8.5 12.0596 9.05964 11.5 9.75 11.5H12V14H8.5V12.75ZM8.5 15.5H12V17.5H9.75C9.05964 17.5 8.5 16.9404 8.5 16.25V15.5ZM13.5 17.5V11.5H14.25C14.9404 11.5 15.5 12.0596 15.5 12.75V16.25C15.5 16.9404 14.9404 17.5 14.25 17.5H13.5Z"/%3E \
            %3Cpath d="M7.25 2C5.45507 2 4 3.45507 4 5.25V18.75C4 20.5449 5.45507 22 7.25 22H16.75C18.5449 22 20 20.5449 20 18.75V9.28553C20 8.42358 19.6576 7.59693 19.0481 6.98744L15.0126 2.9519C14.4031 2.34241 13.5764 2 12.7145 2H7.25ZM5.5 5.25C5.5 4.2835 6.2835 3.5 7.25 3.5H12.7145C13.1786 3.5 13.6237 3.68437 13.9519 4.01256L17.9874 8.0481C18.3156 8.37629 18.5 8.82141 18.5 9.28553V18.75C18.5 19.7165 17.7165 20.5 16.75 20.5H7.25C6.2835 20.5 5.5 19.7165 5.5 18.75V5.25Z"/%3E \
            %3C/svg%3E' : provider[ pIdx ].icon;
          providerSite.style.height = '24px';
          providerSite.style.cursor = 'pointer';
          providerSite.setAttribute( 'tabindex', '-1' ); // Отключаем возможность перехода на ссылку клавишей табуляции
          if ( pIdx < 0 ) { // Если провайдер не найден, то ссылку на сайт провайдера не формируем
            providerSite.title = 'Провайдер не определён';
            providerSite.setAttribute( 'data-start-url', '' );
            providerSite.setAttribute( 'data-start-url-bypass-cache', '0' );
          }
          else {
            providerSite.title = 'Открыть сайт';
            providerSite.setAttribute( 'data-start-url', provider[ pIdx ].startUrl );
            providerSite.setAttribute( 'data-start-url-bypass-cache', ( provider[ pIdx ].startUrlBypassCache )? '1' : '0' );
            providerSite.setAttribute( 'data-start-url-clear-cookies', ( provider[ pIdx ].startUrlClearCookies )? '1' : '0' );
            providerSite.onclick = providerOpenSite;
          }
          wrapperDiv.insertAdjacentElement( 'beforeend', providerSite );
          tableCell.insertAdjacentElement( 'beforeend', wrapperDiv );
          tableCell.style.flex = '1 1 auto';
          break; }
        case 3: { // Для заголовочных строк учётных данных вставляем кнопки управления записями
          let wrapperDiv = document.createElement( 'div' );
          wrapperDiv.style.display = 'flex';
          wrapperDiv.style.alignItems = 'center';
          wrapperDiv.style.justifyContent = 'flex-start';
          wrapperDiv.style.flexDirection = 'column';
            // Количество записей истории по учётным данным
            let recordCounter = document.createElement( 'div' );
            recordCounter.id = `${String(index)}-(${item.loginValue})-recordCounter`;
            recordCounter.style.textAlign = 'center';
            recordCounter.style.fontSize = 'x-small';
            let result = undefined;   // Собираем все promise получения количества записей в хранилище, чтобы вернуть из
            promiseArr.push( result = dbRecordsCount( item.loginValue ) ); // функции их массив для контроля исполнения
            result.then( ( cnt ) => {
              recordCounter.innerHTML = `Записей:&nbsp;<b>${String(cnt)}</b>`;
            });
          wrapperDiv.insertAdjacentElement( 'beforeend', recordCounter );
            let buttonContainer = document.createElement( 'div' );
              // Кнопка удаления истории по строке учётных данных
              let btnImg = document.createElement( 'img' );
              btnImg.id = `${String(index)}-(${item.loginValue})-deleteAll`;
              btnImg.style.height = '24px';
              btnImg.style.cursor = 'pointer';
              btnImg.src = '../images/deleteAll.svg';
              btnImg.title = 'Удалить историю';
            buttonContainer.insertAdjacentElement( 'beforeend', btnImg );
              // Кнопка развёртывания истории запросов по строке учётных данных
              btnImg = document.createElement( 'img' );
              btnImg.id = `${String(index)}-(${item.loginValue})-expand`;
              btnImg.style.height = '24px';
              btnImg.style.cursor = 'pointer';
              btnImg.src = '../images/Expand.svg';
              btnImg.title = 'Раскрыть историю';
            buttonContainer.insertAdjacentElement( 'beforeend', btnImg );
              // Кнопка свёртывания истории запросов по строке учётных данных
              btnImg = document.createElement( 'img' );
              btnImg.id = `${String(index)}-(${item.loginValue})-collapse`;
              btnImg.style.height = '24px';
              btnImg.style.cursor = 'pointer';
              btnImg.src = '../images/Collapse.svg';
              btnImg.title = 'Свернуть историю';
              btnImg.style.display = 'none';
            buttonContainer.insertAdjacentElement( 'beforeend', btnImg );
          wrapperDiv.insertAdjacentElement( 'beforeend', buttonContainer );
          tableCell.insertAdjacentElement( 'beforeend', wrapperDiv );
          tableCell.style.flex = '0 1 4em';
          break; }
      } /* switch */
      tableRow.insertAdjacentElement( 'beforeend', tableCell );
    }
  });
  // Возвращаем массив всех promise получения количества записей в хранилище для контроля исполнения
  return promiseArr;
}


// Отрисовка истории запросов по указанным учётным данным
async function showHistoryForLogin( rowId, rowLoginValue ) {
//             -------------------------------------------
  let rowPrimaryKey = 0;
  let relationRow = document.getElementById( `${rowId}-(${rowLoginValue})` );
  let loginDecription = relationRow.cells[ 0 ].textContent; // Для идентификации строки при отрисовке данных
  // Вставляем пустую строку после выбранной заголовочной
  let stubRow = document.createElement( 'tr' );
  relationRow.insertAdjacentElement( 'afterend', stubRow );
  // Формируем в ней ячейку и div для внедрения таблиц
  let historyCell = document.createElement( 'td' );
  historyCell.setAttribute( 'colspan', 4 );
  historyCell.style.padding = 0;
  historyCell.style.width = '-webkit-fill-available';
  stubRow.insertAdjacentElement( 'beforeend', historyCell );
  let historyPlace = document.createElement( 'div' );
  historyPlace.align = 'center';
  historyCell.insertAdjacentElement( 'beforeend', historyPlace );

  dbRecordsCount( rowLoginValue )
  .then( function( rec ) {
    if ( rec === 0) { // Заглушка для учётных записей без истории запросов
      historyPlace.style.overflow = 'hidden';
      historyPlace.style.textAlign = 'center';
      historyPlace.style.fontSize = 'medium';
      historyPlace.style.color = '#800000';
      historyPlace.textContent = `В хранилище нет записей по учётным данным "${rowLoginValue}"`;
    }
    else { // Прочитываем из хранилища записи истории по учётным данным и формируем из них таблицу
      historyPlace.style.overflow = 'auto';
      historyPlace.style.maxHeight = '56vh';
      let historyTable = document.createElement( 'table' );
      historyTable.classList.add( 'inlayTable' );
      historyTable.style.tableLayout = 'auto';
      // Формируем раздел и строку заголовков таблицы строк истории запросов
      let stubBody = document.createElement( 'thead' );
      let headersRow = document.createElement( 'tr' );
      stubBody.insertAdjacentElement( 'beforeend', headersRow );
      historyTable.insertAdjacentElement( 'beforeend', stubBody );
      historyPlace.insertAdjacentElement( 'beforeend', historyTable );
      [ 'Получено', '<b>Баланс</b>/Кредит', 'Расход', 'Не менялся', 'Баланс2/Баланс3', 'SMS', 'Минуты', 'Интернет', 'До (дата)', 'Блок.',
        'Услуги', 'Тарифный план', 'Лиц.счёт', 'Владелец', '' ].forEach( function( item ) {
        let historyCell = document.createElement( 'th' );
        historyCell.innerHTML = item;
        headersRow.insertAdjacentElement( 'beforeend', historyCell );
      });
      // Формируем тело таблицы строк истории запросов
      stubBody = document.createElement( 'tbody' );
      historyTable.insertAdjacentElement( 'beforeend', stubBody );
      historyPlace.insertAdjacentElement( 'beforeend', historyTable );
      // Наполняем таблицу строками истории запросов
      makeHistoryData( rowId, loginDecription, rowLoginValue, stubBody );
    }
  });
}


// Формирование таблицы истории запросов по указанным учётным данным
async function makeHistoryData( rowIdx, loginDecription, loginValue, bodyTag ) {
//             ---------------------------------------------------------------
  dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' );
  dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
  dbObjStorMB.onerror = function( evnt ) {
    console.log( `[MB] ${evnt.target.error}` );
    reject( evnt.target.error );
  }
  let dbIdxMB = dbObjStorMB.index( 'PhoneNumber' );                        // Создаём курсор на индексе по 'PhoneNumber'
  dbCrsrMB = dbIdxMB.openCursor( IDBKeyRange.only( loginValue ), 'prev' ); // По нему запросим только записи loginValue
  dbCrsrMB.onerror = function( evnt ) {
    console.log( `[MB] ${evnt.target.error}` );
    reject( evnt.target.error );
  }
  let prevRecValue = undefined, prevRow = undefined;
  dbCrsrMB.onsuccess = async function( evnt ) {
    if ( evnt.target.result ) {
      makeHistoryRow( rowIdx, loginDecription, loginValue, evnt.target.result, prevRecValue, prevRow )
      .then( function( historyRow ) {
        prevRow = historyRow; // Последняя созданная строка (возможно в ней понадобится менять цвет ячеек с изменениями)
        prevRecValue = evnt.target.result.value; // Значения последней обработанной записи истории запросов
        historyRow.id = `${String(rowIdx)}-(${String(evnt.target.result.primaryKey)})`;
        bodyTag.insertAdjacentElement( 'beforeend', historyRow );
        evnt.target.result.continue();
      });
    }
  }
};


// Формирование строки для таблицы истории запросов по указанным учётнвм данным
async function makeHistoryRow( rowIdx, loginDecription, loginValue, curRec, prevRecValue, prevRow ) {
//             ------------------------------------------------------------------------------------
  let idx = accounts.findIndex( function( item ) {
    return ( (item.loginValue === loginValue) && (item.description === loginDecription) );
  });
  let pIdx = provider.findIndex( function( pItem ) { // Определяем провайдера для текущих учётных данных
    return ( pItem.name === accounts[ idx ].provider );
  });
  let stubRow = document.createElement( 'tr' );
  // Создаём ячейки для строки учётных данных (заголовок: 'Получено', 'Баланс', 'Дельта', 'Не менялся', 'Баланс2/Баланс3',
  for (let i = 0; i < 15; i++) {                       // 'СМС', 'Минуты', 'Интернет', 'До (дата)', 'Блок.', 'Услуги',
    let tableCell = document.createElement( 'td' );    // 'Тарифный план', 'Лиц.счёт', 'Владелец',
    switch( i ) {                                      // 'ячейка для кнопок управления записями' )
      case 0: { // Поле времени выполнения запроса по учётным данным
        let d = new Date( curRec.value.QueryDateTime );
        tableCell.innerHTML = `${(d.getHours() < 10)   ? '0' + String(d.getHours()) :     String(d.getHours())}:` +
                              `${(d.getMinutes() < 10) ? '0' + String(d.getMinutes()) :   String(d.getMinutes())}:` +
                              `${(d.getSeconds() < 10) ? '0' + String(d.getSeconds()) :   String(d.getSeconds())}<br>` +
                              `${(d.getDate() < 10)    ? '0' + String(d.getDate()) :      String(d.getDate())}.` +
                              `${(d.getMonth() < 9)    ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                              `${String(d.getFullYear())}`;
        break; }
      case 1:  {  // Баланс по учётным данным. Если есть, то и кредитный лимит по ним
        tableCell.style.textAlign = 'right';
        // Если значение баланса отрицательное и установлено выделение таких значений цветом, то меняем цвет строки баланса
        tableCell.innerHTML = `<b>${( paintNegative && ( curRec.value.Balance < 0 ) ) ? '<font color="#FF00FF">' + (curRec.value.Balance).toFixed(2) + '</font>' : (curRec.value.Balance).toFixed(2)}</b><br>${(curRec.value.KreditLimit !== 0 ) ? (curRec.value.KreditLimit).toFixed(2) : '-'}`;
        break; }
      case 2:  {  // Разница баланса, рассчитанная от его значения в предыдущем запросе
        tableCell.style.textAlign = 'right';
        tableCell.textContent = (curRec.value.BalDelta).toFixed(2);
        break; }
      case 3:  {  // Количество дней неизменности суммы баланса, рассчитанное по данным предыдущего запроса
        tableCell.style.textAlign = 'right';
        tableCell.style.whiteSpace = 'nowrap';
        tableCell.textContent = String(curRec.value.NoChangeDays) + ' дн.';
        // Если количество дней превышает заданное, то выделяем значение цветом
        if ( (accounts[ idx ].inactiveRemind !== '') && (Number(accounts[ idx ].inactiveRemind > 0)) &&
             (curRec.value.NoChangeDays > Number(accounts[ idx ].inactiveRemind)) ) {
          tableCell.style.color = '#FF0000';
        }
        break; }
      case 4:  {  // Значения полей 'Balance2' и 'Balance3'. Если есть - значения, если нет - прочерки
        tableCell.style.textAlign = 'right';
        tableCell.innerHTML = ( curRec.value.Balance2 > 0 ) ? (curRec.value.Balance2).toFixed(2) : '-';
        tableCell.innerHTML += ( curRec.value.Balance3 > 0 ) ? `<br>${(curRec.value.Balance3).toFixed(2)}` : `<br>-`;
        break; }
      case 5:  {  // Оставшееся количество SMS
        tableCell.style.textAlign = 'right';
        if (curRec.value.SMS) {
          if ( curRec.value.SMS >= 0 ) // Отображаем количество SMS
            tableCell.textContent = (curRec.value.SMS) ? String(curRec.value.SMS) : ''
          else { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
            tableCell.style.textAlign = 'center';
            tableCell.textContent = '\u221E'
          }
        }
        else // Пакеты не подключены, оплата по условиям тарифа, отображать нечего
          tableCell.textContent = '';
        break; }
      case 6:  { // Оставшееся количество разговорных минут
        tableCell.style.textAlign = 'right';
        if (curRec.value.Minutes) {
          if ( curRec.value.Minutes >= 0 ) // Отображаем количество разговорных минут
            tableCell.textContent = (curRec.value.Minutes) ? String(curRec.value.Minutes) : '';
          else { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
            tableCell.textContent = '\u221E'
            tableCell.style.textAlign = 'center';
          }
        }
        else // Пакеты не подключены, оплата по условиям тарифа, отображать нечего
          tableCell.textContent = '';
        break; }
      case 7:  { // Оставшийся интернет-трафик
        tableCell.style.textAlign = 'right';
        if (curRec.value.Internet) {
          if ( curRec.value.Internet >= 0 ) {
            tableCell.textContent = // Отображаем интернет-трафик в единицах, указанных в настройках для провайдера
              ((pIdx < 0) || provider[ pIdx ].inetUnits === 'G') ? (curRec.value.Internet / 1024).toFixed(2) + ' Гб' :
                                                                   (curRec.value.Internet).toFixed(2) + ' Мб';
            tableCell.style.whiteSpace = 'nowrap';
          }
          else { // -1 = опция безлимитная, отображаем для неё символ бесконечности '∞'
            tableCell.textContent = '\u221E'
            tableCell.style.textAlign = 'center';
          }
        }
        else // Пакеты не подключены, оплата по условиям тарифа, отображать нечего
          tableCell.textContent = '';
        break; }
      case 8:  { // Дата следующего платежа = окончания текущего оплаченного периода услуг = дата отключения
        tableCell.style.textAlign = 'center';
        tableCell.textContent = curRec.value.TurnOffStr;
        break; }
      case 9:  { // Статус блокировки учётных данных. Фиксируем только значения, отличные от "активен"
        tableCell.style.textAlign = 'center';
        tableCell.textContent = curRec.value.BlockStatus;
        // Если статус отличается от принятого при предыдущем опросе, то выделяем значение цветом
        if ( (prevRecValue) && (curRec.value.BlockStatus !== prevRecValue.BlockStatus) )
          prevRow.cells[ i ].style.color = '#FF0000';
        break; }
      case 10:  { // Состав услуг, если их список предполагается в кабинете провайдера
        tableCell.style.textAlign = 'center';
        tableCell.style.whiteSpace = 'nowrap';
        tableCell.textContent = curRec.value.UslugiOn;
        // Если запись состава услуг отличается от принятой при предыдущем опросе, то выделяем значение цветом
        if ( (prevRecValue) && (curRec.value.UslugiOn !== prevRecValue.UslugiOn) )
          prevRow.cells[ i ].style.color = '#FF0000';
        break; }
      case 11: {  // Тарифный план по учётным данным
        tableCell.textContent = curRec.value.TarifPlan;
        // Если запись тарифного плана отличается от принятой при предыдущем опросе, то выделяем значение цветом
        if ( (prevRecValue) && (curRec.value.TarifPlan !== prevRecValue.TarifPlan) )
          prevRow.cells[ i ].style.color = '#FF0000';
        break; }
      case 12: {  // Лицевой счёт
        tableCell.style.textAlign = 'center';
        tableCell.textContent = curRec.value.LicSchet;
        // Если запись лицевого счёта отличается от принятой при предыдущем опросе, то выделяем значение цветом
        if ( (prevRecValue) && (curRec.value.LicSchet !== prevRecValue.LicSchet) )
          prevRow.cells[ i ].style.color = '#FF0000';
        break; }
      case 13: {  // ФИО владельца
        tableCell.textContent = curRec.value.UserName;
        break; }
      case 14: { // Вставляем кнопку для удаления записи
        let btnImg = document.createElement( 'img' );
        btnImg.id = `${String(rowIdx)}-(${String(curRec.primaryKey)})-delete`;
        btnImg.style.height = '24px';
        btnImg.style.cursor = 'pointer';
        btnImg.src = '../images/Delete.svg';
        btnImg.title = 'Удалить запись';
        tableCell.style.textAlign = 'center';
        tableCell.style.width = '1.8vw';
        tableCell.insertAdjacentElement('beforeend', btnImg);
        break; }
    } /* switch */
    stubRow.insertAdjacentElement('beforeend', tableCell);
  }
  return stubRow;
}


// Скрытие истории запросов по указанным учётным данным
async function hideHistoryForLogin( rowId, rowLoginValue ) {
//             -------------------------------------------
  let relationRow = document.getElementById( `${rowId}-(${rowLoginValue})` );
  relationRow.parentElement.deleteRow( relationRow.nextSibling.sectionRowIndex );
}


// Отработка нажатий кнопок в строках таблицы
historyItems.addEventListener( 'click', async function( evnt ) {
//           -----------------
  let rowId, rowLoginValue, rowCommand;
  if ( evnt.target.id.length > 0 ) { // Если событие пришло от элемента, имеющего значение id
    // Разбираем параметры id строки
    let arr = evnt.target.id.split( '-' );
    rowId = (arr[ 0 ]) ? Number(arr[ 0 ]) : -1;
    if ( (arr[ 1 ].startsWith( '(' )) && (arr[ 1 ].endsWith( ')' )) )
      rowLoginValue = (/\((.*)\)/i).exec( arr[ 1 ] )[ 1 ]
    else
      rowLoginValue = '';
    rowCommand = (arr[ 2 ]) ? arr[ 2 ] : '';
  }
  switch( rowCommand ) {
    case 'deleteAll': {
      if ( confirm( `\nИстория запросов для учётных данных "${rowLoginValue}" будет удалена\n\nПродолжить?` ) ) {
        // Если список истории записей по этим учётным данным раскрыт, то закрываем его
        if ( document.getElementById( `${rowId}-(${rowLoginValue})-expand` ).style.display === 'none' ) {
          document.getElementById( `${rowId}-(${rowLoginValue})-expand` ).style.display = '';
          document.getElementById( `${rowId}-(${rowLoginValue})-collapse` ).style.display = 'none';
          hideHistoryForLogin( rowId, rowLoginValue );
        }
        dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
        dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
        dbObjStorMB.onerror = function( evnt ) {
          console.log( `[MB] ${evnt.target.error}` );
        }
        dbIdxMB = dbObjStorMB.index( 'PhoneNumber' ); // Создаём курсор на индексе по 'PhoneNumber'
        dbCrsrMB = dbIdxMB.openCursor( IDBKeyRange.only( rowLoginValue ), 'prev' );
        dbCrsrMB.onerror = function( evnt ) {
          console.log( `[MB] ${evnt.target.error}` );
        }
        dbCrsrMB.onsuccess = function( evnt ) {
          if (evnt.target.result) { // Если запись нашлась, то удаляем её и ищем следующую
              evnt.target.result.delete( evnt.target.result.primaryKey );
              dbCrsrMB.result.continue();
          }
          else {
            dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
            // Обновляем счётчики записей в заголовочной строке учётных данных и заголовке таблицы истории запросов
            dbRecordsCount( rowLoginValue )
            .then( (result) => {
              document.getElementById( `${rowId}-(${rowLoginValue})-recordCounter` ).innerHTML =
                                       `Записей:&nbsp;<b>${String(result)}</b>`;
            });
            dbRecordsCount()
            .then( (result) => {
              totalRecCounter.innerHTML = `Записей:&nbsp;<b>${String(result)}</b>`;
            });
            // Обновляем количество записей в хранилище на странице настроек
            chrome.runtime.sendMessage( { message: 'MB_updateRecordsCount' } );
          }
        }
      }
      break; }
    case 'expand': {
      document.getElementById( evnt.target.id ).style.display = 'none';
      document.getElementById( `${rowId}-(${rowLoginValue})-collapse` ).style.display = '';
      showHistoryForLogin( rowId, rowLoginValue );
      break; }
    case 'collapse': {
      document.getElementById( evnt.target.id ).style.display = 'none';
      document.getElementById( `${rowId}-(${rowLoginValue})-expand` ).style.display = '';
      hideHistoryForLogin( rowId, rowLoginValue );
      break; }
    case 'delete': {
      dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
      dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
      dbObjStorMB.onerror = function( evnt ) {
        console.log( `[MB] ${evnt.target.error}` );
      }
      dbObjStorMB.delete( Number(rowLoginValue) ); // Удаляем указанную запись
      dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
      // Удаляем строку этой записи из таблицы истории заросов
      let relationRow = document.getElementById( `${rowId}-(${rowLoginValue})` );
      // Обновляем счётчики записей в заголовочной строке учётных данных и заголовке таблицы истории запросов
      //                    tbody         table         div           td заг.строки tr заг.строки tr заголовочной строки
      let idx = relationRow.parentElement.parentElement.parentElement.parentElement.parentElement.previousSibling.id;
      arr = idx.split( '-' );
      if ( (arr[ 1 ].startsWith( '(' )) && (arr[ 1 ].endsWith( ')' )) ) {
        rowLoginValue = (/\((.*)\)/i).exec( arr[ 1 ] )[ 1 ]
        dbRecordsCount( rowLoginValue )
        .then( (result) => {
          document.getElementById( idx += '-recordCounter' ).innerHTML =  `Записей:&nbsp;<b>${String(result)}</b>`;
          if (result === 0) {
            document.getElementById( `${rowId}-(${rowLoginValue})-collapse` ).style.display = 'none';
            document.getElementById( `${rowId}-(${rowLoginValue})-expand` ).style.display = '';
            hideHistoryForLogin( rowId, rowLoginValue );
          }
        });
        dbRecordsCount()
        .then( (result) => {
          totalRecCounter.innerHTML = `Записей:&nbsp;<b>${String(result)}</b>`;
        });
        // Обновляем количество записей в хранилище на странице настроек
        chrome.runtime.sendMessage( { message: 'MB_updateRecordsCount' } );

      }
      relationRow.parentElement.deleteRow( relationRow.sectionRowIndex ); // Удаляем строку от имени tbody
      break; }
  }
});


changeMode.addEventListener( 'click', function( evnt ) {
//         ----------------
  window.location.replace( './historyPerDate.html' );
})
