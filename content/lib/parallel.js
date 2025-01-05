/* parallel.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для страницы окна опроса учётных записей в параллельном режиме
 * Редакция:  2022.03.17
 *
*/

let Delay, sleep;        // Глобальные переменные расширения (из модуля vars.mjs)
import('./../../vars.mjs').then( (module) => {
  Delay = module.Delay;
  sleep = module.sleep;
})
.catch((err) => {
  console.log(`[MB] Error: ${err}`);
});

console.log(`[MB] Parallel polling started`);
pollingStart.style.color = '#800000';
pollingStart.textContent += 'Режим параллельного опроса - в разработке';
