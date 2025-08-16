/* Megafon_v2_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для оператора связи Мегафон через API (весь набор данных)
 *            Адаптирован к новой версии личного кабинета (с 29.09.2022) + изменения (с 21.11.2024)
 * Редакция:  2025.08.17
 *
*/

const maxRetries = 5; // Количество повторных попыток API-запросов при ошибках их выполнения 
let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;
let apiUrl = '';

chrome.runtime.onMessage.addListener( async ( request, sender, sendResponse ) => {
//----------------------------------
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBLogin = request.login;
      if ( window.location.host !== 'lk.megafon.ru' ) {                           // Если мы находимся не на странице личного кабинета, значит
        fetchError( '[MB] Authtorization error: current page is not personal profile page' );   // есть ошибки навигации или сервер не отвечает
        initLogout();
        return;
      }
      apiUrl = ( await ( await fetch( window.location.origin + '/settings.json', { method: 'GET', mode: 'cors' } ) ).json() ).api_url;

      switch ( request.action ) {
        case 'log&pass': {
          // Проверяем состояние сессии - авторизованы ли мы в личном кабинете с какими-то учётными данными или нет
          fetch( apiUrl + '/api/auth/sessionCheck',
                 { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' }
          })
          .then( function( response ) {
            response.json()
            .then( function( response ) {
              if ( response.authenticated ) {         // Есть авторизованная сессия в личном кабинете 
                if ( response.phone === MBLogin ) {   // Cессия установлена для нужных учётных данных, переходим к запросу
                  setTimeout( function() {            // Задержка, чтобы виджеты успели прогрузиться и не забивали на сервере
                    getData();                        //   очередь своими запросами - в неё пойдут и запросы от скрипта
                  }, 2000);
                }
                else { // Предыдущая сессия не была закрыта или закрыта неуспешно
                  fetchError( `Wrong profile data '${response.phone}' instead of '${MBLogin}'` );
                  initLogout(); // Нужно завершить эту сессию и авторизоваться с нужными учётными данными
                }
              }
              else { // Авторизованной сессии нет, проводим авторизацию
                authInput( MBLogin, request.passw );
              }
            })
            .catch( function( err ) { fetchError( `[MB] Error getting JSON data for '/api/auth/sessionCheck': ${err.message}` ) } )
          })
          .catch( function( err ) { fetchError( `[MB] Error fetching '/api/auth/sessionCheck' process: ${err.message}` ) } )
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
    fetchError( err.toString() );
    initLogout();
  }
})


function fetchError( err ) {
//       ----------
  requestStatus = false;
  console.log( `[MB] ${requestError = err}` );
}


function sleep( ms ) {
//       -----------
  return new Promise( resolve => setTimeout( resolve, ms ) );
}


async function initLogout() {
//       ----------
  // На странице личного кабинета сразу есть позиция меню выхода с классом 'menu-dropdown__leave'
  let exitButton = document.getElementsByClassName( 'menu-dropdown__leave' );
  if ( exitButton.length > 0 )  exitButton[ 0 ].click();  // Если кнопка выхода нашлась, то 'нажимаем' её
  // С 20.05.2025 при выборе этого пункта меню появляется 'модальное окно' подтверждения выхода
  // 'Модальное окно' формируется в 'div' с классом 'mfui-modal-desktop'
  await sleep( 200 );                                     // Задержка для инициализации структур 'модального окна' подтверждения выхода
  let exitConfirm = document.getElementsByClassName( 'mfui-modal-desktop' );
  // В 'модальном окне' две кнопки с классом 'mfui-button' (подтверждение и отмена)? определяем их
  exitConfirm = exitConfirm[ 0 ].getElementsByClassName( 'mfui-button' );
  // Передаём результаты опроса расширению MobileBalance с задержкой, чтобы успели отработать вызовы завершения сессии
  setTimeout( function() {
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
  }, 500);
  if ( exitConfirm.length > 0 )  exitConfirm[ 0 ].click();  // Если кнопка выхода нашлась, то 'нажимаем' её
/*
  Вызов для завершения сессии теперь требует использования токена, полученного при авторизации
  Получить и передать его возможно, но после вызова выхода нужна отправка события для завершения сессии
  Его пока разобрать не получилось

  // Инициируем завершение сеанса работы с личным кабинетом
  fetch( window.location.origin + '/api/logout',
    { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' }
    // Расширение дополнительно выполнит переход на страницу входа переходом по 'finishUrl' = 'https://lk.megafon.ru' 
  })
  .finally( function( result ) {
    // Передаём результаты опроса расширению MobileBalance
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
    // 'window.location.reload()' переместит нас на страницу авторизации, но то же самое и будет сделано:
    //   расширение дополнительно выполнит переход на страницу входа переходом по 'finishUrl' = 'https://lk.megafon.ru' 
  })
  .catch( function() {} );
*/
}


async function authInput( login, passw ) {
//             -------------------------
  fetch( apiUrl + '/api/login',
    { method: 'POST', mode: 'cors', credentials: 'include', body: `login=7${login}&password=${passw}&incognitoFlag=true`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' }
    })
  .then( function( response ) {
    response.json()
    .then( function( response ) { // Проверяем попытку авторизации на наличие ошибок
      if ( response.code !== undefined ) { // Если в структуре присутствует код ошибки, то выходим
        fetchError( `Authtorization error ${response.code}: ${response.message}` )
        chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                     status: requestStatus, error: requestError, data: undefined }, null );
      }
      else { // Авторизация успешно выполнена. Прогружаем страницу, чтобы расширение инициировало следующий шаг
        window.location.reload();   // Данный экземпляр скрипта при этом будет утрачен
      }
    })
    .catch( function( err ) { fetchError( `Error getting JSON data for '/api/login': ${err.message}` ) } )
  })
  .catch( function( err ) {
    fetchError( `Authtorization error: ${err.message}` )
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError, data: undefined }, null );
  })
}


async function getData() {
//             ---------
  let i = 1;                                              // Сведения о вызовах API взяты из новой версии личного кабинета
  let response, jsonResult;                               //   lk.megafon.ru/public/rwlk/app.18eacca0.js (23.11.2024)
  let payment = null;                                     // Стоимость месячных затрат (тариф + платные услуги)


  for ( i = 1; i <= maxRetries; ++i ) { // Получаем значение текущего баланса, кредитного лимита
    response = await fetch( apiUrl + '/api/main/balance',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      MBResult = { Balance: parseFloat( jsonResult.balance.toFixed(2) ) }; // Создаём 1-ое значение объекта ответа
      if ( jsonResult.limit !== undefined ) { // Получаем кредитный лимит (если он есть в тарифе)
        MBResult.KreditLimit = parseFloat( jsonResult.limit.toFixed(2) );
      }
      break;
    }
    else await sleep( 1000 ); // Если запрос неуспешен - повторяем его после паузы 1с (до заданного количества попыток)
  }
  if ( i > maxRetries ) { // Выполнены все попытки запроса, все были неуспешны, выходим с ошибкой
    fetchError( `Fatch failed within ${i} attempts. Status: '${response.statusText}'` ); // Fatching error
    initLogout();
    return;
  }
  else
    console.log( `[MB] Response for '/api/main/balance' API (total attempts = ${i}): ${JSON.stringify( jsonResult )}` );

  for ( i = 1; i <= maxRetries; ++i ) { // Получаем ФИО владельца, номер лицевого счёта
    response = await fetch( apiUrl + '/api/profile/info',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      MBResult.UserName = jsonResult.oApiName; // ФИО владельца
      MBResult.LicSchet = jsonResult.accountNumber; // Номер лицевого счёта
      break;
    }
    else await sleep( 1000 ); // Если запрос неуспешен - повторяем его после паузы 1с (до заданного количества попыток)
  }
  if ( i > maxRetries ) { // Выполнены все попытки запроса, все были неуспешны, выходим с ошибкой
    fetchError( `Fatch failed within ${i} attempts. Status: '${response.statusText}'` ); // Fatching error
    initLogout();
    return;
  }
  else
    console.log( `[MB] Response for '/api/profile/info' API (total attempts = ${i}): ${JSON.stringify( jsonResult )}` );

  for ( i = 1; i <= maxRetries; ++i ) { // Получаем состав услуг ( формат: 'бесплатные' / 'платные' ), собираем стоимость услуг для платных
    response = await fetch( apiUrl + '/api/services/currentServices/list',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      if ( jsonResult.free !== undefined )
        MBResult.UslugiOn = ( ( jsonResult.free.length > 0 ) ? String(jsonResult.free.length) : '0' ) + ' / '
      else
        MBResult.UslugiOn = '0 / ';
      if ( jsonResult.paid !== undefined )
        MBResult.UslugiOn += ( ( jsonResult.paid.length > 0 ) ? String(jsonResult.paid.length) : '0' )
      else
        MBResult.UslugiOn += '0';
      break;
    }
    else await sleep( 1000 ); // Если запрос неуспешен - повторяем его после паузы 1с (до заданного количества попыток)
  }
  if ( i > maxRetries ) { // Выполнены все попытки запроса, все были неуспешны, выходим с ошибкой
    fetchError( `Fatch failed within ${i} attempts. Status: '${response.statusText}'` ); // Fatching error
    initLogout();
    return;
  }
  else
    console.log( `[MB] Response for '/api/services/currentServices/list' API (total attempts = ${i}): ${JSON.stringify( jsonResult )}` );

  for ( i = 1; i <= maxRetries; ++i ) { // Получаем наименование тарифа, дату следующего платежа и сумму по тарифу (если они есть)
    response = await fetch( apiUrl + '/api/tariff/2019-3/current',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      MBResult.TarifPlan = jsonResult.name; // Наименование тарифа
      // Очищаем текст от спецсиволов (в Мегафоне это любят...)                  Заменяем...
      [ '&nbsp;', '\xA0' ].forEach( function( item ) {                        // ...неразрывные пробелы на обычные
        MBResult.TarifPlan = MBResult.TarifPlan.replaceAll( item, ' ' ) });
      [ '&ndash;', '\x96', '&mdash;', '\x97', '&shy;', '\xAD' ].forEach( function( item ) {
        MBResult.TarifPlan = MBResult.TarifPlan.replaceAll( item, '-' ) });   // ...средние тире, длинные тире, мягкий дефис на обычный дефис
      [ '&laquo;', '\xAB', '&raquo;', '\xBB' ].forEach( function( item ) {
        MBResult.TarifPlan = MBResult.TarifPlan.replaceAll( item, '"' ) });   // ...левые и правые двойные угловые скобки на '"'
      if ( jsonResult.ratePlanCharges.nextCharge !== undefined ) {            // Получаем дату следующего платежа (если она есть)
        // Для даты в формате "дд.мм.гггг чч:мм" берём только информацию о дате
        MBResult.TurnOffStr = jsonResult.ratePlanCharges.nextCharge.chargeDate.split( ' ' )[ 0 ];
        if ( jsonResult.ratePlanCharges.nextCharge.price !== undefined )      // Получаем сумму следующего платежа (если она есть)
          // Значение хранится как текст, заменяем запятые точками и переводим его в цифру
          payment = parseFloat( jsonResult.ratePlanCharges.nextCharge.price.value.replaceAll( ',', '.' ).split( ' ' )[ 0 ] );
      }
      break;
    }
    else await sleep( 1000 ); // Если запрос неуспешен - повторяем его после паузы 1с (до заданного количества попыток)
  }
  if ( i > maxRetries ) { // Выполнены все попытки запроса, все были неуспешны, выходим с ошибкой
    fetchError( `Fatch failed within ${i} attempts. Status: '${response.statusText}'` ); // Fatching error
    initLogout();
    return;
  }
  else
    console.log( `[MB] Response for '/api/tariff/2019-3/current' API (total attempts = ${i}): ${JSON.stringify( jsonResult )}` );

  if ( payment === null ) { // Если в данных о тарифе не было суммы следующего платежа, то пробуем собрать её из данных о расходах
    for ( i = 1; i <= maxRetries; ++i ) {
      response = await fetch( apiUrl + '/api/reports/expenses',
                              { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
      if ( response.ok && ( response.status === 200 ) ) {
        jsonResult = await response.json();
        if ( jsonResult.expenseGroups !== undefined ) {                 // Если в ответе есть раздел 'expenseGroups', то собираем из его объектов ...
          Object.values( jsonResult.expenseGroups ).forEach( function( item ) {                                   // ... значения полей 'totalAmount' 
            if ( item.totalAmount !== undefined )
              payment += item.totalAmount;
          });
        }
        break;
      }
      else await sleep( 1000 ); // Если запрос неуспешен - повторяем его после паузы 1с (до заданного количества попыток)
    }
    if ( i > maxRetries ) { // Выполнены все попытки запроса, все были неуспешны, выходим с ошибкой
      fetchError( `Fatch failed within ${i} attempts. Status: '${response.statusText}'` ); // Fatching error
      initLogout();
      return;
    }
    else
      console.log( `[MB] Response for '/api/reports/expenses' API (total attempts = ${i}): ${JSON.stringify( jsonResult )}` );
  }
  // Дополняем состав услуг стоимостью платных ( формат: 'бесплатные' / 'платные' / 'стоимость платных' )
  // Если сумма оплаты не сформирована, то принимем её равной нулю (вероятно тариф без абонентской платы и за период нет затрат)
  MBResult.UslugiOn += ` / (${( payment === null ) ? '0.00' : payment.toFixed(2)})`;

  for ( i = 1; i <= maxRetries; ++i ) { // Получаем остатки пакетов
    response = await fetch( apiUrl + '/api/options/v2/remainders/mini',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      // Получаем остаток пакета голосовых минут (если есть в составе тарифа)
      if ( jsonResult.remainders === undefined ) // Если пакетов нет, то прекращаем разбор
        break
      else { // Проводим разбор остатков пакетов
        jsonResult.remainders.forEach( async ( item ) => {
          switch ( item.remainderType ) {
            case 'VOICE': {
              if ( item.sumEnabled ) // Если пакет голосовых минут подключён, то выясняем безлимитная это опция или по пакету есть остаток
                MBResult.Minutes = ( item.unlim ) ? -1 : item.availableValue.value;
              break;
            }
            case 'MESSAGE': {
              if ( item.sumEnabled ) // Если пакет SMS подключён, то выясняем безлимитная это опция или по пакету есть остаток
                MBResult.SMS = ( item.unlim ) ? -1 : item.availableValue.value;
              break;
            }
            case 'INTERNET': {
              if ( item.sumEnabled ) { // Если пакет интернета подключён, то выясняем безлимитная это опция или по пакету есть остаток
                if ( item.unlim )
                  MBResult.Internet = -1 // Опция интернета безлимитная
                else {
                  let ratio = 1; // Счисление для трафика у Мегафона странное - десятичное, в "штуках" единиц трафика
                  // Чтобы расширения правильно работало с полученным значением, приводим его к традиционному шестнадцетиричному
                  switch ( item.availableValue.unit ) {
                    case 'МБ': {
                      ratio = 1.024; // Входное значение для расширения - мегабайты. Множитель = 1.024
                      break; }
                    case 'ГБ': {
                      ratio = 1024; // Приводим значение к мегабайтам. Множитель = 1024
                      break; }
                    case 'ТБ': {
                      ratio = 1048576; // Приводим значение к мегабайтам. Множитель = 1024 * 1024 = 1048576
                      break; }
                  }
                  MBResult.Internet = parseFloat( ( item.availableValue.value * ratio ).toFixed(3) );
                }
              }
              break;
            }
          }
        });
        break;
      }
    }
    else await sleep( 1000 ); // Если запрос неуспешен - повторяем его после паузы 1с (до заданного количества попыток)
  }
  if ( i > maxRetries ) { // Выполнены все попытки запроса, все были неуспешны, выходим с ошибкой
    fetchError( `Fatch failed within ${i} attempts. Status: '${response.statusText}'` ); // Fatching error
    initLogout();
    return;
  }
  else
    console.log( `[MB] Response for '/api/options/v2/remainders/mini' API (total attempts = ${i}): ${JSON.stringify( jsonResult )}` );

  // Если ранее не была принята дата следующего платежа и есть остаток пакета голосовых минут, то пытаемся получить дату из него
  if ( ( MBResult.TurnOffStr === undefined ) && ( MBResult.Minutes )) {
    response = await fetch( apiUrl + '/api/options/v2/remainders?remainderType=VOICE',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      if ( jsonResult.remainders && jsonResult.remainders[ 0 ].remainderDetails ) { // Если в пакете есть данные об остатках,
        jsonResult.remainders[ 0 ].remainderDetails.forEach( ( item ) => {          //   то ищем дату окончания срока их действия
          if ( item.dateTo )
            MBResult.TurnOffStr = item.dateTo.split( ' ' )[ 0 ]; // Для даты в формате "дд.мм.гггг чч:мм" берём только информацию о дате
        })
      }
    }
  }
  // Если ранее не была принята дата следующего платежа и есть остаток пакета сообщений, то пытаемся получить дату из него
  if ( ( MBResult.TurnOffStr === undefined ) && ( MBResult.SMS )) {
    response = await fetch( apiUrl + '/api/options/v2/remainders?remainderType=MESSAGE',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      if ( jsonResult.remainders && jsonResult.remainders[ 0 ].remainderDetails ) { // Если в пакете есть данные об остатках,
        jsonResult.remainders[ 0 ].remainderDetails.forEach( ( item ) => {          //   то ищем дату окончания срока их действия
          if ( item.dateTo )
            MBResult.TurnOffStr = item.dateTo.split( ' ' )[ 0 ]; // Для даты в формате "дд.мм.гггг чч:мм" берём только информацию о дате
        })
      }
    }
  }
  // Если ранее не была принята дата следующего платежа и есть остаток пакета интернета, то пытаемся получить дату из него
  if ( ( MBResult.TurnOffStr === undefined ) && ( MBResult.Internet )) {
    response = await fetch( apiUrl + '/api/options/v2/remainders?remainderType=INTERNET',
                            { method: 'GET', mode: 'cors', credentials: 'include', headers: { 'X-App-Type': 'react_lk', 'X-Cabinet-Capabilities': 'web-2020' } } );
    if ( response.ok && ( response.status === 200 ) ) {
      jsonResult = await response.json();
      if ( jsonResult.remainders && jsonResult.remainders[ 0 ].remainderDetails ) { // Если в пакете есть данные об остатках,
        jsonResult.remainders[ 0 ].remainderDetails.forEach( ( item ) => {          //   то ищем дату окончания срока их действия
          if ( item.dateTo )
            MBResult.TurnOffStr = item.dateTo.split( ' ' )[ 0 ]; // Для даты в формате "дд.мм.гггг чч:мм" берём только информацию о дате
        })
      }
    }
  }

  initLogout(); // Выходим из личного кабинета. Страницу на следующем шаге перезагрузит расширение
}
