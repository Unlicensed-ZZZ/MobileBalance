/* BeeLine_v3_API_helper.mjs
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Вспомогательный модуль для работы с плагином 'BeeLine_v3_API.js'
 * Редакция:  2026.05.31
 *
 * От плагина-родителя в переменной 'args' ожидаем параметр вида:
 *  - для удаление неактуальных сессионных cookies
 *   { removeCookies: true }
 */

async function BeeLine_v3_API_helper( provider, args ) {
//             ---------------------------------------
  const helperName = 'BeeLine_v3_API_helper';
  let success = false;
  if ( typeof provider === 'object' ) {
    if ( args.loadCBL !== undefined ) { // Запрошена загрузка кода 'CAPTCHA Breaking Library' 
      await chrome.scripting.executeScript( { target: { tabId: provider.pullingTab },                 // Загружаем его из файла на страницу
                                              files: [ `/providers/lib/CBL_solve_only.min.js` ] } )   //   рабочей вкладки провайдера
      .then( function() {
        success = true;
        console.log( `[${helperName}] "CAPTCHA Breaking Library" for "${provider.description}" loaded` );
      })
      .catch( function( err ) {
        console.log( `[${helperName}] Injection "CAPTCHA Breaking Library" for "${provider.description}":\n${err} failed` );
      })
      return { data: { loadCBL: success }, respond: true };   // Родительский плагин требуется уведомить о завершении операции
    }
  }
  else { // Если входного параметра нет или он не объект, то выйти с ошибкой и результатом 'undefined'
    console.log( `[${helperName}] "provider" argument for "helper" undefined or it's not typeof "Object"` );
    return void 0; // undefined
  }
}

console.log( '[BeeLine_v3_API_helper] Helper loaded' );
export { BeeLine_v3_API_helper as default };

