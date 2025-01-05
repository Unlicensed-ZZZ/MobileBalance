/* orderLoader.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Вспомогательный скрипт для разбора параметров в URL вызова страницы проведения
 *              опроса (poolingCycle.html) и загрузки в неё соответствующего основного скрипта
 * Редакция:  2022.01.25
 *
*/

let urlParams = new URLSearchParams( window.location.search ); // Забираем параметры из URL страницы
let cycleOrder = urlParams.get('co'); // Считываем значение переданного параметра порядка выполнения опроса
let scrpt = document.createElement( 'script' );
scrpt.defer = true;
scrpt.src = `lib/${cycleOrder}.js`; // Загружаем на страницу скрипт, соответствующий указанному порядку опроса
(document.head || document.documentElement).appendChild( scrpt );
