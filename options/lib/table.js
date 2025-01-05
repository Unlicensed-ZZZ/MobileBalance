/* table.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для страницы настроек (вкладки) расширения MobileBalance
 * Редакция:  2024.09.21
 *
 * В тэги строк таблицы нужно вставить вызов функции по событию onclick: <tr onclick=selectRow(event)></tr>
 *
*/

let selectedRow = undefined;

function selectRow( evnt ) {
//       -----------------
  if ( evnt.srcElement.tagName === 'TD' ) {
    evnt.currentTarget.classList.toggle( 'checked' );
    if ( selectedRow === undefined )
      selectedRow = evnt.currentTarget.rowIndex
    else {
      if (selectedRow === evnt.currentTarget.rowIndex)
        selectedRow = undefined
      else {
        evnt.currentTarget.parentNode.rows[selectedRow].classList.toggle( 'checked' );
        selectedRow = evnt.currentTarget.rowIndex;
      }
    }
  }
}
