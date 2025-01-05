/* WiFire_API_inet.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для провайдера WiFire через API. Данные по Интернет-подключению
 * Редакция:  2024.03.20
 *
*/

let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;

chrome.runtime.onMessage.addListener( ( request, sender, sendResponse ) => {
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      let loginForm = document.getElementsByClassName( 'nbn-login-form' );
      switch ( request.action ) {
        case 'log&pass': {
          if ( loginForm !== undefined ) // Сайт не отвечает, страница не прогрузилась или изменена
            authInput( request.login, request.passw );
          break;
        }
        case 'polling': {
          MBextentionId = sender.id;
          getData();
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
//       -------------------------
  fetch( window.location.origin + '/api/v3/login',
         { method: 'POST',
           mode: 'same-origin',
           body: JSON.stringify( { accountNumber: login,
                                   login: login,
                                   password: passw,
                                   save: false,
                                   captchaCode: "",
                                   deviceInfo: { loginType: 'SITE' }
                                 } ),
           headers: { 'Content-Type': 'application/json' }
         }
       )
  .then( async function( response ) {
    let jsonResult = undefined;
    if ( response.ok ) {
      jsonResult = await response.json();
/*    При успешной авторизации структура ответа пустая, {}.
      Структура ответа при ошибке:
      { captcha : true, resultCode : 5, resultText : "Убедитесь, что вводите корректный номер Лицевого счета / Номер телефона или проверьте правильность ввода пароля." }
      { captcha : true, resultCode : 8, resultText : "Повторите с использованием проверочного кода." }
*/
      if ( ( jsonResult !== undefined ) && ( jsonResult.resultCode > 0 ) ) { // Ошибка авторизации, передаём результат расширению MobileBalance
        requestError = `Authorization error: ${jsonResult.resultText}`;
        console.log( '[MB] ' + requestError );
        chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData', status: false,
                                                     error: requestError, data: undefined }, null );
      }
      else {                       // Авторизация успешна, данные уже можно принимать. Но расширение ждёт обновления 
        window.location.reload();  // страницы для перехода к этапу приёма данных, поэтому страницу обновляем
      }
    }
  });
}

async function getData() {
//             ---------
  let response, jsonResult;
  try {
    // Получаем значение текущего баланса и статуса блокировки
    response = await fetch( window.location.origin + '/api/v1/get-balance',
                            { method: 'GET',
                              mode: 'same-origin'
                            }
                          );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for 'get-balance' API: ${JSON.stringify( jsonResult )}` );
      // Значение текущего баланса
      MBResult = { Balance: parseFloat( jsonResult.accountBalance.toFixed(2) ) }; // Создаём 1-ое значение объекта ответа
      // Статус блокировки
      switch ( jsonResult.statusCode ) { // Из комментариев в коде https://my.wifire.ru/assets\js\app\app-data.js
        // 'Активен' - договор в активном состоянии (statusCodes.Active = 0)
        case 0:    {
          break;   }
        // 'Не активирован' - в этом состоянии договор находится сразу после создания (statusCodes.NotActive = 1)
        case 1:    {
          MBResult.BlockStatus = 'NotActive';
          break;   }
        // 'Приостановлен' - договор находится в финансовой блокировке (вручную перевести в это состояние нельзя,
        // переход в это состояние только при не хватке денег на балансе) (statusCodes.FinancialBlock = 2)
        case 2:
        // 'Приостановлен' - в процессе перехода в финансовую блокировку (statusCodes.FinancialBlocking = 1002)
        case 1002: {
          MBResult.BlockStatus = 'FinBlock';
          break;   }
        // 'Заблокирован' - договор временно заблокирован оператором или из личного кабинета (statusCodes.Blocked = 3)
        case 3:
        // 'Заблокирован' - в процессе перехода в операторскую блокировку (statusCodes.Blocking = 1003)
        case 1003: {
          MBResult.BlockStatus = 'Blocked';
          break;   }
        // 'Приостановлен' - договор удален (statusCodes.Deleted = 4)
        case 4:    {
          MBResult.BlockStatus = 'Deleted';
          break;   }
      }
    }
    // Получаем дату следующего платежа
    response = await fetch( window.location.origin + '/api/v2/get-balance-details',
                            { method: 'GET',
                              mode: 'same-origin'
                            }
                          );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for 'get-balance-details' API: ${JSON.stringify( jsonResult )}` );
      // Формируем дату следующего платежа
      let d = new Date( Date.parse( jsonResult.nextPaymentDate ) );
      MBResult.TurnOffStr = `${(d.getDate() < 10) ? '0' + String(d.getDate())      : String(d.getDate())}.` +
                            `${(d.getMonth() < 9) ? '0' + String(d.getMonth() + 1) : String(d.getMonth() + 1)}.` +
                            `${String(d.getFullYear())}`;
    }
    // Получаем данные владельца и лицевой счёт
    response = await fetch( window.location.origin + '/api/v2/get-profile-info',
                            { method: 'GET',
                              mode: 'same-origin'
                            }
                          );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for 'get-profile-info' API: ${JSON.stringify( jsonResult )}` );
      // ФИО владельца
      MBResult.UserName = jsonResult.fullName;
      // Лицевой счёт
      MBResult.LicSchet = JSON.stringify( jsonResult.id );
    }
    // Получаем наименование тарифного плана на сервис подключения к Интернет
    response = await fetch( window.location.origin + '/api/v2/get-internet-accounts-details',
                            { method: 'GET',
                              mode: 'same-origin'
                            }
                          );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for 'get-internet-accounts-details' API: ${JSON.stringify( jsonResult )}` );
      // Наименование тарифного плана
      MBResult.TarifPlan = jsonResult.internetAccounts[ 0 ].tariffPlan.name;
    }
  }
  catch( err ) { // Ответ при ошибке
    requestStatus = false;
    console.log( requestError = err.toString() );
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
    return;
  }
  // Передаём результаты опроса расширению MobileBalance
  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                               status: requestStatus, error: requestError,
                                               data: MBResult }, null );
  // И вызываем выход из личного кабинета
  fetch( window.location.origin + '/logout', { method: 'GET', mode: 'same-origin' })
  .then( function( response ) {
    window.location.reload();
  });
}
