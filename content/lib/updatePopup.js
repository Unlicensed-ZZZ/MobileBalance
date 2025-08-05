/*
 * updatePopup.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для окна сообщения о составе обновления расширения
 * Редакция:  2025.08.04
 *
 */

(async function main(){

  chrome.action.setBadgeText( { text: '' } ); // Убрать надпись об обновлении
  chrome.action.setPopup( { popup: chrome.runtime.getManifest().action.default_popup } ) // Вернуть popup-окно по умолчанию
  
  // Формируем текст состава обновления, из фрагмента текста между символами '^' из файла 'MB_ChangeLog.txt'
  let msgText;
  await fetch( '/MB_ChangeLog.txt', { method: 'GET' } )
  .then( async function( result ) {
    await result.text()
    .then( function( result ) {
      msgText = result.split( '^' )[ 1 ] /*.replaceAll( '\r\n', '<br>' )*/ ;
    })
  });

  updateVersion.textContent = `${chrome.runtime.getManifest().name} обновлён`;
  updateMessage.innerHTML = msgText;
  contentDiv.classList.add( 'makeVisible' );
})()

closeButton.addEventListener( 'click', () => { self.close() } );
