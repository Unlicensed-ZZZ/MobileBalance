/* BeeLine_v2_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для провайдера BeeLine через обновлённый API
 *            Редакция на основе возможностей API личного кабинета
 * Редакция:  2025.08.07
 *
*/

let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;
let MBcurrentNumber = undefined;  // Индекс позиции учётных данных в списке опроса

chrome.runtime.onMessage.addListener( async function( request, sender, sendResponse ) {
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBcurrentNumber = request.accIdx;
      switch ( request.action ) {
        case 'log&pass': { // Предполагается вход в личный кабинет по URL для ЮЛ: 'https://my.beeline.ru'
          // Ищем форму авторизации - тэг с идентификатором 'loginFormB2B:loginForm'
          let loginForm = document.getElementById( 'loginFormB2B:loginForm' );
          // Если форма авторизации не прогрузилась, то вероятнее всего не завершен предыдущий сеанс работы с личным
          //   кабинетом. Инициируем выход из него и перезагружаем страницу. Это не даст корректно пройти текущему
          //   запросу. Но для следующего запроса страница будет в исходном состоянии и выдаст форму авторизации
          if ( ( loginForm === null ) || ( loginForm.length === 0 ) ) {
            if ( window.location.pathname.includes( 'customers/products' ) ) {  // Для старого и нового (с 26.09.2022) личных кабинетов ...
              let prevAuth = document.getElementsByTagName( 'meta' );           // ... ищем на странице тэг 'meta' с аттрибутом 'name="SSODetectionState"'
              if ( ( prevAuth.SSODetectionState !== undefined ) &&              // Если он есть, значит открыта главная страница или
                   ( prevAuth.SSODetectionState.content === 'Detected' ) ) {    //   страница личного кабинета с активной авторизацией
                // Если авторизация выполнена с учётными данными, по которым проводится запрос, то открываем страницу личного кабинета и проводим его
                if ( (await (await fetch( window.location.origin + '/api/profile/common/settings/', { method: 'GET' } )).json()).selectedLogin === request.login ) {
                  // Переходим на страницу нового личного кабинета. Она должна открыться по учётным данным с которыми мы авторизовались
                  window.location.replace( window.location.origin + '/customers/products/elk/' );
                  return;
                }
              }
            }
            requestStatus = false;    // Подготваливаем для расширения аттрибуты сообщения об ошибке ...
            console.log( requestError = `[MB] Didn't find authtorization form on the page` );
            initLogout();             // ... и завешаем сеанс работы в личном кабинете
          }
          else // Загружена страница авторизаци, на ней присутствует форма ввода учётных данных
            authInput( request.login, request.passw ); // Пробуем выполнить авторизацию
          break;
        }
        case 'polling': {
          // Уточняем, находимся ли мы на странице личного кабинета...
          // URL нового (с 26.09.2022) личного кабинета 'https://moskva.beeline.ru/customers/products/elk/'
          // URL старого личного кабинета               'https://moskva.beeline.ru/customers/products/mobile/profile/'
          // URL ещё более раннего личного кабинета     'https://my.beeline.ru/c/pre/index.xhtml'
          if ( window.location.pathname.includes( 'elk' ) )                     // Открыта страница нового (с 26.09.2022) личного кабинета
            setTimeout( function() { // Задержка, чтобы виджеты успели прогрузиться и не забивали на сервере
              getData();             //   очередь своими запросами - в неё пойдут и запросы плагина
            }, 2000)
          else {
            if ( window.location.pathname.includes( 'c/pre' ) ||                // Открыта страница ещё более раннего личного кабинета
                 window.location.pathname.includes( 'mobile/profile' ) ) {      // Открыта страница старого (до 26.09.2022) личного кабинета
              // Новые запросы в старом личном кабинете работают не всегда корректно, а в ещё более раннем не работают совсем.
              // Пробуем открыть новый (с 26.09.2022) личный кабинет '.../customers/products/elk/'
              console.log( requestError = `[MB] Current personal profile page is not valid for plugin` );
              // Запрашиваем у расширения MobileBalance повтор этого этапа запроса
              chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_repeatCurrentPhase', error: requestError, accIdx: MBcurrentNumber }, null );
              // Переходим на страницу нового личного кабинета. Она должна открыться по учётным данным с которыми мы авторизовались
              window.location.replace( window.location.origin + '/customers/products/elk/' );
            }
            else { // Открылась стартовая страница Beeline (или были ошибки загрузки страницы). Проверяем, есть ли авторизация
              requestError = `[MB] Current page is not personal profile page`;
              if ( window.location.pathname.includes( 'customers/products' ) ) {  // Для старого и нового (с 26.09.2022) личных кабинетов ...
                let prevAuth = document.getElementsByTagName( 'meta' );           // ... ищем на странице тэг 'meta' с аттрибутом 'name="SSODetectionState"'
                if ( ( prevAuth.SSODetectionState !== undefined ) &&              // Если он есть, значит открыта главная страница или
                     ( prevAuth.SSODetectionState.content === 'Detected' ) ) {    //   страница личного кабинета с активной авторизацией
                  // Если авторизация выполнена с учётными данными, по которым проводится запрос, то открываем страницу личного кабинета
                  if ( (await (await fetch( window.location.origin + '/api/profile/common/settings/', { method: 'GET' } )).json()).selectedLogin === request.login ) {
                    // Запрашиваем у расширения MobileBalance повтор этого этапа запроса
                    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_repeatCurrentPhase', error: requestError, accIdx: MBcurrentNumber }, null );
                    // Переходим на страницу нового личного кабинета. Она должна открыться по учётным данным с которыми мы авторизовались
                    window.location.replace( window.location.origin + '/customers/products/elk/' );
                    return;
                  }
                  requestError = `[MB] Active authtorization was not detected`;
                }
              }
              // Если в предыдущем каскаде условий не дошли до 'return', который остановил выполнение, значит есть ошибки при загрузке
              //   страницы или она загружена с авторизацией под другими учётными данными
              requestStatus = false; // Выдаём расширению MobileBalance ошибку и выходим
              console.log( requestError );
              chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus,
                                                           error: requestError, data: undefined }, null );
              return;
            }
          }
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


function sleep( ms ) {
//       -----------
  return new Promise( resolve => setTimeout( resolve, ms ) );
}


async function authInput( login, passw ) {
//             -------------------------
  let loginForm = document.getElementById( 'loginFormB2B:loginForm' );              // На форме авторизации...
  let formInputs = loginForm.getElementsByTagName( 'input' );                       // ...находим все поля ввода...
  formInputs['loginFormB2B:loginForm:login'].value = login;                         // ...вводим значения в поля учётных данных
  formInputs['loginFormB2B:loginForm:passwordPwd'].value = formInputs['loginFormB2B:loginForm:password'].value = passw;
  loginForm.submit();                                                               // ...и отправляем форму на сервер для авторизации
  // В результате должна быть открыта страница личного кабинета и этот экземпляр скрипта будет утрачен
}


function initLogout() {
//       ----------
  // Завершаем текущий сеанс, страницу на следующем шаге перезагрузит расширение
  if ( window.location.pathname.includes( 'customers/products' ) ) { // Выход из старого и нового (с 26.09.2022) личных кабинетов
    // Определяем в меню кнопку пункта выхода из личного кабинета
    let menuItems = Array.from( document.getElementsByTagName( 'button' ) );
    let exitButton = menuItems.find( (item) => { return (item.innerText.toUpperCase() === 'ВЫЙТИ') });
    // Передаём результаты опроса расширению
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
    exitButton.click(); // 'Нажимаем' на кнопку пункта выхода из личного кабинета
  }
  else { // Выход для ещё более раннего личного кабинета ('https://my.beeline.ru/c/pre/index.xhtml')
    // Передаём результаты опроса расширению
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
    window.location.replace( window.location.origin + '/c/logout.xhtml' );
  }
}


async function getData() {
//             ---------
  fetch( window.location.origin + '/apigw/ub/balance/main/', { method: 'GET', credentials: 'include' } )
  .then( function( response ) {
    response.json()
    .then( function( response ) {
      console.log( `[MB] Response for '/apigw/ub/balance/main/' API: ${JSON.stringify( response )}` );
      // Забираем данные текущего баланса
      MBResult = { Balance: parseFloat( response.data.balanceValue.toFixed(2) ) }; // Создаём 1-ое значение объекта ответа
      // Забираем статус блокировки
      MBResult.BlockStatus = ( response.data.isBlocked ) ? 'Blocked' : '';

      fetch( window.location.origin + '/api/uni-profile-mobile/blocks/', { method: 'GET', credentials: 'include' } )
      .then( function( response ) {
        response.json()
        .then( function( response ) {
          console.log( `[MB] Response for '/api/uni-profile-mobile/blocks/' API: ${JSON.stringify( response )}` );
          // Получаем наименование тарифного плана
          MBResult.TarifPlan = response.tariff.name;
          // Получаем остатки пакетов ...
          if ( ( response.accumulators.items !== undefined ) &&
               ( response.accumulators.items.length > 0 ) ) {                                   // ... если они есть
            for ( let i = 0; i < response.accumulators.items.length; ++i ) {
              // Получаем остаток пакета голосовых минут (если предусмотрено тарифом) или обозначаем признак безлимитного пакета (-1)
              if ( [ 'SECONDS', 'MINUTES' ].includes( response.accumulators.items[ i ].unit ) ) {
                if ( response.accumulators.items[ i ].isUnlimited )
                  MBResult.Minutes = -1
                else {
                  MBResult.Minutes = response.accumulators.items[ i ].rest;
                  if ( response.accumulators.items[ i ].unit === 'SECONDS' )
                    MBResult.Minutes = MBResult.Minutes / 60;                                   // Всегда в минутах
                }
              }
              // Получаем остаток пакета SMS (если предусмотрено тарифом) или обозначаем признак безлимитного пакета (-1)
              if ( response.accumulators.items[ i ].unit === 'SMS' )
                MBResult.SMS = ( response.accumulators.items[ i ].isUnlimited ) ? -1 :
                  response.accumulators.items[ i ].rest;
              // Получаем остаток пакета Интернет (если предусмотрено тарифом) или обозначаем признак безлимитного пакета (-1)
              if ( response.accumulators.items[ i ].unit === 'KBYTE' )
                MBResult.Internet = ( response.accumulators.items[ i ].isUnlimited ) ? -1 :
                  parseFloat( ( response.accumulators.items[ i ].rest / 1024 ).toFixed(3) );    // Всегда в мегабайтах
            }
          }

          fetch( window.location.origin + '/api/uni-profile-mobile/tariff-fee/', { method: 'GET', credentials: 'include' } )
          .then( function( response ) {
            response.json()
            .then( function( response ) {
              console.log( `[MB] Response for '/api/uni-profile-mobile/tariff-fee/' API: ${JSON.stringify( response )}` );
              let freeCounter = 0, paidCounter = 0, subscriptionsCount = 0, multiplier = 1,
                  paymentAmount = ( response.rcRate !== undefined ) ? response.rcRate : 0;
              // Получаем / вычисляем месячный платёж по тарифу
              if ( ( paymentAmount > 0 ) && ( response.rcRatePeriodDays !== undefined ) )
                multiplier = ( response.rcRatePeriodDays === 1 ) ? 30 : 1;  // rcRatePeriodDays может быть 1 (="₽/сут"), 30 и 31 (="₽/мес")
              paymentAmount = parseFloat( ( paymentAmount * multiplier ).toFixed(0) );

              fetch( window.location.origin + '/api/uni-profile-mobile/services/', { method: 'GET', credentials: 'include' } )
              .then( function( response ) {
                response.json()
                .then( function( response ) {
                  console.log( `[MB] Response for '/api/uni-profile-mobile/services/' API: ${JSON.stringify( response )}` );
                  // Определяем количество бесплатных и платных услуг
                  for( let i = 0; i < response.length; i++ ) {
                    if ( ( response[ i ].fee !== undefined ) && ( response[ i ].fee > 0 ) ) {
                      ++paidCounter;
                      // Для периода оплаты 'сут' приводим сумму к месячной (за 30 дней), для периода 'мес' не изменяем
                      paymentAmount += response[ i ].fee * ( ( response[ i ].feePeriod === 'сут' ) ? 30 : 1 );
                    }
                    else
                      ++freeCounter;
                  }

                  fetch( window.location.origin + '/api/uni-profile-mobile/subscriptions/', { method: 'GET', credentials: 'include' } )
                  .then( function( response ) {
                    response.json()
                    .then( function( response ) {
                      console.log( `[MB] Response for '/api/uni-profile-mobile/subscriptions/' API: ${JSON.stringify( response )}` );
                      // Определяем количество подписок
                      subscriptionsCount = ( response !== undefined ) ? response.length : 0;
                      // Формируем строку состава услуг в формате: 'количество бесплатных' / 'количество платных' /
                      //                                           'количество подписок' / '(сумма по платным)'
                      MBResult.UslugiOn = `${String(freeCounter)} / ${String(paidCounter)} / ${String(subscriptionsCount)} / ` +
                                          `(${(paymentAmount).toFixed(2)})`;

                      initLogout();       // Завешаем сеанс работы в личном кабинете
                    })
                    .catch( function( err ) { fetchError( `Error getting JSON for '/api/uni-profile-mobile/subscriptions/' response: ${err.message}` ) } )
                  })
                  .catch( function( err ) { fetchError( `Fetch error getting '/api/uni-profile-mobile/subscriptions/': ${err.message}` ) } )
                })
                .catch( function( err ) { fetchError( `Error getting JSON for '/api/uni-profile-mobile/services/' response: ${err.message}` ) } )
              })
              .catch( function( err ) { fetchError( `Fetch error getting '/api/uni-profile-mobile/services/': ${err.message}` ) } )
            })
            .catch( function( err ) { fetchError( `Error getting JSON for '/api/uni-profile-mobile/tariff-fee/' response: ${err.message}` ) } )
          })
          .catch( function( err ) { fetchError( `Fetch error getting '/api/uni-profile-mobile/tariff-fee/': ${err.message}` ) } )
        })
        .catch( function( err ) { fetchError( `Error getting JSON for '/api/uni-profile-mobile/blocks/' response: ${err.message}` ) } )
      })
      .catch( function( err ) { fetchError( `Fetch error getting '/api/uni-profile-mobile/blocks/': ${err.message}` ) } )
    })
    .catch( function( err ) { fetchError( `Error getting JSON for '/apigw/ub/balance/main/' response: ${err.message}` ) } )
  })
  .catch( function( err ) { fetchError( `Fetch error getting '/apigw/ub/balance/main/': ${err.message}` ) } )

  function fetchError( err ) {
  //       ----------
    requestStatus = false;
    console.log( requestError = `[MB] ${err}` );
    initLogout();
  }
}
