/* delayBanner.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для отображения на рабочей вкладке запросов к провайдеру сообщения о паузе перед запросом
 * Редакция:  2025.10.20
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

chrome.runtime.sendMessage( { message: 'MB_giveRequestDelay' },
  async function ( response ) {                           // Получаем заданное значение задержки (в миллисекундах)
    let timeLeft = ( response.requestDelayValue === '' ) ? 0 : response.requestDelayValue;
    let delayStart = Date.now();                          // Фиксируем время начала задержки (миллисекунды с 01.01.1970)
    do {
      delayTimer.textContent = ( timeLeft ).toFixed( 0 );
      await sleep ( 1000 );                               // Следующий замер и отрисовку делаем через 1 секунду
      timeLeft = delayStart + ( response.requestDelayValue * 1000 ) - Date.now();
      timeLeft = ( timeLeft <= 0 ) ? 0 : timeLeft / 1000; // Переводим значение в секунды для отображения
    } while ( timeLeft > 0 );
    delayTimer.textContent = '0';
  }
);
