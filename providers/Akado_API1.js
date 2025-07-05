/* Akado_API.js
 * ------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для 'АКАДО Телеком' через API
 * Редакция:  2025.06.17
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
          if ( window.location.href === 'https://office.akado.ru/' ) { // Если мы находимся не на странице входа, значит
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
          }, 500);
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
  // Создаём форму, заполненную значениями учётных данных (логин / пароль)
  frmData = new FormData();
  frmData.append( 'login', login );
  frmData.append( 'password', passw );
  // Отсылаем серверу форму
  fetch( window.location.origin + '/user/login.xml', { method: 'POST', mode: 'cors', body: frmData })
  .then( function( response ) { // Авторизация выполнена, при обновлении страницы сервер откроет страницу личного кабинета
    // Обновляем страницу. Этого ждёт расширение для запуска следующего этапа работы плагина. Данный экземпляр скрипта при этом будет утрачен
    window.location.replace( window.location.origin );
  })
  .catch( function( err ) {
      requestStatus = false;
      requestError = 'Error fetching Login form: ' + err.message;
      console.log( '[MB]' + requestError );
      initLogout();
    });
}


function initLogout() {
//       ----------
  // Передаём результаты опроса расширению MobileBalance
  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                               status: requestStatus, error: requestError,
                                               data: (MBResult === undefined) ? undefined : MBResult }, null );
  // Завершение сеанса работы с личным кабинетом выполнит расширение переходом по 'finishUrl' = 'https://office.akado.ru/user/logout.xml' 
}


async function getData( login ) {
//             ----------------
  // Берём идентификатор запроса из значения 'id', находящегося в теге 'html' сгенерированной страницы личного кабинета
  let requestId = document.getElementsByTagName( 'html' )[ 0 ].id;
  fetch( window.location.origin + `/user/profile-status.xml?serviceRequest=${requestId}`, { method: 'GET', mode: 'no-cors' })
  .then( function( response ) { // Забираем данные о текущем пользователе
    response.text()
    .then( function ( response ) {
    // Ответ приходит в XML. Находим в нём набор нужных данных и формируем из них массив
      let jsonResponse = response.split( '<account ' )[ 1 ].split( '>\n' )[ 0 ].split( ' ');
      // Забираем значение баланса
      for ( let i = 0; i < jsonResponse.length; ++i ) {
        if ( jsonResponse[ i ].includes( 'balance' ) ) {
          MBResult = { Balance: parseFloat( jsonResponse[ i ].split( '"' )[ 1 ] ) };
          break; // Нужное значение нашли, цикл прекращаем
        }
      }
      // Формируем и забираем ФИО владельца
      let nameStr = '';
      for ( let i = 0; i < jsonResponse.length; ++i ) {
        if ( jsonResponse[ i ].includes( 'surname' ) ) {
          nameStr += jsonResponse[ i ].split( '"' )[ 1 ] + ' ';
          continue;
        }
        if ( jsonResponse[ i ].includes( 'name' ) ) {
          nameStr += jsonResponse[ i ].split( '"' )[ 1 ] + ' ';
          continue;
        }
        if ( jsonResponse[ i ].includes( 'patronymic' ) ) {
          nameStr += jsonResponse[ i ].split( '"' )[ 1 ];
          continue;
        }
      }
      if ( nameStr !== '' )
        MBResult.UserName = nameStr;

      // Забираем номер лицевого счёта
      for ( let i = 0; i < jsonResponse.length; ++i ) {
        if ( jsonResponse[ i ].includes( 'crc' ) ) {
          MBResult.LicSchet = jsonResponse[ i ].split( '"' )[ 1 ];
          break; // Нужное значение нашли, цикл прекращаем
        }
      }

      // Забираем дату завершения оплаченного периода
      fetch( window.location.origin + `/information/infoblock.xml?requestID=${requestId}`, { method: 'GET', mode: 'no-cors' })
      .then( function( response ) { // Забираем данные инфоблока
        response.text()
        .then( function ( response ) {
        // Ответ приходит в XML. Выделяем в нём нужное значение
          MBResult.TurnOffStr = response.split( 'date-to-block amount="' )[ 1 ].split( '"/>\n' )[ 0 ];

          initLogout(); // Инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы

        })
        .catch( function( err ) { // Если получения и разбора ответа были ошибки,
          requestStatus = false;
          requestError = `[MB] Error getting XML for '/information/infoblock.xml?': ${err}`;
          console.log( requestError );
          initLogout();           //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
        }) // .then response.text() //
      })
      .catch( function( err ) { // Если были ошибки в ходе получения запроса,
        requestStatus = false;
        requestError = `[MB] Fetch error getting '/information/infoblock.xml?': ${err}`;
        console.log( requestError );
        initLogout();          //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
      }) // /information/infoblock.xml //
    })
    .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
      requestStatus = false;
      requestError = `[MB] Error getting XML for '/user/profile-status.xml?': ${err}`;
      console.log( requestError );
      initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
    }) // .then response.text() //
  })
  .catch( function( err ) {  // Если были ошибки в ходе получения запроса,
    requestStatus = false;
    requestError = `[MB] Fetch error getting '/user/profile-status.xml?': ${err}`;
    console.log( requestError );
    initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
  }) // /user/profile-status //
}
