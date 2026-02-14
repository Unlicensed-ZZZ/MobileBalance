/* VTBMobile_API.js
 * ----------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для 'ВТБ Мобайл' через API
 * Редакция:  2026.01.29
*/

let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;

chrome.runtime.onMessage.addListener( async function ( request, sender, sendResponse ) {
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      switch ( request.action ) {
        case 'log&pass': {
          if ( !window.location.pathname.includes( 'authorization') ) {   // Если мы находимся не на странице авторизации, то ...
            if ( window.location.pathname.includes( 'personal' ) ) {      // ... не был выполнен выход по предыдущим учётным данным
              let prevAccount = '';
              try {
                prevAccount = await ( await fetch( window.location.origin + '/api/v1/personal/subscriber-status/',
                                                   { method: 'GET', mode: 'cors', credentials: 'include',
                                                     headers: { Accept: 'application/json', 'Content-Type':'application/json' }
                                                   }) ).json();
              }
              catch( err ) {
                fetchError( `Fetch error getting '/api/v1/personal/subscriber-status/': ${err.toString()}` );
                initLogout(); // Инициируем завершение сеанса работы с личным кабинетом
                return;
              }
              prevAccount = prevAccount.username.slice( 1 );
              // Если авторизация выполнена с учётными данными, по которым проводится запрос, то проводим его. Обновляем страницу
              // для запуска расширением следующего этапа работы плагина. Данный экземпляр скрипта будет утрачен
              if ( prevAccount === request.login )
                window.location.reload()
              else { // Инициируем завершение сеанса работы с личным кабинетом
                fetchError( `Рrevious session for '${prevAccount}' was not closed. Closing it now...` );
                initLogout();
              }
            }
            else {                                                        // ... или ошибки навигации / сервер не отвечает
              fetchError( `Page-landing error or server not responding` );
              initLogout(); // Инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
            }
          }
          else {
            authInput( request.login, request.passw );
          }
          break;
        }
        case 'polling': {
          setTimeout( function() {    // Задержка, чтобы виджеты успели прогрузиться и не забивали на сервере
            getData( request.login ); //   очередь своими запросами - в неё пойдут и запросы от скрипта
          }, 200);
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


function fetchError( err ) {
//       ----------
  requestStatus = false;
  console.log( `[MB] ${requestError = err}` );
}


function authInput( login, passw ) {
//       ---------
  fetch( window.location.origin + '/api/v1/api-token-auth/', { method: 'POST', mode: 'cors', credentials: 'include',
         body: JSON.stringify( { username: '7' + login, password: passw } ), headers: { 'Content-Type': 'application/json' }
  })
  .then( function( response ) {
    response.json()
    .then( function( response ) {
      if ( response.error !== undefined ) {   // Есть ошибки авторизации, выходим
        fetchError( `Authorization error: ${response.error}` );
        initLogout(); // Инициируем завершение сеанса работы с личным кабинетом
      }
      else  // Авторизация выполнена, при обновлении страницы сервер откроет страницу личного кабинета, а
            // расширение запустит следующий этап работы плагина. Данный экземпляр скрипта будет утрачен
        window.location.replace( window.location.origin + '/personal/' );
    })
    .catch( function( err ) {
      fetchError( `Error getting JSON for '/api/v1/api-token-auth/': ${err.message}` );
      initLogout(); // Инициируем завершение сеанса работы с личным кабинетом
    })
  })
  .catch( function( err ) {
    fetchError( `Authtorization error: ${err.message}` );
    initLogout(); // Инициируем завершение сеанса работы с личным кабинетом
  })
}


function initLogout() {
//       ----------
  fetch( window.location.origin + '/api/v1/personal/logout/', { method: 'GET', mode: 'cors', credentials: 'include',
         headers: { 'Content-Type': 'application/json' }
  })
  .then( function( response ) {
      // Передаём результаты опроса расширению MobileBalance
      chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                   status: requestStatus, error: requestError,
                                                   data: (MBResult === undefined) ? undefined : MBResult }, null );
      // Завершение сеанса работы с личным кабинетом и обновление страницы выполнит расширение переходом по 'finishUrl'
  })
  .catch( function( err ) {
    fetchError( `Logout error: ${err.message}` );
    initLogout(); // Инициируем завершение сеанса работы с личным кабинетом
  })
}


async function getData( login ) {
//             ----------------
  let freeCounter = 0, paidCounter = 0, paidAmmount = 0;
  let subscriberExt_key = 0;
  fetch( window.location.origin + '/api/v1/personal/subscriber-status/', { method: 'GET', mode: 'cors', credentials: 'include',
         headers: { 'Content-Type': 'application/json' }
  })
  .then( function( response ) {
    response.json()
    .then( function( response ) {
      console.log( `[MB] Response for '/api/v1/personal/subscriber-status/' API: ${JSON.stringify( response )}` );
      // Получаем ФИО владельца
      let tmp = '';
      tmp = ( ( response.firstName === undefined )  ? '' : response.firstName ) + 
            ( ( response.middleName === undefined ) ? '' : ` ${response.middleName}` ) + 
            ( ( response.lastName === undefined )   ? '' : ` ${response.lastName}` );
      if ( tmp !== '' )
        MBResult = { UserName: tmp };                     // Создаём 1-ое значение объекта ответа
      // Получаем статус блокировки
      if ( response.profile_info !== undefined ) {
        MBResult.BlockStatus = ( response.profile_info.status.toUpperCase() !== 'ACTIVE' ) ? 'Blocked' : '';
        // Получаем название тарифа и его идентификатор (для дальнейших запросов)
        if ( response.profile_info.active_product_info !== undefined )
          subscriberExt_key = response.profile_info.active_product_info.ext_key;
      }

      fetch( window.location.origin + '/api/v1/personal/subscription-details/', { method: 'GET', mode: 'cors', credentials: 'include',
             headers: { 'Content-Type': 'application/json' }
      })
      .then( function( response ) {
        response.json()
        .then( function( response ) {
          console.log( `[MB] Response for '/api/v1/personal/subscription-details/' API: ${JSON.stringify( response )}` );
          // Получаем полный баланс (основной + бонусный)
          MBResult.Balance = response.total;
          // Получаем бонусный баланс
          if ( parseFloat( response.bonus_wallet.value ) !== 0 )
            MBResult.Balance2 = parseFloat( response.bonus_wallet.value );
          // Получаем остатки
          response.items.forEach( function ( item ) {
            switch ( item.unitType.toUpperCase() ) {
              case 'ТБ': {  // Остатки пакета интернет. Исходное значение для расширения - мегабайты. Приводим значение, множитель = 1048576 = 1024 * 1024
//                if ( item.unlimited )  MBResult.Internet = -1               // Если опция безлимитная, то возвращаем значение -1
                MBResult.Internet = parseFloat( ( parseFloat( item.liveAmount.replaceAll( ',', '.' ) ) * 1048576 ).toFixed(3) );
                break; }
              case 'ГБ': {  // Остатки пакета интернет. Исходное значение для расширения - мегабайты. Приводим значение, множитель = 1024
//                if ( item.unlimited )  MBResult.Internet = -1               // Если опция безлимитная, то возвращаем значение -1
                MBResult.Internet = parseFloat( ( parseFloat( item.liveAmount.replaceAll( ',', '.' ) ) * 1024 ).toFixed(3) );
                break; }
              case 'МБ': {  // Остатки пакета интернет. Исходное значение для расширения - мегабайты, оставляем значение
//                if ( item.unlimited )  MBResult.Internet = -1               // Если опция безлимитная, то возвращаем значение -1
                MBResult.Internet = parseFloat( ( parseFloat( item.liveAmount.replaceAll( ',', '.' ) ) ).toFixed(3) );
                break; }
              case 'МИН': { // Остатки пакета минут
//                if ( item.unlimited )  MBResult.Internet = -1               // Если опция безлимитная, то возвращаем значение -1
                MBResult.Minutes = parseInt( item.liveAmount );
                break; }
              case 'SMS': { // Остатки пакета SMS
//                if ( item.unlimited )  MBResult.Internet = -1               // Если опция безлимитная, то возвращаем значение -1
                MBResult.SMS = parseInt( item.liveAmount );
                break; }
            }
          })
          fetch( window.location.origin + '/api/v1/personal/get-next-purchase-date/', { method: 'GET', mode: 'cors', credentials: 'include',
                 headers: { 'Content-Type': 'application/json' }
          })
          .then( function( response ) {
            response.json()
            .then( function( response ) {
              console.log( `[MB] Response for '/api/v1/personal/get-next-purchase-date/' API: ${JSON.stringify( response )}` );
              // Получаем стоимость тарифа и дату следующего платежа в формате 'DD.MM.YYYY'
              if ( response.monthlyPrice !== undefined )
                paidAmmount = paidAmmount + parseFloat( response.monthlyPrice.replaceAll( ',', '.' ) );
              if ( ( response.nextPurchaseDate !== undefined ) && ( response.nextPurchaseDate !== null ) ) {
                tmp = response.nextPurchaseDate.split( 'T' )[ 0 ].split( '-' );
                MBResult.TurnOffStr = `${tmp[ 2 ]}.${tmp[ 1 ]}.${tmp[ 0 ]}`;
              }

              fetch( window.location.origin + `/api/v1/lists/get-product-by-ext-key/?ext_key=${subscriberExt_key}`,
                     { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'Content-Type': 'application/json' }
              })
              .then( function( response ) {
                response.json()
                .then( function( response ) {
                  console.log( `[MB] Response for '/api/v1/lists/get-product-by-ext-key/?ext_key=${subscriberExt_key}' API: ${JSON.stringify( response )}` );
                  // Получаем название тарифа
                  if ( response.name !== undefined )
                    MBResult.TarifPlan = response.name;
                  // Получаем количество сервисов, включённых в тариф. В рамках стоимости тарифа считаем их бесплатными
                  if ( response.options !== undefined )
                    freeCounter = response.options.length;
                  // В тестируемом тарифе дополнительные сервисы, которые бы можно было рассматривать как платные, не подключены
                  // Ждём тариф, у которого они будут подключены. Выясним структуру ответа по ним и выведем в строке услуг
                  // paidCounter = ???
                  // Формируем строку услуг
                  MBResult.UslugiOn = `${freeCounter} / ??? (${paidAmmount.toFixed(2)})`;


                  initLogout();

                })
                .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
                  fetchError( `Error getting JSON for '/api/v1/lists/get-product-by-ext-key/?ext_key=${subscriberExt_key}': ${err.message}` );
                  initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
                })
              })
            })
            .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
              fetchError( `Error getting JSON for '/api/v1/lists/get-product-by-ext-key/?ext_key=${subscriberExt_key}': ${err.message}` );
              initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
            })
          })
          .catch( function( err ) {  // Если были ошибки в ходе получения запроса,
            fetchError( `Error getting JSON for '/api/v1/personal/get-next-purchase-date/': ${err.message}` );
            initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
          })
        })
        .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
          fetchError( `Error getting JSON for '/api/v1/personal/subscription-details/': ${err.message}` );
          initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
        })
      })
      .catch( function( err ) {  // Если были ошибки в ходе получения запроса,
        fetchError( `Error getting JSON for '/api/v1/personal/subscription-details/': ${err.message}` );
        initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
      })
    })
    .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
      fetchError( `Error getting JSON for '/api/v1/personal/subscriber-status/': ${err.message}` );
      initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
    })
  })
  .catch( function( err ) {  // Если были ошибки в ходе получения запроса,
    fetchError( `Error getting JSON for '/api/v1/personal/subscriber-status/': ${err.message}` );
    initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
  })
}
