/* T2_API_helper.mjs
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Вспомогательный модуль для работы с библиотеками для обработчика 'T2_API.js'
 * Редакция:  2025.08.07
 *
 * От плагина-родителя в переменной 'args' ожидаем параметры вида:
 *   - для расчёта контрольных значений:
 *     { tests: [ { bundle: 'имя файла библиотеки', // например, 'compute_v1.mjs'
 *                  args: { ... значения параметров расчёта контрольного значения }
 *                },
 *                { bundle: 'имя файла библиотеки', // например, 'css_v2.mjs'
 *                  args: { ... значения параметров расчёта контрольного значения }
 *                }
 *              ]
 *     }
 *   - для эмуляции активности вкладки провайдера
 *     { activateNab: true }
 */

async function Т2_API_helper( provider, args ) {
//             -------------------------------
  const helperName = 'Т2_API_helper';
  if ( typeof provider === 'object' ) {
    if ( args.tests !== undefined ) { // Запрошен расчёт контрольных значений
      let solution = {}; // Объект для ответа под расчитанные контрольные значения
      for ( let test in args.tests ) {
        let moduleName = args.tests[ test ].bundle;
        // Если это не было сделано ранее, импортируем требуемую библиотеку
        if ( provider.modules[ moduleName ].moduleFunc === null ) {
          provider.modules[ moduleName ].moduleFunc = 
            await import( `/providers/modules/${provider.modules[ moduleName ].moduleFile}` );
          provider.modules[ moduleName ].moduleFunc = provider.modules[ moduleName ].moduleFunc.default;
          console.log( `[${helperName}] [${provider.modules[ moduleName ].moduleFile}] Module loaded` );
        }
        // Выполняем с помощью библиотеки расчёт контрольного примера по переданным параметрам
        await provider.modules[ moduleName ].moduleFunc( args.tests[ test ].args )
        .then( function( result ) {
          Object.assign( solution, result );
          console.log( `[${helperName}] [${provider.modules[ moduleName ].moduleFile}] Solution calculated` );
        })
        .catch( function( err ) {
          console.log( `[${helperName}] [${provider.modules[ moduleName ].moduleFile}] Error: ${err}` );
        })
      }
      // Результат расчёта (data) нужно направать (respond = true) плагину-родителю
      return { data: solution, respond: true };
    }
    if ( args.activateTab !== undefined ) { // Запрошена эмуляция активности вкладки провайдера
      // Сохраняем состояние вкладок окна опроса по учётным данным
      // workWin, workTab - переменные объектов, доступные helper-модулю в скрипте вкладки окна результатов опроса
      let wrkWin = await chrome.windows.get( workWin.id, { populate: true } );
      let prevTab = wrkWin.tabs.find( function( item ) {
        return ( item.active === true );
      });
      // Эмулируем активность вкладки провайдера для прохождения антибот-проверки
      await chrome.tabs.update( provider.pullingTab, { active: true } ); // Активируем вкладку провайдера
      await chrome.tabs.update( prevTab.id, { active: true } ); // Возвращаем активность предыдущей вкладке
      return { data: {}, respond: false };
    }
  }
  else { // Если входного параметра нет или он не объект, то выйти с ошибкой и результатом 'undefined'
    console.log( `[${helperName}] "provider" argument for "helper" undefined or it's not typeof "Object"` );
    return void 0;  // undefined
  }
}

console.log( '[Т2_API_helper] Helper loaded' );
export { Т2_API_helper as default };
