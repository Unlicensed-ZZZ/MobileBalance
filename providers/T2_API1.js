/* T2_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для оператора связи T2 (ранее Tele2) через API
 * Редакция:  2024.09.05
 *
*/

const maxRetries = 5; // Количество повторных попыток API-запросов при ошибках их выполнения 
let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;
let MBLogin = undefined;
let currentTokens = { renew: false }; // Для обновления токенов через ответ раширению в 'detail'. По умолчанию их обновлять не нужно.

chrome.runtime.onMessage.addListener( async function( request, sender, sendResponse ) {
//----------------------------------
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBLogin = request.login;
      switch ( request.action ) {
        case 'log&pass': {
// --- До обновления сайта Tele2 04.09.2024 ('tele2.ru') ---
          //  При входе на 'tele2.ru' (включая перенаправления) получаем страницу, на которой есть элемент со ссылкой для входа с классом 'gtm-new-navigation-login'. 
          //  Если предыдущая сессия не завершена, то класс у этой ссылки 'gtm-new-navigation-lk' и она открывает личный кабинет по предыдущим учётным данным
          if ( window.location.origin.includes( 'tele2.ru' ) ) {                                // Если стартовая страница сайта открылась ...
            if ( document.getElementsByClassName( 'gtm-new-navigation-login' ).length > 0 ) {   // ... и в её меню есть ссылка для входа в личный кабинет
              if ( ( request.detail !== undefined ) &&                                          // Если в дополнительных параметрах переданы ранее сохранённые токены
                   ( request.detail.access_token !== undefined ) &&                             // и они имеют значение (это не пустые строки), то вносим их в cookie,
                   ( request.detail.access_token !== '' ) ) {                                   // восстанавливая сессию ранее открытую для учётных данных
                console.log( `[MB] Attempting to authorize as '${MBLogin}' ...` );
                request.detail.access_token.domain = 'tele2.ru';                                // Прописываем в cookie домен 'tele2.ru' на случай, если там что-то другое
                request.detail.refresh_token.domain = 'tele2.ru';
                await cookieStore.set( request.detail.access_token );
                await cookieStore.set( request.detail.refresh_token );
                window.location.replace( window.location.origin + '/lk' );                      // Переходим на страницу личного кабинета, этот экземпляр скрипта будет утрачен
                return;
              }
              else { // Инициируем загрузку формы ввода учётных данных и ожидаем их ввода пользователем (включая код из SMS или письма на эл. почту)
                document.getElementsByClassName( 'gtm-new-navigation-login' )[ 0 ].click();
                do { await sleep( 100 ); // Дожидаемся завершения загрузки формы авторизации. По умолчанию на ней активна 'вкладка' входа по SMS
                } while ( ( !document.getElementsByTagName( 'html' )[ 0 ].classList.contains( 'modal-dialog-opened' ) ) &&
                          ( document.getElementsByClassName( 'keycloak-login-form' ).length === 0 ) );
                await sleep( 200 );                                                             // Задержка, чтобы дать время на инициализацию структур формы
                let phoneNumber = document.getElementsByName( 'phoneNumber' );                  // Находим в форме поле ввода номера
                phoneNumber[ 0 ].setAttribute( 'value', MBLogin );                              // Вносим в него значение номера из учётных данных
                phoneNumber[ 0 ].dispatchEvent( new Event( 'change', { bubbles: true } ) );     // Инициируем приём и обработку значения формой
                return;
                // После успешной авторизации должна быть открыта страница личного кабинета (то есть страница обновится и этот экземпляр скрипта будет утрачен)
              } // При отсутствии действий пользователя, ошибках авторизаци = превышении времени ожидания авторизации, расширение прекратит опрос по этим учётным данным
            }
            else { // На странице нет элемента с классом 'gtm-new-navigation-login' ...
              if ( document.getElementsByClassName( 'gtm-new-navigation-lk' ).length > 0 ) {    // ... но есть элемент для входа в личный кабинет по активной сессии
                // В ссылке для входа учётные данные показаны в формате '+7 111 222 33 44'. Приводим их к виду '1112223344', пригодному для сравнения
                let prevAccount = document.getElementsByClassName( 'gtm-new-navigation-lk' )[ 0 ].getElementsByClassName( 'br' )[ 0 ].textContent.replaceAll( ' ', '' ).slice( 2 );
                if ( prevAccount === MBLogin ) {                                                // Сессия открыта для нужных нам учётных данных
                  window.location.replace( window.location.origin + '/lk' );                    // Переходим на страницу личного кабинета, этот экземпляр скрипта будет утрачен
                  return;
                }
                else { // Закрываем текущую сессию удалением токенов в cookie
                  fetchError( `Рrevious session for '${prevAccount}' was not closed. Closing it now...` );
                  await cookieStore.delete( { name: 'access_token', domain: 'tele2.ru', path: '/' } );
                  await cookieStore.delete( { name: 'refresh_token', domain: 'tele2.ru', path: '/' } );
                  // При завершении этапа расширение выполнит переход на страницу входа 'finishUrl' и страница загрузится без прежней сессии
                }
              }
              else { // Если нет элементов с этими классами, то вероятно страница прогрузилась с ошибками или не загрузилась совсем
                fetchError( 'Login page error or server not responding' );
              }
              chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
              return;
            }
          }
// --- До обновления сайта Tele2 04.09.2024 ('tele2.ru') ---
// --- После обновления сайта Tele2 04.09.2024 ('t2.ru') ---
          //  При входе на 't2.ru' (включая перенаправления) получаем страницу, на которой есть элемент кнопки со вложенным элементом 'span' с innerText = 'ВОЙТИ'.
          //  Если предыдущая сессия не завершена, то на странце появляется элемент со ссылкой, имеющей класс 't2-header__profile'. В ней находится элемент 'span'
          //  с классом 't2-header__phone-number', содержащий номер текущих учётных данных. При нажатии на эту ссылку открывается страница личного кабинета по
          //  предыдущим учётным данным.
          if ( window.location.origin.includes( 't2.ru' ) ) {                                   // Если стартовая страница сайта открылась ...
            // Проверяем, есть ли текущая авторизация - элемент для входа в личный кабинет по активной сессии
            let prevAccount = document.getElementsByClassName( 't2-header__profile' );
            if ( prevAccount.length > 0 ) {                                                     // ... и есть текущая авторизация в личном кабинете
              // В ссылке для входа учётные данные показаны в формате '+7 111 222 33 44'. Приводим их к виду '1112223344', пригодному для сравнения
              prevAccount = prevAccount[0].firstChild.innerText.replaceAll( ' ', '' ).slice( 2 );
              if ( prevAccount === MBLogin ) {                                                  // Сессия открыта для нужных нам учётных данных
                window.location.replace( window.location.origin + '/lk' );                      // Переходим на страницу личного кабинета, этот экземпляр скрипта будет утрачен
                return;
              }
              else { // Закрываем текущую сессию удалением токенов в cookie
                fetchError( `Рrevious session for '${prevAccount}' was not closed. Closing it now...` );
                await cookieStore.delete( { name: 'access_token', domain: 't2.ru', path: '/' } );
                await cookieStore.delete( { name: 'refresh_token', domain: 't2.ru', path: '/' } );
                // При завершении этапа расширение выполнит переход на страницу входа 'finishUrl' и страница загрузится без прежней сессии
                chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
                return;
              }
            }
            // Ищем на странице элемент с набором ссылок-пунктов меню, а в нём - элемент ссылки входа в личный кабинет
            let desktopMenu = Array.from(document.getElementsByTagName( 'span' ));
            desktopMenu = desktopMenu.find( function( item ) { return item.innerText.includes( 'ВОЙТИ' ) })
            if ( desktopMenu !== undefined ) {                                                  // Если есть ссылка для входа в личный кабинет, то ...
              if ( ( request.detail !== undefined ) &&                                          // Если в дополнительных параметрах переданы ранее сохранённые токены
                   ( request.detail.access_token !== undefined ) &&                             // и они имеют значение (это не пустые строки), то вносим их в cookie,
                   ( request.detail.access_token !== '' ) ) {                                   // ... восстанавливая сессию ранее открытую для учётных данных
                console.log( `[MB] Attempting to authorize as '${MBLogin}' ...` );
                request.detail.access_token.domain = 't2.ru';                                   // Прописываем в cookie домен 't2.ru' на случай, если там что-то другое
                request.detail.refresh_token.domain = 't2.ru';
                await cookieStore.set( request.detail.access_token );
                await cookieStore.set( request.detail.refresh_token );
                window.location.replace( window.location.origin + '/lk' );                      // Переходим на страницу личного кабинета, этот экземпляр скрипта будет утрачен
                return;
              }
              else { // Инициируем загрузку формы ввода учётных данных и ожидаем их ввода пользователем (включая код из SMS или письма на эл. почту)
                desktopMenu.click();
                do { await sleep( 100 ); // Дожидаемся завершения загрузки формы авторизации. По умолчанию на ней активна 'вкладка' входа по SMS
                } while ( ( !document.getElementsByTagName( 'html' )[ 0 ].classList.contains( 'modal-dialog-opened' ) ) &&
                          ( document.getElementsByClassName( 'keycloak-login-form' ).length === 0 ) );
                await sleep( 200 );                                                             // Задержка, чтобы дать время на инициализацию структур формы
                let phoneNumber = document.getElementsByName( 'phoneNumber' );                  // Находим в форме поле ввода номера
                phoneNumber[ 0 ].setAttribute( 'value', MBLogin );                              // Вносим в него значение номера из учётных данных
                phoneNumber[ 0 ].dispatchEvent( new Event( 'change', { bubbles: true } ) );     // Инициируем приём и обработку значения формой
                return;
                // После успешной авторизации должна быть открыта страница личного кабинета (то есть страница обновится и этот экземпляр скрипта будет утрачен)
              } // При отсутствии действий пользователя, ошибках авторизаци = превышении времени ожидания авторизации, расширение прекратит опрос по этим учётным данным
            }
          }
// --- После обновления сайта Tele2 04.09.2024 ('t2.ru') ---
          // Если иы попали в эту точку, то предыдущие условия не отаботали и главная страница (страница авторизации) не открыта. Значит есть ошибки навигации или сервер не отвечает
          fetchError( 'Login page error or server not responding' );
          // Передаём результаты опроса расширению MobileBalance
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
          return;
          break;
        }
        case 'polling': {
          setTimeout( function() {    // Задержка, чтобы страница успела прогрузиться и не забивала на сервере
            getData();                //   очередь своими запросами - в неё пойдут и запросы от скрипта
          }, 2000);
          break;
        }
      } /* switch */
    }
    else return;
  }
  catch( err ) { fetchError( err.toString() );
                 chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
               }
})


function fetchError( err ) {
//       ----------
  requestStatus = false;
  requestError = err;
  console.log( `[MB] ${requestError}` );
}


function sleep( ms ) {
//       -----------
  return new Promise( resolve => setTimeout( resolve, ms ) );
}


async function initLogout() {
//       ----------
  let dmn = window.location.origin.includes( 't2.ru' ) ? 't2.ru' : 'tele2.ru';
  // Закрываем текущую сессию удалением токенов в cookie (если они были)
  await cookieStore.delete( { name: 'access_token', domain: dmn, path: '/' } );
  await cookieStore.delete( { name: 'refresh_token', domain: dmn, path: '/' } );
  // Передаём результаты зароса расширению
  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError,
                                               data: (MBResult === undefined) ? undefined : MBResult,
                                               detail: ( currentTokens.renew ) ? currentTokens : undefined,
                                             }, null );
}


async function getData() {
//             ---------
  let accessTkn = await cookieStore.get( 'access_token' );
  // Проверяем, находимся ли странице личного кабинета (загрузилась ли она)
  if ( !window.location.href.includes( '2.ru/lk' ) ) { // Проверяем нахождение на 't2.ru/lk' или 'tele2.ru/lk'
    fetchError( `Account page error or server not responding` );
    if ( accessTkn !== null ) {
      // Если произошла ошибка перехода в личный кабинет после выполнения авторизации, то токены (сессия для текущих учётных данных)
      // могли быть сформированы. Их нужно передать для сохранения в раширении, чтобы использовать в следующем запросе по этим учётным данным
      // Если ошибка перехода в личный кабинет произошла при указании ранее сохранённых токенов (полученных от расширения),
      // то их пересохранение в расширении ничего не нарушит - обновятся только параметры 'expires'
      currentTokens.access_token = accessTkn;
      currentTokens.refresh_token = await cookieStore.get( 'refresh_token' );
      currentTokens.renew = true; // Запрос должен записать / обновить в учётных данных значения токенов
    }
    initLogout(); // Выходим из личного кабинета
    return;
  }
  // Если в адресе '2.ru/lk' присутствует, но токенов нет, то личный кабинет скорее всего отверг предложенные сохранённые токены и запрашивает авторизацию
  if ( accessTkn === null ) {
    fetchError( `Authorization needed or server not responding` );
    currentTokens.renew = true; // Токенов нет, запрос обновления должен удалить в учётных данных неактуальные значения
    initLogout(); // Выходим из личного кабинета
    return;
  }
  else
    accessTkn = accessTkn.value;
  let siteId = undefined;
  let freeCounter = 0, paidCounter = 0, paidAmmount = 0;
  // Значение для 'x-request-id' находится в переменной 'requestId' объекта 'window'

  fetch( window.location.origin + `/api/subscribers/7${MBLogin}/profile`,
         { method: 'GET', mode: 'cors', credentials: 'include',
           headers: { Accept: 'application/json, text/plain, */*', Authorization: 'Bearer ' + accessTkn,
                      'cache-control': 'no-cache', pragma: 'no-cache',
                      'tele2-user-agent': 'web', 'x-request-id': window.requestId }
         })
  .then( function( response ) {
    response.json()
    .then( function( response ) {
      if ( response.meta.status === 'OK' ) {
        console.log( `[MB] Response for '.../profile': ${JSON.stringify( response )}` );
        siteId = response.data.siteId;
        // Получаем ФИО владельца
        MBResult = { UserName: response.data.fullName }; // Создаём 1-ое значение объекта ответа
        // Получаем статус блокировки
        MBResult.BlockStatus = ( response.data.status.status.toUpperCase() !== 'ACTIVATED' ) ? 'Blocked' : '';

        fetch( window.location.origin + `/api/subscribers/7${MBLogin}/${siteId}/rests`,
               { method: 'GET', mode: 'cors', credentials: 'include',
                 headers: { Accept: 'application/json, text/plain, */*', Authorization: 'Bearer ' + accessTkn,
                            'cache-control': 'no-cache', pragma: 'no-cache',
                            'tele2-user-agent': 'web', 'x-request-id': window.requestId }
               })
        .then( function( response ) {
          response.json()
          .then( function( response ) {
            if ( response.meta.status === 'OK' ) {
              console.log( `[MB] Response for '.../rests': ${JSON.stringify( response )}` );
              if ( response.data.tariffStatus.toUpperCase() === 'BLOCKED' ) // Если тариф заблокирован, то остатки тоже недоступны, нет смысла их разбирать
                MBResult.BlockStatus = 'Blocked'                            // Проставляем статус блокировки. Абонент активен, но остатки по этим учётным данным заблокированы
              else {
                if ( response.data.rests && ( response.data.rests.length > 0 ) ) { // Если есть остатки пакетов, то получаем их
                  for ( let i = 0; i < response.data.rests.length; i++  ) {
                    if ( ( MBResult.TurnOffStr === undefined ) || ( MBResult.TurnOffStr === '' ) ) {  // Забираем дату следующего платежа в формате 'DD.MM.YYYY',
                      let endDayStr = response.data.rests[ i ].endDay.split( 'T' )[ 0 ].split( '-' ); // если это ещё не сделано в предыдущих циклах
                      MBResult.TurnOffStr = `${endDayStr[ 2 ]}.${endDayStr[ 1 ]}.${endDayStr[ 0 ]}`;
                    }
                    switch ( response.data.rests[ i ].uom.toUpperCase() ) {
                      case 'MB': { // Остатки пакета интернет. Исходное значение для расширения - мегабайты, оставляем значение
                        if ( response.data.rests[ i ].status.toUpperCase() !== 'BLOCKED' ) {        // Если пакет не заблокирован...
                          if ( response.data.rests[ i ].unlimited )  MBResult.Internet = -1         // Если опция безлимитная, то возвращаем значение -1
                          else {
                            if ( ( response.data.rests[ i ].type.toUpperCase() === 'TARIFF' ) &&    // Если это блок данных тарифной, а не сервисной опции
                                 ( !response.data.rests[ i ].rollover ) )                           // ...и это пакет текущего (а не перенесённого) остатка
                              MBResult.Internet = parseFloat( ( response.data.rests[ i ].remain ).toFixed(3) )
                          }
                        }
                        break; }
                      case 'MIN': { // Остатки пакета минут
                        if ( response.data.rests[ i ].status.toUpperCase() !== 'BLOCKED' ) {        // Если пакет не заблокирован...
                          if ( response.data.rests[ i ].unlimited )  MBResult.Minutes = -1          // Если опция безлимитная, то возвращаем значение -1
                          else {
                            if ( ( response.data.rests[ i ].type.toUpperCase() === 'TARIFF' ) &&    // Если это блок данных тарифной, а не сервисной опции
                                 ( !response.data.rests[ i ].rollover ) )                           // ...и это пакет текущего (а не перенесённого) остатка
                              MBResult.Minutes = response.data.rests[ i ].remain
                          }
                        }
                        break; }
                      case 'PCS': { // Остатки пакета SMS
                        if ( response.data.rests[ i ].status.toUpperCase() !== 'BLOCKED' ) {        // Если пакет не заблокирован...
                          if ( response.data.rests[ i ].unlimited )  MBResult.SMS = -1              // Если опция безлимитная, то возвращаем значение -1
                          else {
                            if ( ( response.data.rests[ i ].type.toUpperCase() === 'TARIFF' ) &&    // Если это блок данных тарифной, а не сервисной опции
                                 ( !response.data.rests[ i ].rollover ) )                           // ...и это пакет текущего (а не перенесённого) остатка
                              MBResult.SMS = response.data.rests[ i ].remain
                          }
                        }
                        break; }
                    } // switch
                  }
                }
              }

              fetch( window.location.origin + `/api/subscribers/7${MBLogin}/balance`,
                     { method: 'GET', mode: 'cors', credentials: 'include',
                       headers: { Accept: 'application/json, text/plain, */*', Authorization: 'Bearer ' + accessTkn,
                                  'cache-control': 'no-cache', pragma: 'no-cache',
                                  'tele2-user-agent': 'web', 'x-request-id': window.requestId }
                     })
              .then( function( response ) {
                response.json()
                .then( function( response ) {
                  if ( response.meta.status === 'OK' ) {
                    console.log( `[MB] Response for '.../balance': ${JSON.stringify( response )}` );
                    // Получаем значение текущего баланса
                    MBResult.Balance = parseFloat( response.data.value.toFixed(2) );

                    fetch( window.location.origin + `/api/subscribers/7${MBLogin}/tariff`,
                           { method: 'GET', mode: 'cors', credentials: 'include',
                             headers: { Accept: 'application/json, text/plain, */*', Authorization: 'Bearer ' + accessTkn,
                                        'cache-control': 'no-cache', pragma: 'no-cache',
                                        'tele2-user-agent': 'web', 'x-request-id': window.requestId }
                           })
                    .then( function( response ) {
                      response.json()
                      .then( function( response ) {
                        if ( response.meta.status === 'OK' ) {
                          console.log( `[MB] Response for '.../tariff': ${JSON.stringify( response )}` );
                          // Получаем брэнд-наименование тарифного плана
                          MBResult.TarifPlan = response.data.frontName;

                          fetch( window.location.origin + `/api/subscribers/7${MBLogin}/${siteId}/services?status=connected`,
                                 { method: 'GET', mode: 'cors', credentials: 'include',
                                   headers: { Accept: 'application/json, text/plain, */*', Authorization: 'Bearer ' + accessTkn,
                                              'cache-control': 'no-cache', pragma: 'no-cache',
                                              'tele2-user-agent': 'web', 'x-request-id': window.requestId }
                                 })
                          .then( function( response ) {
                            response.json()
                            .then( function( response ) {
                              if ( response.meta.status === 'OK' ) {
                                console.log( `[MB] Response for '.../services?status=connected': ${JSON.stringify( response )}` );
                                // Получаем состав подключённых услуг, разделяем их на бесплатные и платные
                                response.data.forEach( function( item ) {
                                  if ( item.abonentFee.amount > 0 ) {
                                    ++paidCounter; // Для услуг с ежедневной оплатой принимаем стоимость услуги как сумму за 30 дней
                                    paidAmmount += parseInt( item.abonentFee.amount ) * ( (item.abonentFee.period === 'day') ? 30 : 1 );
                                  }
                                  else ++freeCounter;
                                });

                              fetch( window.location.origin + `/api/subscribers/7${MBLogin}/subscription`,
                                     { method: 'GET', mode: 'cors', credentials: 'include',
                                       headers: { Accept: 'application/json, text/plain, */*', Authorization: 'Bearer ' + accessTkn,
                                                  'cache-control': 'no-cache', pragma: 'no-cache',
                                                  'tele2-user-agent': 'web', 'x-request-id': window.requestId }
                                     })
                              .then( function( response ) {
                                response.json()
                                .then( async function( response ) {
                                  if ( response.meta.status === 'OK' ) {
                                    console.log( `[MB] Response for '.../subscription': ${JSON.stringify( response )}` );
                                    // Получаем состав подключённых подписок, разделяем их на бесплатные и платные
                                    response.data.forEach( function( item ) {
                                      if ( !isNaN( parseInt( item.cost ) ) && ( parseInt( item.cost ) > 0 ) ) {
                                        ++paidCounter; // Для подписок с ежедневной оплатой принимаем стоимость подписки как сумму за 30 дней
                                        paidAmmount += parseInt( item.cost ) * ( (item.period === 'day') ? 30 : 1 );
                                      }
                                      else ++freeCounter;
                                    });
                                    // Отражаем состав услуг в формате: 'количество бесплатных' / 'количество платных' / (сумма по платным)
                                    MBResult.UslugiOn = `${String(freeCounter)} / ${String(paidCounter)} (${paidAmmount.toFixed(2)})`;

                                    // Подготавливаем к передаче расширению значения токенов для сохранения (сессии для текущих учётных данных)
                                    currentTokens.renew = true; // Запрос должен записать / обновить в учётных данных значения токенов
                                    currentTokens.access_token = await cookieStore.get( 'access_token' );
                                    currentTokens.refresh_token = await cookieStore.get( 'refresh_token' );
                                    initLogout(); // Выходим из личного кабинета. Страницу на следующем шаге перезагрузит расширение
                                  } // meta.status === 'OK' для запроса '/api/subscribers/.../subscription'
                                })
                                .catch( function( err ) { fetchError( `Error getting JSON for '/api/subscribers/.../subscription': ${response.message}` );
                                                          initLogout(); // Выходим из личного кабинета
                                                        } )
                              })
                              .catch( function( err ) { fetchError( `Fetch error getting '/api/subscribers/.../subscription' ${response.code}: ${response.message}` );
                                                        initLogout(); // Выходим из личного кабинета
                                                      } )
                              } // meta.status === 'OK' для запроса '/api/subscribers/.../services?status=connected'
                            })
                            .catch( function( err ) { fetchError( `Error getting JSON for '/api/subscribers/.../services?status=connected': ${response.message}` );
                                                      initLogout(); // Выходим из личного кабинета
                                                    } )
                          })
                          .catch( function( err ) { fetchError( `Fetch error getting '/api/subscribers/.../services?status=connected' ${response.code}: ${response.message}` );
                                                    initLogout(); // Выходим из личного кабинета
                                                  } )
                        } // meta.status === 'OK' для запроса '/api/subscribers/.../tariff'
                      })
                      .catch( function( err ) { fetchError( `Error getting JSON for '/api/subscribers/.../tariff': ${response.message}` );
                                                initLogout(); // Выходим из личного кабинета
                                              } )
                    })
                    .catch( function( err ) { fetchError( `Fetch error getting '/api/subscribers/.../tariff' ${response.code}: ${response.message}` );
                                              initLogout(); // Выходим из личного кабинета
                                            } )
                  } // meta.status === 'OK' для запроса '/api/subscribers/.../balance'
                })
                .catch( function( err ) { fetchError( `Error getting JSON for '/api/subscribers/.../balance': ${response.message}` );
                                          initLogout(); // Выходим из личного кабинета
                                        } )
              })
              .catch( function( err ) { fetchError( `Fetch error getting '/api/subscribers/.../balance' ${response.code}: ${response.message}` );
                                        initLogout(); // Выходим из личного кабинета
                                      } )
            } // meta.status === 'OK' для запроса '/api/subscribers/.../rests'
          })
          .catch( function( err ) { fetchError( `Error getting JSON for '/api/subscribers/.../rests': ${response.message}` );
                                    initLogout(); // Выходим из личного кабинета
                                  } )
        })
        .catch( function( err ) { fetchError( `Fetch error getting '/api/subscribers/.../rests' ${response.code}: ${response.message}` );
                                  initLogout(); // Выходим из личного кабинета
                                } )
      } // meta.status === 'OK' для запроса '/api/subscribers/.../profile'
    })
    .catch( function( err ) { fetchError( `Error getting JSON for '/api/subscribers/.../profile': ${response.message}` );
                              initLogout(); // Выходим из личного кабинета
                            } )
  })
  .catch( function( err ) { fetchError( `Fetch error getting '/api/subscribers/.../profile' ${response.code}: ${response.message}` );
                            initLogout(); // Выходим из личного кабинета
                          } )
}