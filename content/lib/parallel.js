/* parallel.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для страницы окна опроса учётных записей в параллельном режиме
 * Редакция:  2025.01.13
 *
*/

let Delay, dbVersion, sleep;                    // Глобальные переменные расширения (из модуля vars.mjs)
import('./../../vars.mjs').then( (module) => {
  Delay = module.Delay;
  dbVersion = module.dbVersion;
  MBResult = module.MBResult;    // Структура ответа на запрос по учётным данным провайдера
  sleep = module.sleep;
})
.catch( (err) => { console.log( `[MB] Error: ${err}` ) } );

async function importAwait() {  // Ожидание завершения импорта значений и функций из модуля
  do {                          // Нужно вызвать в первой инициализируемой функци с await
    await new Promise( resolve => setTimeout( resolve, 50 ) );
  } while ( sleep === undefined );
}

console.log(`[MB] Parallel polling started`);

let tableRow = document.createElement( 'tr' );
let tableCell = document.createElement( 'td' );
tableCell.setAttribute( 'colspan', pollingTitles.children[ 0 ].childElementCount );
tableCell.style.textAlign = 'center';
tableCell.style.fontSize = 'medium';
tableCell.style.color = '#800000';
tableCell.textContent = `Режим параллельного опроса - в разработке`;
tableCell.style.width = '-webkit-fill-available';
tableRow.insertAdjacentElement( 'beforeend', tableCell );
pollingItems.insertAdjacentElement( 'beforeend', tableRow );
