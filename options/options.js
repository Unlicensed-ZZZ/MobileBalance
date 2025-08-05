/* options.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для страницы настроек расширения MobileBalance
 * Редакция:  2025.07.22
 *
*/

let dbVersion;
import('./../vars.mjs').then( (module) => { // Глобальные переменные расширения (из модуля vars.mjs)
  dbVersion = module.dbVersion;
  MBResult = module.MBResult;      // Структура ответа на запрос по учётным данным провайдера
})
.catch( (err) => {
  console.log(`[MB] ${err}`);
});

let dbMB, dbTrnsMB, dbObjStorMB, dbCrsrMB;
let providerRecords = [], loginRecords = [];
let cycleOrder = '', daylyMntn = false, mntnTime = '', rptAttempts = 0, poolWinAlive = false, poolLog = false, paintNegative = false, deleteSameDateRecord = 0;
let fileClamedBy = ''; // Идентификатор кнопки, которой инициирована функция загрузки файла
// Блок переменных по разрешениям показа уведомлений (оповещений)
let notifPermission = 'denied';
chrome.notifications.getPermissionLevel( level => { notifPermission = level } );
let ntfEnable = false, ntfOnError = false, ntfOnProcess = false, ntfOnUpdateDelay = false;


// Открываем или создаём (если их не было или нужно их обновление) структуры indexedDB
let dbRequest = indexedDB.open( 'BalanceHistory', dbVersion );
dbRequest.onerror = function( evnt ) {
//        -------
  console.log( `[MB] ${evnt.target.error}` );
}
dbRequest.onsuccess = function( evnt ) {
//        ---------
  dbMB = evnt.target.result;
  console.log( `[MB] IndexedDB '${dbMB.name}' opened successfully` );
  dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' ); // Открываем хранилище 'Phones'
  dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
  dbObjStorMB.onerror = function( evnt ) {
    console.log( `[MB] ${evnt.target.error}` );
  }
  dbRecordsCount().then( (result) => {
    console.log( `[MB] Object store '${dbObjStorMB.name}' total records: ${String(result)}` );
  });
}
dbRequest.onupgradeneeded = function( evnt ) {
//        ---------------
  dbMB = evnt.target.result;
  if ( !dbMB.objectStoreNames.contains( 'Phones' ) ) { // Если хранилища 'Phones' не было - создаём его
    dbObjStorMB = dbMB.createObjectStore( 'Phones',
                                          { keyPath: 'QueryDateTime', autoIncrement: false } );
  }
  else {                                               // Если оно было - открываем хранилище 'Phones'
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
  }
  if (!dbObjStorMB.indexNames.contains( 'PhoneNumber' ) ) // Если индекса 'PhoneNumber' не было - создаём его
    dbObjStorMB.createIndex( 'PhoneNumber', 'PhoneNumber', { unique: false } );
  console.log( `[MB] IndexedDB '${dbMB.name}' created / upgraded` );
}


// Получение текущего количества записей в хранилище 'Phones'
function dbRecordsCount() {
//       ----------------
  return new Promise((resolve, reject) => {
    dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' );
    dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
    dbObjStorMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    let dbRecCntMB = dbObjStorMB.count();
    dbRecCntMB.onerror = function( evnt ) {
      console.log( `[MB] ${evnt.target.error}` );
      reject( evnt.target.error );
    }
    dbRecCntMB.onsuccess = function( evnt ) {
      resolve( dbRecCntMB.result );
    }
  });
}


getOptionsFromStorage();

// Получение списка основных параметров и учётных данных для опросов из local storage
async function getOptionsFromStorage() {
//             ---------------------
  await chrome.storage.local.get( null, function( fromStorage ) {
    cycleOrder = fromStorage.cycleOrder;
    daylyMntn = fromStorage.daylyMaintain;
    mntnTime = fromStorage.daylyMaintainTime;
    rptAttempts = fromStorage.repeatAttempts;
    ntfEnable = fromStorage.notificationsEnable;
    ntfOnError = fromStorage.notificationsOnError;
    ntfOnProcess = fromStorage.notificationsOnProcess;
    ntfOnUpdateDelay = fromStorage.notificationsOnUpdateDelay;
    poolWinAlive = fromStorage.poolingWinAlive;
    poolLog = fromStorage.poolingLogSave;
    paintNegative = fromStorage.markNegative;
    deleteSameDateRecord = fromStorage.deleteSameDateRecord;
    loginRecords = (fromStorage.accounts !== undefined) ? fromStorage.accounts : Array([]);
  });
  await getProviderFromStorage();
}

// Получение списка провайдеров (plugin-ов) из local storage и подготовка списков их выбора
async function getProviderFromStorage() {
//             ------------------------
  return new Promise( (resolve, reject) => {
    chrome.storage.local.get( 'provider', function( fromStorage ) {
      if ( fromStorage.provider !== undefined ) {
        let i = selectProvider.options.length;
        for ( i; selectProvider.options.length > 0; --i ) {
          selectProvider.options[ i - 1 ].remove();
        }
        i = chooseProvider.options.length;
        for ( i; chooseProvider.options.length > 0; --i ) {
          chooseProvider.options[ i - 1 ].remove();
        }
        fromStorage.provider.forEach( function ( item, index ) {
          providerRecords[ index ] = item;         // Наполняем структуру провайдеров значениями из local storage
          let SPOption = document.createElement( 'option' ); // Подготовка списка для модального окна учётной записи
          let CPOption = document.createElement( 'option' ); // Подготовка списка для окна настройки параметров
          SPOption.value = CPOption.value = providerRecords[ index ].name;
          SPOption.textContent = CPOption.textContent =      // Провайдеров добавленных пользователем выделяем '★' в начале наименования
            (( providerRecords[ index ].custom ) ? '\u2605 ' : '') + providerRecords[ index ].description;
          selectProvider.insertAdjacentElement( 'beforeend', SPOption );
          chooseProvider.insertAdjacentElement( 'beforeend', CPOption );
        });
        providerSave.disabled = providerDelete.disabled = ( providerRecords.length === 0 ); // Состояние кнопок
        resolve ( true );
      }
      else
        reject ( false );
    });
  });
}


chrome.tabs.onUpdated.addListener( initFromStorage );

// Исходная отрисовка страниц с параметрами из local storage (в слушателе события chrome.tabs.onUpdated)
async function initFromStorage( tabId, changeInfo, tab ) {
//             -----------------------------------------
  let optTab = await chrome.tabs.getCurrent();
  if (optTab.id === tabId) {
    chrome.tabs.onUpdated.removeListener( initFromStorage );
    // Первичное наполнение таблицы учётных данных
    await drawLoginTable( 'dataList' ); 
    // Первичная инициализация кнопок вкладки учётных данных
    logElementNew.disabled = logElementLoad.disabled = false;
    logElementChange.disabled = logElementDelete.disabled = logElementUp.disabled = logElementDown.disabled = true;
    logElementSave.disabled = logElementDeleteAll.disabled = (dataList.rows.length === 0) ? true : false;
    // Первичная инициализация параметров вкладки общих настроек
    await drawProvider();
    setTimeout( async function() {
      await drawOptions();
    }, 200); // Если нужно создать структуры в indexedDB - делаем задержку, чтобы это
             // успело произойти до запросов к нему (например, за количеством записей)
    await drawAbout();
  }
  else return false;
}

// Инициализация общих настроек по параметрам из local storage
async function drawOptions() {
//             -------------
  document.querySelector( `[id^='cycleOrder_${cycleOrder}']` ).checked = true;
  maintainDayly.checked = ( daylyMntn ) ? true : false;
  maintainTime.value = mntnTime;
  maintainTime.disabled = ( maintainDayly.checked ) ? false : true;
  repeatAttempts.value = rptAttempts;
  // Блок переключателей по уведомлениям (оповещениям)
  if (notifPermission === 'granted') {
    notifTrigger.style.flexDirection = 'column';
    notifDisabled.style.display = 'none';
    document.querySelectorAll( '.notifMB' ).forEach( function (item) {
      item.style.display = 'flex';
    });
    enableNotifications.checked = ntfEnable;
    if ( !ntfEnable ) {
      onErrorNotifications.disabled = onProcessNotifications.disabled = onUpdateDelayNotifications.disabled = true;
      onErrorNotifications.checked = onProcessNotifications.checked = onUpdateDelayNotifications.checked = false;
    }
    else {
      onErrorNotifications.disabled = onProcessNotifications.disabled = onUpdateDelayNotifications.disabled = false;
      onErrorNotifications.checked = ntfOnError;
      onProcessNotifications.checked = ntfOnProcess;
      onUpdateDelayNotifications.checked = ntfOnUpdateDelay;
    }
  }
  else {
    notifTrigger.style.flexDirection = 'row';
    notifDisabled.style.display = 'inline-flex';
    document.querySelectorAll( '.notifMB' ).forEach( function (item) {
      item.style.display = 'none';
    });
    enableNotifications.disabled = onErrorNotifications.disabled =
      onProcessNotifications.disabled = onUpdateDelayNotifications.disabled = true;
    enableNotifications.checked = onErrorNotifications.checked =
      onProcessNotifications.checked = onUpdateDelayNotifications.checked = false;
  }
  poolingWinAlive.checked = ( poolWinAlive ) ? true : false;
  poolingLogSave.checked = ( poolLog ) ? true : false;
  markNegative.checked = ( paintNegative ) ? true : false;
  switch ( deleteSameDateRecord ) {
    case 0: {
      document.querySelector(`[id='notDelete']`).checked = true;
      break;
    }
    case 4:
    case 8:
    case 12: {
      document.querySelector(`[id='${String(deleteSameDateRecord)}hAge']`).checked = true;
      break;
    }
  }
  dbRecordsCount().then( (result) => {
    recCount.textContent = String(result);
    historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
    historyLoad.disabled = false;
  });
  // div-контейнер элементов настройки скрыт (class='expandable') до завершения инициализации. Здесь делаем его видимым
  optionsBlock.style.height = 'auto';
  optionsBlock.classList.add( 'expanded' );
  chrome.runtime.onMessage.dispatch( { 'message': 'MB_actualizeControls' },
                                     { tab: null, id: this.location.origin }, null );
}

// Инициализация блока провайдеров на вкладке общих настроек по параметрам из local storage
async function drawProvider() {
//             --------------
  providerRecords.forEach( function( item, index ) {
    if ( chooseProvider.value === item.name ) {
      providerInfo.innerHTML = '<b>Версия:</b> ' + item.version + '<br>' +
                               '<b>Автор:</b> ' + item.author + '<br>' +
                               '<b>Описание:</b> ' + item.annotation;
      requestDelay.checked = (item.requestDelay) ? true : false;
      requestDelayValue.value = item.requestDelayValue;
      requestDelayValue.disabled = (requestDelay.checked) ? false : true;
      // Если в записи провайдера нет изображения - вставляем картинку по умолчанию
      providerIcon.src = (item.icon === '') ?
        'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23333333" style="transform:rotate(90deg);"%3E \
         %3Cpath d="M9.75 10C8.23122 10 7 11.2312 7 12.75V16.25C7 17.7688 8.23122 19 9.75 19H14.25C15.7688 19 17 17.7688 17 16.25V12.75C17 11.2312 15.7688 10 14.25 10H9.75ZM8.5 12.75C8.5 12.0596 9.05964 11.5 9.75 11.5H12V14H8.5V12.75ZM8.5 15.5H12V17.5H9.75C9.05964 17.5 8.5 16.9404 8.5 16.25V15.5ZM13.5 17.5V11.5H14.25C14.9404 11.5 15.5 12.0596 15.5 12.75V16.25C15.5 16.9404 14.9404 17.5 14.25 17.5H13.5Z"/%3E \
         %3Cpath d="M7.25 2C5.45507 2 4 3.45507 4 5.25V18.75C4 20.5449 5.45507 22 7.25 22H16.75C18.5449 22 20 20.5449 20 18.75V9.28553C20 8.42358 19.6576 7.59693 19.0481 6.98744L15.0126 2.9519C14.4031 2.34241 13.5764 2 12.7145 2H7.25ZM5.5 5.25C5.5 4.2835 6.2835 3.5 7.25 3.5H12.7145C13.1786 3.5 13.6237 3.68437 13.9519 4.01256L17.9874 8.0481C18.3156 8.37629 18.5 8.82141 18.5 9.28553V18.75C18.5 19.7165 17.7165 20.5 16.75 20.5H7.25C6.2835 20.5 5.5 19.7165 5.5 18.75V5.25Z"/%3E \
         %3C/svg%3E' : item.icon;
      onUpdateDelay.checked = (item.onUpdateDelay) ? true : false;
      onUpdateDelayValue.value = item.onUpdateDelayValue;
      onUpdateDelayValue.disabled = (onUpdateDelay.checked) ? false : true;
      respondTimeout.checked = (item.respondTimeout) ? true : false;
      respondTimeoutValue.value = item.respondTimeoutValue;
      respondTimeoutValue.disabled = (respondTimeout.checked) ? false : true;
      if ( item.inetUnits === '' ) // Если указаны единицы измерения, то устанавливаем их
        document.querySelectorAll( `[id^='providerInet']` ).forEach( function( item ) { item.checked = false; } );
      else
        document.querySelector( `[id^='providerInet'][value='${item.inetUnits}']` ).checked = true;
      providerIgnoreFractional.checked = (item.ignoreFractional) ? true : false;
      providerClearCookies.checked = (item.startUrlClearCookies) ? true : false;
      providerBypassCache.checked = (item.startUrlBypassCache) ? true : false;
    }
  });
}


// Инициализация данных на вкладке 'О расширении'
async function drawAbout() {
//             -----------
  let about = await chrome.runtime.getManifest();
  aboutName.textContent += about.name;
  aboutVersion.textContent += about.version;
  aboutDescription.textContent += about.description;
  aboutAuthor.textContent += about.author;
}


// Создаём элементы наполнения списка учётных данных на Div-"вкладке" страницы
async function drawLoginTable( objId, startId = 0, amountId = loginRecords.length ) {
//             --------------------------------------------------------------------
// По умолчанию: с нулевого индекса, полностью для всех элементов loginRecords
  let relationElement = document.getElementById( objId );
  for ( let i = startId; i < (amountId - startId); ++i )
    newLoginRowInsert( i );
}


// Формирование текстовой строки даты в формате YYYY-MM-DD
function createDateStr() {
//       ---------------
  let timeStamp = new Date();
  timeStamp.getTime();
  let result = String(timeStamp.getFullYear());
  result = result + ( ((timeStamp.getMonth()+1)<10) ? ('-0'+String(timeStamp.getMonth()+1)) : ('-'+String(timeStamp.getMonth()+1)) );
  result = result + ( (timeStamp.getDate()<10) ? ('-0'+String(timeStamp.getDate())) : ('-'+String(timeStamp.getDate())) );
  return result;
}


// Вставить в таблицу учётных даных новую строку
async function newLoginRowInsert( index ) {
//             --------------------------
  let relationElement = dataList.insertRow( (index !== undefined) ? index : -1 );
  relationElement.onclick = selectRow; // selectRow - функция из файла table.js, подключён в html
  if (index === undefined) index = loginRecords.length - 1;
  if (!loginRecords[index].maintain) // Для учётных данных с отметкой 'без участия в опросе' меняем стиль
    relationElement.classList.toggle( 'noMaintain' );
  // Создаём ячейки для учётных данных (заголовок: 'Порядок опроса', 'Включать в опрос', 'Название', 'Провайдер (плагин)' )
  for (let j = 0; j < 4; j++) {
    let loginElement = document.createElement('td');
    switch( j ) {
      case 0: { // Ячейку порядка опроса выравниваем вправо и ограничиваем размер (= как в заголовке)
        loginElement.align = 'right';
        loginElement.style.width = '5vw'; // Ячейку ограничиваем в размере (= как в заголовке)
        loginElement.style.verticalAlign = 'middle';
        loginElement.textContent = String(index + 1);
        break; }
      case 1: { // Формируем переключатель включения / мсключения учётных данных из опроса
        loginElement.align = 'center';
        loginElement.style.width = '5vw'; // Ячейку ограничиваем в размере (= как в заголовке)
        loginElement.style.verticalAlign = 'middle';
        // Внешний div-обёртку делаем 'flex', чтобы спозиционировать его внутри ячейки (вместе с его содержимым)
        let wraperElem = document.createElement( 'div' );
        wraperElem.style.display = 'flex';
        wraperElem.style.alignItems = 'center';
        wraperElem.style.justifyContent = 'center';
        // Вннутренний div-обёртку делаем позиционированным - от него будут отсчитываться координаты дочерних объектов
        let outerElem = document.createElement( 'div' );
        outerElem.style.position = 'relative';
        wraperElem.insertAdjacentElement( 'beforeend', outerElem ); // Вставляем внутренний 'div' в div-обёртку
        // Создаём 'checkbox', он прозрачный, с абсолютным позиционированием от внутреннего 'div', размером = визуальным элементам
        let checkboxElem = document.createElement( 'input' );
        checkboxElem.type = 'checkbox';
        checkboxElem.classList.add( 'chkbox' );
        checkboxElem.checked = loginRecords[ index ].maintain; // Выставляем переключатель по значению 'maintain' учётных данных
        checkboxElem.addEventListener( 'change', toggleMaintain );
        outerElem.insertAdjacentElement( 'beforeend', checkboxElem ); // Вставляем 'checkbox' во внутренний 'div'
        // Создаём визуальное отображение для 'checkbox', оно с позиционированием (0,0) относительно внутреннего 'div'
        checkboxElem = document.createElement( 'div' );
        checkboxElem.classList.add( 'chkbox_pseudo' );
        outerElem.insertAdjacentElement( 'beforeend', checkboxElem ); // Вставляем визуальное отображение во внутренний 'div'
        loginElement.insertAdjacentElement( 'beforeend', wraperElem ); // Вставляем div-обёртку в ячейку
        break; }
      case 2: { // Заполняем ячейку описания
        loginElement.style.verticalAlign = 'middle';
        loginElement.textContent = loginRecords[ index ].description;
        break; }
      case 3: { // Заполняем ячейку наименования провайдера (плагина)
        let pIdx = providerRecords.findIndex( function( pItem ) {         // Определяем провайдера для учётных данных
          return ( pItem.name === loginRecords[ index ].provider );       // Если провайдер не найден (был удалён), то pIdx = -1
        });
        loginElement.style.width = '28vw'; // Ячейку ограничиваем в размере (= как в заголовке)
        loginElement.style.verticalAlign = 'middle';
        // Формируем flex-контейнер и встявляем его в ячейку
        let flexElem = document.createElement( 'div' );
        flexElem.style.display = 'flex';
        flexElem.style.alignItems = 'center';
        flexElem.style.justifyContent = 'space-between';
        // Клики на контейнере и его содержимом запрещаем. События пойдут к родителю - строке таблицы
        flexElem.style.pointerEvents = 'none';
        loginElement.insertAdjacentElement( 'beforeend', flexElem );
        // Вставляем в flex-контейнер наименование провайдера
        let Elem = document.createElement( 'div' );
        Elem.textContent = ( pIdx < 0 ) ? 'Параметры провайдера не найдены' : // Если провайдер не найден, то выводим предупреждение
                                                                              // Провайдеров добавленных пользователем выделяем '★' в начале наименования
                                          (( providerRecords[ pIdx ].custom ) ? '\u2605 ' : '') + providerRecords[ pIdx ].description;
        flexElem.insertAdjacentElement( 'beforeend', Elem );
        // Вставляем в flex-контейнер изображение логотипа провайдера
        Elem = document.createElement( 'img' );
        // Если в записи провайдера нет изображения или провайдер не найден - вставляем картинку по умолчанию
        Elem.src = ( ( pIdx < 0 ) || ( providerRecords[ pIdx ].icon === '' ) ) ?
          'data:image/svg+xml;utf8,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23333333" style="transform:rotate(90deg);"%3E \
           %3Cpath d="M9.75 10C8.23122 10 7 11.2312 7 12.75V16.25C7 17.7688 8.23122 19 9.75 19H14.25C15.7688 19 17 17.7688 17 16.25V12.75C17 11.2312 15.7688 10 14.25 10H9.75ZM8.5 12.75C8.5 12.0596 9.05964 11.5 9.75 11.5H12V14H8.5V12.75ZM8.5 15.5H12V17.5H9.75C9.05964 17.5 8.5 16.9404 8.5 16.25V15.5ZM13.5 17.5V11.5H14.25C14.9404 11.5 15.5 12.0596 15.5 12.75V16.25C15.5 16.9404 14.9404 17.5 14.25 17.5H13.5Z"/%3E \
           %3Cpath d="M7.25 2C5.45507 2 4 3.45507 4 5.25V18.75C4 20.5449 5.45507 22 7.25 22H16.75C18.5449 22 20 20.5449 20 18.75V9.28553C20 8.42358 19.6576 7.59693 19.0481 6.98744L15.0126 2.9519C14.4031 2.34241 13.5764 2 12.7145 2H7.25ZM5.5 5.25C5.5 4.2835 6.2835 3.5 7.25 3.5H12.7145C13.1786 3.5 13.6237 3.68437 13.9519 4.01256L17.9874 8.0481C18.3156 8.37629 18.5 8.82141 18.5 9.28553V18.75C18.5 19.7165 17.7165 20.5 16.75 20.5H7.25C6.2835 20.5 5.5 19.7165 5.5 18.75V5.25Z"/%3E \
           %3C/svg%3E' : providerRecords[ pIdx ].icon;
        Elem.style.height = '24px';
        Elem.alt = 'icon';
        flexElem.insertAdjacentElement( 'beforeend', Elem );
        break; }
    }
    relationElement.insertAdjacentElement( 'beforeend', loginElement );
  }
}


// Включение / исключение учётных данных их из опроса переключателем в строке списка
function toggleMaintain ( evnt ) {
//       --------------
  evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
  let changingRow = evnt.target.parentElement.parentElement.parentElement.parentElement.rowIndex // Получаем индекс строки изменяемых учётных данных
  loginRecords[ changingRow ].maintain = evnt.target.checked;
  chrome.storage.local.set( { accounts: [] } );
  chrome.storage.local.set( { accounts: loginRecords } );
  dataList.deleteRow( changingRow );
  newLoginRowInsert( changingRow );
  if ( selectedRow === changingRow )
    dataList.rows[ changingRow ].classList.add( 'checked' ); // Если строка была выделена, то возвращаем её выделение
  return true;
}


// Обработка нажатия кнопок управления списком учётных данных (по onclick на Div-"вкладке" учётных данных страницы)
loginData.addEventListener( 'click', async function( evnt ) {
//        -----------------
  switch( evnt.target.id ) {
    case 'logElementNew': {
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      loginWin() // Вызов окна создания учётных данных. Новая запись - без параметра (по умолчанию = undefined)
      .then( ( LoginItem ) => {
        if ( LoginItem !== undefined ) { // Вставляем строку, если учётные данные были созданы
          loginRecords.splice( ( (selectedRow !== undefined) ? selectedRow : loginRecords.length), 0, LoginItem );
          chrome.storage.local.set( { accounts: [] } );
          chrome.storage.local.set( { accounts: loginRecords } );
          newLoginRowInsert( selectedRow ); // Если строка выделена - вставляем в её позицию, если нет - в конец
          // Корректируем на +1 номера строк ниже по списку, если строка вставлена не в его конце
          if (selectedRow !== undefined) {
            ++selectedRow; // Исправляем значение - у ранее выделенной строки индекс стал +1
            for ( let i = selectedRow; i < dataList.rows.length; ++i )
              dataList.rows[ i ].children[0].textContent = String(i + 1);
            dataList.rows[ selectedRow ].dispatchEvent( new Event( 'click' ) ); // Снимаем выделение со строки
          }
        }
      });
      break; }
    case 'logElementChange': { // Если строка не выделена, вызов происходить не должен - кнопка не активна
      evnt.stopPropagation();  // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      loginWin( selectedRow )  // Вызов окна изменения учётных данных для выбранной строки
      .then( ( LoginItem ) => {
        if ( LoginItem !== undefined ) { // Записываем параметры, если выбрано сохранение в модальном окне
          loginRecords[ selectedRow ] = LoginItem;
          chrome.storage.local.set( { accounts: [] } );
          chrome.storage.local.set( { accounts: loginRecords } );
          dataList.deleteRow( selectedRow );
          newLoginRowInsert( selectedRow );
          dataList.rows[ selectedRow ].classList.add( 'checked' ); // Возвращаем выделение строки
        }
      });
      break; }
    case 'logElementDelete': { // Удалить строку учётных данных
      evnt.stopPropagation();  // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( ( selectedRow !== undefined ) &&
           ( confirm( '\nУказанная запись учётных данных будет удалена\n\nПродолжить?' ) ) ) {
        loginRecords.splice( selectedRow, 1 );
        // Сохраняем изменения в local storage
        chrome.storage.local.set( { accounts: [] } );
        chrome.storage.local.set( { accounts: loginRecords } );
        dataList.deleteRow( selectedRow );
        // Корректируем на -1 номера строк ниже по списку
        for ( let i = selectedRow; i < dataList.rows.length; ++i )
          dataList.rows[ i ].children[ 0 ].textContent = String(i + 1);
        selectedRow = undefined;
      }
      break; }
    case 'logElementUp': {    // Для первой строки вызов происходить не должен - кнопка не активна
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      loginRecords.splice( selectedRow, 0, loginRecords.splice((selectedRow - 1), 1)[ 0 ] );
      dataList.deleteRow( selectedRow - 1 );
      --selectedRow; // Исправляем значение - у ранее выделенной строки индекс стал -1
      // Вставляем строку под выделенной и корректируем её номер
      newLoginRowInsert( selectedRow + 1 );
      dataList.rows[ selectedRow ].children[ 0 ].textContent = String(selectedRow + 1);
      // Сохраняем изменения в local storage
      chrome.storage.local.set( { accounts: [] } );
      chrome.storage.local.set( { accounts: loginRecords } );
      break; }
    case 'logElementDown': { // Для последней строки вызов происходить не должен - кнопка не активна
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      loginRecords.splice( selectedRow, 0, loginRecords.splice((selectedRow + 1), 1)[ 0 ] );
      dataList.deleteRow( selectedRow + 1 );
      ++selectedRow; // Исправляем значение - у ранее выделенной строки индекс стал +1
      // Вставляем строку над выделенной, корректируем её номер
      newLoginRowInsert( selectedRow - 1 );
      dataList.rows[ selectedRow ].children[ 0 ].textContent = String(selectedRow + 1);
      // Сохраняем изменения в local storage
      chrome.storage.local.set( { accounts: [] } );
      chrome.storage.local.set( { accounts: loginRecords } );
      break; }
    case 'logElementSave': { // Сохранить учётные данные из local storage в файл
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      // Вызов должен произойти только при наличии строк учётных записей, иначе кнопка не активна
      chrome.storage.local.get( 'accounts', function(fromStorage) {
        if (fromStorage.accounts.length > 0) {
          fromStorage.accounts.forEach( function( item ) { // Пароли для сохранения в файле-выгрузке декодируем
            item.passwValue = decodePassword( item.passwValue );
          });
          let blob = new Blob( [ JSON.stringify( fromStorage, null, 2 ) ], { type: 'text/json', endings: 'native' } );
          let link = document.createElement( 'a' );
          link.setAttribute( 'href', URL.createObjectURL( blob ) );
          link.setAttribute( 'download', createDateStr() + ' MB-loginData.json' );
          link.click();
          link.remove();
        }
      });
      break; }
    case 'logElementLoad': { // Загрузка учётных данных из указанного файла
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( ( loginRecords.length > 0 ) &&
           ( !confirm( '\nСуществующие записи учётных данных будут замещены данными из файла\n\nПродолжить?' ) ) ) {
        break;
      }
      window.showOpenFilePicker( { multiple: false, excludeAcceptAllOption: true,
                                   types: [ { description: 'Файл учётных записей',
                                              accept: { 'application/json': [ '.json' ] }
                                            } ]
                                 } )
      .then( function( fsHandles ) {
        getLoadedFile( 'logElementLoad', fsHandles[ 0 ] );
      })
      .catch( function ( err ) {
        console.log( `[MB] ${err}` );
      });
      break; }
    case 'logElementDeleteAll': {
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( confirm( '\nВсе записи учётных данных будут удалены\n\nПродолжить?' ) ) {
        loginRecords = [];
        console.log(`[MB] Login data removed (also from local storage)`);
        chrome.storage.local.set( { accounts: [] } );
        for (let i = (dataList.rows.length - 1); i >= 0; --i)
          dataList.deleteRow( i );
        selectedRow = undefined; // Если в таблице учётных записей была выделена строка - снимаем выделение
      }
      break; }
  } /* switch */
  // Активация кнопок управления списком учётных данных
  if (selectedRow !== undefined) {
    if ( (evnt.target.localName === 'td') ||
         ['logElementChange', 'logElementUp', 'logElementDown'].includes(evnt.target.id)
       ) {
      logElementChange.disabled = logElementDelete.disabled = false;
      logElementUp.disabled = (selectedRow === 0) ? true : false;
      logElementDown.disabled = (selectedRow === dataList.lastElementChild.rowIndex) ? true : false;
    }
  }
  else {
    logElementChange.disabled = logElementDelete.disabled = logElementUp.disabled = logElementDown.disabled = true;
  }
  logElementDeleteAll.disabled = logElementSave.disabled = (dataList.rows.length === 0) ? true : false;
  return true;
});


// Обработка нажатия кнопок управления по onclick на Div-"вкладке" основных параметров
optionsPage.addEventListener( 'click', async function(evnt) {
//        -----------------
  let crsr = document.body.style.cursor;
  switch ( evnt.target.id ) {
    case 'maintainNote': { // Пояснение по настройкам браузера для работы с таймером опроса по расписанию
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (maintainNoteText.classList.contains( 'expanded' )) {
        maintainNoteText.classList.toggle( 'expanded' );
        maintainNoteText.style.height = 0;
      }
      else {
        maintainNoteText.style.height = 'auto';
        maintainNoteText.classList.toggle( 'expanded' );
      }
      break; }
    case 'optionsRepair': { // Восстановить исходные значения переменных в local storage
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      await chrome.storage.local.remove( 'workTab' ); // Удаляем запись об ID рабочей вкладки окна результатов опроса
      await chrome.storage.local.remove( 'workWin' ); // Удаляем запись об ID окна результатов опроса
      await chrome.storage.local.set( { inProgress: false } ); // Сбрасываем статус опроса - он не идёт
      optionsRepair.disabled = true; // Блокируем кнопку восстановления исходных значений
      break; }
    case 'optionsSave': { // Сохранить основные параметры из local storage в файл
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      chrome.storage.local.get( [ 'popupShortInfo', 'cycleOrder', 'daylyMaintain', 'daylyMaintainTime', 'deleteSameDateRecord',
                                  'notificationsEnable', 'notificationsOnError', 'notificationsOnProcess', 'notificationsOnUpdateDelay',
                                  'poolingWinAlive', 'poolingLogSave', 'markNegative', 'repeatAttempts', 'historyShowMaintained' ],
                                function( fromStorage ) {
        let blob = new Blob( [ JSON.stringify( fromStorage, null, 2 ) ], { type: 'text/json', endings: 'native' } );
        let link = document.createElement( 'a' );
        link.setAttribute( 'href', URL.createObjectURL( blob ) );
        link.setAttribute( 'download', createDateStr() + ' MB-options.json' );
        link.click();
        link.remove();
      });
      break; }
    case 'optionsLoad': { // Загрузить основные параметры из указанного файла
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      window.showOpenFilePicker( { multiple: false, excludeAcceptAllOption: true,
                                   types: [ { description: 'Файл общих настроек',
                                              accept: { 'application/json': [ '.json' ] }
                                            } ]
                                 } )
      .then( function( fsHandles ) {
        getLoadedFile( 'optionsLoad', fsHandles[ 0 ] );
      })
      .catch( function ( err ) {
        console.log( `[MB] ${err}` );
      });
      break; }
    case 'historyDelete': { // Очистить историю запросов в хранилище 'Phones' indexedDb
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( confirm( '\nВсе записи истории запросов будут удалены\n\nПродолжить?' ) ) {
        document.body.style.cursor = 'wait';
        historyDelete.disabled = historySave.disabled = historyLoad.disabled = true;

        dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
        dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
        dbObjStorMB.onerror = function( evnt ) {
          console.log(`[MB] ${evnt.target.error}`);
        }
        try {
          dbObjStorMB.clear();
        }
        catch(err) {
          dbRecordsCount().then( (result) => {
            historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
            historyLoad.disabled = false;
          });
          document.body.style.cursor = crsr;
          console.log(`[MB] ${err}`);
        }
        console.log(`[MB] History data in Object store '${dbObjStorMB.name}' deleted`);
        dbRecordsCount().then( (result) => {
          recCount.textContent = String(result);
          historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
          historyLoad.disabled = false;
        });
        document.body.style.cursor = crsr;
      }
      else
        console.log(`[MB] History data deletion canceled`);
      break; }
    case 'historySave': { // Сохранить историю запросов из хранилища 'Phones' indexedDb в csv-файл
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      document.body.style.cursor = 'wait';
      historyDelete.disabled = historySave.disabled = historyLoad.disabled = true;
      infoWin.style.display = 'block'; // Выдаём на время операции модальное информационное окно

      dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readonly' );
      dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
      dbObjStorMB.onerror = function( evnt ) {
        historyLoad.disabled = false;
        document.body.style.cursor = crsr;
        console.log(`[MB] ${evnt.target.error}`);
      }

      dbCrsrMB = dbObjStorMB.openCursor( IDBKeyRange.lowerBound(0), 'next' );
      dbCrsrMB.onerror = function( evnt ) {
        dbRecordsCount().then( (result) => {
          historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
          historyLoad.disabled = false;
        });
        document.body.style.cursor = crsr;
        console.log( `[MB] ${evnt.target.error}` );
      }

      let textToSave = '';
      let rec = 0; // Счётчик записей для заполнения в выгрузке поля 'NN' значениями
      dbCrsrMB.onsuccess = function( evnt ) {
        let dbRec = evnt.target.result;
        if (dbRec) {
          let recToSave = Object.assign( new Object(), MBResult ); // Создаём объект со значениями по умолчанию
          Object.assign( recToSave, dbRec.value ); // Копируем из записи значения для полей, в которых они есть
          if (textToSave === '') { // Если это первая запись, то формируем строку заголовков из ключей
            textToSave = 'NN;';
            for (let i = 0; i < Object.entries(recToSave).length; ++i) {
              textToSave = (i === Object.entries(recToSave).length - 1) ?
                           (textToSave + Object.keys(recToSave)[ i ] + '\n') :
                           (textToSave + Object.keys(recToSave)[ i ] + ';');
            }
          }
          textToSave += parseInt( ++rec ) + ';';
          for (let i = 0; i < Object.entries(recToSave).length; ++i) {
            if (Object.keys(recToSave)[ i ] === 'QueryDateTime') { // Дату и время преобразовываем в текст
              let d = new Date( Object.values(recToSave)[ i ] );
              textToSave = textToSave + `${String(d.getFullYear())}-` +
                           `${(d.getMonth() < 9) ? '0' +    String(d.getMonth() + 1) : String(d.getMonth() + 1)}-` +
                           `${(d.getDate() < 10) ? '0' +    String(d.getDate()) :      String(d.getDate())}T` +
                           `${(d.getHours() < 10) ? '0' +   String(d.getHours()) :     String(d.getHours())}:` +
                           `${(d.getMinutes() < 10) ? '0' + String(d.getMinutes()) :   String(d.getMinutes())}:` +
                           `${(d.getSeconds() < 10) ? '0' + String(d.getSeconds()) :   String(d.getSeconds())};`;
            }
            else
              textToSave = (i === Object.entries(recToSave).length - 1) ?
                           (textToSave + Object.values(recToSave)[ i ] + '\n') :
                           (textToSave + Object.values(recToSave)[ i ] + ';');
          }
          dbRec.continue(); // Переводим курсор на следующую запись хранилища
        }
        else { // Всё хранилище получили в массиве, записываем его в csv-файл (UTF-8)
          let blob = new Blob( [ textToSave ], { type: 'text/plain', endings: 'native' } );
          let link = document.createElement( 'a' );
          link.setAttribute( 'href', URL.createObjectURL( blob ) );
          link.setAttribute( 'download', createDateStr() + ' MB-historyData.csv' );
          link.click();
          link.remove();
          infoWin.style.display = 'none'; // Снимаем модальное информационное окно
          dbRecordsCount().then( (result) => {
            historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
            historyLoad.disabled = false;
          });
          document.body.style.cursor = crsr;
        }
      } /* dbCrsrMB.onsuccess */
      break; }
    case 'historyLoad': { // Загрузить историю запросов в хранилище 'Phones' indexedDb из указанного csv-файла
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      window.showOpenFilePicker( { multiple: false, excludeAcceptAllOption: true,
                                   types: [ { description: 'Файл истории запросов',
                                              accept: { 'text/csv': [ '.csv' ] }
                                            } ]
                                 } )
      .then( function( fsHandles ) {
        getLoadedFile( 'historyLoad', fsHandles[ 0 ] );
      })
      .catch( function ( err ) {
        console.log( `[MB] ${err}` );
      });
      break; }
    case 'historyNote': { // Пояснение по подготовке csv-файла
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (historyNoteText.classList.contains( 'expanded' )) {
        historyNoteText.classList.toggle( 'expanded' );
        historyNoteText.style.height = 0;
      }
      else {
        historyNoteText.style.height = 'auto';
        historyNoteText.classList.toggle( 'expanded' );
      }
      break; }
  } /* switch */
  return true;
});


// Обработка нажатия кнопок управления по onclick на Div-"вкладке" параметров провайдеров
providersPage.addEventListener( 'click', async function(evnt) {
//        -----------------
  let crsr = document.body.style.cursor;
  switch ( evnt.target.id ) {
    case 'providerDelete': { // Удалить набор файлов текущего плагина
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      let pIdx = providerRecords.findIndex( function( item, index ) {
        return ( ( chooseProvider.value === item.name ) && ( chooseProvider.selectedIndex === index ) )
      });
      if ( pIdx >= 0) { // Если такой провайдер есть - удаляем его данные
        if ( ( providerRecords.length > 0 ) &&
             ( confirm( `\nПараметры провайдера "${providerRecords[ pIdx ].description}" будут удалены\n\n` +
                        `Продолжить?` ) ) ) {
          console.log( `[MB] Provider script "${providerRecords[ pIdx ].name}.js" deleted` )
          providerRecords.splice( pIdx, 1 );                          // Удаляем из массива запись этого провайдера
          chrome.storage.local.set( { provider: providerRecords } )   // Сохраняем обновлённые значения в local storage
          .then( () => {
            getProviderFromStorage()                                  // Обновляем записи провайдеров в списках выбора...
            .then( () => {
              drawProvider();                                         // ...и отрисовываем его параметры
              for ( let i = (dataList.rows.length - 1); i >= 0; --i ) // Удаляем строки таблицы на 'вкладке' учётных записей...
                dataList.deleteRow( i );
              drawLoginTable( 'dataList' );                           // ...и отрисовываем их заново
            })
          })
        }
      }
      break; }
    case 'providerSave': { // Сохранить набор файлов текущего плагина на диск
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      let pIdx = providerRecords.findIndex( function( item, index ) {
        return ( ( chooseProvider.value === item.name ) && ( chooseProvider.selectedIndex === index ) )
      });
      if ( pIdx >= 0) { // Если такой провайдер есть - сохраняем его данные в файл
          let blob = new Blob( [ JSON.stringify( providerRecords[ pIdx ], null, 2 ) ], { type: 'text/json', endings: 'native' } );
          let link = document.createElement( 'a' );
          link.setAttribute( 'href', URL.createObjectURL( blob ) );
          link.setAttribute( 'download', createDateStr() + ' MB-provider-' + providerRecords[ pIdx ].name + '.json' );
          link.click();
          link.remove();
      }
      break; }
    case 'providerLoad': { // Загрузить новый набор файлов плагина с диска
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( confirm( `\nЕсли провайдер с таким именем (значение 'name' в структуре файла) уже существует, то его запись будет замещена данными из загружаемого файла\n\nПродолжить?` ) ) {
        window.showOpenFilePicker( { multiple: false, excludeAcceptAllOption: true,
                                     types: [ { description: 'Файл настроек провайдера',
                                                accept: { 'application/json': [ '.json' ] }
                                              } ]
                                   } )
        .then( function( fsHandles ) {
          getLoadedFile( 'providerLoad', fsHandles[ 0 ] );
        })
        .catch( function ( err ) {
          console.log( `[MB] ${err}` );
        });
      }
      break; }
    case 'providerNote': { // Пояснение по плагинам расширения
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if ( providerNoteText.classList.contains( 'expanded' ) ) {
        providerNoteText.classList.toggle( 'expanded' );
        providerNoteText.style.height = 0;
      }
      else {
        providerNoteText.style.height = 'auto';
        providerNoteText.classList.toggle( 'expanded' );
      }
      break; }
  } /* switch */
  return true;
});


// Обработка нажатия кнопок управления по onclick на Div-"вкладке" сведений о расширении
aboutPage.addEventListener( 'click', async function(evnt) {
//        -----------------
  switch (evnt.target.id) {
    case 'changeLogNote': { // История изменений расширения из файла MB_ChangeLog.txt
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (changeLogText.classList.contains( 'expanded' )) {
        changeLogText.classList.toggle( 'expanded' );
        changeLogText.style.height = 0;
      }
      else {
        if (!changeLogText.classList.contains( 'textLoaded' )) {
          try { // Если файл ещё не считывали - делаем это
            changeLogText.textContent = await ( await fetch( `\\MB_ChangeLog.txt` ) ).text();
            changeLogText.classList.toggle( 'textLoaded' );
          }
          catch(err) {
            console.log(`[MB] ${err}`);
          }
        }
        changeLogText.style.height = '36vh';
        changeLogText.classList.toggle( 'expanded' );
      }
    break; }
  } /* switch */
  return true;
});


// Контроль доступности кнопки восстановления исходных значений
chrome.storage.onChanged.addListener(
  async function( changes ) {
    if (changes.workWin) // Если запись об ID окна результатов опроса удалена (только oldValue), то блокируем кнопку
                         // Если она создана (только newValue) или изменилась (и newValue, и oldValue), то разблокируем
      optionsRepair.disabled = ( (changes.workWin.oldValue) && (!changes.workWin.newValue) ) ? true : false;
    return true;
  }
);


// Отработка сообщений на вкладках общих настроек
chrome.runtime.onMessage.addListener(
  async function( request, sender, sendResponse ) {
    switch(request.message) {
      case 'MB_updateRecordsCount': { // Обновить количество записей в хранилище
        if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
        dbRecordsCount().then( (result) => {
          recCount.textContent = String(result);
          historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
          historyLoad.disabled = false;
        });
        break; }
      case 'MB_actualizeControls': { // Актуализировать доступность кнопки восстановления исходных значений
        if ( sendResponse ) sendResponse( 'done' );  // Ответ в Service Worker для поддержания канала связи
        let workWin = -1;
        try { // Если открыто окно для проведения опроса, то в Local Storage должен быть сохранён id его вкладки
          workWin = (await chrome.storage.local.get( 'workWin' )).workWin;
        }
        catch(err) {
          console.log( `[MB] ${err}` );
        }
        // Если открыто окно проведения опроса, то разблокируем кнопку восстановления исходных значений
        optionsRepair.disabled = (workWin >= 0) ? false : true;
        break; }
    } /* switch */
    return true;
  }
);


// Обработка состояния объектов управления по onchange на Div-"вкладке" основных параметров
optionsPage.addEventListener( 'change', async function(evnt) {
//        -----------------
  switch ( evnt.target.id ) {
    case 'cycleOrder_sequence': // Порядок опроса
    case 'cycleOrder_parallel': {
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      cycleOrder = document.querySelector( `[name='cycleOrder']:checked` ).value;
      chrome.storage.local.set( { cycleOrder: cycleOrder } );
      break; }
    case 'maintainDayly': { // Ежедневный опрос
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      daylyMntn = maintainDayly.checked;
      chrome.storage.local.set( { daylyMaintain: daylyMntn } )
      .then( () => {
        chrome.runtime.sendMessage( { message: 'MB_poolingTimerReset', daylyMntn: daylyMntn, mntnTime: mntnTime } );
      });
      maintainTime.disabled = (daylyMntn) ? false : true;
      break; }
    case 'maintainTime': { // Время начала ежедневного опроса
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      mntnTime = maintainTime.value;
      chrome.storage.local.set( { daylyMaintainTime: mntnTime } )
      .then( () => {
        chrome.runtime.sendMessage( { message: 'MB_poolingTimerReset', daylyMntn: daylyMntn, mntnTime: mntnTime } );
      });
      break; }
    case 'repeatAttempts': { // Количество повторов при неудачном запросе
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      repeatAttempts.style.outlineColor = ''; // Сбрасываем цвет рамки фокуса - он мог быть установлен в цвет ошибки
      if (repeatAttempts.value < 0) {
        repeatAttempts.style.outlineColor = '#800000'; // Цвет рамки - 'Maroon' rgb(128,0,0) #800000
        repeatAttempts.focus();
        break;
      }
      rptAttempts = parseInt((repeatAttempts.value === '') ? 0 : repeatAttempts.value);
      chrome.storage.local.set( { repeatAttempts: rptAttempts } );
      break; }
    case 'enableNotifications': { // Разрешить оповещения от расширения
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (notifPermission === 'granted') {
        ntfEnable = enableNotifications.checked;
        chrome.storage.local.set( { notificationsEnable: ntfEnable } );
        if (ntfEnable === false) {
          onErrorNotifications.disabled = onProcessNotifications.disabled = onUpdateDelayNotifications.disabled = true;
          onErrorNotifications.checked = onProcessNotifications.checked = onUpdateDelayNotifications.checked = false;
        }
        else {
          onErrorNotifications.disabled = onProcessNotifications.disabled = onUpdateDelayNotifications.disabled = false;
          enableNotifications.checked = ntfEnable;
          onErrorNotifications.checked = ntfOnError;
          onProcessNotifications.checked = ntfOnProcess;
          onUpdateDelayNotifications.checked = ntfOnUpdateDelay;
        }
      }
      break; }
    case 'onErrorNotifications': { // Разрешить оповещения при ошибках запросов
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (notifPermission === 'granted') {
        ntfOnError = onErrorNotifications.checked;
        chrome.storage.local.set( { notificationsOnError: ntfOnError } );
      }
      break; }
    case 'onProcessNotifications': { // Разрешить оповещения при начале-завершении опроса
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (notifPermission === 'granted') {
        ntfOnProcess = onProcessNotifications.checked;
        chrome.storage.local.set( { notificationsOnProcess: ntfOnProcess } );
      }
      break; }
    case 'onUpdateDelayNotifications': { // Разрешить оповещения при отсутствии изменений баланса
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      if (notifPermission === 'granted') {
        ntfOnUpdateDelay = onUpdateDelayNotifications.checked;
        chrome.storage.local.set( { notificationsOnUpdateDelay: ntfOnUpdateDelay } );
      }
      break; }
    case 'poolingWinAlive': { // Оставлять окно результатов после опроса открытым
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      poolWinAlive = poolingWinAlive.checked;
      chrome.storage.local.set( { poolingWinAlive: poolWinAlive } );
      break; }
    case 'poolingLogSave': {  // Сохранять лог после закрытия окна опроса
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      poolLog = poolingLogSave.checked;
      chrome.storage.local.set( { poolingLogSave: poolLog } );
      break; }
    case 'markNegative': { // Выделять отрицательное значение баланса цыетом
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      paintNegative = markNegative.checked;
      chrome.storage.local.set( { markNegative: paintNegative } );
      break; }
    case 'notDelete': {
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      chrome.storage.local.set( { deleteSameDateRecord: deleteSameDateRecord = 0 } );
      break; }
    case '4hAge':
    case '8hAge':
    case '12hAge': {
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      deleteSameDateRecord = Number( document.querySelector( `[id='${evnt.target.id}']` ).value );
      chrome.storage.local.set( { deleteSameDateRecord: deleteSameDateRecord } );
      break; }
  } /* switch */
  return true;
});


// Обработка состояния объектов управления по onchange на Div-"вкладке" параметров провайдеров
providersPage.addEventListener( 'change', async function(evnt) {
//        -----------------
  switch ( evnt.target.id ) {
    case 'chooseProvider': { // Выбор набора параметров провайдера
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      drawProvider();
      break; }
    case 'requestDelay': { // Включение задержки между опросами по номерам провайдера
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].requestDelay = requestDelay.checked;
          chrome.storage.local.set( { provider: providerRecords } );
          requestDelayValue.disabled = (requestDelay.checked) ? false : true;
          break;
        }
      }
      break; }
    case 'requestDelayValue': { // Значение задержки между опросами по номерам провайдера
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      requestDelayValue.style.outlineColor = ''; // Сбрасываем цвет рамки фокуса - он мог быть установлен в цвет ошибки
      if (requestDelayValue.value < 0) {
        requestDelayValue.style.outlineColor = '#800000';
        requestDelayValue.focus();
        break;
      }
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].requestDelayValue =
            parseInt( (requestDelayValue.value === '') ? 0 : requestDelayValue.value );
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
    case 'onUpdateDelay': { // Включение задержки после обновления / смены страницы провайдера
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].onUpdateDelay = onUpdateDelay.checked;
          chrome.storage.local.set( { provider: providerRecords } );
          onUpdateDelayValue.disabled = (onUpdateDelay.checked) ? false : true;
          break;
        }
      }
      break; }
    case 'onUpdateDelayValue': { // Значение задержки после обновления / смены страницы провайдера
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      onUpdateDelayValue.style.outlineColor = ''; // Сбрасываем цвет рамки фокуса - он мог быть установлен в цвет ошибки
      if (onUpdateDelayValue.value < 0) {
        onUpdateDelayValue.style.outlineColor = '#800000';
        onUpdateDelayValue.focus();
        break;
      }
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].onUpdateDelayValue =
            parseInt( (onUpdateDelayValue.value === '') ? 0 : onUpdateDelayValue.value );
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
    case 'respondTimeout': { // Включение времени ожидания от провайдера ответа на запрос
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].respondTimeout = respondTimeout.checked;
          chrome.storage.local.set( { provider: providerRecords } );
          respondTimeoutValue.disabled = (respondTimeout.checked) ? false : true;
          break;
        }
      }
      break; }
    case 'respondTimeoutValue': { // Значение времени ожидания от провайдера ответа на запрос
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      respondTimeoutValue.style.outlineColor = ''; // Сбрасываем цвет рамки фокуса - он мог быть установлен в цвет ошибки
      if (respondTimeoutValue.value < 0) {
        respondTimeoutValue.style.outlineColor = '#800000';
        respondTimeoutValue.focus();
        break;
      }
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].respondTimeoutValue =
            parseInt( (respondTimeoutValue.value === '') ? 0 : respondTimeoutValue.value );
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
    case 'providerInetGb':
    case 'providerInetMb': {
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].inetUnits = document.querySelector( `[name='providerInetUnits']:checked` ).value;
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
    case 'providerIgnoreFractional': { // Отбрасывать дробную часть баланса при оценке его изменения
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].ignoreFractional = providerIgnoreFractional.checked;
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
    case 'providerClearCookies': { // Удалять cookie для стартовой страницы перед запросом
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].startUrlClearCookies = providerClearCookies.checked;
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
    case 'providerBypassCache': { // Обновлять стартовую страницу запроса с сервера (аналог Ctrl+F5)
      evnt.stopPropagation(); // Это событие нужно только здесь, не разрешаем ему всплывать дальше
      for ( let i = 0; i < providerRecords.length; ++i ) {
        if (chooseProvider.value === providerRecords[ i ].name) {
          providerRecords[ i ].startUrlBypassCache = providerBypassCache.checked;
          chrome.storage.local.set( { provider: providerRecords } );
          break;
        }
      }
      break; }
  } /* switch */
  return true;
});


// Проверка-запрос разрешения пользователя на запись файлов расширением
async function verifyPermission( handle, readWrite ) {
//             -------------------------------------
  return new Promise( (resolve, reject) => {
    var options = {};
    options.mode = ( readWrite ) ? 'readwrite' : 'read';
    handle.queryPermission( options )
    .then( (result) => {
      if ( result === 'granted' )           // Если разрешение уже есть, то больше ничего делать не нужно
        resolve( true )
      else {
        handle.requestPermission( options ) // Здесь пользователь получит запрос на предоставление разрешения
        .then( (result) => {                // Если пользователь подтветдил разрешение, то больше ничего делать не нужно
          resolve( result === 'granted' );  // Если пользователь разрешение не подтветдил, то возвращаем false
        })
      }
    })
  });
}


function getLoadedFile( btnId, fsHandle ) {
//       --------------------------------
  fileClamedBy = btnId;
  let crsr = document.body.style.cursor;
  document.body.style.cursor = 'wait';
  if ( fileClamedBy === 'historyLoad' ) {
    historyDelete.disabled = historySave.disabled = historyLoad.disabled = true;
    infoWin.style.display = 'block';  // Выдаём на время операции модальное информационное окно
  }
  console.log(`[MB] File chose (loading ${((fileClamedBy === 'logElementLoad') ? 'login data' :    '')}` +
                                       `${((fileClamedBy === 'optionsLoad') ?    'options' :       '')}` +
                                       `${((fileClamedBy === 'providerLoad') ?   'provider data' : '')}` +
                                       `${((fileClamedBy === 'historyLoad') ?    'history data' :  '')}` +
                                       `): ${fsHandle.name}`);
  let rawFile = new FileReader();
  fsHandle.getFile()
  .then ( function (result) {
    rawFile.readAsText( result );     // Прочитываем выбранный пользователем файл
  })
  .catch( function ( err ) {
    if ( fileClamedBy === 'historyLoad' ) {
      infoWin.style.display = 'none'; // Снимаем модальное информационное окно
      dbRecordsCount().then( (result) => {
        historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
        historyLoad.disabled = false;
      });
    }
    document.body.style.cursor = crsr;
    fileClamedBy = '';
    console.log( `[MB] ${err}` );
    return false;
  });

  rawFile.onerror = function() { // Ошибка чтения Файла
  //      -------
    if ( fileClamedBy === 'historyLoad' ) {
      infoWin.style.display = 'none'; // Снимаем модальное информационное окно
      dbRecordsCount().then( (result) => {
        historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
        historyLoad.disabled = false;
      });
    }
    document.body.style.cursor = crsr;
    fileClamedBy = '';
    console.log( `[MB] ${rawFile.error}` );
  }

  rawFile.onload = function() { // Файл считан. Преобразуем его в объект JSON для учётных данных и опций
  //      ------                   или в текст для плагина провайдера и записей истории запросов
    let jsonFile = undefined;
    switch ( fileClamedBy ) {
      case 'logElementLoad':
      case 'optionsLoad':
      case 'providerLoad': {
        try {
          jsonFile = JSON.parse( rawFile.result )
        }
        catch( err ) {
          document.body.style.cursor = crsr;
          fileClamedBy = '';
          console.log( `[MB] ${err}` );
          alert( 'Загрузка прервана\nОбнаружена ошибка в JSON-структуре файла');
        }
        console.log( `[MB] Structure loaded from file: ${JSON.stringify(jsonFile)}` );
        break; };
    }
    // Разбираем параметры в зависимости от того, загрузка чего (= какой кнопкой) инициирована
    switch ( fileClamedBy ) {
      case 'logElementLoad': { // Загрузка учётных данных
        if ( !jsonFile.accounts ) {
          fileClamedBy = '';
          console.log( `[MB] Error: Login JSON data structure 'accounts' not found` );
        }
        else {
          loginRecords = jsonFile.accounts;
          loginRecords.forEach( function( item ) { // Пароли для хранения в local storage кодируем
            item.passwValue = encodePassword( item.passwValue );
          });
          chrome.storage.local.set( { accounts: loginRecords } );
          for ( let i = (dataList.rows.length - 1); i >= 0; --i ) // Удаляем текущие строки в таблице учётных записей
            dataList.deleteRow( i );
          selectedRow = undefined; // Если в таблице учётных записей была выделена строка - снимаем выделение
          drawLoginTable( 'dataList' ); // Отрисовываем строки таблицы учётных записей заново (по loginRecords)
          loginData.dispatchEvent( new Event( 'click' ) ); // Инициализируем кнопки щелчком по таблице-заголовку
        }
        document.body.style.cursor = crsr;
        break; };
      case 'optionsLoad': { // Загрузка основных параметров
        if ( jsonFile.popupShortInfo !== undefined ) {
          chrome.storage.local.set( { popupShortInfo: jsonFile.popupShortInfo } );
        }
        if ( jsonFile.cycleOrder !== undefined ) {
          chrome.storage.local.set( { cycleOrder: cycleOrder = jsonFile.cycleOrder } );
        }
        if ( jsonFile.daylyMaintainTime !== undefined ) {
          chrome.storage.local.set( { daylyMaintainTime: mntnTime = jsonFile.daylyMaintainTime } );
        }
        if ( jsonFile.daylyMaintain !== undefined ) {
          chrome.storage.local.set( { daylyMaintain: daylyMntn = jsonFile.daylyMaintain } )
          .then( () => {
            if ( daylyMntn )
              chrome.runtime.sendMessage( { message: 'MB_poolingTimerReset', daylyMntn: daylyMntn, mntnTime: mntnTime } );
          });
        }
        if ( jsonFile.repeatAttempts !== undefined ) {
          chrome.storage.local.set( { repeatAttempts: rptAttempts = jsonFile.repeatAttempts } );
        }
        if ( jsonFile.notificationsEnable !== undefined ) {
          chrome.storage.local.set( { notificationsEnable: ntfEnable = jsonFile.notificationsEnable } );
        }
        if ( jsonFile.notificationsOnError !== undefined ) {
          chrome.storage.local.set( { notificationsOnError: ntfOnError = jsonFile.notificationsOnError } );
        }
        if ( jsonFile.notificationsOnProcess !== undefined ) {
          chrome.storage.local.set( { notificationsOnProcess: ntfOnProcess = jsonFile.notificationsOnProcess } );
        }
        if ( jsonFile.notificationsOnUpdateDelay !== undefined ) {
          chrome.storage.local.set( { notificationsOnUpdateDelay: ntfOnUpdateDelay = jsonFile.notificationsOnUpdateDelay } );
        }
        if ( jsonFile.poolingWinAlive !== undefined ) {
          chrome.storage.local.set( { poolingWinAlive: poolWinAlive = jsonFile.poolingWinAlive } );
        }
        if ( jsonFile.poolingLogSave !== undefined ) {
          chrome.storage.local.set( { poolingLogSave: poolLog = jsonFile.poolingLogSave } );
        }
        if ( jsonFile.markNegative !== undefined ) {
          chrome.storage.local.set( { markNegative: paintNegative = jsonFile.markNegative } );
        }
        if ( jsonFile.historyShowMaintained !== undefined ) {
          chrome.storage.local.set( { historyShowMaintained: jsonFile.historyShowMaintained } );
        }
        drawOptions(); // Проставляем значения на вкладке основных параметров (по загруженным)
        document.body.style.cursor = crsr;
        break; };
      case 'providerLoad': { // Загрузка параметров провайдера
        if ( !jsonFile.name || (jsonFile.name === '' ) ) {
          fileClamedBy = '';
          console.log( `[MB] Error: Provider JSON data is invalid. 'name' property undefined or it's value is empty` );
          // Сообщение об ошибке выдаём с задержкой, чтобы успели сработать функции удаления элементов выбора файла
          setTimeout( function() {
            alert( `Опреация прервана\nОшибка в JSON-структуре файла провайдера: элемент 'name' не определен или имеет значение пустой строки` );
          }, 100);
        }
        else {
          let newProvider = { name: jsonFile.name };
          newProvider.description = ( jsonFile.description ) ? jsonFile.description : 'не определено';
          newProvider.version = ( jsonFile.version ) ? jsonFile.version : 'не определено';
          newProvider.author = ( jsonFile.author ) ? jsonFile.author : 'не указан';
          newProvider.annotation = ( jsonFile.annotation ) ? jsonFile.annotation : 'не определено';
          newProvider.icon = ( jsonFile.icon ) ? jsonFile.icon : '';
          newProvider.startUrl = ( jsonFile.startUrl ) ? jsonFile.startUrl : '';
          newProvider.finishUrl = ( jsonFile.finishUrl ) ? jsonFile.finishUrl : '';
          newProvider.scriptActions = ( jsonFile.scriptActions ) ? jsonFile.scriptActions : [];
          newProvider.scriptFiles = ( jsonFile.scriptFiles ) ? jsonFile.scriptFiles : [];
          newProvider.requestDelay = ( jsonFile.requestDelay === true );
          newProvider.requestDelayValue = ( jsonFile.requestDelayValue ) ? Number(jsonFile.requestDelayValue) : 0;
          newProvider.onUpdateDelay = ( jsonFile.onUpdateDelay === true );
          newProvider.onUpdateDelayValue = ( jsonFile.onUpdateDelayValue ) ? Number(jsonFile.onUpdateDelayValue) : 0;
          newProvider.respondTimeout = ( jsonFile.respondTimeout === true );
          newProvider.respondTimeoutValue = ( jsonFile.respondTimeoutValue ) ? Number(jsonFile.respondTimeoutValue) : 0;
          newProvider.inetUnits = ( jsonFile.inetUnits ) ? jsonFile.inetUnits : 'G';
          newProvider.ignoreFractional = ( jsonFile.ignoreFractional === true );
          newProvider.startUrlClearCookies = ( jsonFile.startUrlClearCookies === true );
          newProvider.startUrlBypassCache = ( jsonFile.startUrlBypassCache === true );
          // Выясняем есть ли уже провайдер с таким именем, как в загружаемых параметрах
          let pIdx = providerRecords.findIndex( function( item ) {
            return ( newProvider.name === item.name )
          });
          if ( pIdx >= 0) {    // Если такой провайдер есть - замещаем его данные
            newProvider.custom = ( providerRecords[ pIdx ].custom === undefined ) ? true : providerRecords[ pIdx ].custom;
            Object.assign( providerRecords[ pIdx ], newProvider );
          }
          else {               // Если это новая запись провайдера - добавляем её как пользовательскую
            newProvider.custom = true;
            providerRecords.push( newProvider );
            pIdx = providerRecords.length - 1;
          }
          chrome.storage.local.set( { provider: providerRecords } )   // Сохраняем обновлённые значения в local storage
          .then( () => {
            getProviderFromStorage()                                  // Обновляем записи провайдеров в списках выбора...
            .then( () => {
              chooseProvider.selectedIndex = pIdx;                    // Выбираем загруженную запись провайдера в списке
              drawProvider();                                         // ...и отрисовываем его параметры
              for ( let i = (dataList.rows.length - 1); i >= 0; --i ) // Удаляем строки таблицы на 'вкладке' учётных записей...
                dataList.deleteRow( i );
              drawLoginTable( 'dataList' );                           // ...и отрисовываем их заново
            })
          });
        }
        document.body.style.cursor = crsr;
        break; };
      case 'historyLoad': { // Загрузка записей истории запросов
        try {
          let allTextLines = rawFile.result.split( /\r\n|\n/ );
          let headerArr = allTextLines[ 0 ].split( ';' );
          for ( let i = 1; i < allTextLines.length; i++ ) {
            dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
            dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );

            dbObjStorMB.onerror = function( evnt ) {
              infoWin.style.display = 'none'; // Снимаем модальное информационное окно
              historyLoad.disabled = false;
              fileClamedBy = '';
              document.body.style.cursor = crsr;
              console.log( `[MB] ${evnt.target.error}` );
            }

            let valueArr = allTextLines[ i ].split( ';' );
            if (valueArr.length === headerArr.length) {
              let value = undefined;
              let tArr = MBResult; //  Создаём объект со значениями полей по умолчанию
              for (let j = 0; j < headerArr.length; j++) {
                // Эти поля из структуры оригинальной BalanceHistory.mdb не импортируем
                if ( [ 'NN', 'ObPlat', 'Average', 'TurnOff', 'JeansExpired', 'Recomend', 'USDRate',
                       'Contract', 'PhoneReal', 'BalanceRUB', 'Currenc', 'BalDeltaQuery', 'MinDelta',
                       'MinDeltaQuery', 'RealAverage', 'CalcTurnOff', 'BeeExpired', 'SMS_USD', 'SMS_RUB',
                       'MinAverage', 'Seconds', 'SpendMin', 'MinSonet', 'MinLocal','InternetUSD',
                       'InternetRUB', 'SpendBalance' ].indexOf( headerArr[ j ] ) >= 0 ) {
                  continue;
                }
                if ( [ 'SMS', 'Minutes', 'NoChangeDays', 'Warning' ].indexOf( headerArr[ j ] ) >= 0 ) {
                  value = parseInt( (valueArr[ j ] === '') ? 0 : valueArr[ j ] );
                }
                if ( [ 'Balance', 'BalDelta', 'Internet', 'KreditLimit', 'Balance2',
                       'Balance3'].indexOf( headerArr[ j ] ) >= 0 ) {
                  if (valueArr[ j ] === '') value = 0
                  else
                    value = parseFloat( parseFloat( valueArr[ j ].replace( ',', '.' ) ).toFixed(3) );
                }
                // 'QueryDateTime' - ключевое (primary key). Если в нём не будет значения, то indexedDB
                if (headerArr[ j ] === 'QueryDateTime') { //   не запишет такую запись в хранилище
                  value = Date.parse( valueArr[ j ]+'.000' ); // В сохраняемом представлении даты нет мс, добавляем их
                }
                if ( [ 'LicSchet', 'PhoneNumber', 'UserName', 'TarifPlan', 'BlockStatus', 'AnyString',
                       'TurnOffStr', 'UslugiOn' ].indexOf( headerArr[ j ] ) >= 0 ) {
                  value = valueArr[ j ];
                }
                tArr[ headerArr[ j ] ] = value;
              } /* for j */
              let dbRequest = dbObjStorMB.add( tArr );
              dbTrnsMB.commit(); // Закрываем транзакция - для следующей строки запустится новая транзакция
              dbRequest.onerror =  function( evnt ) { console.log( `[MB] ${evnt.target.error}` ); }
            }
          } /* for i */
          console.log( `[MB] History data import success. ${String(allTextLines.length - 2)} ` +
                       `records processed to add in '${dbObjStorMB.name}'` );
          dbRecordsCount().then( (result) => {
            console.log( `[MB] Object store '${dbObjStorMB.name}' total records: ${String(result)}` );
            infoWin.style.display = 'none'; // Снимаем модальное информационное окно
            recCount.textContent = String(result);
            historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
            historyLoad.disabled = false;
            document.body.style.cursor = crsr;
          });
        }
        catch(err) {
          dbRecordsCount().then( (result) => {
            infoWin.style.display = 'none'; // Снимаем модальное информационное окно
            historyDelete.disabled = historySave.disabled = (result === 0) ? true : false;
            historyLoad.disabled = false;
          });
          fileClamedBy = '';
          document.body.style.cursor = crsr;
          console.log( `[MB] ${err}` );
        }
        break; };
    } /* switch */
    fileClamedBy = '';
  } /* rawFile.onload */

  return false;
}


// Модальное окно параметров учётных данных
function loginWin( itemId = undefined ) {       // Если itemId = undefined - создаём новую запись
//       ------------------------------
  selectProvider.style.outlineColor = '';       // Сбрасываем цвет рамки фокуса - он мог быть установлен
  inputInactiveRemind.style.outlineColor = '';  // в цвет ошибки #800000 при предыдущем открытии окна

  if ( itemId === undefined ) { // Инициализация окна для новой учётной записи
    selectMaintain.checked = true;
    inputLogin.value = inputPassword.value = inputDescription.value =
                       selectProvider.value = inputInactiveRemind.value = '';
  }
  else { // Отображение параметров выбранной учётной записи
    selectMaintain.checked = loginRecords[ itemId ].maintain;
    inputLogin.value = loginRecords[ itemId ].loginValue;
    inputPassword.value = decodePassword( loginRecords[ itemId ].passwValue ); // Для работы с паролем его декодируем
    inputDescription.value = loginRecords[ itemId ].description;
    selectProvider.value = loginRecords[ itemId ].provider;
    inputInactiveRemind.value = loginRecords[ itemId ].inactiveRemind;
  }

  modalWin.style.display = 'block';
  selectMaintain.focus();

  return new Promise((resolve, reject) => {

    // Отмена изменений / создания параметров в 'модальном' окне по клавише Escape
    document.addEventListener( 'keyup', keyCatcher );
    function keyCatcher(evnt) {
      if ( evnt.key === 'Escape' ) {
        modalWin.style.display = 'none';
        document.removeEventListener( 'keyup', keyCatcher );
        resolve( undefined );
      }
    };
    // Отмена изменений / создания параметров в 'модальном' окне по экранным кнопкам отмены
    modalWinClose1.onclick = modalWinClose2.onclick = function() {
      modalWin.style.display = 'none';
      document.removeEventListener( 'keyup', keyCatcher );
      resolve( undefined );
    };
    // Удержание фокуса на элементах 'модального' окна по клавише табуляции (в прямом направлении обхода)
    modalTop.onfocus = function() {
      modalWinClose2.focus();
      return false;
    }
    // Удержание фокуса на элементах 'модального' окна по клавише табуляции (в обратном направлении обхода)
    modalBottom.onfocus = function() {
      selectMaintain.focus();
      return false;
    }

    // Сохранение изменений / создание параметров в 'модальном' окне
    modalWinSave.onclick = function() { // Создание новой учётной записи
      if (selectProvider.value === '') {
        selectProvider.style.outlineColor = '#800000'; // Цвет рамки - 'Maroon' rgb(128,0,0) #800000
        selectProvider.focus();
      }
      else {
        if (inputInactiveRemind.value < 0) {
          inputInactiveRemind.style.outlineColor = '#800000';
          inputInactiveRemind.focus();
        }
        else {
          selectProvider.style.outlineColor = ''; // Цвет рамки указанный в CSS
          // Копируем предыдущие значения учётных данных - в них могут быть дополнительные параметры ...
          let LoginItem = Object.assign( new Object(), loginRecords[ itemId ] );
          // ... и меняем значения на указанные в 'модальном' окне
          LoginItem.maintain = selectMaintain.checked;
          LoginItem.loginValue = inputLogin.value;
          LoginItem.passwValue = encodePassword( inputPassword.value ); // Паролm для хранения в local storage кодируем
          // Удаляем запятые - они не дадут разделить JSON основных параметров на строки при сохранении в файл.
          // В других полях запятых оказаться не должно
          LoginItem.description = (inputDescription.value).replaceAll( ',', '' );
          LoginItem.provider = selectProvider.value;
          // Для пустых значений в цифровом поле обеспечиваем запись '', для любых других - Number, а не строку
          LoginItem.inactiveRemind = (inputInactiveRemind.value === '') ? '' : Number(inputInactiveRemind.value);
          modalWin.style.display = 'none';
          document.removeEventListener( 'keyup', keyCatcher );
          resolve( LoginItem );
        }
      }
    }

  }); /* Promise */
}

// Кодирование пароля для хранения в local storage и внутренних структурах расширения
function encodePassword( psw ) {
//       ---------------------
  let str = btoa( encodeURI( psw ) );                     // Кодируем символы в UTF-8, результат кодируем по Base64
  let arr = str.split( '' )                               // Трансформируем строку в массив символов
  .map( function( c ) { return c.charCodeAt( 0 ); } )     // Меняем в массиве символы на их ASCII-номера
  .map( function( i ) { return i ^ 13; } );               // XOR-"encryption"
  return ( String.fromCharCode.apply( undefined, arr ) ); // Трюк: цифровой массив в массив ASCII-символов, объединяя их в единую строку
}

// Декодирование пароля работы с ним в окне учётных данных и сохранении в файл
function decodePassword( psw ) {
//       ---------------------
  let arr = psw.split( '' )                               // Трансформируем строку в массив символов
  .map( function( c ) { return c.charCodeAt( 0 ); } )     // Меняем в массиве символы на их ASCII-номера
  .map( function( i ) { return i ^ 13; } );               // XOR-"encryption"
  let str = String.fromCharCode.apply( undefined, arr );  // Трюк: цифровой массив в массив ASCII-символов, объединяя их в единую строку
  return ( decodeURI( atob( str ) ) );                    // Декодируем Base64 в ASCII-символы, результат декодируем из UTF-8
}

