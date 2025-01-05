/* table.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для страницы результатов опроса (таблица) расширения MobileBalance
 * Редакция:  2022.02.03
 *
 * В тэги строк таблицы нужно вставить вызов функции по событию onclick: <tr onclick=selectRow(event)></tr>
 *                                     и id со значением, равным порядковому номеру строки таблицы: id='1'
*/

let selectedRow = undefined;

function selectRow( evnt ) {
//       -----------------
  evnt.currentTarget.classList.toggle( 'checked' );
  if ( selectedRow === undefined )
    selectedRow = evnt.currentTarget.id
  else {
    if (selectedRow === evnt.currentTarget.id)
      selectedRow = undefined
    else {
      document.getElementById(selectedRow).classList.toggle( 'checked' );
      selectedRow = evnt.currentTarget.id;
    }
  }
}
