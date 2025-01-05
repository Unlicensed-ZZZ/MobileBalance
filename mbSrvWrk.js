/* mbSrvWrk.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Сервисный (фоновый) обработчик расширения MobileBalance (Service Worker)
 * Редакция:  2024.08.11
 *
*/

'use strict';
import { Delay, dbVersion } from './vars.mjs'; // Глобальные переменные расширения (из модуля vars.mjs)

let provider = undefined;                      // Набор параметров для провайдеров (plugin-ов)

// Указываем в подписи к иконке расширения его наименование и версию
chrome.action.setTitle( { title: `${chrome.runtime.getManifest().name}  ${chrome.runtime.getManifest().version}` } );

// Инициализация структур расширения в local storage при его исходной установке
chrome.runtime.onInstalled.addListener( async ( details ) => {   // Fired when the extension is first installed,
  console.log( `[MB] Exeption 'runtime.onInstalled' fired with reason: '${details.reason}'` );
  let dbMB, dbTrnsMB, dbObjStorMB, dbCrsrMB;                     //       when the extension is updated to a new version,
  switch( details.reason ) {                                     //       and when Chrome is updated to a new version
    case 'install': {
      try {
        await chrome.storage.local.set( { inProgress: false } ); // Статус опроса (true = идёт, false = не начат/прерван)
        // Инициализируем исходную коллекцию параметров для провайдеров (плагинов)
        await chrome.storage.local.set( await (await fetch( `.\\providers\\providers.json` )).json() );
        // Загружаем исходные параметры опроса
        await chrome.storage.local.set( await (await fetch( `.\\options\\options.json` )).json() );
        // Инициализируем структуру параметров номеров для опроса (пустая, загружаем отдельно или формируем в интерфейсе)
        await chrome.storage.local.set( { accounts: [] } );
        // Инициализируем таймер ежедневного опроса
        await activateTimer();
        // Создаём исходные структуры indexedDB
        let dbRequest = indexedDB.open( 'BalanceHistory', dbVersion );
        dbRequest.onerror = function( evnt ) {
        //        -------
          console.log( `[MB] ${evnt.target.error}` );
        }
        dbRequest.onupgradeneeded = function( evnt ) {
        //        ---------------
          dbMB = evnt.target.result;
          if ( !dbMB.objectStoreNames.contains( 'Phones' ) ) {    // Если хранилища 'Phones' не было - создаём его
            dbObjStorMB = dbMB.createObjectStore( 'Phones',
                                                  { keyPath: 'QueryDateTime', autoIncrement: false } );
          }
          else {                                                  // Если хранилище 'Phones' было - открываем его
            dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
            dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
          }
          if (!dbObjStorMB.indexNames.contains( 'PhoneNumber' ) ) // Если индекса 'PhoneNumber' не было - создаём его
            dbObjStorMB.createIndex( 'PhoneNumber', 'PhoneNumber', { unique: false } );
          console.log( `[MB] IndexedDB '${dbMB.name}' created / upgraded` );
        }
      }
      catch( err ) { console.log( `[MB] ${err}` ); }
      break;
    }
    case 'update': {
      try {
        console.log( `[MB] Extention updated from version '${details.previousVersion}' ` +
                     `to version '${chrome.runtime.getManifest().version}'`);
        // Замещаем коллекцию провайдеров (плагинов) и их параметры на полученные в обновлении
        let providerNew = (await (await fetch( `.\\providers\\providers.json` )).json()).provider;
        let providerSet = (await chrome.storage.local.get( 'provider' )).provider;
        providerSet.forEach( function ( item, index ) {
          if ( ( item.custom ) &&                               // Если в текущем наборе провайдеров есть добавленные пользователем...
               ( providerNew.findIndex( function( pItem ) {
                 return ( item.name === pItem.name ) } ) < 0 )  // ...и провайдеров с таким именем нет в составе обновлённой коллекции...
             ) providerNew.push( item );                        // ...то такие пользовательские записи оставляем
        });
        await chrome.storage.local.set( { provider: providerNew } );
        // Реинициализируем таймер ежедневного опроса, если он используется
        await activateTimer();
        // Следующий код нужен только для перехода на версию v1.0.11, в которой в структуру записи хранилища IndexedDB 'Phones'
        // добавлено поле 'Warning'. Нужно добавить его со значением 0 во все существующие записи
/* // -------
        let dbRequest = indexedDB.open( 'BalanceHistory', dbVersion );
        dbRequest.onerror = function( evnt ) { console.log( `[MB] ${evnt.target.error}` ); }
        dbRequest.onupgradeneeded = function( evnt ) { console.log( `[MB] IndexedDB '${evnt.target.result.name}' upgrade needed` ); }
        dbRequest.onsuccess = function( evnt ) {
          dbMB = evnt.target.result;
          dbTrnsMB = dbMB.transaction( [ 'Phones' ], 'readwrite' );
          dbObjStorMB = dbTrnsMB.objectStore( 'Phones' );
          dbObjStorMB.onerror = function( evnt ) { console.log( `[MB] ${evnt.target.error}` );  }
          let recCount = 0;
          console.log( `[MB] Adding key 'Warning' with value=0 to all records of storage '${dbObjStorMB.name}' in IndexedDB...` );
          dbCrsrMB = dbObjStorMB.openCursor( IDBKeyRange.lowerBound(0), 'next' );
          dbCrsrMB.onerror = function( evnt ) { console.log( `[MB] ${evnt.target.error}` ); }
          dbCrsrMB.onsuccess = function( evnt ) {
            let dbRec = evnt.target.result;
            if ( dbRec ) {
              if ( dbRec.value.Warning === undefined ) { // Если поля 'Warning' в записи ещё нет, то добавляеем его
                dbRec.value.Warning = 0;                      // Добавляем в структуру записи поле 'Warning' со значением 0
                let result = dbObjStorMB.put( dbRec.value );  // Обновляем запись в хранилище IndexedDB 'Phones'
                result.onerror =  function( evnt ) { console.log( `[MB] ${evnt.target.error}` ); }
                ++recCount;
              }
              dbRec.continue();                               // Переходим к следующей записи
            }
            else { // Все записи в хранилище обработаны
              dbTrnsMB.commit(); // Закрываем транзакцию, сохраняем результаты из кэша в хранилище
              console.log( `[MB] Records updated: ${recCount}` );
            }
          }
        }
// ------- */
      }
      catch( err ) { console.log( `[MB] ${err}` ); }
      break;
    }                         // Edge, Safari - only supports 'install' and 'update'.
    case 'chrome_update':     // Chrome, Yandex, Opera
    case 'browser_update': {  // Firefox, Chromium (?)
      // Реинициализируем таймер ежедневного опроса, если он используется
      await activateTimer();
      break;
    }
  } /* switch */
});


// Инициализация таймера ежедневного опроса при запуске браузера
chrome.runtime.onStartup.addListener( async ( evnt ) => {
  console.log( `[MB] Exeption 'runtime.onStartup' fired` );
  await activateTimer();
});


// Чтение значения единичного параметра из local storage
function getParamFromStorage( param ) {
//       ----------------------------
  let fromStorage = new Promise( (resolve, reject) => {
    chrome.storage.local.get( param, (result) => {
      if (Object.entries( result ).length > 0) {
         resolve(Object.values( result )[ 0 ])
      }
      else
        resolve( undefined );
    })
  });
  return fromStorage;
}


// Инициализация таймера ежедневного опроса
async function activateTimer( daylyMntn = '', mntnTime = '' ) {
//             ----------------------------------------------
  let daylyMaintain =
      ( daylyMntn === '' ) ? await getParamFromStorage( 'daylyMaintain' ) : daylyMntn;
  // Если параметр ежедневного выполнения опроса установлен, то запускаем таймер
  if ( daylyMaintain === true ) {
    let daylyMaintainTime =
        ( mntnTime === '' ) ? await getParamFromStorage( 'daylyMaintainTime' ) : mntnTime;
    let alarmTime = new Date().setHours( Number(daylyMaintainTime.slice(0, 2)), // Вычисляем дату-время для таймера
                                         Number(daylyMaintainTime.slice(3, 5)), 0, 0 );
    if ( alarmTime < Date.now() )  // Если заданное время в текущей дате уже прошло, то устанавливаем таймер на
      alarmTime += 86400000;       // заданное время в следующей дате (+ сутки = 86400000 = 1000 * 60 * 60 * 24)
    await chrome.alarms.create( 'poolingTimer', { periodInMinutes: 1440, when: alarmTime } );
    console.log( `[MB] Pooling timer set up on '${new Date(alarmTime)}'` );
  }
  else { // Ежедневное выполнение опроса отключено, снимаем таймер (если он был)
    await chrome.alarms.clear( 'poolingTimer' );
    console.log( `[MB] Pooling timer cleared` );
  }
}


// При срабатывании таймера опроса по расписанию запустить процесс опроса
chrome.alarms.onAlarm.addListener( async (alarm) => {
//                    ------------
  chrome.runtime.onMessage.dispatch( { 'message': 'MB_startPooling', init: 'byTimer' }, { tab: null, id: self.location.origin }, null );
});


// Основной цикл работы по сообщениям
chrome.runtime.onMessage.addListener(
  async function( request, sender, sendResponse ) {
    console.log( `[MB] Message in Service Worker: "${request.message}"` );
    switch ( request.message ) {
      case 'MB_poolingTimerReset': { // Устанавливаем обновлённые значения таймера запуска опроса по расписанию
        if ( sendResponse ) sendResponse( 'done' ); // Ответ окну результатов опроса для поддержания канала связи
        activateTimer( request.daylyMntn, request.mntnTime );
        break; }
      case 'MB_showNotification': {  // Показать уведомление (оповещение)
        if ( sendResponse ) sendResponse( 'done' ); // Ответ окну результатов опроса для поддержания канала связи
        await self.registration.showNotification( request.title, request.options );
        break; }
      case 'MB_startPooling': {      // Запустить опрос в новом окне
        if ( sendResponse ) sendResponse( 'done' );  // Ответ в popup для завершения им требуемых действий
        if ( !await getParamFromStorage( 'inProgress' ) ) {
          try { // Открываем в новом окне страницу для проведения опроса и передаём ей параметром тип опроса
            let cycleOrder, workWin, workTab;
            getParamFromStorage( 'cycleOrder' )                      // Выясняем порядок опроса
            .then( function( result ) {                              // Открываем новое окно для выполнения опроса
              cycleOrder = result;
              // По кнопке из popup открываем окно активным в нормальном режиме, по таймеру - минимизированным
              let createData = { type: 'normal' };
              switch ( request.init ) {
                case 'fromPopUp': { createData.state = 'normal';    createData.focused = true; 
                  break; }
                case 'byTimer':   { createData.state = 'minimized'; createData.focused = false;
                  break; }
              };
              chrome.windows.create( createData )
              .then( function( result ) {
                workWin = result;
                // Некоторые браузеры отказываются создавать минимизированное окно, пробуем установить нужный статус иначе
                chrome.windows.update( workWin.id, { state: createData.state } )
                .then( function() {                                  // Сохраняем id окна опроса и id рабочей вкладки опроса
                  chrome.storage.local.set( { workWin: workWin.id, workTab: workWin.tabs[ 0 ].id } )
                  .then( function() {                                // Устанавливаем статус опроса - он запущен
                    chrome.storage.local.set( { inProgress: true } )
                    .then( function() {                              // Открываем в окне страницу опроса
                      chrome.tabs.update( workWin.tabs[ 0 ].id,
                                          { url: chrome.runtime.getURL( `content/poolingCycle.html?co=${cycleOrder}` ) } )
                      .then( function() {
                        // Актуализируем (если окна открыты) доступность кнопок запуска опроса в popup-окне и
                        //   восстановления исходных значений расширения в окне options
                        chrome.runtime.sendMessage( { message: 'MB_actualizeControls' } ) // Если открытых окон нет,
                        .catch( function() {} ); // то нет и кода обработки приёма сообщений - снимаем ошибку канала связи
                        // Выдаём оповещение о начале опроса
                        console.log( `[MB] Polling started in ${cycleOrder} order` );
                        getParamFromStorage( 'notificationsEnable' ) // Если разрешены уведомления вообще
                        .then( function( result ) {                  // и уведомления о начале опроса, в частности,
                          if ( result )                              // то выдаём уведомление
                            getParamFromStorage( 'notificationsOnProcess' )
                            .then( function( result ) {
                              if ( result ) {
                                let d = new Date();
                                let timeStr =
                                    `${(d.getHours() < 10) ? '0' + String(d.getHours()) : String(d.getHours())}:` +
                                    `${(d.getMinutes() < 10) ? '0' + String(d.getMinutes()) : String(d.getMinutes())}:` +
                                    `${(d.getSeconds() < 10) ? '0' + String(d.getSeconds()) : String(d.getSeconds())} - ` +
                                    `${(d.getDate() < 10) ? '0' + String(d.getDate()) : String(d.getDate())}.` +
                                    `${(d.getMonth() < 9) ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                                    `${String(d.getFullYear())}`;
                                self.registration.showNotification( 'Опрос начат', { body: timeStr, dir: 'ltr',
                                                                                     requireInteraction: false,
                                                                                     badge: '/images/MB.png',
                                                                                     icon:  '/images/MB.png' } );
                              }
                            })
                        })
                      })
                    })
                  })
                })
              })
            });
          }
          catch( err ) {
            console.log( `[MB] ${err}` );
          }
        }
        break; }
    } /* switch */
    return true;
  }
);


// Контроль и закрытие окна результатов опроса
chrome.tabs.onRemoved.addListener(
  async function( tabId, removeInfo ) {
    let workWin = await getParamFromStorage( 'workWin' );
    let workTab = await getParamFromStorage( 'workTab' );
    if ( workTab === tabId ) { // Рабочая вкладка окна опроса была закрыта
      // Выдаём оповещение о завершении опроса
      let d = new Date();
      let timeStr = `${(d.getHours() < 10)   ? '0' + String(d.getHours())     : String(d.getHours())}:` +
                    `${(d.getMinutes() < 10) ? '0' + String(d.getMinutes())   : String(d.getMinutes())}:` +
                    `${(d.getSeconds() < 10) ? '0' + String(d.getSeconds())   : String(d.getSeconds())} - ` +
                    `${(d.getDate() < 10)    ? '0' + String(d.getDate())      : String(d.getDate())}.` +
                    `${(d.getMonth() < 9)    ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                    `${String(d.getFullYear())}`;
      let options = { dir: 'ltr', requireInteraction: false, badge: '/images/MB.png' };
      if ( await getParamFromStorage( 'inProgress' ) ) { // Если статус опроса не был сброшен, то опроса был завершён некорректно
        console.log( `[MB] Pooling window closed by user before pooling was completed (or browser failed)` );
        if ( await getParamFromStorage( 'notificationsEnable' ) &&
             await getParamFromStorage( 'notificationsOnProcess' ) ) {
          options.body = 'Окно опроса было закрыто до его завершения\n' + timeStr;
          options.icon = '/images/Alarm.png';
          self.registration.showNotification( 'Опрос прекращён', options );
        }
      }
      else {
        console.log( `[MB] Pooling window closed, pooling prosess completed` );
        if ( await getParamFromStorage( 'notificationsEnable' ) &&
             await getParamFromStorage( 'notificationsOnProcess' ) ) {
          options.body = 'Опрос завершён, окно опроса закрыто\n' + timeStr;
          options.icon = '/images/MB.png';
          self.registration.showNotification( 'Опрос завершён', options );
        }
      };
      // Если закрытие рабочей вкладки опроса выполнено скриптом или пользователем, то она считается закрытой
      //   не по причине закрытия содержащего её окна. Если это окно всё ещё открыто, то закрываем его
      if ( !removeInfo.isWindowClosing ) {          // Если рабочая вкладка закрыта не из-за закрытии её окна...
        chrome.windows.get( removeInfo.windowId )
        .then( async function( Wnd ) {
          if ( workWin === Wnd.id )                 // ...и окно всё ещё открыто...
            await chrome.windows.remove( workWin ); // ...то закрываем его
        })
        .catch( function() {} ); // Окна результатов опроса (с ID = workWin) нет, действий не требуется
      }
      await chrome.storage.local.remove( 'workTab' ); // Удаляем запись об ID рабочей вкладки окна результатов опроса
      await chrome.storage.local.remove( 'workWin' ); // Удаляем запись об ID окна результатов опроса
      await chrome.storage.local.set( { inProgress: false } ); // Сбрасываем статус опроса - он не идёт
      // Актуализируем (если окна открыты) доступность кнопок запуска опроса в popup-окне и
      //   восстановления исходных значений расширения в окне options
      chrome.runtime.sendMessage( { message: 'MB_actualizeControls' } ) // Если открытых окон нет,
      .catch( function() {} ); // то нет и кода обработки приёма сообщений - снимаем ошибку канала связи
    }
    return true;
  }
);
