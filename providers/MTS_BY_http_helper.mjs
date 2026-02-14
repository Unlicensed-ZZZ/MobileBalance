/* MTS_BY_http_helper.mjs
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Вспомогательный модуль для работы с плагином 'MTS_BY_http.js'
 * Редакция:  2026.02.10
 *
 * От плагина-родителя в переменной 'args' ожидаем параметр вида:
 *  - для удаление неактуальных сессионных cookies
 *   { removeCookies: true }
 */

async function MTS_BY_http_helper( provider, args ) {
//             ------------------------------------
  const helperName = 'MTS_BY_http_helper';
  if ( typeof provider === 'object' ) {
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

console.log( '[MTS_BY_http_helper] Helper loaded' );
export { MTS_BY_http_helper as default };

