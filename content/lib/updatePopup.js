/*
 * updatePopup.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Скрипт для окна сообщения о составе обновления расширения
 * Редакция:  2026.06.07
 *
 */

(async function main(){

  chrome.action.setBadgeText( { text: '' } ); // Убрать надпись об обновлении
  chrome.action.setPopup( { popup: chrome.runtime.getManifest().action.default_popup } ) // Вернуть popup-окно по умолчанию

  // Проверка и восстановление в браузере таймера опроса по расписанию
  chrome.alarms.get( 'poolingTimer' )
  .then( async function( alarm ) {
    if ( alarm === undefined )                // Таймера в браузере нет
      await chrome.storage.local.get( [ 'maintainPooling', 'maintainStartTime' ] )
      .then( function( timerOptions ) {
        if ( timerOptions.maintainPooling )   // Если таймер должен быть установлен (опрос по расписанию включён),
          chrome.runtime.sendMessage( { message: 'MB_poolingTimerReset' } );  // ... то восстанавливаем его
      })
  })
  .catch( function( err ) {
    console.log( `[MB] Error getting timer: ${err}` );
  })
  
  // Формируем текст состава обновления, из фрагмента текста между символами '^' из файла 'MB_ChangeLog.txt'
  let msgText, captionText = '', messageText = '';
  await fetch( '/MB_ChangeLog.txt', { method: 'GET' } )
  .then( async function( result ) {
    await result.text()
    .then( function( result ) {
      msgText = result.split( '^' )[ 1 ];                               // Выделяем блок текста между символами '^'
      msgText = msgText.replaceAll( '\r', '' );                         // Удаляем символы возврата каретки
      msgText = msgText.split( '\n' );                                  // Создаём массив строк по символам перевода строки
      for ( let i = 0; i < msgText.length; ++i ) {                      // Удаляем в строках массива лидирующие и замыкающие пробелы
        msgText[ i ] = msgText[ i ].trim();
      };
      captionText = msgText[ 1 ];                                       // Формируем текст даты / версии обновления
      msgText = msgText.slice( 3 );                                     //   и удаляем из массива его строки-исходники
      for ( let i = 0; i < msgText.length; ++i ) {                      // Формируем текст описания обновления
        if ( [ '*', '+', '-' ].includes( msgText[ i ].charAt( 0 ) ) )   // Если последующая строка начинается с символа '*', '+' или '-',
          messageText += '\n' + msgText[ i ]                            //   то отделяем её от предыдущей символом перевода строки
        else
          messageText += ' ' + msgText[ i ];                            // Если нет, то добавляем её к предыдущей через пробел
      }
      if ( messageText.charAt( 0 ) === '\n' )                           // Если в строке оказался лидирующий символом перевода строки,
        messageText = messageText.slice( 1 );                           //   то удаляем его
    })
  });
  updateVersion.textContent = `${chrome.runtime.getManifest().name} обновлён`;
  updateCaption.textContent = captionText;  // Вносим текст даты / версии обновления
  updateMessage.innerText   = messageText;  // Вносим текст описания обновления
  contentDiv.classList.add( 'makeVisible' );
})()

closeButton.addEventListener( 'click', () => { self.close() } );
