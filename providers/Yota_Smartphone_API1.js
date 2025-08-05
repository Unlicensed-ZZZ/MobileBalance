/* Yota_Smartphone_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для оператора связи Yota через API
 * Редакция:  2025.08.05
 *
*/

const maxRetries = 5; // Количество повторных попыток API-запросов при ошибках их выполнения 
let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;
let MBLogin = undefined;
let currentToken = { renew: false }; // Для обновления токена через ответ раширению в 'detail'. По умолчанию его обновлять не нужно.

chrome.runtime.onMessage.addListener( async function( request, sender, sendResponse ) {
//----------------------------------
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      MBextentionId = sender.id;
      MBLogin = request.login;
      switch ( request.action ) {
        case 'log&pass': {
          //  При входе на 'web.yota.ru' при отсутствии авторизации попадаем на страницу '/login', при активной авторизации - на страницу '/profile'.
          //  При авктивной авторизации на странице есть меню перехода / выхода - элемент кнопки с классом 'authorized-menu__btn'. В нём - вложенный
          //  элемент 'span' с innerText = номеру текущих учётных данных. При отсутствии авторизации элемента с классом 'authorized-menu__btn' нет.
          if ( window.location.origin.includes( 'web.yota.ru' ) ) {                             // Если стартовая страница сайта открылась ...
            if ( window.location.pathname === '/profile' ) {                                    // ... и есть текущая авторизация в личном кабинете
              let prevAccount = document.getElementsByClassName( 'authorized-menu__btn' );
              if ( prevAccount.length > 0 ) {
                // В меню перехода / выхода учётные данные показаны в формате '+7 111 222 33 44'. Приводим их к виду '1112223344', пригодному для сравнения
                prevAccount = prevAccount[ 0 ].firstChild.innerText.replaceAll( ' ', '' ).slice( 2 );
                if ( prevAccount === MBLogin ) {                                                // Если сессия открыта для нужных нам учётных данных ...
                  window.location.reload();                                                     // ... то мы уже на странице ЛК, переходим к этапу опроса
                  return;
                }
                else {                                                                          // Если сессия открыта для других учётных данных ...
                  fetchError( `Рrevious session for '${prevAccount}' was not closed. Closing it now...` );
                  await cookieStore.delete( { name: 'token', path: '/' } );                     // ... то закрываем сессию удалением токена в cookie
                  // При завершении этапа расширение выполнит переход на страницу входа 'finishUrl' и страница загрузится без прежней сессии
                  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
                  return;
                }
              }
            }
            else { // Активной авторизации нет
              if ( window.location.pathname === '/login' ) {                                      // Должны находиться на странице '/login'
                if ( ( request.detail !== undefined ) &&                                          // Если в дополнительных параметрах передан ранее сохранённый токен ...
                     ( request.detail.token !== undefined ) &&                                    // ... и он имеет значение (не пустая строка), то вносим его в cookie, ...
                     ( request.detail.token !== '' ) ) {                                          // ... восстанавливая сессию, ранее открытую для учётных данных
                  console.log( `[MB] Attempting to authorize as '${MBLogin}' ...` );
                  await cookieStore.set( { 'name': 'token', 'value': request.detail.token, path: '/' } );
                  window.location.replace( window.location.origin + '/profile' );                 // Переходим на страницу личного кабинета, этот экземпляр скрипта будет утрачен
                  return;
                }
                else { // Вносим в поле ввода учётные данные, ожидаем их отправку и последующий ввод пароля (код из SMS) пользователем
                  let phoneNumber = document.getElementsByTagName( 'form' )[ 0 ].getElementsByTagName( 'input' )[ 0 ];  // Получаем поле ввода с формы авторизации
                  phoneNumber.dispatchEvent( new Event( 'focusin', { bubbles: true } ) );
                  phoneNumber.value = MBLogin;
                  phoneNumber.dispatchEvent( new Event( 'input', { bubbles: true } ) );
                  return;
                  // После успешной авторизации должна быть открыта страница личного кабинета (то есть страница обновится и этот экземпляр скрипта будет утрачен)
                } // При отсутствии действий пользователя, ошибках авторизаци = превышении времени ожидания авторизации, расширение прекратит опрос по этим учётным данным
              }
            }
          }
          // Если иы попали в эту точку, то предыдущие условия не отаботали и страница сайта не была открыта. Значит есть ошибки навигации или сервер не отвечает
          fetchError( 'Login page error or server not responding' );
          // Передаём результаты опроса расширению MobileBalance
          chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError, data: undefined }, null );
          return;
          break;
        }
        case 'polling': {
          setTimeout( function() {    // Задержка, чтобы страница успела прогрузиться и не забивала на сервере
            getData();                //   очередь своими запросами - в неё пойдут и запросы от скрипта
          }, 200);
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
  // Закрываем текущую сессию удалением токена в cookie (если он был)
  await cookieStore.delete( { name: 'token', path: '/' } );
  // Передаём результаты зароса расширению
  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: requestStatus, error: requestError,
                                               data: (MBResult === undefined) ? undefined : MBResult,
                                               detail: ( currentToken.renew ) ? currentToken : undefined,
                                             }, null );
}


async function getData() {
//             ---------
  let Tkn = await cookieStore.get( 'token' );
  // Проверяем, находимся ли странице личного кабинета 'web.yota.ru/profile' (прошла ли авторизация)
  if ( !window.location.href.includes( '/profile' ) ) {   // Если не попали на 'web.yota.ru/profile' ...
    if ( Tkn === null ) {                                 // ... то если токена нет, то скорее всего предложенный сохранённый токен отвергнут и запрашивается авторизация
      fetchError( `Authorization needed or server not responding` );
      // Токена нет, запрос обновления должен удалить в учётных данных неактуальное значение
    }
    else {  // Если токен есть, то это нештатная ситуация, то токен попробуем сохранить и использовать в следующем запросе по этим учётным данным
      fetchError( `Account page error or server not responding` );
      currentToken.token = Tkn.value;
      // Запрос должен записать / обновить в учётных данных значение токена
    }
    currentToken.renew = true; // Токена нет, запрос обновления должен удалить в учётных данных неактуальное значение
    initLogout(); // Выходим из личного кабинета
    return;
  }
  else
    Tkn = Tkn.value;
  let siteId = undefined;
  let freeCounter = 0, paidCounter = 0, paidAmmount = 0;
  // Получаем базовый URL для API-запросов
  let apiUrl = ( await ( await fetch( window.location.origin + `/settings.json`, { method: 'GET', mode: 'cors', credentials: 'omit' } ) ).json() ).api_url;

  fetch( apiUrl + `/customer/profile`,
         { method: 'GET', mode: 'cors', credentials: 'omit',
           headers: { Accept: 'application/json, text/plain, */*', Build: '1.0', Platform: '4', OSVersion: 'chromium-137',
                      'X-Secure-Authorization': 'Basic ' + (await cookieStore.get( 'token' )).value,
                      'X-Transactionid': `${hexGen( 8 )}-${hexGen( 4 )}-${hexGen( 4 )}-${hexGen( 4 )}-${hexGen( 12 )}}`
                    }
         })
  .then( function( response ) {
    response.json()
    .then( async function( response ) {
      console.log( `[MB] Response for '.../profile': ${JSON.stringify( response )}` );

      // Получаем значение текущего баланса
      MBResult = { Balance: parseFloat( response.carrierProfile.balance.toFixed(2) ) }; // Создаём 1-ое значение объекта ответа
      // Получаем статус блокировки
      MBResult.BlockStatus = ( response.context.features.carrierClientStatus.toUpperCase() !== 'ACTIVE' ) ? 'Blocked' : '';

      fetch( apiUrl + `/customer/carrierProductsProfile`,
             { method: 'GET', mode: 'cors', credentials: 'omit',
               headers: { Accept: 'application/json, text/plain, */*', Build: '1.0', Platform: '4', OSVersion: 'chromium-137',
                          'X-Secure-Authorization': 'Basic ' + (await cookieStore.get( 'token' )).value,
                          'X-Transactionid': `${hexGen( 8 )}-${hexGen( 4 )}-${hexGen( 4 )}-${hexGen( 4 )}-${hexGen( 12 )}}`
                        }
             })
      .then( function( response ) {
        response.json()
        .then( async function( response ) {
          console.log( `[MB] Response for '.../carrierProductsProfile': ${JSON.stringify( response )}` );

          // Если есть блоки параметров в разделе 'products', то разбираем пакеты остатков
          if ( ( response.currentProductConfiguration.products !== undefined ) && ( response.currentProductConfiguration.products.length > 0 ) ) {
            response.currentProductConfiguration.products.forEach( function( item0 ) {
              // Забираем дату следующего платежа в формате 'DD.MM.YYYY', если это ещё не сделано в предыдущих циклах
              if ( ( MBResult.TurnOffStr === undefined ) || ( MBResult.TurnOffStr === '' ) && ( item0.nextPayDateTime !== undefined ) ) {
                let endDayStr = item0.nextPayDateTime.split( 'T' )[ 0 ].split( '-' );
                MBResult.TurnOffStr = `${endDayStr[ 2 ]}.${endDayStr[ 1 ]}.${endDayStr[ 0 ]}`;
                // Если в текущем блоке определена стоимость услуг, то берём её для вывода в строке состава услуг (далее)
                if ( item0.cost.finalCost !== undefined )
                  paidAmmount = parseFloat( item0.cost.finalCost.toFixed(2) );
              }
              // Собираем значения остатков в пакетах
              item0.resources.forEach( function( item1 ) {
                switch (item1.resourceType.toUpperCase() ) {
                  case 'DATA': { // Остатки пакета интернет. Исходное значение для расширения - мегабайты
                    item1.characteristicsList.forEach( function( item1_1 ) {
                      if ( item1_1.fixedValue.accumulator.isUnlim )  MBResult.Internet = -1     // Если опция безлимитная, то возвращаем значение -1
                      else {
                        let ratio = 1; // Приводим значение к мегабайтам (размерность для ответа расширению)
                        switch ( item1_1.fixedValue.accumulator.unit ) {
                          case 'KB': {
                            ratio = 0.0009765625; // Приводим значение к мегабайтам. Множитель = 1 / 1024 = 0.0009765625
                            break; }
                          case 'MB': {
                            ratio = 1;            // Входное значение для расширения - мегабайты. Множитель = 1
                            break; }
                          case 'GB': {
                            ratio = 1024;         // Приводим значение к мегабайтам. Множитель = 1024
                            break; }
                        }
                        MBResult.Internet = parseFloat( ( item1_1.fixedValue.accumulator.value * ratio ).toFixed(3) );
                      }
                    })
                    break; }
                  case 'VOICE': { // Остатки пакета минут
                    item1.characteristicsList.forEach( function( item1_2 ) {
                      if ( item1_2.fixedValue.accumulator.isUnlim )  MBResult.Minutes = -1      // Если опция безлимитная, то возвращаем значение -1
                      else
                        MBResult.Minutes = item1_2.fixedValue.accumulator.value;
                    })
                    break; }
 /* --- !!! В тестируемом тарифе блока SMS не было, не проверено !!! --- */
                  case 'UNIT': { // Остатки пакета SMS
                    item1.characteristicsList.forEach( function( item1_3 ) {
                      if ( item1_3.fixedValue.accumulator.isUnlim )  MBResult.SMS = -1          // Если опция безлимитная, то возвращаем значение -1
                      else
                        MBResult.SMS = item1_3.fixedValue.accumulator.value;
                    })
                    break; }
                } // switch
              })
            })
          }

          fetch( apiUrl + `/vas/subscriptions`,
                 { method: 'GET', mode: 'cors', credentials: 'omit',
                   headers: { Accept: 'application/json, text/plain, */*', Build: '1.0', Platform: '4', OSVersion: 'chromium-137',
                              'X-Secure-Authorization': 'Basic ' + (await cookieStore.get( 'token' )).value,
                              'X-Transactionid': `${hexGen( 8 )}-${hexGen( 4 )}-${hexGen( 4 )}-${hexGen( 4 )}-${hexGen( 12 )}}`
                            }
                 })
          .then( function( response ) {
            response.json()
            .then( async function( response ) {
              console.log( `[MB] Response for '.../subscriptions': ${JSON.stringify( response )}` );

              // Собираем данные по платным / бесплатным сервисам
              response.forEach( function( item ) {
                if ( item.status.toUpperCase() == 'SUBSCRIBED' ) {
                  if ( item.cost.finalCost > 0 ) {
                    ++paidCounter;
                    paidAmmount += parseFloat( item.cost.finalCost.toFixed(2) );
                  }
                  else
                    ++freeCounter;
                }
              })
              // Формируем строку в формате: 'бесплатные' / 'платные' / (сумма по платным)
              MBResult.UslugiOn = `${freeCounter} / ${paidCounter} (${paidAmmount.toFixed(2)})`;

              // Подготавливаем к передаче расширению значение токене для сохранения (сессия для текущих учётных данных)
              currentToken.renew = true; // Запрос должен записать / обновить в учётных данных значение токена
              currentToken.token = ( await cookieStore.get( 'token' ) ).value;
              initLogout(); // Выходим из личного кабинета. Страницу на следующем шаге перезагрузит расширение

            })
            .catch( function( err ) { fetchError( `Error getting JSON for '.../subscriptions': ${response.message}` );
                                      initLogout(); // Выходим из личного кабинета
                                    } )
          })
          .catch( function( err ) { fetchError( `Fetch error getting '.../subscriptions' ${response.code}: ${response.message}` );
                                    initLogout(); // Выходим из личного кабинета
                                  } )
        })
        .catch( function( err ) { fetchError( `Error getting JSON for '.../carrierProductsProfile': ${response.message}` );
                                  initLogout(); // Выходим из личного кабинета
                                } )
      })
      .catch( function( err ) { fetchError( `Fetch error getting '.../carrierProductsProfile' ${response.code}: ${response.message}` );
                                initLogout(); // Выходим из личного кабинета
                              } )
    })
    .catch( function( err ) { fetchError( `Error getting JSON for '.../profile': ${response.message}` );
                              initLogout(); // Выходим из личного кабинета
                            } )
  })
  .catch( function( err ) { fetchError( `Fetch error getting '.../profile' ${response.code}: ${response.message}` );
                            initLogout(); // Выходим из личного кабинета
                          } )

  // Генерация строки шестнадцатеричных значений в количестве указываемом в аргументу
  function hexGen( num = 4 ) {
  // ------------
    let result = [];
    for ( i = 0; i < num; ++i) {
      result.push( Math.floor( Math.random() * 16 ).toString( 16 ) )
    }
    return result.join().replaceAll( ',', '' );
  }

}
