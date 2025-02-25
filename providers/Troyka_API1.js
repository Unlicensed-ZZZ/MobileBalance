/* Troyka_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для кошелька карты 'Тройка' в 'mosmetro.ru' через API
 *            Логин - номер карты, пароль не используется
 * Редакция:  2024.11.20
 *
*/

let MBextentionId = undefined;
let requestError = '';
let MBResult = undefined;
let MBLogin = undefined;
let currentTokens = { renew: false }; // Для обновления токенов через ответ раширению в 'detail'. По умолчанию их обновлять не нужно
let authKeyPressed = false;           // На форме авторизации нажата кнопка = запрошена авторизация в личном кабинете


chrome.runtime.onMessage.addListener( async function( request, sender, sendResponse ) {
//----------------------------------
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBLogin = request.login;
      // Исходно проводится открытие страницы личного кабинета по startUrl = https://lk.mosmetro.ru/personal-cabinet
      // Если есть активная авторизация, то будет открыт личный кабинет с данными по ранее привязанным картам. Если
      //   авторизация не выполнена, то на странице присутствует кнопка для перехода на страницу авторизации.

      if ( window.location.origin.includes( 'auth.mosmetro.ru' ) ) {
        // Если активна страница авторизации, значит мы открыли её на предыдущем шаге при неудачной попытке авторизации
        //   (первый вход и сохранённых токенов ещё нет или токены устарели). Нужно ждать ввода данных пользователем.
        //   После успешного прохождения авторизации должен произойти переход на страницу личного кабинета

        // На все кнопки формы устанавливаем контроль нажатия. Эти обработчики далее нигде не снимаем - они уйдут при обновлении страницы
        document.querySelectorAll( 'button' ).forEach( function( item ) {
          item.addEventListener( 'click', clickListener, true )   // Обрабатывать событие 'click' нужно сначала в нашей функции (useCapture = true)
        });
        // Устанвливаем контроль обновления страницы с 'passive = true' - не отменять поведение события по умолчанию
        // Отменять поведение события по умолчанию для 'beforeunload' нельзя - появится 'alert'-запрос подтверждения ухода со страницы
        window.addEventListener( 'beforeunload', beforeunloadListener, { passive: true } );
        return;   // Ждём обновления страницы при переходе в личный кабинет после авторизации. Авторизацию предполагаем выполненной при нажатии
                  //   кнопки на форме. В этом случае запросим у расширения повтор текущего этапа запроса перед обновлением страницы.
                  // Если пользователь не авторизуется за отведённое время, то расширение завершит запрос по таймауту.
      }

      function clickListener( evnt ) {
//             -------------
        authKeyPressed = true; // Устанавливаем флаг нажатия кнопки на форме авторизации
      };

      function beforeunloadListener( evnt ) {
//             --------------------
        window.removeEventListener( 'beforeunload', beforeunloadListener );         // Снимаем контроль обновления страницы
        if ( authKeyPressed ) {                                                     // Если на странице была нажата кнопка,
          console.log( requestError = `[MB] Trying to check authtorization` );      // то запрашиваем у расширения повтор этапа запроса
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_repeatCurrentPhase', error: requestError }, null );
        }
      };

      switch ( request.action ) {
        case 'log&pass': {
          if ( window.location.origin.includes( 'lk.mosmetro.ru' ) ) {              // Если находимся на странице личного кабинета
            // На сгенерированной странице присутствует тэг <header>. Он на странице единственный
            //   <header _ngcontent-had-c32="" class="container_inner header no_auth">
            // При отсутствии авторизации в этом тэге есть класс 'no_auth', при успешной авторизации его нет
            if ( document.getElementsByTagName( 'header' )[ 0 ].classList.contains( 'no_auth' ) ) {
              if ( ( request.detail !== undefined ) &&                              // Если в дополнительных параметрах переданы ранее сохранённые токены
                   ( request.detail.access_token !== undefined ) &&                 // и они имеют значения (это не пустые строки), то записываем их в localStorage,
                   ( request.detail.access_token !== '' ) ) {                       // ... восстанавливая сессию ранее открытую для учётных данных
                console.log( `[MB] Attempting to authorize...` );
                // Восстанавливаем ранее сохранённые токены = проводим авторизацию
                await window.localStorage.setItem( 'passenger_access_token',  request.detail.access_token );
                await window.localStorage.setItem( 'passenger_refresh_token', request.detail.refresh_token );
                // Предпринимаем попытку обновить страницу личного кабинета, он должн открыться с авторизацией
                // Этот экземпляр плагина будет утрачен, расширение инициирует для него следующий этап - приём данных
                window.location.reload();
              }
              else { // Открываем страницу авторизации, расширение инициирует следующий этап - приём данных
                console.log( `[MB] Active authtorization was not detected on '${request.action}' stage` );
                // Переходим на страницу авторизации, этот экземпляр плагина будет утрачен
                window.location.replace( await window.localStorage.getItem( 'passenger_authorize_url' ) );
              }
            }
            else { // Если есть активная авторизация, то переходим к приёму данных
              window.location.reload()
            }
          }
          else { // Это не личный кабинет, видимо ошибка загрузки страницы
            console.log( requestError = `[MB] Page loading error or server not responding` );
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: false, error: requestError,
                                                         data: undefined, detail: undefined, }, null );
          }
          break;
        }
        case 'polling': {
          // Если авторизации в личном кабинете нет, значит кабинет отверг ранее сохранённые токены (требуется повторная авторизация)
          //   или ожидалась авторизация в личном кабинете, но она не была выполнена за отведённое время
          // Удаляем в расширении ранее сохранённые (неактуальные) токены и заканчиваем запрос. При следующем запросе будет запрошена
          //   авторизация и в случае успеха в расширении будут сохранены актуальные токены
          if ( ( !window.location.origin.includes( 'lk.mosmetro.ru' ) ) ||
               ( document.getElementsByTagName( 'header' )[ 0 ].classList.contains( 'no_auth' ) ) ) {
            console.log( requestError = `[MB] Active authtorization was not detected on '${request.action}' stage` );
            currentTokens.renew = true; // Расширение должно будет удалить в учётных данных неактуальные значения токенов
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: false, error: requestError,
                                                         data: undefined, detail: currentTokens, }, null );
            break;
          }
          // Считываем текущие значения токенов из localStorage. Ранее сохранённые токены здесь не используем - если есть авторизация,
          //   то в localStorage они и записаны, а если сохранённых токенов нет, то исходно их можно получить только из localStorage
          currentTokens.access_token  = await window.localStorage.getItem( 'passenger_access_token' );
          currentTokens.refresh_token = await window.localStorage.getItem( 'passenger_refresh_token' );
          let result = '';
          // Обновляем значения токенов для гарантии их актуальности - они могли быть изменены в ходе работы личного кабинета
          result = await (await fetch( window.location.origin + '/api/authorization/v1.0/refresh',
                                       { method: 'POST', mode: 'cors', credentials: 'include',
                                         body: `{ "refreshToken": "${currentTokens.refresh_token}" }`,
                                         headers: { 'authorization': `Bearer ${currentTokens.access_token}`,
                                                    'content-type': 'application/json' }
                                       })).json()
          // Сохраняем обновлённые значения токенов в localStorage и для передачи расширению на хранение для следующего запроса
          await window.localStorage.setItem( 'passenger_access_token',  currentTokens.access_token  = result.data.accessToken );
          await window.localStorage.setItem( 'passenger_refresh_token', currentTokens.refresh_token = result.data.refreshToken );
          currentTokens.renew = true; // Расширение должно будет записать / обновить в учётных данных обновлённые значения токенов

          // Получаем значения для карт, привязанных в личном кабинете
          result = await (await fetch( window.location.origin + '/api/carriers/v1.0/linked',
                                       { method: 'GET', mode: 'cors', credentials: 'include',
                                         headers: { 'authorization': `Bearer ${currentTokens.access_token}` }
                                       })).json()
          // Определяем блок параметров для требуемой карты
          result = result.data.cards.find( item => item.card.cardNumber === MBLogin )
          if ( result !== undefined ) { // Если карта с указанным номером есть в ответе, то получаем по ней значения
            // Получаем значение текущего баланса
            MBResult = { Balance: parseFloat( result.balance.balance.toFixed(2) ) }; // Создаём 1-ое значение объекта ответа
            // Принимаем статус блокировки. При статусах, отличных от активного, проставляем его
            if ( result.status.toUpperCase() !== 'ACTION' ) {
              MBResult.BlockStatus = result.status;
            };
            // По данным из 'main....js' (16.11.2024, 'lk.mosmetro.ru') статус карты может принимать следующие значения (надеюсь, сопоставлено правильно):
            // 'action'         = 'Активна'                 - Вашей картой можно оплачивать поездки на городском транспорте
            // 'transfer'       = 'Временно заблокирована'  - Ваша карта подготавливается для переноса баланса. Картой временно нельзя оплачивать поездки
            //                                                на городском транспорте
            // 'blocked'        = 'Заблокирована'           - Вашей картой нельзя оплачивать поездки на городском транспорте. Чтобы разблокировать карту,
            //                                                пожалуйста, обратитесь в один из сервисных центров (https://www.mosmetro.ru/info/service-center)
            // 'waitingCard'    = 'Готова к переносу'       - Вы можете переносить баланс этой карты на новую. После того, как вы это сделаете, карта будет
            //                                                заблокирована. Выполнить перенос возможно с помощью мобильного устройства с функцией NFC, кроме
            //                                                телефонов Apple, или через терминалы, установленные на всех станциях метро
            // 'waitingPayment' = 'Ожидает привязки'        - Ожидается подтверждение привязки карты к Вашей учетной записи. Для подтверждения привязки
            //                                                пополните карту на указанную сумму через приложение, в кассах или автоматах продажи проездных
            //                                                билетов метрополитена. Обратите внимание, что пополнение и его запись (для оплаты через
            //                                                приложение) должны быть выполнены до истечения времени отображаемого таймера
            // 'waitingConfirm' = 'Обработка привязки'      - В Системе выполняется проверка подтверждения привязки. Если подтверждение было выполнено, карта
            //                                                будет привязана к Вашей учетной записи. В противном случае, карта будет удалена из списка "Мои
            //                                                карты"
            // 'annulled'       = <'Аннулирована'>          - <Пояснения на сайте нет, но очевидно, что карта аннулирована>

            // Если есть сумма, ожидающая зачисления, то принимаем её
            if ( result.deferredActions !== undefined ) {
              result = result.deferredActions.find( item => item.operationName === 'КОШЕЛЕК' )
              if ( result !== undefined )
                MBResult.Balance2 = parseFloat( result.sum.toFixed(2) );
            }
            // Принимаем имя пользователя
            result = await (await fetch( window.location.origin + '/api/accounts/v1.0/info',
                               { method: 'GET', mode: 'cors', credentials: 'include',
                                 headers: { 'authorization': `Bearer ${currentTokens.access_token}` }
                               })).json();
            if ( ( result.data.userName !== undefined ) && ( result.data.userName !== '' ) )
              MBResult.UserName = result.data.userName;
          }
          else {
            console.log( requestError = `[MB] Card '${MBLogin}' is not linked to profile` );
          }

          // Выходим из личного кабинета, токены в localStorage (за исключением хранящих данные для последующего повторного входа) будут удалены
          document.getElementsByClassName( 'exit' )[ 0 ].click();     // Вызываем 'модальное окно' подтверждения выхода
          await new Promise( resolve => setTimeout( resolve, 100 ) )  // Задержка, чтобы успело сформироваться 'модальное окно'
          // 'Нажимаем' кнопку выхода в 'модальном окне'
          Array.from( document.getElementsByClassName( 'alert_button' ) ).find( item => item.textContent.toUpperCase() === 'ВЫЙТИ' ).click();
          // Передаём результаты зароса расширению
          setTimeout( function() {                                    // Задержка, чтобы успели отработать вызовы выхода из личного кабинета
            chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: true, error: requestError,
                                                         data: (MBResult === undefined) ? undefined : MBResult,
                                                         detail: ( currentTokens.renew ) ? currentTokens : undefined }, null );
          }, 300);
          break;
        }
      } // switch //
    }
    else return;
  }
  catch( err ) {
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: false, error: err.toString(), data: undefined }, null );
  }
})
