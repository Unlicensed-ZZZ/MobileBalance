/* popup.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для окна меню расширения MobileBalance
 * Редакция:  2025.01.13
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

// Отображение наименования и версии расширения
aboutName.innerHTML = chrome.runtime.getManifest().name + '&nbsp;&nbsp;' + chrome.runtime.getManifest().version;
// Отображение даты-времени следующего опроса
checkNextPoolingTime().then( function (timeStr) { nextPoolingTime.innerHTML = timeStr } )
.catch((err) => { nextPoolingTime.innerHTML = 'Следующий опрос:&nbsp;&nbsp;Ошибка чтения значений' });
// Актуализация состояния кнопки запуска опроса при обновлении popup-окна / открытии его вновь
chrome.storage.local.get( 'inProgress' )
.then( function( result ) { 
  btnStartPooling.disabled = result.inProgress;
});

// Начать опрос в новом окне
btnStartPooling.addEventListener( 'click', async () => {
  chrome.runtime.sendMessage( { message: 'MB_startPooling', init: 'fromPopUp' }, await function (response) {
    if ((response != undefined) && (response === 'done')) {
      btnStartPooling.disabled = true; // Блокируем, чтобы не запустили ещё экземпляр опроса
      self.close(); // popup-окно закрываем
    }
  })
});

// Актуализация popup-окна по сообщениям
chrome.runtime.onMessage.addListener(
  async function( request, sender, sendResponse ) {
    switch( request.message ) {
      case 'MB_actualizeControls': {
        if ( sendResponse ) sendResponse( 'done' ); // Ответ вызывающему окну для поддержания канала связи
        chrome.storage.local.get( 'inProgress' )
        .then( function( result ) {
          btnStartPooling.disabled = result.inProgress;  // Актуализировать статус кнопки запуска опроса
          checkNextPoolingTime()                         // и дату-время следующего опроса
          .then( function( timeStr ) {
            nextPoolingTime.innerHTML = timeStr;
          })
        });
        break; }
    };
    return true;
  }
);


// Открыть страницу истори запросов
btnHistory.addEventListener( 'click', async () => {
  let historyUrl = chrome.runtime.getURL( `content/history.html` );
  chrome.tabs.query( { url: historyUrl } )               // Ищем вкладку с адресом страницы истории запросов
  .then( function( result ) {
    if (result.length > 0)                               // Если нашлась - переходим к ней
      return chrome.tabs.highlight( { windowId: result[ 0 ].windowId, tabs: result[ 0 ].index } )
    else                                                 // Если страницы настроек расширения нет - открываем её
      return chrome.tabs.create( { url: historyUrl } );
  })
  self.close();                                          // popup-окно закрываем
});


// Открыть страницу настроек
btnOptions.addEventListener( 'click', async () => {
  chrome.management.getSelf()                            // Получаем параметры расширения
  .then( function( extnData ) {
    chrome.tabs.query( { url: extnData.optionsUrl } )    // Ищем вкладку с адресом страницы настроек расширения
    .then( function( result ) {
      if (result.length > 0)                             // Если нашлась - переходим к ней
        return chrome.tabs.highlight( { windowId: result[ 0 ].windowId, tabs: result[ 0 ].index } )
      else                                               // Если страницы настроек расширения нет - открываем её
        return chrome.tabs.create( { url: extnData.optionsUrl } );
    })
    self.close();                                        // popup-окно закрываем
  })
});


// Открыть сайт провайдера
function providerOpenSite ( event ) {
  if ( !event.type === 'click' || (( event.type === 'keypress' ) && ![ 'Space', 'Enter', 'NumpadEnter' ].includes( event.code )) )
    return; // Реагируем только на клик кнопки мыши и нажатие клавиши пробела или Enter
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
      await importAwait();                                                  // Ожидание завершения импорта значений и функций из модуля
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
      self.close();                                                         // popup-окно закрываем
    }, 
    () => { if ( chrome.runtime.lastError ) console.log( '[MB] Error occured: ' + chrome.runtime.lastError ) }
    )
  })
};


// Обработка изменений состояния флага отображения данных кратко / полно
infoState.addEventListener( 'change', async () => {
  let totalCells = popupTable.getElementsByTagName( 'td' );
  for ( let i = 0; i < totalCells.length; ++i ) {
    if ( totalCells[ i ].classList.contains( 'infoStateSensitive' ) )
      totalCells[ i ].style.display = ( infoState.checked ) ? 'none' : 'table-cell';
  };
  popupTable.style.display = 'table'; // В html таблица исходно скрыта. Теперь она сформирована, режим отображения данных определён - показываем её
  await chrome.storage.local.set( { popupShortInfo: infoState.checked } ); // Сохраняем значение режима отображения данных в хранилище
});


// Отображение статуса текущих значений для учётных данных

let dbMB, dbTrnsMB, dbObjStorMB; // Переменные для работы со структурами indexedDB
let dbRequest = indexedDB.open( 'BalanceHistory', dbVersion );
dbRequest.onerror = function( evnt ) {
//        -------
  console.log( `[MB] ${evnt.target.error}` );
}
dbRequest.onupgradeneeded = function( evnt ) {
//        ---------------
  console.log( `[MB] IndexedDB '${evnt.target.result.name}' upgrade needed` );
}
dbRequest.onsuccess = async function( evnt ) {
//        ---------
  dbMB = evnt.target.result;
  let provider = (await chrome.storage.local.get( 'provider' )).provider;
  // Получаем из хранилища данных значение настройки выделения цветом отрицательных занчений баланса
  let paintNegative = (await chrome.storage.local.get( 'markNegative' )).markNegative;
  // Отобразить статус текущих значений для учётных данных
  let tableBody = document.getElementById( 'popupItems' );
  // Вставляем стиль для отрисовки рамки вокруг иконки перехода на сайт провайдера
  let providerLinkStyle = document.createElement( 'style' );
  providerLinkStyle.textContent = '.pLink:focus { outline: 2px solid #B0B0B0; }';
  tableBody.insertAdjacentElement( 'beforeend', providerLinkStyle );

  let d = new Date();
  let currentDate = `${(d.getDate() < 10)    ? '0' + String(d.getDate())      : String(d.getDate())}.` +
                    `${(d.getMonth() < 9)    ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                    `${String(d.getFullYear())}`;

  let accounts = await getItemList();                             // Получаем список учётных данных, включённых в опрос
  for ( let i = 0; i < accounts.length; ++i ) {
    let pIdx = provider.findIndex( function( pItem ) {            // Определяем провайдера для учётных данных
      return ( pItem.name === accounts[ i ].provider );           // Если провайдер не найден (был удалён), то pIdx = -1
    });
    let rec = await dbGetLastRecord( accounts[ i ].loginValue );  // Получаем запись последнего запроса по учётным данным
    let outdatedValue = await checkOutdated( rec );               // Проверяем запрос на соответствие текущей дате

    let tableRow = document.createElement( 'tr' );
    tableRow.colspan = 10;
    if ( outdatedValue !== undefined ) tableRow.style.color = '#A0A0A0';    // Для устаревших запросов меняем цвет строки

    let tableCell = document.createElement( 'td' );                         // Вставляем наименование учётных данных
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.textContent = accounts[ i ].description;
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );                             // Вставляем визуальный разделитель ':'
    tableCell.textContent = ':';
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'right';
    tableCell.style.fontWeight = 'bold';
    tableCell.textContent = ( rec ) ? (rec.Balance).toFixed(2) : '-';       // Если запись по учётным данным есть, считываем баланс
    if ( paintNegative && rec && ( rec.Balance < 0 ) ) {                    // Если значение баланса отрицательное и установлено выделение таких
      tableCell.style.color = ( outdatedValue !== undefined ) ? '#FF99FF' : '#FF00FF'; // значений цветом, то меняем цвет в ячейке значения баланса
    }
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'right';
    tableCell.classList.add( 'infoStateSensitive' );
    tableCell.textContent = ( rec ) ? (rec.BalDelta).toFixed(2) : '-';      // Если запись по учётным данным есть, считываем расход
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'right';
    tableCell.classList.add( 'infoStateSensitive' );
    tableCell.textContent = ( rec ) ? `${rec.NoChangeDays} дн.` : '-';      // Если запись по учётным данным есть, считываем количество дней без изменения баланса
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'right';
    tableCell.classList.add( 'infoStateSensitive' );
    tableCell.textContent = ( rec && ( rec.Balance2 > 0) ) ? (rec.Balance2).toFixed(2) : '-';      // Если запись по учётным данным есть, считываем значение поля 'Balance2'
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'right';
    tableCell.classList.add( 'infoStateSensitive' );
    tableCell.textContent = ( rec && ( rec.Balance3 > 0) ) ? (rec.Balance3).toFixed(2) : '-';      // Если запись по учётным данным есть, считываем значение поля 'Balance3'
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'center';
    tableCell.classList.add( 'infoStateSensitive' );
    if ( ( rec === undefined ) || ( rec.SMS === 0 ) )
      tableCell.textContent = '-'
    else
      tableCell.textContent = ( rec.SMS > 0 ) ? rec.SMS : '\u221E';         // Если запись по учётным данным есть, считываем количество остатка SMS
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'center';
    tableCell.classList.add( 'infoStateSensitive' );
    if ( ( rec === undefined ) || ( rec.Minutes === 0 ) )
      tableCell.textContent = '-'
    else
      tableCell.textContent = ( rec.Minutes > 0 ) ? rec.Minutes : '\u221E'; // Если запись по учётным данным есть, считываем количество остатка минут
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.whiteSpace = 'nowrap';
    tableCell.style.textAlign = 'center';
    tableCell.classList.add( 'infoStateSensitive' );
    if ( ( rec === undefined ) || ( rec.Internet === 0 ) )
      tableCell.textContent = '-'
    else
      if ( rec.Internet < 0 ) tableCell.textContent = '\u221E'              // Если запись по учётным данным есть, считываем количество остатка Интернет-трафика
      else {
        tableCell.style.textAlign = 'right';
        if ( pIdx < 0 )
          tableCell.textContent = ( rec.Internet / 1024 ).toFixed(2) + ' Гб' // Если провайдер не найден, то отображанм остаток Интернет-трафика в Гб
        else
          tableCell.textContent = ( provider[ pIdx ].inetUnits === 'M' ) ? ( rec.Internet ).toFixed(2) + ' Мб' : ( rec.Internet / 1024 ).toFixed(2) + ' Гб';
      }
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );             // Формируем ссылку на сайт провайдера
    tableCell.style.textAlign = 'right';                    // Содержимое ячейки (изображение) сдвигаем вправо
    tableCell.style.width = '1em';                          // Задаём ширину ячейки (чтобы уместилась под заголовок со следующей)
    let providerSite = document.createElement( 'img' );
    providerSite.src = 'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" \
                       xmlns="http://www.w3.org/2000/svg" fill="%23707070"%3E \
                       %3Cpath d="M10.5495 2.53189C11.3874 1.82531 12.6126 1.82531 13.4505 2.5319L20.2005 8.224C20.7074 8.65152 21 9.2809 21 9.94406V19.7468C21 20.7133 20.2165 21.4968 19.25 21.4968H15.75C14.7835 21.4968 14 20.7133 14 19.7468V14.2468C14 14.1088 13.8881 13.9968 13.75 13.9968H10.25C10.1119 13.9968 9.99999 14.1088 9.99999 14.2468V19.7468C9.99999 20.7133 9.2165 21.4968 8.25 21.4968H4.75C3.7835 21.4968 3 20.7133 3 19.7468V9.94406C3 9.2809 3.29255 8.65152 3.79952 8.224L10.5495 2.53189ZM12.4835 3.6786C12.2042 3.44307 11.7958 3.44307 11.5165 3.6786L4.76651 9.37071C4.59752 9.51321 4.5 9.72301 4.5 9.94406V19.7468C4.5 19.8849 4.61193 19.9968 4.75 19.9968H8.25C8.38807 19.9968 8.49999 19.8849 8.49999 19.7468V14.2468C8.49999 13.2803 9.2835 12.4968 10.25 12.4968H13.75C14.7165 12.4968 15.5 13.2803 15.5 14.2468V19.7468C15.5 19.8849 15.6119 19.9968 15.75 19.9968H19.25C19.3881 19.9968 19.5 19.8849 19.5 19.7468V9.94406C19.5 9.72301 19.4025 9.51321 19.2335 9.37071L12.4835 3.6786Z"/%3E \
                       %3C/svg%3E';
    providerSite.classList.add( 'pLink' );                  // Класс отображения рамки фокуса (стиль вставлен выше)
    providerSite.style.height = '15px';
    providerSite.style.cursor = 'pointer';
    providerSite.setAttribute( 'tabindex', '0' );
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
      providerSite.onkeypress = providerOpenSite;
    }
    tableCell.insertAdjacentElement( 'beforeend', providerSite );
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableCell = document.createElement( 'td' );
    tableCell.style.textAlign = 'right';                    // Содержимое ячейки (изображение) сдвигаем вправо
    tableCell.style.width = '1em';                          // Задаём ширину ячейки (чтобы уместилась под заголовок с предыдущей)
    if ( rec ) {                                            // Если запись по учётным данным есть, анализируем значение поля Warning
      let warningText = '';
      if ( (rec.Warning & 1) === 1 ) warningText += 'Баланс не изменялся дольше, чем указано\n';
      if ( (rec.Warning & 2) === 2 ) warningText += 'Изменился статус блокировки\n';
      if ( (rec.Warning & 4) === 4 ) warningText += 'Изменился состав или стоимость услуг\n';
      if ( (rec.Warning & 8) === 8 ) warningText += 'Изменился тариф\n';
      let warningImg = document.createElement( 'img' );     // Формируем изображение-носитель подсказки с сообщением
      if ( warningText.length > 0 ) { // При отклонениях значений запроса вставляем изображение красного цвета и дополняем сообщениями
        warningImg.src = 'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" \
                          xmlns="http://www.w3.org/2000/svg" fill="%23FF6666"%3E%3E \
                          %3Cpath d="M22 11.998C22 6.4752 17.5228 1.99805 12 1.99805C6.47715 1.99805 2 6.4752 2 11.998C2 13.6408 2.3972 15.2274 3.1449 16.6483L2.02855 20.9367C1.99198 21.0771 1.99199 21.2246 2.02858 21.3651C2.1469 21.8194 2.6111 22.0917 3.06538 21.9734L7.35578 20.8563C8.77516 21.602 10.3596 21.998 12 21.998C17.5228 21.998 22 17.5209 22 11.998ZM12 6.49951C12.4142 6.49951 12.75 6.8353 12.75 7.24951V13.4995C12.75 13.9137 12.4142 14.2495 12 14.2495C11.5858 14.2495 11.25 13.9137 11.25 13.4995V7.24951C11.25 6.8353 11.5858 6.49951 12 6.49951ZM13 16.4974C13 17.0497 12.5523 17.4974 12 17.4974C11.4477 17.4974 11 17.0497 11 16.4974C11 15.9451 11.4477 15.4974 12 15.4974C12.5523 15.4974 13 15.9451 13 16.4974Z"/%3E \
                          %3C/svg%3E';
      }
      else { // При отсутствии отклонений даём только информацию о дате последнего запроса, изображение обычного цвета
        warningImg.src = 'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" \
                          xmlns="http://www.w3.org/2000/svg" fill="%23707070"%3E%3E \
                          %3Cpath d="M12 6.5C12.4142 6.5 12.75 6.83579 12.75 7.25V13.5C12.75 13.9142 12.4142 14.25 12 14.25C11.5858 14.25 11.25 13.9142 11.25 13.5V7.25C11.25 6.83579 11.5858 6.5 12 6.5Z"/%3E \
                          %3Cpath d="M12 17.4978C12.5523 17.4978 13 17.0501 13 16.4978C13 15.9455 12.5523 15.4978 12 15.4978C11.4477 15.4978 11 15.9455 11 16.4978C11 17.0501 11.4477 17.4978 12 17.4978Z"/%3E \
                          %3Cpath d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.3817 22 8.81782 21.6146 7.41286 20.888L3.58704 21.9553C2.92212 22.141 2.23258 21.7525 2.04691 21.0876C1.98546 20.8676 1.98549 20.6349 2.04695 20.4151L3.11461 16.5922C2.38637 15.186 2 13.6203 2 12C2 6.47715 6.47715 2 12 2ZM12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 13.4696 3.87277 14.8834 4.57303 16.1375L4.72368 16.4072L3.61096 20.3914L7.59755 19.2792L7.86709 19.4295C9.12006 20.1281 10.5322 20.5 12 20.5C16.6944 20.5 20.5 16.6944 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5Z"/%3E \
                          %3C/svg%3E';
      }
      warningImg.style.height = '15px';
      if ( outdatedValue !== undefined ) // Для устаревших запросов строка даты уже сформирована
        warningImg.title = `Последний запрос: ${outdatedValue}\n` + warningText;
      else                               // Для актуальных запросов строку текущей даты тоже предварительно сформировали
        warningImg.title = `Последний запрос: ${currentDate}\n` + warningText;
      tableCell.insertAdjacentElement( 'beforeend', warningImg );
    }
    tableRow.insertAdjacentElement( 'beforeend', tableCell );

    tableBody.insertAdjacentElement( 'beforeend', tableRow );
  }

  chrome.storage.local.get( 'popupShortInfo' ) // Считываем режим отображения данных в popup-окне (true = кратко, false = полно)
  .then( async function( result ) {            // Если это значение есть - актуализаруем флаг в popup-окне
    if ( result.popupShortInfo !== undefined ) {
      infoState.checked = result.popupShortInfo;
    }
    else { // Если значения режима отображения данных в хранилище нет - создаём его со значением true (= кратко)
      await chrome.storage.local.set( { popupShortInfo: true } );
      infoState.checked = true;
    }
    infoState.dispatchEvent( new Event('change') ); // Актуализируем вид текущих значений для учётных данных
  })
}

// Формирование списка учётных данных в порядке, указанном в настройках
function getItemList() {
//       -------------
  let acc = [];
  return new Promise( ( resolve, reject ) => {
    chrome.storage.local.get( 'accounts' )                   // Получаем из хранилища список учётных данных
    .then( function( result ) {
      result.accounts.forEach( function ( item ) {
      if ( item.maintain )                                   // Копируем только записи включённые в опрос
        acc.push( item );
      })
      resolve ( acc );
    })
    .catch( function( err ) {
      console.log( `[MB] ${err}`);
      reject ( err );
    })
  })
}

// Получение последней записи о результате запроса в хранилище 'Phones'
function dbGetLastRecord( item ) {
//       -----------------------
  return new Promise( (resolve, reject) => {
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
      if ( dbRec ) resolve( dbRec.value ) // Найдена запись, возвращаем её значение
      else         resolve( undefined );  // Записей c переданным значением item ещё нет
    }
  });
}

// Проверка даты запроса записи хранилища на равенство текущей дате
function checkOutdated( item ) {
//       ---------------------
  return new Promise( (resolve, reject) => {
    if ( item ) {
      // Определяем порог даты: значение текущей даты в 00:00:00
      let thresholdDate = new Date().setHours( 0, 0, 0, 0 );
      // Если дата запроса в найденной записи = текущей, то запрос актуален
      if ( item.QueryDateTime && ( (thresholdDate - item.QueryDateTime) < 0 ) )
          resolve( undefined )
      else { // Дата запроса в найденной записи < текущей, значит данные устарели
        let d = new Date( item.QueryDateTime );
        resolve( `${(d.getDate() < 10)    ? '0' + String(d.getDate())      : String(d.getDate())}.` +
                 `${(d.getMonth() < 9)    ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                 `${String(d.getFullYear())}` );
      }
    }
    else resolve( '' ); // Запросов по этим учётным данным ещё не было
  });
}

// Подготовка строки даты-времени следующего запроса
function checkNextPoolingTime() {
//       ----------------------
  return new Promise( (resolve, reject) => {
    chrome.storage.local.get( 'daylyMaintain' )
    .then( function( result ) {
      if ( result.daylyMaintain ) {
        chrome.alarms.get( 'poolingTimer' )
        .then( function( alarm ) {
          let d = new Date( alarm.scheduledTime );
          let timeStr = `${(d.getDate() < 10)    ? '0' + String(d.getDate())      : String(d.getDate())}.` +
                        `${(d.getMonth() < 9)    ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                        `${String(d.getFullYear())} в ` +
                        `${(d.getHours() < 10)   ? '0' + String(d.getHours())     : String(d.getHours())}:` +
                        `${(d.getMinutes() < 10) ? '0' + String(d.getMinutes())   : String(d.getMinutes())}`;
          resolve( 'Следующий опрос:&nbsp;' + timeStr );
        })
      }
      else
        resolve( 'Следующий опрос:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;не определён' );
    })
    .catch((err) => { console.log(`[MB] Error: ${err}`) })
  });
}
