/* delayBanner.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для отображения на рабочей вкладке запросов к провайдеру сообщения о паузе перед запросом
 * Редакция:  2026.07.19
 *
*/

function sleep( ms ) { // Функция обеспечения задержки, заданной в милисекундах
//       -----------
  return new Promise( function( resolve ) { setTimeout( resolve, ms ) } );
}

let relationElement = document.getElementsByTagName( 'body' )[0];
let loginElement = document.createElement( 'div' );
loginElement.classList.add( 'modal' );
loginElement.id = 'delayWin';
loginElement.style.zIndex = 1000;
relationElement.insertAdjacentElement( 'beforeend', loginElement );
relationElement = loginElement;

loginElement = document.createElement( 'div' );
loginElement.classList.add( 'modal-content' );
loginElement.id = 'delayWinContent';
relationElement.insertAdjacentElement( 'beforeend', loginElement );
relationElement = loginElement;

loginElement = document.createElement( 'div' );
loginElement.classList.add( 'modal-title' );
loginElement.textContent = 'Пауза перед следующим запросом к провайдеру';
relationElement.insertAdjacentElement( 'beforeend', loginElement );

loginElement = document.createElement( 'div' );
loginElement.style.display = 'flex';
loginElement.style.justifyContent = 'space-evenly';
relationElement.insertAdjacentElement( 'beforeend', loginElement );

relationElement = loginElement;
loginElement = document.createElement( 'div' );
loginElement.textContent = 'Следующий запрос через ';
relationElement.insertAdjacentElement( 'beforeend', loginElement );

loginElement = document.createElement( 'div' );
loginElement.id = 'delayTimer';
loginElement.style.fontWeight = 'bold';
loginElement.style.color = 'limegreen';
loginElement.textContent = '  ';
relationElement.insertAdjacentElement( 'beforeend', loginElement );

loginElement = document.createElement( 'div' );
loginElement.textContent = ' секунд';
relationElement.insertAdjacentElement( 'beforeend', loginElement );

delayWin.style.display = 'block';

chrome.runtime.onMessage.addListener( async function( request, sender, sendResponse ) {
  if ( request.message === 'MB_takeRequestDelay' ) {
    if ( sendResponse ) sendResponse( 'done' );
    let timeLeft = Date.now() + ( request.requestDelayValue * 1000 );     // Получаем время завершения заданной задержки (в миллисекундах)
    do {
      delayTimer.textContent = Math.abs( Math.round( ( timeLeft - Date.now() ) / 1000 ) );
      await sleep ( 1000 );                                               // Следующий замер и отрисовку делаем через 1 секунду
    } while ( delayTimer.textContent !== '0' );
  }
})
                                                                          // Запрашиваем значение задержки между запросами к провайдеру
chrome.runtime.sendMessage( chrome.runtime.id, { message: 'MB_giveRequestDelay' } );

