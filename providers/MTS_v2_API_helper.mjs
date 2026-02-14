/* MTS_v2_API_helper.mjs
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Вспомогательный модуль для работы плагином 'MTS_v2_API.js'
 * Редакция:  2026.02.10
 *
 * От плагина-родителя в переменной 'args' ожидаем параметр вида:
 *  - для удаление неактуальных сессионных cookies
 *   { removeCookies: true }
 */

async function MTS_API_helper( provider, args ) {
//             --------------------------------
  const helperName = 'MTS_API_helper';
  if ( typeof provider === 'object' ) {
    if ( args.removeCookies !== undefined ) { // Запрошено удаление неактуальных сессионных cookies провайдера
      await chrome.cookies.getAll( { domain: 'mts.ru' } )
      .then( async function( cookieArr ) {
        if ( cookieArr.length > 0 ) {   // Если cookies для 'mts.ru' в браузере найдены, то удаляем среди них сессионные
          let cookiesRemoved = false;
          for ( let i = cookieArr.length - 1; i >= 0; --i ) {
            if ( cookieArr[ i ].name === 'MTSWebSSO' )
              await chrome.cookies.remove( { name: cookieArr[ i ].name,
                                             url: `http${( cookieArr[ i ].secure ? 's' : '' )}://` +
                                                  `${cookieArr[ i ].domain}${cookieArr[ i ].path}` } )
              .then( function() {
                cookiesRemoved = true;
              })
              .catch( function( err ) {} ); // Ошибки подавляем
          }
          if ( cookiesRemoved === true )
            console.log( `[${helperName}] Irrelevant session cookies for "${provider.description}" removed` );
        }
      })
      .catch( function( err ) {} ); // Ошибки подавляем
      return { data: { removeCookies: true }, respond: true };  // Родительский плагин требуется уведомить о завершении операции
    }
    if ( args.loadCBL !== undefined ) { // Запрошена загрузка кода 'CAPTCHA Breaking Library' 
      await chrome.scripting.executeScript( { target: { tabId: provider.pullingTab },             // Загружаем его из файла на страницу
                                              files: [ `/providers/lib/CBL_solve_only.min.js` ] } )   //   рабочей вкладки провайдера
      .then( function() {
        console.log( `[${helperName}] "CAPTCHA Breaking Library" for "${provider.description}" loaded` );
      })
      .catch( function( err ) {
        console.log( `[${helperName}] Couldn't inject "CAPTCHA Breaking Library" for "${provider.description}":\n${err}` );
      })
      return { data: { loadCBL: true }, respond: true };  // Родительский плагин требуется уведомить о завершении операции
    }
  }
  else { // Если входного параметра нет или он не объект, то выйти с ошибкой и результатом 'undefined'
    console.log( `[${helperName}] "provider" argument for "helper" undefined or it's not typeof "Object"` );
    return void 0;  // undefined
  }
}

console.log( '[MTS_API_helper] Helper loaded' );
export { MTS_API_helper as default };

