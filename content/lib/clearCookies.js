/* clearCookies.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для удаления на странице рабочей вкладки записей из cookies
 * Редакция:  2024.05.25
 *
*/

cookieStore.getAll()                                            // Считываем cookies со страницы провайдера
.then( async function ( pageCookies ) {
  if ( pageCookies.length > 0 ) {                               // Если записи cookies для страницы есть, то удаляем их
    for ( let i = pageCookies.length - 1; i >= 0; i-- ) {
      await cookieStore.delete( { name:   pageCookies[ i ].name,
                                  domain: pageCookies[ i ].domain,
                                  path:   pageCookies[ i ].path } )
    }
    console.log( `[MB] Cookies for this page were deleted` )
  }
  else
    console.log( `[MB] No cookies for deletion on this page` )
})
