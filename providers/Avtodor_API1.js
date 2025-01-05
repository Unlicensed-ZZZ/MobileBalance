/* Avtodor_API.js
 * --------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для 'Автодор' через API
 * Редакция:  2023.04.19
*/

let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;

chrome.runtime.onMessage.addListener( ( request, sender, sendResponse ) => {
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      switch ( request.action ) {
        case 'log&pass': {
          if ( window.location.origin !== 'https://auth-lkmp.avtodor-tr.ru' ) { // Если мы находимся не на странице входа, значит
            // либо не был выполнен выход по предыдущим учётным данным и мы попали в личный кабинет по ним, либо ошибки на сервере
            requestStatus = false;
            requestError = 'Previous session was not finished or login page error';
            console.log( '[MB]' + requestError );
            initLogout(); // Инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
          }
          else {
            authInput( request.login, request.passw );
          }
          break;
        }
        case 'polling': {
          setTimeout( function() {    // Задержка, чтобы виджеты успели прогрузиться и не забивали на сервере
            getData( request.login ); //   очередь своими запросами - в неё пойдут и запросы от скрипта
          }, 2000);
          break;
        }
      }
    }
    else return;
  }
  catch( err ) {
    console.log( err.toString() );
    return;
  }
})

function authInput( login, passw ) {
//       ---------
  // Выделяем фрагмент страницы с описанием формы ввода учётных данных
  let resp = document.getElementsByTagName( 'form' );
  // В ней параметр 'action' содержит url с токенами, сгенерированными для сессии. Забираем его
  let fetchUrl = resp[ 'kc-form-login' ].action;
  // Отсылаем серверу форму по ссылке из 'action' с токенами, дополняя её значениями учётных данных (логин / пароль)
  fetch( fetchUrl, { method: 'POST', mode: 'no-cors', body: 'username=' + login + '&password=' + passw,
                     headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  .then( function( response ) { // Авторизация выполнена, при обновлении страницы сервер откроет страницу личного кабинета
    // Обновляем страницу. Этого ждёт расширение для запуска следующего этапа работы плагина. Данный экземпляр скрипта при этом будет утрачен
    window.location.reload();
  })
  .catch( function( err ) { fetchError( '[MB] Error fetching Login form: ' + err.message ) });
}


function initLogout() {
//       ----------
  // Инициируем завершение сеанса работы с личным кабинетом...
  fetch( 'https://lk.avtodor-tr.ru/sso/logout', { method: 'GET', mode: 'no-cors' } )
  .then( function( result ) {
    // Передаём результаты опроса расширению MobileBalance
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
    // Переход на страницу входа выполнит расширение переходом по 'finishUrl' = 'https://avtodor-tr.ru/account/login' 
  })
  .catch( function() {} );
}


async function getData( login ) {
//             ----------------
  fetch( 'https://lk.avtodor-tr.ru/api/client/extended', { method: 'GET', mode: 'no-cors' } )
  .then( function( response ) { // Забираем данные о текущем пользователе
    response.json()
    .then( function ( response ) {
    // Создаём объект с 1-ым значением...
      // Значение текущего баланса
      MBResult = { Balance: parseFloat( response.contracts[ 0 ].account_balance.toFixed(2) ) };
    // ...а потом в него добавляем дополнительные свойства
      // Бонусные баллы (если они предполагаются текущими условиями подключения)
      if ( response.contracts[ 0 ].loyalty_member_balance !== undefined )
        MBResult.Balance2 = parseFloat( response.contracts[ 0 ].loyalty_member_balance.toFixed(2) );
      // ФИО владельца
      MBResult.UserName = response.client.name;
      // Номер лицевого счёта
      MBResult.LicSchet = JSON.stringify( response.client.id ).replaceAll( '\"', '' ); // Опреации приведения к строке - из-за её изменения в
      // структуре ответа (с 02.10.2022). Была строка - стало число. На случай, если опять вернут строку, проставим удаление символов-ограничителей
      // двойные кавычки, которые тогда появятся в результате приведения

      // Для последующего запроса понадобится id основного Договора
      let main_contract_id = response.client.main_contract_id;
      fetch( `https://lk.avtodor-tr.ru/api/devices?contract_id=${main_contract_id}&all=true`, { method: 'GET', mode: 'no-cors' } )
      .then( function( response ) {
        response.json()
        .then( function ( response ) {
          // В справочнике значений кодов 'device_statuses' по API 'https://lk.avtodor-tr.ru/api/public/dictionaries/all?0=api_responses' записи следующие:
          //   id=1, name=Затребован; id=2, name=Произведен, id=3, name=Действителен; id=4, name=В оранжевом списке; id=5, name=Временно заблокирован;
          //   id=6, name=Удален; id=7, name=Прекращен
          // Рассматриваем все состояния кроме 'Действителен', как недоступность транспондера. Присваиваем по ним статус блокировки
          // Получаем статус первого (если их больше одного) транспондера в списке устройств
          MBResult.BlockStatus = ( Number(response.devices[ 0 ].device_status_id) === 3 ) ? '' : 'Blocked';

          initLogout(); // Инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
        })
        .catch( function( err ) { // Если получения и разбора ответа были ошибки,
          requestStatus = false;
          requestError = `[MB] Error getting JSON for '/api/devices?': ${err}`;
          console.log( requestError );
          initLogout();           //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
        }) /* .then response.json() */
      })
      .catch( function( err ) { // Если были ошибки в ходе получения запроса,
        requestStatus = false;
        requestError = `[MB] Fetch error getting '/api/devices?': ${err}`;
        console.log( requestError );
        initLogout();          //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
      }) /* /api/devices? */
    })
    .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
      requestStatus = false;
      requestError = `[MB] Error getting JSON for '/api/client/extended': ${err}`;
      console.log( requestError );
      initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
    }) /* .then response.json() */
  })
  .catch( function( err ) {  // Если были ошибки в ходе получения запроса,
    requestStatus = false;
    requestError = `[MB] Fetch error getting '/api/client/extended': ${err}`;
    console.log( requestError );
    initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
  }) /* /api/client/extended */
}
