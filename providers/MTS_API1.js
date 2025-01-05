/* MTS_API.js
 * ----------
 * Проект:    MobileBalance
 * Описание:  Обработчик для оператора связи МТС через API (весь набор данных)
 *            Авторизация через 'https://login.mts.ru/amserver/NUI/' (новый способ авторизации с апреля 2022)
 *            Получение данных в интерфейсе и через API 'нового' (с 12.07.2022) личного кабинета
 * Редакция:  2024.09.19
 *
*/

let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;
let MBLogin = undefined;
// Параметры для выполнения API-запросов по учётным данным: 'apiPart' - фрагмент для формирования URL запроса;
//                                                          'longtaskCheck' - признак необходимости использованием токена при формировании URL для запроса;
//                                                          'retries' - количество запросов для получения данных, выполняемых в одном "блоке";
//                                                          'minSuccess' - минимальное количество удачных запросов для определения полного и непустого ответа;
//                                                          'successRequests' - счётчик удачных запросов = API-запросов, на которые был получен ответ без ошибок;
//                                                          'successContent' - наиболее полный ответ, полученный в предыдущих 'successRequests' запросах
let requestParam = { dataBalance:    { apiPart: 'accountInfo/mscpBalance', longtaskCheck: true,  retries: 4, minSuccess: 2, successRequests: 0, successContent: [] },
                     creditLimit:    { apiPart: 'creditLimit',             longtaskCheck: true,  retries: 4, minSuccess: 2, successRequests: 0, successContent: [] },
                     userInfo:       { apiPart: '/api/login/user-info',    longtaskCheck: false, retries: 4, minSuccess: 2, successRequests: 0, successContent: [] },
                     dataCounters:   { apiPart: 'sharing/counters',        longtaskCheck: true,  retries: 6, minSuccess: 4, successRequests: 0, successContent: [] },
                     activeServices: { apiPart: 'services/list/active',    longtaskCheck: true,  retries: 4, minSuccess: 2, successRequests: 0, successContent: [] },
                     cashBack:       { apiPart: 'cashback/account',        longtaskCheck: true,  retries: 4, minSuccess: 2, successRequests: 0, successContent: [] }
                   };

chrome.runtime.onMessage.addListener( ( request, sender, sendResponse ) => {
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBLogin = request.login;
      switch ( request.action ) {
        case 'log&pass': {
          if ( window.location.origin !== 'https://login.mts.ru' ) { // Если мы находимся не на странице входа, значит
            // либо не был выполнен выход по предыдущим учётным данным и мы попали в личный кабинет по ним, либо ошибки на сервере
            fetch( 'https://login.mts.ru/amserver/rest/widget', { method: 'GET', mode: 'cors', credentials: 'include' } )
            .then( function( response ) {
              response.json()
              .then( function( response ) {
                if ( response[ 'mobile:phone' ] === MBLogin ) {  // Если личный кабинет открыт с информацией по нужным учётным данным, то переходим
                  window.location.replace( 'https://lk.mts.ru' ) //   на страницу личного кабинета, чтобы расширение инициировало следующий шаг
                }
                else { // Инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
                  requestStatus = false;
                  requestError = 'Previous session was not finished or login page error';
                  console.log( '[MB]' + requestError );
                  initLogout();
                }
              })
            })
          }
          else {
            authInput( MBLogin, request.passw );
          }
          break;
        }
        case 'polling': {
          setTimeout( function() {    // Задержка, чтобы виджеты успели прогрузиться и не забивали на сервере
            getData();                //   очередь своими запросами - в неё пойдут и запросы от скрипта
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
  // Авторизация через 'https://login.mts.ru/amserver/NUI/' проходит 4-мя последовательными запросами.
  const authUrl = 'https://login.mts.ru/amserver/wsso/authenticate?authIndexType=service&authIndexValue=login-spa';
  let i = 0;
  
  // Запрашиваем структуру данных формы подтверждения входа с 'header':'trusted-network' или 'header':'device-match-hold'
  fetch( authUrl, { method: 'POST', mode: 'cors',
                    headers: { 'Content-Type': 'application/json', 'Accept-API-Version': 'resource=4.0, protocol=1.0' } } )
    .then( function( response ) {
    response.json()
    .then( function( response ) {
      // Проверяем полученный ответ на отсутствие запроса ввода капчи
      if ( response.header === 'verify-captcha' ) { // Пришла капча. Её обработка не реализована
        fetchError( '[MB] Need to solve captcha' );
        return;
      }
      // Вносим в структуру ответа подтверждение входа
      for ( i = 0; i < response.callbacks.length; i++ ) {
        if ( response.callbacks[ i ].type === 'ConfirmationCallback' )
          response.callbacks[ i ].input[ 0 ].value = 1;
      }
      // Отсылаем форму серверу. Получаем в ответ структуру формы ввода учётных данных (логина) с 'header':'enter-phone'
      fetch( authUrl, { method: 'POST', mode: 'cors', body: JSON.stringify( response ),
                        headers: { 'Content-Type': 'application/json', 'Accept-API-Version': 'resource=4.0, protocol=1.0' } } )
      .then( function( response ) {
        response.json()
        .then( function( response ) {
          // Вносим в структуру ответа значение логина
          for ( i = 0; i < response.callbacks.length; i++ ) {
            if ( response.callbacks[ i ].type === 'ConfirmationCallback' )
              response.callbacks[ i ].input[ 0 ].value = 1;
            if ( response.callbacks[ i ].type === 'NameCallback' )
              response.callbacks[ i ].input[ 0 ].value = '7' + login;
          }
          // Отсылаем форму серверу. При отсутствии ошибок получаем в ответ структуру формы ввода пароля с 'header':'verify-password'
          fetch( authUrl, { method: 'POST', mode: 'cors', body: JSON.stringify( response ),
                            headers: { 'Content-Type': 'application/json', 'Accept-API-Version': 'resource=4.0, protocol=1.0' } } )
          .then( function( response ) {
            response.json()
            .then( function( response ) {
              // Вносим в структуру ответа значение пароля
              for ( i = 0; i < response.callbacks.length; i++ ) {
                if ( response.callbacks[ i ].type === 'ConfirmationCallback' )
                  response.callbacks[ i ].input[ 0 ].value = 1;
                if ( response.callbacks[ i ].type === 'PasswordCallback' )
                  response.callbacks[ i ].input[ 0 ].value = passw;
                // Если на предыдущем шаге в ответе возвращена ошибка - прекращаем процесс авторизации
                if (( response.callbacks[ i ].type === 'MetadataCallback' ) && ( response.callbacks[ i ].output[ 0 ].value.error )) {
                  console.log( `[MB] Login or account error. Code: ${response.callbacks[ i ].output[ 0 ].value.error}` );
                  // Передаём расширению MobileBalance ошибку при авторизации
                  chrome.runtime.sendMessage( MBextentionId,
                                              { message: 'MB_workTab_takeData', status: false, data: undefined,
                                                error: `[MB] Login or account error. Code: ${response.callbacks[ i ].output[ 0 ].value.error}` }, null );
                  return;
                }
              }
              // Отсылаем форму серверу. При отсутствии ошибок авторизация успешно завершена
              fetch( authUrl, { method: 'POST', mode: 'cors', body: JSON.stringify( response ),
                       headers: { 'Content-Type': 'application/json', 'Accept-API-Version': 'resource=4.0, protocol=1.0' } } )
              .then( function( response ) {
                response.json()
                .then( function( response ) {
                  if ( response.successUrl ) // Авторизация успешна. Прогружаем страницу, чтобы расширение инициировало следующий шаг
                    window.location.replace( 'https://lk.mts.ru' )  // Данный экземпляр скрипта при этом будет утрачен
                  else // Если были ошибки, то возвращена форма ввода пароля с 'callbacks'
                    for ( i = 0; i < response.callbacks.length; i++ ) {
                      // Если на предыдущем шаге (при отсылке пароля) в ответе возвращена ошибка - прекращаем процесс авторизации
                      if (( response.callbacks[ i ].type === 'MetadataCallback' ) && ( response.callbacks[ i ].output[ 0 ].value.error )) {
                        console.log( `[MB] Password or account error. Code: ${response.callbacks[ i ].output[ 0 ].value.error}` );
                        // Передаём расширению MobileBalance ошибку при авторизации
                        chrome.runtime.sendMessage( MBextentionId,
                                                    { message: 'MB_workTab_takeData', status: false, data: undefined,
                                                      error: `[MB] Password or account error. Code: ${response.callbacks[ i ].output[ 0 ].value.error}` }, null );
                        return;
                      }
                    }
                })
                .catch( function( err ) { fetchError( '[MB] Response error getting PasswordValue form. Received: ' + err.message ) } )
              })
              .catch( function( err ) { fetchError( '[MB] Error fetching PasswordValue form: ' + err.message ) } )
            })
            .catch( function( err ) { fetchError( '[MB] Response error getting PasswordValue form. Received: ' + err.message ) } )
          })
          .catch( function( err ) { fetchError( '[MB] Error fetching LoginValue form: ' + err.message ) } )
        })
        .catch( function( err ) { fetchError( '[MB] Response error getting LoginValue form. Received: ' + err.message ) } )
      })
      .catch( function( err ) { fetchError( '[MB] Error fetching LoginConfirmation form: ' + err.message ) } )
    })
    .catch( function( err ) { fetchError( '[MB] Response error getting LoginConfirmation form. Received: ' + err.message ) } )
  })
  .catch( function( err ) { fetchError( '[MB] Error fetching InitLogin process: ' + err.message ) } )

  function fetchError( err ) {
  //       ----------
    requestStatus = false;
    requestError = err;
    console.log( `[MB] ${requestError}` );
    initLogout();
  }
}


function initLogout() {
//       ----------
  // Маршруты процедур выхода из личного кабинета или профиля пользователя по состоянию на 22.10.2023
  switch ( window.location.hostname.split( '.' )[ 0 ] ) { // Выделяем первую часть адреса Это должно оказаться...
    case 'lk': {                                          // ...либо 'lk' для личного кабинета ('lk.mts.ru')
      // Инициируем завершение сеанса работы
      fetch( 'https://lk.mts.ru/api/login/logout', { method: 'GET', mode: 'cors' } )
      .finally( async function( result ) {
        // Воспроизводим цепочку переходов в процедуре выхода
        fetch( 'https://login.mts.ru/amserver/UI/Logout?goto=https://lk.mts.ru/auth/account/login',
               { method: 'GET', mode: 'no-cors', credentials: 'include' } )
        .then( function ( result ) {
          // Передаём результаты опроса расширению MobileBalance
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                       status: requestStatus, error: requestError,
                                                       data: (MBResult === undefined) ? undefined : MBResult }, null );
        })
        .catch( function() {} );
      })
      .catch( function() {} );
      break;
    }
    case 'profile': {                                     // ...либо 'profile' для профиля пользователя ('profile.mts.ru')
      // Инициируем завершение сеанса работы
      fetch( 'https://profile.mts.ru/logout', { method: 'GET', mode: 'cors' } )
      .finally( async function( result ) {
        // Воспроизводим цепочку переходов в процедуре выхода
        fetch( 'https://login.mts.ru/amserver/UI/Logout?goto=https://profile.mts.ru',
               { method: 'GET', mode: 'no-cors', credentials: 'include' } )
        .then( function ( result ) {
          fetch( 'https://login.mts.ru/amserver/NUI/?service=login-spa&client_id=MTS_Profile&goto=https://login.mts.ru/amserver/oauth2/authorize?client_id=MTS_Profile&redirect_uri=https://profile.mts.ru/auth&response_type=code&service=login&scope=profile&realm=/users',
                 { method: 'GET', mode: 'no-cors', credentials: 'include' } )
          .then( function ( result ) {
            // Передаём результаты опроса расширению MobileBalance
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                         status: requestStatus, error: requestError,
                                                         data: (MBResult === undefined) ? undefined : MBResult }, null );
          })
          .catch( function() {} );
        })
        .catch( function() {} );
      })
      .catch( function() {} );
      break;
    }
  }
  // Расширение дополнительно выполнит переход на страницу входа по 'finishUrl'
}


function sleep( ms ) {
//       -----
  return new Promise( resolve => setTimeout( resolve, ms ) );
}


// Поиск значений в структуре выдачи API по остаткам
function countersSearch( inpStruct, packageType, partType ) {
//       --------------
  let i = inpStruct.findIndex( function( item ) { // Определяем структуру с нужным значением 'packageType'
    return ( ( item.packageGroup === 'Main' ) && ( item.packageType === packageType ) )
  })
  if ( i < 0 ) return null; // Если нет искомой структуры - выходим
  if ( inpStruct[ i ].isUnlimited ) return -1; // Если опция безлимитная, то возвращаем значение -1
  // Значения остатков пакетов готовим для SMS - в штуках, для голосовых звонков - в минутах, для интернета - в мегабайтах
  let multiplier = 1;
  switch ( inpStruct[ i ].unitType ) { // Определяем размерность и устанавливаем поправочный коэффициент
    case 'Item':
    case 'Minute':
    case 'MByte':  { break; } // Нужная размерность, множитель = 1 не меняем
    case 'Byte':   { multiplier = 0.00000095367431640625; break; }
    case 'KByte':  { multiplier = 0.0009765625;           break; }
    case "GByte":  { multiplier = 1024;                   break; }
    case 'Second': { multiplier = 0.0166666666666667;     break; }
    case 'Hour':   { multiplier = 60;                     break; }
  }
  let j = inpStruct[ i ].parts.findIndex( function( item ) { // Определяем структуру с нужным значением 'partType'
    return ( item.partType === partType )
  })
  // Если в структуре нет раздела с параметром 'NonUsed', то нет и соответствующего значения 'amount'
  // Иначе возвращаем произведение полученного значения 'amount' на выявленный множитель
  return ( j < 0 ) ? null : inpStruct[ i ].parts[ j ].amount * multiplier
}


async function getData() {
//             ---------
  fetch( window.location.origin + '/api/login/profile', { method: 'GET', mode: 'no-cors' } )
  .then( async function( response ) {
    response.json()
    .then( async function( response ) {
      if ( response.account.phone !== MBLogin ) { // Если личный кабинет открыт с информацией по неправильным учётным данным, то вероятно, что
        requestError = `Wrong profile data '${response.account.phone}' instead of '${MBLogin}'`; // предыдущая сессия не была закрыта или закрыта неуспешно
        console.log( '[MB] ' + requestError );
        // Инициируем завершение сеанса работы с личным кабинетом - оно должно актуализировать в кабинете авторизацию по тем учётным данным, с которыми мы входили
        fetch( window.location.origin + '/api/login/logout', { method: 'GET', mode: 'no-cors' } )
        .finally( async function( result ) {
          await sleep( 200 ); // Задержка чтобы успел отработать backend выхода из кабинета
          // Запрашиваем у расширения повтор этого этапа запроса
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_repeatCurrentPhase', error: requestError }, null );
          // Перезагружаем страницу - она должна актуализироваться по учётным данным, с которыми мы авторизовались. Данный экземпляр скрипта при этом будет утрачен
          window.location.reload();
        })
        .catch( function() {} );
        return;
      }
      else {
        // Будем находиться в цикле 'do-while' пока для каждого из опрашиваемых параметров не будет выполнено 'minSuccess' или более удачных запросов.
        // Для параметров, по которым было получено менее 'minSuccess' ответов, запросы будут повторяться блоками по 'retries' штук.
        // Если за время, определённое в настройках расширения (параметр ожидания ответа на запрос от провайдера 'respondTimeoutValue'), для каждого из
        //   параметров не будет получено 'minSuccess' или более ответов по удачным запросам, то расширение прервёт запрос. Он будет считаться неудачным.
        do {
          if ( requestParam.dataBalance.minSuccess > requestParam.dataBalance.successRequests ) {
            await getDataAction( requestParam.dataBalance, 'mscpBalance' )
            .then( function( response ) {
              // Если получено 'minSuccess' или более ответов по удачным запросам (то есть разбора и приёма ответа ещё не было),
              // то забираем данные текущего баланса
              if ( requestParam.dataBalance.successRequests >= requestParam.dataBalance.minSuccess ) {
                if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                  MBResult = { Balance: parseFloat( response.amount.toFixed(2) ) }
                else                          // Если в объекте уже есть значения
                  MBResult.Balance = parseFloat( response.amount.toFixed(2) );
                // Забираем статус блокировки
                if ( ( response.accountBlocker !== undefined ) && ( response.accountBlocker.isBlocked !== undefined ) )
                  MBResult.BlockStatus = ( response.accountBlocker.isBlocked ) ? 'Blocked' : '';
              }
            })
            .catch( function( err ) { console.log( err ) })
          }
          if ( requestParam.creditLimit.minSuccess > requestParam.creditLimit.successRequests ) {
            await getDataAction( requestParam.creditLimit, 'creditLimit' )
            .then( function( response ) {
              // Если получено 'minSuccess' или более ответов по удачным запросам (то есть разбора и приёма ответа ещё не было),
              // то забираем данные кредитного лимита (если он есть)
              if ( requestParam.creditLimit.successRequests >= requestParam.creditLimit.minSuccess ) {
                if ( response.currentCreditLimitValue !== undefined )
                  if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                    MBResult = { KreditLimit: parseFloat( response.currentCreditLimitValue.toFixed(2) ) }
                  else                          // Если в объекте уже есть значения
                    MBResult.KreditLimit = parseFloat( response.currentCreditLimitValue.toFixed(2) );
              }
            })
            .catch( function( err ) { console.log( err ) })
          }
          if ( requestParam.userInfo.minSuccess > requestParam.userInfo.successRequests ) {
            await getDataAction( requestParam.userInfo, 'userInfo' )
            .then( function( response ) {
              // Если получено 'minSuccess' или более ответов по удачным запросам (то есть разбора и приёма ответа ещё не было),
              // то забираем данные о текущем пользователе
              if ( requestParam.userInfo.successRequests >= requestParam.userInfo.minSuccess ) {
                if ( response.userProfile !== undefined ) {
                  // ФИО владельца
                  if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                    MBResult = { UserName: response.userProfile.displayName }
                  else                          // Если в объекте уже есть значения
                    MBResult.UserName = response.userProfile.displayName;
                  // Брэнд-наименование тарифного плана
                  if ( MBResult.TarifPlan !== undefined ) // Если тарифная опция оказалась взята до брэнд-наименования
                    MBResult.TarifPlan = response.userProfile.tariff + MBResult.TarifPlan
                  else
                    MBResult.TarifPlan = response.userProfile.tariff;
                }
              }
            })
            .catch( function( err ) { console.log( err ) })
          }
          if ( requestParam.dataCounters.minSuccess > requestParam.dataCounters.successRequests ) {
            // Забираем остатки пакетов минут, SMS и Интернета (если есть)
            // Минут и SMS может не быть в интернет-тарифах, а интернета - в голосовых тарифах
            // Если значение для параметра есть - создаём его, если нет, то опция не предусмотрена или она безлимитная
            await getDataAction( requestParam.dataCounters, 'dataCounters' )
            .then( function( response ) {
              // Если получено 'minSuccess' или более ответов по удачным запросам (то есть разбора и приёма ответа ещё не было),
              // то разбираем остатки пакетов
              if ( requestParam.dataCounters.successRequests >= requestParam.dataCounters.minSuccess ) {
                // Если в ответе присутствует блок данных по остаткам пакетов, то проводим их разбор ...
                if ( ( response.data.counters !== undefined ) && ( response.data.counters.length > 0 ) ) {
                  // ... ищем остаток минут голосового пакета (в минутах)
                  let tmp = countersSearch( response.data.counters, 'Calling', 'NonUsed' );
                  if ( tmp !== null ) // Если остаток по голосовому пакету обнаружен, то принимаем его
                    if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                      MBResult = { Minutes: ( tmp < 0 ) ? -1 : parseInt( tmp ) }
                    else                          // Если в объекте уже есть значения
                      MBResult.Minutes = ( tmp < 0 ) ? -1 : parseInt( tmp );
                  // ... ищем остаток SMS пакета сообщений (в штуках)
                  tmp = countersSearch( response.data.counters, 'Messaging', 'NonUsed' );
                  if ( tmp !== null ) // Если остаток по пакету сообщений обнаружен, то принимаем его
                    if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                      MBResult = { SMS: ( tmp < 0 ) ? -1 : parseInt( tmp ) }
                    else                          // Если в объекте уже есть значения
                      MBResult.SMS = ( tmp < 0 ) ? -1 : parseInt( tmp );
                  // ... ищем остаток трафика пакета интернета (в мегабайтах)
                  tmp = countersSearch( response.data.counters, 'Internet', 'NonUsed' );
                  if ( tmp !== null ) // Если остаток по пакету интернета обнаружен, то принимаем его
                    if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                      MBResult = { Internet: ( tmp < 0 ) ? -1 : parseFloat( tmp.toFixed(3) ) }
                    else                          // Если в объекте уже есть значения
                      MBResult.Internet = ( tmp < 0 ) ? -1 : parseFloat( tmp.toFixed(3) );
                  // Если в тарифе есть остатки пакета интернета, то тарифную опцию будем брать из него, если нет - то из остатков голосового пакета
                  if ( ( MBResult.Internet !== undefined ) && ( MBResult.Internet >= 0 ) )  tmp = 'Internet'
                  else
                    if ( ( MBResult.Minutes !== undefined ) && ( MBResult.Minutes >= 0 ) )  tmp = 'Calling'
                    else  tmp = '';
                  // Добавляем к брэнд-наименованию тарифного плана наименование основной тарифной опции ...
                  if ( MBResult.TarifPlan === undefined ) // Если брэнд-наименование тарифа ещё не было принято, то создаём его с пустым значением
                    MBResult.TarifPlan = '';              // и вносим составляющую тарифной опции. Брэнд-наименование потом вставим в начало строки
                  for ( let i = 0; i < response.data.counters.length; i++ ) {
                    if ( ( response.data.counters[ i ].packageGroup === 'Main' ) && // ... из секции основных данных остатков
                         ( response.data.counters[ i ].packageType === tmp ) ) {
                      MBResult.TarifPlan += ` => ${response.data.counters[ i ].name}`;
                      // Дата следующего платежа
                      if ( response.data.counters[ i ].deadlineDate )
                        MBResult.TurnOffStr = `${response.data.counters[ i ].deadlineDate.slice( 8, 10 )}.` +
                                              `${response.data.counters[ i ].deadlineDate.slice( 5,  7 )}.` +
                                              `${response.data.counters[ i ].deadlineDate.slice( 0,  4 )}`;
                      break;
                    }
                  }
                }
              }
            })
            .catch( function( err ) { console.log( err ) })
          }
          if ( requestParam.activeServices.minSuccess > requestParam.activeServices.successRequests ) {
            await getDataAction( requestParam.activeServices, 'activeServices' )
            .then( function( response ) {
              // Если получено 'minSuccess' или более ответов по удачным запросам (то есть разбора и приёма ответа ещё не было),
              // то забираем состав услуг
              if ( requestParam.activeServices.successRequests >= requestParam.activeServices.minSuccess ) {
                // Формируем строку состава услуг в формате: 'количество бесплатных' / 'количество платных' / (сумма по платным)
                let freeCounter = 0, paidCounter = 0, paidAmmount = 0;
                response.data.services.forEach( function( item ) {
                  if ( item.primarySubscriptionFee.value > 0 ) {
                    ++paidCounter;
                    paidAmmount += item.primarySubscriptionFee.value;
                  }
                  else ++freeCounter;
                });
                if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                  MBResult = { UslugiOn: `${String(freeCounter)} / ${String(paidCounter)} (${paidAmmount.toFixed(2)})` }
                else                          // Если в объекте уже есть значения
                  MBResult.UslugiOn = `${String(freeCounter)} / ${String(paidCounter)} (${paidAmmount.toFixed(2)})`;
              }
            })
            .catch( function( err ) { console.log( err ) })
          }
          if ( requestParam.cashBack.minSuccess > requestParam.cashBack.successRequests ) {
            await getDataAction( requestParam.cashBack, 'cashBack' )
            .then( function( response ) {
              // Если получено 'minSuccess' или более ответов по удачным запросам (то есть разбора и приёма ответа ещё не было),
              // то забираем значение кэшбэка, если его значение ненулевое
              if ( requestParam.cashBack.minSuccess >= requestParam.cashBack.successRequests ) {
                if ( response.data.balance && ( response.data.balance > 0 ) ) {
                  if ( MBResult === undefined ) // Если помещаем в объект ответа 1-ое значение
                    MBResult = { Balance2: parseFloat( response.data.balance.toFixed(2) ) }
                  else                          // Если в объекте уже есть значения
                    MBResult.Balance2 = parseFloat( response.data.balance.toFixed(2) );
                }
              }
            }) // getCashBack //
            .catch( function( err ) { console.log( err ) })
          }
        } while ( ( requestParam.dataBalance.minSuccess    > requestParam.dataBalance.successRequests )    ||
                  ( requestParam.creditLimit.minSuccess    > requestParam.creditLimit.successRequests )    ||
                  ( requestParam.userInfo.minSuccess       > requestParam.userInfo.successRequests )       ||
                  ( requestParam.dataCounters.minSuccess   > requestParam.dataCounters.successRequests )   ||
                  ( requestParam.activeServices.minSuccess > requestParam.activeServices.successRequests ) ||
                  ( requestParam.cashBack.minSuccess       > requestParam.cashBack.successRequests )
                );

        initLogout(); // Инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
      }
    }) /* .then response.json() */
    .catch( function( err ) {  // Если получения и разбора ответа были ошибки,
      requestStatus = false;
      requestError = `[MB] Error getting JSON for '/api/login/profile': ${err}`;
      console.log( requestError );
      initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
    }) /* .then response.json() */
  }) /* /auth/profile/full/legacy */
  .catch( function( err ) {  // Если были ошибки в ходе получения запроса,
    requestStatus = false;
    requestError = `[MB] Fetch error getting '/api/login/profile': ${err}`;
    console.log( requestError );
    initLogout();         //   то инициируем завершение сеанса работы с личным кабинетом и уходим с его страницы
  }) /* /api/login/profile */
}


async function getRequestToken( dest ) {
//             ---------------
  return new Promise( function( resolve, reject ) { // Получаем токен для API-запроса
    fetch( window.location.origin + '/api/' + dest + '?overwriteCache=false', { method: 'GET', mode: 'no-cors' } )
    .then( function( response ) {
      response.json()
      .then( function( response ) {
        resolve( response );
      })
      .catch( function( err ) {
        reject( `[MB] Error getting JSON for requestToken: ${err}` );
      })
    })
    .catch( function( err ) {
      reject( `[MB] Fetch error getting requestToken: ${err}` );
    })
  });
}


async function urlsPrepare( longtaskCheck, retries, apiPart ) {
//             -----------
  let urls = new Array;
  for ( let i = 0; i < retries; i++ ) {
    if ( longtaskCheck === true ) {
      await getRequestToken( apiPart )   // Для каждого запроса запрашиваем свой токен
      .then( function( requestToken ) {  // Подготавливаем массив ссылок для запросов с токенами
        urls.push( window.location.origin + `/api/longtask/check/${requestToken}?for=api/${apiPart}` )
      })
      .catch( function( err ) { // Токен не получен, ссылка не сформирована, нужно повторить
        ++i;                    // !!! Есть риск бесконечного цикла при отказе API-функции выдачи токена !!!
        console.log( err );
      })
    }
    else                                 // Подготавливаем массив ссылок для запросов без токенов
      urls.push( window.location.origin + apiPart );
  }
  return urls;
}


async function getDataAction( param, paramName ) {
//             -------------
  return new Promise( async function( resolve, reject ) {
    // Выполняем запрос для параметра 'param', предварительно получив для него 'retries' ссылок для запросов
    await requestAction( await urlsPrepare( param.longtaskCheck, param.retries, param.apiPart ), param, paramName )
    .then( result => {
      resolve( result );
    })
    .catch( err => {
      reject( err );
    })
  })
}


async function requestAction( urls, param, paramName ) {
//             -------------
  let attempts = urls.length;
  await sleep( 1000 ); // Задержка в 1 секунду перед очередным блоком запросом
  return new Promise( function( resolve, reject ) {
    Promise.allSettled(
      urls.map( async function( url, idx ) {
        let respResult;
        try { // Запрос данных
          respResult = await fetch( url, { method: 'GET', mode: 'cors', credentials: 'include',
                                           headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Login': '7' + MBLogin }
                                         });
        }
        catch( err ) {
          console.log( `[MB] Fetch error getting ${paramName} on attempt ${idx + 1}: ${err}` );
          urls[ idx ] = '';
          --attempts;
        }
        if ( respResult.ok ) {
          try {
            urls[ idx ] = await respResult.json();
          }
          catch( err ) {
            console.log( `[MB] Error getting JSON for ${paramName} on attempt ${idx + 1}: ${err}` );
            urls[ idx ] = '';
            --attempts;
          }
        }
      })
    )
    .then( async function ( results ) {
      if ( ( attempts > 0 ) && ( urls.length > 0 ) ) {
        if ( param.successContent.length > 0 )        // Добавляем в массив ответ (если он был), полученный при предыдущих попытках запросов
          urls.push( param.successContent[ 0 ] );
        while ( urls.length > 1 ) {                   // Удаляем одинаковые, неполные (более короткие) и ошибочные ответы (они пустые)
          ( JSON.stringify(urls[ urls.length - 1 ]).length <= JSON.stringify(urls[ urls.length - 2 ]).length ) ?
            urls.splice( urls.length - 1, 1 ) : urls.splice( urls.length - 2, 1 );
        }
        param.successContent[ 0 ] = urls[ 0 ];        // Сохраняем наиболее полный правильный ответ
        console.log( `[MB] Response for ${paramName}: ${JSON.stringify(urls[ 0 ])}` );
        param.successRequests += attempts;            // Добавляем к значению счётчика количество удачных запросов с корректными ответами
        console.log( `[MB] Successful attempts for getting ${paramName}: ${attempts}` );
        resolve( urls[ 0 ] ); // Возвращаем полученый ответ
      }
      else {                                          // Если удачных запросов нет, то выдаём ошибку
        reject( `[MB] Fetch error getting ${paramName}: No successful requests` );
      }
    })
    .catch( function( err ) {
      reject( `[MB] Fetch error getting ${paramName}: ${err}` );
    })
  });
}
