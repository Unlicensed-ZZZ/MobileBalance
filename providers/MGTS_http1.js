/* MGTS_http.js
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Обработчик для оператора связи МГТС - сбор данных с html-страницы
 * Редакция:  2022.03.29
 *
*/

let MBextentionId = undefined;
let requestStatus = true;
let requestError = '';
let MBResult = undefined;

chrome.runtime.onMessage.addListener( ( request, sender, sendResponse ) => {
  try {
    if ( request.message === 'MB_takeData' ) {
      if ( sendResponse ) sendResponse( 'done' );  // Ответ в окно опроса для поддержания канала связи
      let loginForm = document.all.Login;
      switch ( request.action ) {
        case 'login': {
          if ( ( loginForm !== undefined ) && // Сайт не отвечает, страница не прогрузилась или изменена
               ( loginForm.classList.contains( '-loginForm' ) ) )
            loginInput( request.login )
          else
            if ( ( loginForm !== undefined ) && // Сайт не отвечает, страница не прогрузилась или изменена
                 ( loginForm.classList.contains( 'passwordForm' ) ) ) {
              chrome.runtime.sendMessage( sender.id, { message: 'MB_workTab_skipNextPhase' }, null );
              passwInput( request.passw );
            }
          break;
        }
        case 'password': {
          if ( loginForm === undefined ) return; // Сайт не отвечает, страница не прогрузилась или изменена
          if ( loginForm.classList.contains( 'passwordForm' ) )
            passwInput( request.passw )
          break;
        }
        case 'polling': {
          MBextentionId = sender.id;
          setTimeout( function() { // Задержка, чтобы виджеты успели прогрузиться
            getData();
          }, 2000);
          break;
        }
      }
    }
    else return;
  }
  catch( err ) {
    console.log( err.toString() );
    return;
  }
})

function loginInput( login ) {
//       -------------------
  document.getElementById( 'loginform-username' ).value = login;
  document.getElementById( 'submit' ).disabled = false;
  document.getElementById( 'submit' ).click();
}

function passwInput( passw ) {
//       -------------------
  document.getElementById( 'loginform-password' ).value = passw;
  document.getElementById( 'submit' ).disabled = false;
  document.getElementById( 'submit' ).click();
}

async function getData() {
//             ---------
  try {
    // Значение текущего баланса
    let str = document.getElementsByClassName( 'account-info_balance_value' )[ 0 ].children[ 0 ].textContent;
    MBResult = { Balance: parseFloat( str.replace( ',', '.' ) ) }; // Создаём объект с 1-ым значением
    // ФИО владельца
    MBResult.UserName = document.getElementsByClassName( 'account-info_title' )[ 0 ].outerText;
    // Лицевой счёт
    let i = 0;
    str = document.getElementsByClassName( 'account-info_item_value' );
    for ( i = 0; i < str.length; ++i ) {
      if ( str[ i ].previousElementSibling.textContent.includes( 'Лицевой' ) ) {
        MBResult.LicSchet = str[ 1 ].outerText;
        break;
      }
    }
    // Брэнд-наименование тарифного плана
    str = document.getElementsByClassName( 'text-link' ); // Ищем элементы виджетов с описанием сервисов
    if ( str.length > 0 ) {
      for ( i = 0; i < str.length; ++i ) { // Если найденный элемент находится в блоке с наименованием тарифа
        if ( str[ i ].parentElement.childNodes[0].textContent.match(/тариф/) ) {
          MBResult.TarifPlan = str[ i ].textContent;                              // то забираем наименование
          break;
        }
      }
    }
  }
  catch( err ) { // Ответ при ошибке
    requestStatus = false;
    console.log( requestError = err.toString() );
    chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                                 status: requestStatus, error: requestError,
                                                 data: (MBResult === undefined) ? undefined : MBResult }, null );
    return;
  }
  // Передаём результаты опроса расширению MobileBalance
  chrome.runtime.sendMessage( MBextentionId, { message: 'MB_workTab_takeData',
                                               status: requestStatus, error: requestError,
                                               data: MBResult }, null );
}
