/* MTS_v3_API_helper.mjs
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Вспомогательный модуль для работы плагином 'MTS_v3_API.js'
 * Редакция:  2026.04.06
 *
 * От плагина-родителя в переменной 'args' ожидаем параметр вида:
 *  - удаление из браузера неактуальных сессионных cookie
 *   { removeCookie: true }
 *  - восстановление в браузере сохранённых сессионных cookie
 *   { restoreCookie: Object }
 *   restoreCookie - объект элементами в формате 'имя': 'структура_cookie_для восстановления'
 * - считывание сессионных cookie из браузера
 *   { getCookie: true }
 *  - догрузка кода библиотеки 'CAPTCHA Breaking Library' на опрашиваемую страницу
 *  { loadCBL: true }
 */

async function MTS_API_helper( provider, args ) {
//             --------------------------------
  const helperName = 'MTS_API_helper';
  if ( typeof provider === 'object' ) {
    if ( args.removeCookie !== undefined ) {      // Запрошено удаление неактуальных сессионных cookie
      await chrome.cookies.getAll( { domain: 'mts.ru' } )
      .then( async function( cookieArr ) {
        if ( cookieArr.length > 0 ) {                   // Если cookies для 'mts.ru' в браузере найдены,
          cookieArr.forEach( async function( item ) {   //   то удаляем среди них сессионные
            if ( [ 'MTSWebSSO', 'MTSWebSSOPersistent', 'mts_auth_lk',
                   'mts_auth_userId_lk', 'mts_auth_mtsru' ].includes( item.name ) )
              await chrome.cookies.remove( { name: item.name,
                                             url: `http${( item.secure ? 's' : '' )}://` +
                                                  `${item.domain}${item.path}` } )
              .catch( function( err ) {} )  // Ошибки подавляем
          })
          console.log( `[${helperName}] Session cookie for "${provider.description}" login data removed` );
        }
      })
      .catch( function( err ) {} ); // Ошибки подавляем
      return { data: { removeCookie: true }, respond: true }; // Родительский плагин требуется уведомить о завершении операции
    }
    if ( args.restoreCookie !== undefined ) {     // Запрошено восстановление сохранённых сессионных cookie
      if ( Object.keys( args.restoreCookie ).length > 0 ) {
        for ( const i in args.restoreCookie ) {         // Если в объекте есть cookie, то восстановливаем их
          await chrome.cookies.set( { name:           args.restoreCookie[ i ].name,
                                      expirationDate: ( args.restoreCookie[ i ].expirationDate !== undefined ) ? args.restoreCookie[ i ].expirationDate : undefined,
                                      domain:         ( args.restoreCookie[ i ].hostOnly === false ) ? args.restoreCookie[ i ].domain : undefined,
                                      path:           ( args.restoreCookie[ i ].hostOnly === false ) ? args.restoreCookie[ i ].path : undefined,
                                      httpOnly:       args.restoreCookie[ i ].httpOnly,
                                      sameSite:       args.restoreCookie[ i ].sameSite,
                                      secure:         args.restoreCookie[ i ].secure,
                                      url:            `http${( args.restoreCookie[ i ].secure ? 's' : '' )}://${ args.restoreCookie[ i ].domain }${ args.restoreCookie[ i ].path }`,
                                      value:          args.restoreCookie[ i ].value
                                    } )
          .then( function() {
            console.log( `[${helperName}] OTP-session cookie for "${provider.description}" current login data restored` );
          })
          .catch( function( err ) {} ); // Ошибки подавляем
        }
        return { data: { restoreCookie: true }, respond: true }; // Родительский плагин требуется уведомить о завершении операции
      }
      console.log( `[${helperName}] No OTP-session cookie saved for "${provider.description}" current login data, nothing to restore` );
      return { data: { restoreCookie: false }, respond: true };  // Родительский плагин требуется уведомить о завершении операции
    }
    if ( args.getCookie !== undefined ) {         // Запрошено считывание сессионных cookie
      let tmp;
      await chrome.cookies.get( { name: 'MTSWebSSOPersistent', url: 'https://login.mts.ru/' } )
      .then( function( result ) {
        tmp = result;
        console.log( `[${helperName}] OTP-session cookie for "${provider.description}" current login data${( result !== null ) ? ' received from' : ' not found in' } browser` );
      })
      .catch( function( err ) {} ); // Ошибки подавляем
      return { data: { getCookie: ( tmp !== null ) ? { MTSWebSSOPersistent: tmp } : false },
               respond: true };   // Передаём полученный результат родительскому плагину
    }
    if ( args.loadCBL !== undefined ) {           // Запрошена загрузка кода 'CAPTCHA Breaking Library' 
      await chrome.scripting.executeScript( { target: { tabId: provider.pullingTab },           // Загружаем его из файла на страницу
                                              files: [ `/providers/lib/CBL_solve_only.min.js` ] } )   //   рабочей вкладки провайдера
      .then( function() {
        console.log( `[${helperName}] "CAPTCHA Breaking Library" for "${provider.description}" current login data loaded` );
      })
      .catch( function( err ) {
        console.log( `[${helperName}] Couldn't inject "CAPTCHA Breaking Library" for "${provider.description}" current login data:\n${err}` );
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

