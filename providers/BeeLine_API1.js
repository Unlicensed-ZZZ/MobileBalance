/* BeeLine_API.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для провайдера BeeLine через API
 *            Адаптация jsmb-плагина 'BeeAPI' редакции 11.11.2020 для MobileBalance (comprech & y-greek & Arty)
 * Редакция:  2022.10.18
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
      if ( request.action === 'log&pass' ) {
        MBextentionId = sender.id;
        // Есть API для аутентификации, поэтому прохождение страниц ввода логина пароля не нужно.
        // Получаем данные и отсылаем ответ сразу, в один этап
        getData( request.login, request.passw );
      }
    }
    else return;
  }
  catch( err ) {
    console.log( err.toString() );
    return;
  }
});

async function getData( login, passw ) {
//             -----------------------
  let token, response, jsonResult;

  try {
    // Получаем токен для запросов по учётным данным
    response = await fetch( `/api/1.0/auth/auth?login=${login}&password=${passw}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Token by '/api/1.0/auth/auth' API recieved: ${JSON.stringify( jsonResult )}` );
      token = jsonResult.token;
    }
    // Получаем значение текущего баланса
    response = await fetch( `/api/1.0/info/prepaidBalance?ctn=${login}&token=${token}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for '/api/1.0/info/prepaidBalance' API: ${JSON.stringify( jsonResult )}` );
      if ( jsonResult.meta.status === 'OK' ) { // Если тариф с предоплатой
        response = jsonResult.balance.toFixed(2); // Получаем значение с 2 знаками после запятой в виде строки
      }
      else {
        response = await fetch( `/api/1.0/info/postpaidBalance?ctn=${login}&token=${token}`,
                                { method: 'GET', mode: 'same-origin' } );
        if ( response.ok ) {
          jsonResult = await response.json();
          console.log( `[MB] Response for '/api/1.0/info/postpaidBalance' API: ${JSON.stringify( jsonResult )}` );
          if ( jsonResult.meta.status === 'OK' ) { // Если тариф с постоплатой
            // Значение текущего баланса
            response = jsonResult.balance.toFixed(2); // Получаем значение с 2 знаками после запятой в виде строки
          }
        }
      }
      MBResult = { Balance: parseFloat( response ) }; // Создаём 1-ое значение объекта ответа
    }
    // Получаем наименование тарифного плана
    response = await fetch( `/api/1.0/info/pricePlan?ctn=${login}&token=${token}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for '/api/1.0/info/pricePlan' API: ${JSON.stringify( jsonResult )}` );
      MBResult.TarifPlan = jsonResult.pricePlanInfo.entityName;
    }
    // Формируем строку состава услуг в формате: 'количество бесплатных' / 'количество платных' / 'количество подписок'
    let freeCounter = 0, paidCounter = 0, subscriptionCounter = 0;
    response = await fetch( `/api/1.0/info/serviceList?ctn=${login}&token=${token}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for '/api/1.0/info/serviceList' API: ${JSON.stringify( jsonResult )}` );
      for( let i = 0; i < jsonResult.services.length; i++ ) {
        if ( jsonResult.services[ i ].rcRate > 0 )
          ++paidCounter
        else
          ++freeCounter;
      }
    }
    response = await fetch( `/api/1.0/info/subscriptions?ctn=${login}&token=${token}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for '/api/1.0/info/subscriptions' API: ${JSON.stringify( jsonResult )}` );
      subscriptionCounter = jsonResult.subscriptions.length;
    }
    MBResult.UslugiOn = `${String(freeCounter)} / ${String(paidCounter)} / ${String(subscriptionCounter)}`;
    // Получаем статус блокировки
    response = await fetch( `/api/1.0/info/status?ctn=${login}&token=${token}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) { // status - Статус абонента. A - активен, S - блокировка (её код - в поле statusRsnCode)
      jsonResult = await response.json();
      console.log( `[MB] Response for '/api/1.0/info/status' API: ${JSON.stringify( jsonResult )}` );
      MBResult.BlockStatus = ( jsonResult.status === 'A' ) ? '' : 'Blocked';
    }
    // Получаем остатки пакетов
    response = await fetch( `/api/1.0/info/rests?ctn=${login}&token=${token}`,
                            { method: 'GET',
                              mode: 'same-origin' } );
    if ( response.ok ) {
      jsonResult = await response.json();
      console.log( `[MB] Response for '/api/1.0/info/rests' API: ${JSON.stringify( jsonResult )}` );
      // !!! Этот блок приёма данных перенесён из jsmb-плагина 'BeeAPI' редакции 11.11.2020 для MobileBalance (авторы:
      //     comprech & y-greek & Arty) без тестирования - нет в распоряжении учётных данных с такими тарифами
      if ( jsonResult.meta.status === 'OK' ) {
        if ( jsonResult.rests.length > 0 ) { // Есть данные для разбора
          for( let i = 0; i < jsonResult.rests.length; i++ ) {
            // Получаем остаток пакета минут (если предусмотрено тарифом)
            if ( jsonResult.rests[ i ].unitType === 'VOICE' )    MBResult.Minutes = jsonResult.rests[ i ].currValue;
            // Получаем остаток пакета SMS (если предусмотрено тарифом)
            if ( jsonResult.rests[ i ].unitType === 'SMS_MMS' )  MBResult.SMS = jsonResult.rests[ i ].currValue;
            // Получаем остаток пакета Интернет (если предусмотрено тарифом)
            if ( jsonResult.rests[ i ].unitType === 'INTERNET' ) MBResult.Internet = jsonResult.rests[ i ].currValue;
          }
        }
      }
      else {
        response = await fetch( `/api/1.0/info/accumulators?ctn=${login}&token=${token}`,
                                { method: 'GET',
                                  mode: 'same-origin' } );
        if ( response.ok ) {
          jsonResult = await response.json();
          console.log( `[MB] Response for '/api/1.0/info/accumulators' API: ${JSON.stringify( jsonResult )}` );
          if ( jsonResult.accumulators.length > 0 ) { // Есть данные для разбора
            for( let i = 0; i < jsonResult.accumulators.length; i++ ) {
              // Получаем остаток пакета минут (если предусмотрено тарифом)
              if ( jsonResult.accumulators[ i ].unit === 'SECONDS' )
                if ( ( !jsonResult.accumulators[ i ].frequency ) || // Забираем если это не ситуационная разовая опция
                     ( jsonResult.accumulators[ i ].frequency.indexOf( 'dayly' ) < 0 ) )
                  MBResult.Minutes = Math.round( jsonResult.accumulators[ i ].rest / 60 );
              // Получаем остаток пакета SMS (если предусмотрено тарифом)
              if ( jsonResult.accumulators[ i ].unit === 'SMS' )
                if ( ( !jsonResult.accumulators[ i ].frequency ) || // Забираем если это не ситуационная разовая опция
                     ( jsonResult.accumulators[ i ].frequency.indexOf( 'dayly' ) < 0 ) )
                  MBResult.SMS = jsonResult.accumulators[ i ].rest;
              // Получаем остаток пакета Интернет (если предусмотрено тарифом)
              if ( jsonResult.accumulators[ i ].unit === 'KBYTE' )
                if ( ( !jsonResult.accumulators[ i ].frequency ) || // Забираем если это не ситуационная разовая опция
                     ( jsonResult.accumulators[ i ].frequency.indexOf( 'dayly' ) < 0 ) )
                  MBResult.Internet = parseFloat( ( jsonResult.accumulators[ i ].rest / 1024 ).toFixed(3) );
            }
          }
        }
      }
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
}
