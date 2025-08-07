/* T2_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для оператора связи T2 (ранее Tele2) через API
 * Редакция:  2025.08.07
 *
*/

const maxRetries = 5; // Количество повторных попыток API-запросов при ошибках их выполнения 
let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;
let MBLogin = undefined;
let MBcurrentNumber = undefined;  // Индекс позиции учётных данных в списке опроса
let currentTokens = { renew: false }; // Для обновления токенов через ответ раширению в 'detail'. По умолчанию их обновлять не нужно.
let antiBotParam, challenge, solvingStart, tmp;

chrome.runtime.onMessage.addListener( async function( request, sender, sendResponse ) {
//----------------------------------
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBLogin = request.login;
      MBcurrentNumber = request.accIdx;
      // Проверяем не попали ли на страницу антибот-проверки, делаем это только на начальном этапе работы плагина
      if ( ( window.location.origin.includes( 't2.ru' ) ) && ( request.action === 'log&pass' ) ) {
        // Получаем html-текст страницы
        antiBotParam = document.body.innerHTML;
        // Ищем на ней объявление переменной 'window.ctx' в составе текста встроенного скрипта
        antiBotParam = antiBotParam.split( `window.ctx='` )[ 1 ];
        // Если переменная 'window.ctx' нашлась, значит точно находимся на странице антибот-проверки браузера
        if ( antiBotParam !== undefined ) {
/*
          // Отбрасываем в строке параметров 'хвост' от записи из переменной ...
          antiBotParam = antiBotParam.split( `';` )[ 0 ];
          // ... декодируем результат через 'decodeURIComponent' и разобираем строку на единичные переменные ...
          tmp = decodeURIComponent( antiBotParam ).split( '&' );
          // ... собираем полученные переменные в объект
          antiBotParam = {};
          for ( let paramStr of tmp ) {
            let param = paramStr.split( '=' );
            antiBotParam[ param[ 0 ] ] = param.slice( 1 ).join( '=' );
          }
          solvingStart = Date.now();  // Фиксируем время начала проверки
          // Запрашиваем у сервера параметры для выполнения расчёта контрольных значений
          try {
            tmp = await fetch( window.location.origin + antiBotParam.challenge_url,
                               { method: 'GET', mode: 'cors', credentials: 'include',
                                 headers: { [ antiBotParam.settings_header ]: antiBotParam.settings }
                               });
          }
          catch( err ) {
            fetchError( `Error fetching challenge parameters: ${err}, status-code: ${tmp.status}\r\nURL: ${window.location.origin + antiBotParam.challenge_url}\r\nheaders: '${antiBotParam.settings_header}': '${antiBotParam.settings}'` );
            // Передаём результаты опроса расширению MobileBalance
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
            return true;
          }
          // Сохраняем значение 'x-ngenix-bcd' из 'headers' ответа для использования как 'x-ngenix-bcc' в следующем вызове
          try {
            antiBotParam.settings = await tmp.headers.get( antiBotParam.state_header );
          }
          catch( err ) {
            fetchError( `Error reading 'x-ngenix-bcd' header: ${err}` );
            // Передаём результаты опроса расширению MobileBalance
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
            return true;
          }
          challenge = await tmp.json()  // Считываем параметры для расчёта контрольных значений
          .catch( function(err) {
            fetchError( `Error reading challenge parameters result: ${err}` );
            // Передаём результаты опроса расширению MobileBalance
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
            return true;
          });
          // Запрашиваем у расширения вызов дочернего helper-модуля для выполнения расчёта контрольных значений
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_helperClaim', args: challenge }, null );
          return true;
*/

          console.log( `[MB] Waiting for page reloading...` );
          // Устанвливаем контроль обновления страницы с 'passive = true' - не отменять поведение события по умолчанию
          // Отменять поведение события по умолчанию для 'beforeunload' нельзя - появится 'alert'-запрос подтверждения ухода со страницы
          window.addEventListener( 'beforeunload', beforeunloadListener, { passive: true } );
          // Запрашиваем у расширения вызов дочернего helper-модуля для эмуляции активности вкладки. Ответ не предполагается
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_helperClaim', args: { activateTab: true } }, null );
          return true;

        }
      }

      switch( request.action ) {
/*
        case 'helperResult': {

          // Формат структуры правильного ответа дочернего helper-модуля в 'request.helper': { data: <any data>, respond: <boolean> }
          //  data = данные результата работы вспомогательного модуля, формат - необходимый для дальнейшей работы
          //  respond = true. Не учитываем его, это флаг вспомогательного модуля 'направить ответ плагину-родителю'

          // Если работа helper-модуля была успешной, то ожидаем завершения антибот-проверки и перезагрузки страницы
          if ( request.helper !== undefined ) {
            // Отправляем серверу объект с результатами расчёта контрольных значений
            try {
              tmp = await fetch( window.location.origin + antiBotParam.challenge_url,
                                 { method: 'POST', mode: 'cors', credentials: 'include',
                                   body: JSON.stringify( request.helper.data ),
                                   headers: { [ antiBotParam.settings_header ]: antiBotParam.settings }
                    })
            }
            catch( err ) {
              fetchError( `Error sending challenge solution: ${err}` )
              // Передаём результаты опроса расширению MobileBalance
              chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
              return true;
            }
            if ( tmp.status === 205 ) {
              // Вычисляем время, оставшееся после запросов и расчётов до минимально заданного (min_display = 1.5 сек) ...
              let delayTime = antiBotParam.min_display - ( Date.now() - solvingStart );
              if ( delayTime > 0 )  // ... если оно ещё не закончилось, то выполняем задержку до его полного истечения ...
                await new Promise( resolve => setTimeout( resolve, delayTime ) );
              // ... и добавляем дополнительную задержку 0.5 сек, чтобы сервер точно успел обработать результат проверки
              await new Promise( resolve => setTimeout( resolve, 500 ) );

              // Перезагружаем страницу, в предположении, что антибот-проверка пройдена и будет загружена страница сайта
//              fetchError( `Bot-challenge detected, reloading page` ); // Запрашиваем у расширения повтор этапа запроса
//              chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_repeatCurrentPhase', error: requestError, accIdx: MBcurrentNumber }, null );
//              document.location.reload();
//              return true;

              // Конструируем новый URL, его присвоение 'document.location' вызовет перезагрузку страницы
              let newURL = new URL( document.location.href );
              let param = 'utm_referrer';
              ( !document.referrer || newURL.searchParams.has( param ) || ( document.location == document.referrer ) ) ?
                document.location.reload() :
                ( newURL.searchParams.set( param, document.referrer ), document.location = newURL.href );

            }


//            console.log( `[MB] Waiting for page reloading...` );
            // Устанвливаем контроль обновления страницы с 'passive = true' - не отменять поведение события по умолчанию
            // Отменять поведение события по умолчанию для 'beforeunload' нельзя - появится 'alert'-запрос подтверждения ухода со страницы
//            window.addEventListener( 'beforeunload', beforeunloadListener, { passive: true } );
//            // Запрашиваем у расширения вызов дочернего helper-модуля для эмуляции активности вкладки. Ответ не предполагается
//            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_helperClaim', args: { activateTab: true } }, null );

            return true;
          }
          else {  // При неуспешнном результате работы helper-модуля заканчиваем с ошибкой - антибот-проверка не пройдена ...
            fetchError( `Helper result unsuccessful or 'undefined'` );            // ... и страница сайта не будет открыта
            // Передаём результаты опроса расширению MobileBalance
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
            return true;
          }

          break;
        }
*/
        case 'log&pass': {
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
                return true;
              }
              else { // Закрываем текущую сессию удалением токенов в cookie
                fetchError( `Рrevious session for '${prevAccount}' was not closed. Closing it now...` );
                await cookieStore.delete( { name: 'access_token', domain: 't2.ru', path: '/' } );
                await cookieStore.delete( { name: 'refresh_token', domain: 't2.ru', path: '/' } );
                // При завершении этапа расширение выполнит переход на страницу входа 'finishUrl' и страница загрузится без прежней сессии
                chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
                return true;
              }
            }
            // Ищем на странице элемент с набором ссылок-пунктов меню, а в нём - элемент ссылки входа в личный кабинет
            let desktopMenu = Array.from( document.getElementsByTagName( 'span' ) );
            if ( desktopMenu.length > 0 )
              desktopMenu = desktopMenu.find( function( item ) { return item.innerText.includes( 'ВОЙТИ' ) });
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
                return true;
              }
              else { // Инициируем загрузку формы ввода учётных данных и ожидаем их ввода пользователем (включая код из SMS или письма на эл. почту)
                desktopMenu.click();
                do { await sleep( 100 ); // Дожидаемся завершения загрузки формы авторизации. По умолчанию на ней активна 'вкладка' входа по SMS
                } while ( ( !document.getElementsByTagName( 'html' )[ 0 ].classList.contains( 'modal-dialog-opened' ) ) &&
                          ( document.getElementsByTagName( 'form' ).length > 0 ) );
                await sleep( 200 );                                                             // Задержка, чтобы дать время на инициализацию структур формы
                let loginDigits = Array.from( MBLogin );                                        // Преобразовываем номер учётных данных в раздельные символы
                let phoneNumDigits = document.getElementsByTagName( 'form' )[ 0 ].getElementsByTagName( 'input' );  // Получаем поля ввода с формы авторизации
                for ( let i = 1; i <= 10; ++i ) {
                  phoneNumDigits[ 'phoneNumber' + i ].setAttribute( 'value', loginDigits[ i - 1 ] );              // Вносим символы номера учётных данных в поля ввода
                  phoneNumDigits[ 'phoneNumber' + i ].dispatchEvent( new Event( 'change', { bubbles: true } ) );  // Инициируем приём и обработку значения формой
                }
                return true;
                // После успешной авторизации должна быть открыта страница личного кабинета (то есть страница обновится и этот экземпляр скрипта будет утрачен)
              } // При отсутствии действий пользователя, ошибках авторизаци = превышении времени ожидания авторизации, расширение прекратит опрос по этим учётным данным
            }
            // Если иы попали в эту точку, то предыдущие условия не отаботали и главная страница (страница авторизации) не открыта. Значит есть ошибки навигации или сервер не отвечает
            fetchError( 'Login page error or server not responding' );
            // Передаём результаты опроса расширению MobileBalance
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
            return true;
          }
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
    else return true;
  }
  catch( err ) { fetchError( err.toString() ) }
})


function fetchError( err ) {
//       ----------
  requestStatus = false;
  requestError = err;
  console.log( `[MB] ${requestError}` );
}


function beforeunloadListener( evnt ) {
//       --------------------
  window.removeEventListener( 'beforeunload', beforeunloadListener );                 // Снимаем контроль обновления страницы
  console.log( requestError = `Bot-challenge seems to be passed, page reloading` );   // Запрашиваем у расширения повтор этапа запроса
  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_repeatCurrentPhase', error: requestError, accIdx: MBcurrentNumber }, null );
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
  else {
    // Токены сохраним уже на этом этапе. Если дальше в запросах будут ошибки, то расширение сохранит токены для последующей авторизации
    currentTokens.access_token = accessTkn;
    currentTokens.refresh_token = await cookieStore.get( 'refresh_token' );
    currentTokens.renew = true; // Запрос должен записать / обновить в учётных данных значения токенов
    accessTkn = accessTkn.value;
  }
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
                  let Internet = 0, Minutes = 0, SMS = 0;
                  for ( let i = 0; i < response.data.rests.length; i++  ) {
                    if ( ( ( MBResult.TurnOffStr === undefined ) || ( MBResult.TurnOffStr === '' ) ) &&   // Забираем дату следующего платежа в формате 'DD.MM.YYYY',
                         ( response.data.rests[ i ].endDay !== undefined ) ) {                            // если это ещё не сделано в предыдущих циклах и дата вообще есть
                      let endDayStr = response.data.rests[ i ].endDay.split( 'T' )[ 0 ].split( '-' );
                      MBResult.TurnOffStr = `${endDayStr[ 2 ]}.${endDayStr[ 1 ]}.${endDayStr[ 0 ]}`;
                    }
                    switch ( response.data.rests[ i ].uom.toUpperCase() ) {
                      case 'MB': { // Остатки пакета интернет. Исходное значение для расширения - мегабайты, оставляем значение
                        if ( response.data.rests[ i ].status.toUpperCase() !== 'BLOCKED' ) {              // Если пакет не заблокирован...
                          if ( response.data.rests[ i ].unlimited )  MBResult.Internet = -1               // Если опция безлимитная, то возвращаем значение -1
                          else {
                            if ( !response.data.rests[ i ].roamingPackage )                               // Добавляем значение, если пакет не является роуминговым остатком
                              Internet += parseFloat( ( response.data.rests[ i ].remain ).toFixed(3) )
                          }
                        }
                        break; }
                      case 'MIN': { // Остатки пакета минут
                        if ( response.data.rests[ i ].status.toUpperCase() !== 'BLOCKED' ) {              // Если пакет не заблокирован...
                          if ( response.data.rests[ i ].unlimited )  MBResult.Minutes = -1                // Если опция безлимитная, то возвращаем значение -1
                          else {
                            if ( !response.data.rests[ i ].roamingPackage )                               // Добавляем значение, если пакет не является роуминговым остатком
                              Minutes += response.data.rests[ i ].remain
                          }
                        }
                        break; }
                      case 'PCS': { // Остатки пакета SMS
                        if ( response.data.rests[ i ].status.toUpperCase() !== 'BLOCKED' ) {              // Если пакет не заблокирован...
                          if ( response.data.rests[ i ].unlimited )  MBResult.SMS = -1                    // Если опция безлимитная, то возвращаем значение -1
                          else {
                            if ( !response.data.rests[ i ].roamingPackage )                               // Добавляем значение, если пакет не является роуминговым остатком
                              SMS += response.data.rests[ i ].remain
                          }
                        }
                        break; }
                    } // switch
                  }
                  // Заносим значения остатков в ответ для расширения
                  if ( Internet > 0 ) MBResult.Internet = parseFloat( ( Internet ).toFixed(3) );
                  if ( Minutes > 0 )  MBResult.Minutes  = Minutes;
                  if ( SMS > 0 )      MBResult.SMS      = SMS;
                  // Если есть стоимость тарифа, то добавляем её. Если среди сервисов и подписок есть платные, то эта стоимость далее будет дополнена
                  if ( ( response.data.tariffCost !== undefined ) && ( response.data.tariffCost.amount !== undefined ) )
                    paidAmmount = parseFloat( ( response.data.tariffCost.amount ).toFixed(2) );
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
